import type { ChunkId, Embedding, SearchResult, Indexable } from '../types';
import { IndexError } from '../types/errors';

const DIM = 384;

/**
 * Pure-JS brute-force vector store.
 *
 * We deliberately avoid hnswlib-wasm here: its Emscripten glue initialises the
 * WASM module with `eval()`, which Manifest V3's CSP forbids
 * (`script-src 'self' 'wasm-unsafe-eval'` allows WASM compilation but NOT eval),
 * causing "Failed to initialise HNSW index" at runtime.
 *
 * Embeddings from MiniLM are L2-normalised (`normalize: true`), so cosine
 * similarity reduces to a dot product. A linear scan over a few thousand — even
 * tens of thousands — of 384-d vectors is only a few milliseconds, which is well
 * within budget for an on-device popup search.
 */
export class VectorStore<T extends Indexable = Indexable> {
  private vectors = new Map<number, Float32Array>();
  private ready = false;

  // eslint-disable-next-line @typescript-eslint/require-await
  async init(force = false): Promise<void> {
    if (force) this.vectors.clear();
    this.ready = true;
  }

  /** Drop all vectors and start from an empty index. */
  async reset(): Promise<void> {
    return this.init(true);
  }

  addEmbedding(id: ChunkId, vector: Embedding): void {
    const v = vector as unknown as Float32Array;
    if (v.length !== DIM) return; // ignore malformed vectors
    this.vectors.set(id as unknown as number, v);
  }

  add(item: T): void {
    this.addEmbedding(item.id, item.embedding);
  }

  search(queryVector: Embedding, k = 20): SearchResult[] {
    if (this.vectors.size === 0) return [];
    try {
      const q = queryVector as unknown as Float32Array;
      const heap: SearchResult[] = [];

      for (const [id, vec] of this.vectors) {
        let dot = 0;
        for (let i = 0; i < DIM; i++) dot += q[i]! * vec[i]!;
        heap.push({ id: id as unknown as ChunkId, score: dot });
      }

      heap.sort((a, b) => b.score - a.score);
      return heap.slice(0, Math.min(k, heap.length));
    } catch (err) {
      throw new IndexError('Search failed', 'search');
    }
  }

  getCurrentCount(): number {
    return this.vectors.size;
  }
}
