declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type RawText = Brand<string, 'RawText'>;
export type ChunkText = Brand<string, 'ChunkText'>;
export type PageId = Brand<number, 'PageId'>;
export type ChunkId = Brand<number, 'ChunkId'>;
export type Embedding = Brand<Float32Array, 'Embedding'>;

export const toRawText = (s: string): RawText => s as RawText;
export const toChunkText = (s: string): ChunkText => s as ChunkText;
export const toEmbedding = (f: Float32Array): Embedding => f as Embedding;
export const toPageId = (n: number): PageId => n as PageId;
export const toChunkId = (n: number): ChunkId => n as ChunkId;

// --- Worker messages (unchanged) ---

export type ToWorkerMessage =
  | { type: 'EMBED_CHUNKS'; pageId: PageId; chunks: ChunkText[] }
  | { type: 'EMBED_QUERY'; query: RawText }
  | { type: 'KEEP_ALIVE' };

export type FromWorkerMessage =
  | { type: 'EMBEDDINGS_READY'; pageId: PageId; embeddings: Embedding[] }
  | { type: 'QUERY_READY'; embedding: Embedding }
  | { type: 'ERROR'; message: string };

// --- Extended metadata ---

export interface PageMetadata {
  pageId: PageId;
  url: string;
  title: string;
  timestamp: number;
  favicon?: string | undefined;
  readingTime?: number | undefined; // minutes
  domain?: string | undefined;
  visitCount?: number | undefined;
}

// --- Settings ---

export interface ExtensionSettings {
  theme: 'dark' | 'light' | 'auto';
  blacklistedDomains: string[];
  indexingEnabled: boolean;
  syncEnabled: boolean;
  syncApiUrl: string;
  syncToken: string;
  globalShortcut: string;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  theme: 'dark',
  blacklistedDomains: [],
  indexingEnabled: true,
  syncEnabled: false,
  syncApiUrl: '',
  syncToken: '',
  globalShortcut: 'Ctrl+Shift+S',
};

export type SearchRange = 'all' | 'today' | 'week' | 'month';

// --- Statistics ---

export interface DomainStat {
  domain: string;
  count: number;
  favicon?: string | undefined;
}

export interface TimelineEntry {
  date: string; // YYYY-MM-DD
  pages: PageMetadata[];
}

export interface BrowsingStats {
  totalPages: number;
  totalChunks: number;
  totalDomains: number;
  topDomains: DomainStat[];
  todayCount: number;
  weekCount: number;
  monthCount: number;
  estimatedReadingMinutes: number;
  /** Pages indexed per day for the last 7 days, oldest first. */
  dailyCounts: number[];
}

// --- Runtime messages (expanded) ---

export type RuntimeMessage =
  // Original
  | { type: 'PAGE_CONTENT'; payload: { chunks: ChunkText[]; pageId: PageId; url: string; title: string; favicon?: string; readingTime?: number; domain?: string } }
  | { type: 'SEARCH'; payload: { query: RawText } }
  | { type: 'SEARCH_RESULTS'; payload: EnrichedResult[] }
  // Stats
  | { type: 'GET_STATS'; payload?: undefined }
  | { type: 'STATS_RESULT'; payload: BrowsingStats }
  // Timeline
  | { type: 'GET_TIMELINE'; payload: { range: 'today' | 'week' | 'month' | 'all' } }
  | { type: 'TIMELINE_RESULT'; payload: TimelineEntry[] }
  // Summarize
  | { type: 'SUMMARIZE_PAGE'; payload: { text: string; title: string } }
  | { type: 'SUMMARY_RESULT'; payload: { summary: string; keyPoints: string[] } }
  // Similar pages
  | { type: 'FIND_SIMILAR'; payload: { url: string; text: string } }
  | { type: 'SIMILAR_RESULT'; payload: EnrichedResult[] }
  // Data management
  | { type: 'EXPORT_DATA'; payload?: undefined }
  | { type: 'EXPORT_RESULT'; payload: { json: string; count: number } }
  | { type: 'CLEAR_DATA'; payload?: undefined }
  | { type: 'CLEAR_RESULT'; payload: { success: boolean } }
  // Settings
  | { type: 'GET_SETTINGS'; payload?: undefined }
  | { type: 'SETTINGS_RESULT'; payload: ExtensionSettings }
  | { type: 'SAVE_SETTINGS'; payload: ExtensionSettings }
  | { type: 'SETTINGS_SAVED'; payload: { success: boolean } }
  // Recent searches
  | { type: 'GET_RECENT_SEARCHES'; payload?: undefined }
  | { type: 'RECENT_SEARCHES_RESULT'; payload: string[] };

// --- Search types ---

export interface SearchResult {
  id: ChunkId;
  score: number;
}

export interface EnrichedResult extends SearchResult {
  metadata: PageMetadata;
  chunkText: ChunkText;
}

export interface Indexable {
  id: ChunkId;
  embedding: Embedding;
}
