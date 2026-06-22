import type { PageId, PageMetadata, ChunkId, ChunkText, Embedding, SearchResult, EnrichedResult, BrowsingStats, DomainStat, TimelineEntry } from '../types';

const DB_NAME = 'semantic-memory';
const DB_VERSION = 2;
const METADATA_STORE = 'page-metadata';
const CHUNK_STORE = 'chunk-texts';
const EMBEDDING_STORE = 'chunk-embeddings';
const CHUNK_PAGE_MAP_STORE = 'chunk-page-map';

// Singleton cached connection — avoids opening 60+ connections per page visit
let cachedDB: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (cachedDB) return Promise.resolve(cachedDB);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: 'pageId' });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: 'chunkId' });
      }
      if (!db.objectStoreNames.contains(EMBEDDING_STORE)) {
        db.createObjectStore(EMBEDDING_STORE, { keyPath: 'chunkId' });
      }
      // Maps chunkId → pageId so we can look up metadata from search results
      if (!db.objectStoreNames.contains(CHUNK_PAGE_MAP_STORE)) {
        db.createObjectStore(CHUNK_PAGE_MAP_STORE, { keyPath: 'chunkId' });
      }
    };
    req.onsuccess = () => {
      cachedDB = req.result;
      // Re-open on unexpected close (e.g. versionchange from another tab)
      cachedDB.onclose = () => { cachedDB = null; };
      cachedDB.onversionchange = () => {
        cachedDB?.close();
        cachedDB = null;
      };
      resolve(cachedDB);
    };
    req.onerror = () => reject(req.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// A transaction signals completion via `oncomplete`, NOT `onsuccess` — so it
// must not be passed to promisify(). Use this to await a multi-store write.
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export interface StoredEmbedding {
  chunkId: number;
  embedding: number[];
}

export class MetadataStore {
  async saveMetadata(pageId: PageId, metadata: PageMetadata): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(METADATA_STORE, 'readwrite');
    await promisify(tx.objectStore(METADATA_STORE).put(metadata));
  }

  async saveChunkText(chunkId: ChunkId, chunkText: ChunkText, pageId: PageId): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([CHUNK_STORE, CHUNK_PAGE_MAP_STORE], 'readwrite');
    tx.objectStore(CHUNK_STORE).put({
      chunkId: chunkId as unknown as number,
      chunkText,
    });
    // Store the reverse mapping so enrichResults can find the pageId
    tx.objectStore(CHUNK_PAGE_MAP_STORE).put({
      chunkId: chunkId as unknown as number,
      pageId: pageId as unknown as number,
    });
    await txDone(tx);
  }

  async saveEmbedding(chunkId: ChunkId, embedding: Embedding): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(EMBEDDING_STORE, 'readwrite');
    await promisify(tx.objectStore(EMBEDDING_STORE).put({
      chunkId: chunkId as unknown as number,
      embedding: Array.from(embedding),
    }));
  }

  async getMetadata(pageId: PageId): Promise<PageMetadata | undefined> {
    const db = await openDB();
    const tx = db.transaction(METADATA_STORE, 'readonly');
    return promisify(tx.objectStore(METADATA_STORE).get(pageId));
  }

  async getChunkText(chunkId: ChunkId): Promise<ChunkText | undefined> {
    const db = await openDB();
    const tx = db.transaction(CHUNK_STORE, 'readonly');
    const result = await promisify<{ chunkId: number; chunkText: ChunkText }>(
      tx.objectStore(CHUNK_STORE).get(chunkId as unknown as number)
    );
    return result?.chunkText;
  }

  async getPageIdForChunk(chunkId: ChunkId): Promise<PageId | undefined> {
    const db = await openDB();
    const tx = db.transaction(CHUNK_PAGE_MAP_STORE, 'readonly');
    const result = await promisify<{ chunkId: number; pageId: number } | undefined>(
      tx.objectStore(CHUNK_PAGE_MAP_STORE).get(chunkId as unknown as number)
    );
    return result?.pageId as unknown as PageId | undefined;
  }

  async getAllEmbeddings(): Promise<StoredEmbedding[]> {
    const db = await openDB();
    const tx = db.transaction(EMBEDDING_STORE, 'readonly');
    return promisify(tx.objectStore(EMBEDDING_STORE).getAll());
  }

  /** Store one page's chunks + reverse maps in a single transaction (no embeddings). */
  async saveChunks(pageId: PageId, chunks: { chunkId: ChunkId; text: ChunkText }[]): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([CHUNK_STORE, CHUNK_PAGE_MAP_STORE], 'readwrite');
    const chunkStore = tx.objectStore(CHUNK_STORE);
    const mapStore = tx.objectStore(CHUNK_PAGE_MAP_STORE);
    for (const c of chunks) {
      chunkStore.put({ chunkId: c.chunkId as unknown as number, chunkText: c.text });
      mapStore.put({ chunkId: c.chunkId as unknown as number, pageId: pageId as unknown as number });
    }
    await txDone(tx);
  }

  /** Chunks that have text stored but no embedding yet (for lazy embedding in the popup). */
  async getUnembeddedChunks(limit = 500): Promise<{ chunkId: ChunkId; text: ChunkText }[]> {
    const db = await openDB();
    const tx = db.transaction([CHUNK_STORE, EMBEDDING_STORE], 'readonly');
    const [chunks, embeddedKeys] = await Promise.all([
      promisify<{ chunkId: number; chunkText: ChunkText }[]>(tx.objectStore(CHUNK_STORE).getAll()),
      promisify<IDBValidKey[]>(tx.objectStore(EMBEDDING_STORE).getAllKeys()),
    ]);
    const embedded = new Set(embeddedKeys as number[]);
    const out: { chunkId: ChunkId; text: ChunkText }[] = [];
    for (const c of chunks) {
      if (!embedded.has(c.chunkId)) {
        out.push({ chunkId: c.chunkId as unknown as ChunkId, text: c.chunkText });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  async enrichResults(results: SearchResult[]): Promise<EnrichedResult[]> {
    const enriched: EnrichedResult[] = [];
    for (const r of results) {
      const pageId = await this.getPageIdForChunk(r.id);
      if (!pageId) continue;
      const metadata = await this.getMetadata(pageId);
      const chunkText = await this.getChunkText(r.id);
      if (metadata && chunkText) {
        enriched.push({
          ...r,
          metadata,
          chunkText,
        });
      }
    }
    return enriched;
  }

  // --- New methods for revolutionary features ---

  async getAllMetadata(): Promise<PageMetadata[]> {
    const db = await openDB();
    const tx = db.transaction(METADATA_STORE, 'readonly');
    return promisify(tx.objectStore(METADATA_STORE).getAll());
  }

  async getChunkTextCount(): Promise<number> {
    const db = await openDB();
    const tx = db.transaction(CHUNK_STORE, 'readonly');
    return promisify(tx.objectStore(CHUNK_STORE).count());
  }

  async getStats(): Promise<BrowsingStats> {
    const allPages = await this.getAllMetadata();
    const totalChunks = await this.getChunkTextCount();

    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now - 7 * 86_400_000);
    const monthStart = new Date(now - 30 * 86_400_000);

    // Domain counting
    const domainMap = new Map<string, { count: number; favicon?: string | undefined }>();
    let totalReadingTime = 0;

    for (const page of allPages) {
      const domain = page.domain ?? extractDomain(page.url);
      const existing = domainMap.get(domain);
      if (existing) {
        existing.count += 1;
        if (!existing.favicon && page.favicon) existing.favicon = page.favicon;
      } else {
        domainMap.set(domain, { count: 1, favicon: page.favicon });
      }
      totalReadingTime += page.readingTime ?? 0;
    }

    const topDomains: DomainStat[] = Array.from(domainMap.entries())
      .map(([domain, data]) => ({ domain, count: data.count, favicon: data.favicon }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalPages: allPages.length,
      totalChunks,
      totalDomains: domainMap.size,
      topDomains,
      todayCount: allPages.filter(p => p.timestamp >= todayStart.getTime()).length,
      weekCount: allPages.filter(p => p.timestamp >= weekStart.getTime()).length,
      monthCount: allPages.filter(p => p.timestamp >= monthStart.getTime()).length,
      estimatedReadingMinutes: Math.round(totalReadingTime),
    };
  }

  async getTimeline(range: 'today' | 'week' | 'month' | 'all'): Promise<TimelineEntry[]> {
    const allPages = await this.getAllMetadata();
    const now = Date.now();

    let cutoff = 0;
    switch (range) {
      case 'today': {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        cutoff = d.getTime();
        break;
      }
      case 'week': cutoff = now - 7 * 86_400_000; break;
      case 'month': cutoff = now - 30 * 86_400_000; break;
      case 'all': cutoff = 0; break;
    }

    const filtered = allPages
      .filter(p => p.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);

    // Group by date
    const dateMap = new Map<string, PageMetadata[]>();
    for (const page of filtered) {
      const dateStr = new Date(page.timestamp).toISOString().split('T')[0]!;
      const existing = dateMap.get(dateStr);
      if (existing) {
        existing.push(page);
      } else {
        dateMap.set(dateStr, [page]);
      }
    }

    return Array.from(dateMap.entries()).map(([date, pages]) => ({ date, pages }));
  }

  async exportAll(): Promise<{ json: string; count: number }> {
    const allPages = await this.getAllMetadata();
    const allEmbeddings = await this.getAllEmbeddings();

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      pages: allPages,
      embeddingCount: allEmbeddings.length,
    };

    return {
      json: JSON.stringify(exportData, null, 2),
      count: allPages.length,
    };
  }

  async clearAll(): Promise<void> {
    const db = await openDB();
    const storeNames = [METADATA_STORE, CHUNK_STORE, EMBEDDING_STORE, CHUNK_PAGE_MAP_STORE];
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      tx.objectStore(name).clear();
    }
    await txDone(tx);
  }

  async getChunkCount(): Promise<number> {
    const db = await openDB();
    const tx = db.transaction(EMBEDDING_STORE, 'readonly');
    return promisify(tx.objectStore(EMBEDDING_STORE).count());
  }
}

// Helper
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

export const metadataStore = new MetadataStore();
