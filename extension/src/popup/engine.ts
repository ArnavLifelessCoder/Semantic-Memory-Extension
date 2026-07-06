/**
 * In-popup search engine.
 *
 * Runs the embedding model (Transformers.js / MiniLM) and the vector index
 * directly in the popup — a normal extension DOM page where the WASM backend
 * works reliably. No service-worker/offscreen round-trips, so failures are
 * visible in the popup console and only affect search (not analytics/timeline).
 *
 * Chunk text + page metadata are written to IndexedDB by the service worker as
 * you browse; this engine lazily embeds any chunks that don't have a vector yet.
 */

import { metadataStore } from '../store/metadata-store';
import { VectorStore } from '../store/vector-store';
import { makeChunkId } from '../store/chunk-id';
import { chunkText } from '../content/chunker';
import { shouldIndexUrl, isNoiseUrl } from '../content/url-filter';
import { getSettings } from './storage';
import { toEmbedding, toRawText, toPageId, type Embedding, type EnrichedResult, type ChunkId, type PageId, type SearchRange } from '../types';
// Type-only import — erased at runtime, so it does NOT pull Transformers.js into
// the popup bundle's load path. The actual module is loaded lazily below.
import type { FeatureExtractionPipeline } from '@xenova/transformers';
import browser from 'webextension-polyfill';

const DIM = 384;
const store = new VectorStore();

let embedder: FeatureExtractionPipeline | null = null;
let embedderPromise: Promise<FeatureExtractionPipeline> | null = null;
let indexReady: Promise<void> | null = null;

export type ProgressFn = (done: number, total: number) => void;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedder) return embedder;
  if (!embedderPromise) {
    embedderPromise = (async () => {
      console.log('[engine] loading Transformers.js…');
      // Dynamic import: the heavy ML module (and its onnxruntime eval paths) only
      // execute when search/summarize is first used — never at popup startup.
      const { pipeline, env } = await import('@xenova/transformers');
      try {
        env.useBrowserCache = true;
        env.allowLocalModels = false;
        const wasm = env.backends?.onnx?.wasm;
        if (wasm) {
          wasm.numThreads = 1;
          wasm.proxy = false;
        }
      } catch (err) {
        console.warn('[engine] env config warning:', err);
      }
      console.log('[engine] loading MiniLM model…');
      const p = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
      embedder = p;
      console.log('[engine] model ready');
      return p;
    })().catch((err) => {
      embedderPromise = null;
      console.error('[engine] model failed to load:', err);
      throw err;
    });
  }
  return embedderPromise;
}

async function embed(text: string): Promise<Embedding> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return toEmbedding(new Float32Array(output.data as Float32Array));
}

/** Load already-computed embeddings from IndexedDB into the in-memory index (once). */
async function ensureIndex(): Promise<void> {
  if (!indexReady) {
    indexReady = (async () => {
      await store.init();
      const rows = await metadataStore.getAllEmbeddings();
      for (const r of rows) {
        store.addEmbedding(r.chunkId as unknown as ChunkId, new Float32Array(r.embedding) as unknown as Embedding);
      }
      console.log(`[engine] index loaded with ${rows.length} embeddings`);
    })();
  }
  return indexReady;
}

let embedding = false;

/** Embed any chunks that have text but no vector yet, adding them to the index. */
export async function embedPending(onProgress?: ProgressFn): Promise<number> {
  await ensureIndex();
  if (embedding) return 0;
  embedding = true;
  let count = 0;
  try {
    const pending = await metadataStore.getUnembeddedChunks(500);
    if (pending.length === 0) return 0;
    console.log(`[engine] embedding ${pending.length} pending chunks…`);
    for (let i = 0; i < pending.length; i++) {
      const { chunkId, text } = pending[i]!;
      try {
        const vec = await embed(text as unknown as string);
        store.addEmbedding(chunkId, vec);
        await metadataStore.saveEmbedding(chunkId, vec);
        count++;
      } catch (err) {
        console.error('[engine] embed chunk failed:', err);
      }
      onProgress?.(i + 1, pending.length);
    }
  } finally {
    embedding = false;
  }
  return count;
}

// --- Hybrid ranking helpers ---

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'that', 'this', 'is', 'are', 'was', 'were', 'about', 'how', 'what', 'when',
  'where', 'who', 'why', 'i', 'my', 'me', 'it', 'its', 'read', 'article',
]);

function queryTerms(query: string): string[] {
  return Array.from(new Set(
    query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
  ));
}

/** Fraction of query terms that appear in `text` (case-insensitive). */
function termCoverage(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let found = 0;
  for (const t of terms) if (lower.includes(t)) found++;
  return found / terms.length;
}

const MIN_SEMANTIC_SCORE = 0.28;
/** Drop results scoring below this fraction of the best hit — once the good
 *  matches run out, the tail is unrelated noise that only pads the list. */
const RELATIVE_CUTOFF = 0.65;
const MAX_RESULTS = 12;
const DAY_MS = 86_400_000;

/**
 * Combine the semantic similarity with lexical evidence and freshness.
 * Semantic score dominates; exact keyword hits in the chunk or (especially)
 * the title, and recently visited pages, get a measured boost.
 */
function rankResults(query: string, results: EnrichedResult[], range: SearchRange): EnrichedResult[] {
  const terms = queryTerms(query);
  const now = Date.now();

  let cutoff = 0;
  if (range === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    cutoff = d.getTime();
  } else if (range === 'week') cutoff = now - 7 * DAY_MS;
  else if (range === 'month') cutoff = now - 30 * DAY_MS;

  const scored = results
    .filter((r) => r.score >= MIN_SEMANTIC_SCORE && r.metadata.timestamp >= cutoff)
    .map((r) => {
      const lexical = termCoverage(terms, r.chunkText as unknown as string);
      const title = termCoverage(terms, r.metadata.title);
      const ageDays = Math.max(0, (now - r.metadata.timestamp) / DAY_MS);
      const recency = Math.exp(-ageDays / 30); // 1 today → ~0.37 after a month
      const combined = Math.min(1, r.score + 0.08 * lexical + 0.1 * title + 0.03 * recency);
      return { ...r, score: combined };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0]?.score ?? 0;
  return scored
    .filter((r) => r.score >= top * RELATIVE_CUTOFF)
    .slice(0, MAX_RESULTS);
}

// Small LRU-ish cache so repeated queries skip the model entirely.
const queryCache = new Map<string, Embedding>();
const QUERY_CACHE_MAX = 32;

async function embedQuery(query: string): Promise<Embedding> {
  const key = query.trim().toLowerCase();
  const cached = queryCache.get(key);
  if (cached) return cached;
  const vec = await embed(query);
  if (queryCache.size >= QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(key, vec);
  return vec;
}

export interface SearchOptions {
  range?: SearchRange;
}

export async function search(query: string, onProgress?: ProgressFn, options?: SearchOptions): Promise<EnrichedResult[]> {
  await ensureIndex();
  await embedPending(onProgress);
  const qe = await embedQuery(query);
  // Over-fetch: hybrid re-ranking and the page-level dedupe both shrink the list.
  const hits = store.search(qe, 48);
  const enriched = await metadataStore.enrichResults(hits);
  return rankResults(query, enriched, options?.range ?? 'all');
}

/** Remove a page from IndexedDB and the live in-memory index. */
export async function deletePageFromIndex(pageId: PageId): Promise<void> {
  const chunkIds = await metadataStore.deletePage(pageId);
  store.removeMany(chunkIds);
}

// --- Ask My Memory: extractive question answering across the whole index ---

export function isQuestion(q: string): boolean {
  const t = q.trim().toLowerCase();
  return t.endsWith('?') ||
    /^(who|what|when|where|why|how|which|did|does|do|is|are|can|could|should|was|were|will)\b/.test(t);
}

export interface AskResult {
  answer: string;
  sources: { title: string; url: string; domain: string }[];
}

/**
 * Build an extractive answer from already-retrieved results: split the top
 * chunks into sentences, embed each, and stitch the sentences closest to the
 * question into an answer with cited source pages. Returns null when nothing
 * is confident enough to present as an answer.
 */
export async function answerFromResults(question: string, results: EnrichedResult[]): Promise<AskResult | null> {
  const top = results.slice(0, 6);
  if (top.length === 0) return null;
  const qe = await embedQuery(question);

  const candidates: { sentence: string; result: EnrichedResult }[] = [];
  const seen = new Set<string>();
  outer: for (const r of top) {
    const sentences = (r.chunkText as unknown as string).match(/[^.!?]+[.!?]+/g) ?? [];
    for (const raw of sentences) {
      const s = raw.trim();
      if (s.length < 40 || s.length > 320) continue;
      const letters = (s.match(/[a-zA-Z]/g) ?? []).length;
      if (letters / s.length < 0.6) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ sentence: s, result: r });
      if (candidates.length >= 32) break outer;
    }
  }
  if (candidates.length === 0) return null;

  const scored: { sentence: string; result: EnrichedResult; score: number }[] = [];
  for (const c of candidates) {
    const e = await embed(c.sentence);
    let dot = 0;
    for (let i = 0; i < DIM; i++) dot += (e as unknown as Float32Array)[i]! * (qe as unknown as Float32Array)[i]!;
    scored.push({ ...c, score: dot });
  }
  scored.sort((a, b) => b.score - a.score);
  if ((scored[0]?.score ?? 0) < 0.42) return null;

  const picked = scored.slice(0, 3).filter((x) => x.score >= 0.36);
  const answer = picked.map((p) => p.sentence).join(' ');
  const sources = Array.from(
    new Map(picked.map((p) => [p.result.metadata.url, {
      title: p.result.metadata.title,
      url: p.result.metadata.url,
      domain: p.result.metadata.domain ?? '',
    }])).values()
  );
  return { answer, sources };
}

// --- Memory Map: 2D projection + clustering of the whole knowledge space ---

export interface MapPoint {
  pageId: PageId;
  title: string;
  url: string;
  domain: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  cluster: number;
}

function dotVec(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < DIM; i++) d += a[i]! * b[i]!;
  return d;
}

/** Top principal component via power iteration, deflated against `exclude`. */
function principalComponent(rows: Float32Array[], exclude?: Float32Array): Float32Array {
  let v = new Float32Array(DIM);
  for (let i = 0; i < DIM; i++) v[i] = Math.sin(i * 12.9898) * 43758.5453 % 1; // deterministic seed
  for (let iter = 0; iter < 30; iter++) {
    if (exclude) {
      const proj = dotVec(v, exclude);
      for (let i = 0; i < DIM; i++) v[i]! -= proj * exclude[i]!;
    }
    const next = new Float32Array(DIM);
    for (const row of rows) {
      const d = dotVec(row, v);
      for (let i = 0; i < DIM; i++) next[i]! += d * row[i]!;
    }
    let norm = Math.sqrt(dotVec(next, next)) || 1;
    for (let i = 0; i < DIM; i++) next[i]! /= norm;
    v = next;
  }
  return v;
}

/** Plain k-means on unit vectors; returns per-row cluster assignment. */
function kMeans(rows: Float32Array[], k: number): number[] {
  const n = rows.length;
  const centroids: Float32Array[] = [];
  for (let c = 0; c < k; c++) centroids.push(Float32Array.from(rows[Math.floor((c * n) / k)]!));
  const assign = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 15; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < k; c++) {
        const sim = dotVec(rows[i]!, centroids[c]!);
        if (sim > bestSim) { bestSim = sim; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    if (!changed) break;
    for (let c = 0; c < k; c++) {
      const sum = new Float32Array(DIM);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assign[i] !== c) continue;
        for (let j = 0; j < DIM; j++) sum[j]! += rows[i]![j]!;
        count++;
      }
      if (count === 0) continue;
      const norm = Math.sqrt(dotVec(sum, sum)) || 1;
      for (let j = 0; j < DIM; j++) sum[j]! /= norm;
      centroids[c] = sum;
    }
  }
  return assign;
}

/**
 * Project every indexed page into 2D (PCA over mean chunk embeddings) and
 * cluster them into topics. Cluster labels are each cluster's dominant domain.
 */
export async function getMemoryMap(onProgress?: ProgressFn): Promise<{ points: MapPoint[]; clusterLabels: string[] }> {
  await ensureIndex();
  await embedPending(onProgress);

  const [embeddings, chunkPageMap, pages] = await Promise.all([
    metadataStore.getAllEmbeddings(),
    metadataStore.getAllChunkPageMap(),
    metadataStore.getAllMetadata(),
  ]);
  const chunkToPage = new Map(chunkPageMap.map((m) => [m.chunkId, m.pageId]));
  const pageMeta = new Map(pages.map((p) => [p.pageId as unknown as number, p]));

  // Page vector = normalized mean of its chunk embeddings.
  const sums = new Map<number, { v: Float32Array; n: number }>();
  for (const e of embeddings) {
    const pid = chunkToPage.get(e.chunkId);
    if (pid === undefined || !pageMeta.has(pid)) continue;
    let s = sums.get(pid);
    if (!s) { s = { v: new Float32Array(DIM), n: 0 }; sums.set(pid, s); }
    for (let i = 0; i < DIM; i++) s.v[i]! += e.embedding[i]!;
    s.n++;
  }
  const ids: number[] = [];
  const vecs: Float32Array[] = [];
  for (const [pid, s] of sums) {
    const v = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) v[i] = s.v[i]! / s.n;
    const norm = Math.sqrt(dotVec(v, v)) || 1;
    for (let i = 0; i < DIM; i++) v[i]! /= norm;
    ids.push(pid);
    vecs.push(v);
  }
  if (vecs.length < 3) return { points: [], clusterLabels: [] };

  // Center, then PCA to 2D.
  const mean = new Float32Array(DIM);
  for (const v of vecs) for (let i = 0; i < DIM; i++) mean[i]! += v[i]! / vecs.length;
  const centered = vecs.map((v) => {
    const c = new Float32Array(DIM);
    for (let i = 0; i < DIM; i++) c[i] = v[i]! - mean[i]!;
    return c;
  });
  const pc1 = principalComponent(centered);
  const pc2 = principalComponent(centered, pc1);
  const xs = centered.map((c) => dotVec(c, pc1));
  const ys = centered.map((c) => dotVec(c, pc2));

  const k = Math.min(6, Math.max(2, Math.round(Math.sqrt(vecs.length / 2))));
  const assign = kMeans(vecs, k);

  // Normalize coordinates to [0,1] with a small margin.
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const points: MapPoint[] = ids.map((pid, i) => {
    const meta = pageMeta.get(pid)!;
    return {
      pageId: meta.pageId,
      title: meta.title,
      url: meta.url,
      domain: meta.domain ?? '',
      x: (xs[i]! - minX) / spanX,
      y: (ys[i]! - minY) / spanY,
      cluster: assign[i]!,
    };
  });

  // Label each cluster with its dominant domain.
  const clusterLabels: string[] = [];
  for (let c = 0; c < k; c++) {
    const domains = new Map<string, number>();
    for (const p of points) {
      if (p.cluster !== c || !p.domain) continue;
      domains.set(p.domain, (domains.get(p.domain) ?? 0) + 1);
    }
    const topDomain = Array.from(domains.entries()).sort((a, b) => b[1] - a[1])[0];
    clusterLabels.push(topDomain ? topDomain[0] : `Topic ${c + 1}`);
  }

  return { points, clusterLabels };
}

export async function findSimilar(text: string): Promise<EnrichedResult[]> {
  await ensureIndex();
  await embedPending();
  const qe = await embed(text.slice(0, 2000));
  const hits = store.search(qe, 15);
  return metadataStore.enrichResults(hits);
}

export async function summarize(
  text: string
): Promise<{ summary: string; keyPoints: string[] }> {
  // Normalise whitespace and split into candidate sentences.
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const rawSentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [];

  // Filter out navigation/boilerplate fragments:
  //  - too short or too long to be a real sentence
  //  - too few words (single tokens / menu labels)
  //  - mostly non-alphabetic (dates, tables, symbols)
  //  - duplicate sentences (TOC often echoes the body)
  const seen = new Set<string>();
  const limited = rawSentences
    .map((s) => s.trim())
    .filter((s) => {
      if (s.length < 40 || s.length > 400) return false;
      const words = s.split(/\s+/);
      if (words.length < 6) return false;
      const letters = (s.match(/[a-zA-Z]/g) ?? []).length;
      if (letters / s.length < 0.6) return false; // too many digits/symbols
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);

  if (limited.length === 0) {
    return { summary: 'Not enough readable content to summarize this page.', keyPoints: [] };
  }
  if (limited.length <= 3) {
    return { summary: limited.join(' '), keyPoints: limited };
  }

  const embs: Float32Array[] = [];
  for (const s of limited) embs.push((await embed(s)) as unknown as Float32Array);

  const centroid = new Float32Array(DIM);
  for (const e of embs) for (let i = 0; i < DIM; i++) centroid[i]! += e[i]! / embs.length;

  const scored = limited.map((sentence, i) => {
    const e = embs[i]!;
    let dot = 0;
    for (let j = 0; j < DIM; j++) dot += e[j]! * centroid[j]!;
    // Light positional boost: earlier sentences tend to carry the thesis.
    const positionBoost = 1 + (limited.length - i) / (limited.length * 12);
    return { sentence, score: dot * positionBoost, index: i };
  });
  scored.sort((a, b) => b.score - a.score);

  const keyPoints = scored.slice(0, 5).sort((a, b) => a.index - b.index).map((s) => s.sentence);
  const summary = scored.slice(0, 3).sort((a, b) => a.index - b.index).map((s) => s.sentence).join(' ');
  return { summary, keyPoints };
}

/** Reset the in-memory index after a data clear or import; the next search reloads from IndexedDB. */
export async function resetIndex(): Promise<void> {
  await store.reset();
  indexReady = null;
}

/**
 * Index the currently-active tab directly from the popup (no content-script /
 * service-worker dependency). Returns the number of chunks stored, or 0 if the
 * page can't be indexed or was already captured.
 */
/**
 * Purge already-indexed noise pages (SERPs, chat app shells, webmail…) that
 * slipped in before the URL filter existed. Returns the number removed.
 */
export async function pruneNoisePages(): Promise<number> {
  const all = await metadataStore.getAllMetadata();
  const noise = all.filter((p) => isNoiseUrl(p.url));
  for (const page of noise) {
    const chunkIds = await metadataStore.deletePage(page.pageId);
    store.removeMany(chunkIds);
  }
  return noise.length;
}

export async function indexCurrentPage(): Promise<number> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return 0;

    const settings = await getSettings();
    if (!settings.indexingEnabled) return 0;
    if (!shouldIndexUrl(tab.url, settings.blacklistedDomains)) return 0;

    const already = await metadataStore.getAllMetadata();
    if (already.some((p) => p.url === tab.url)) {
      console.log('[engine] current page already indexed:', tab.url);
      return 0;
    }

    const res = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ text: document.body.innerText, title: document.title }),
    });
    const data = res[0]?.result as { text: string; title: string } | undefined;
    if (!data?.text || data.text.length < 50) return 0;

    const chunks = chunkText(toRawText(data.text));
    if (chunks.length === 0) return 0;

    const pageId = toPageId(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    let domain = '';
    try { domain = new URL(tab.url).hostname.replace('www.', ''); } catch { /* ignore */ }

    await metadataStore.saveMetadata(pageId, {
      pageId,
      url: tab.url,
      title: data.title || tab.title || tab.url,
      timestamp: Date.now(),
      favicon: tab.favIconUrl,
      readingTime: Math.max(1, Math.round(data.text.split(/\s+/).length / 200)),
      domain,
    });
    await metadataStore.saveChunks(
      pageId,
      chunks.map((text, i) => ({ chunkId: makeChunkId(pageId as unknown as number, i), text }))
    );
    console.log(`[engine] indexed current page (${chunks.length} chunks):`, data.title);
    return chunks.length;
  } catch (err) {
    console.error('[engine] indexCurrentPage failed:', err);
    return 0;
  }
}
