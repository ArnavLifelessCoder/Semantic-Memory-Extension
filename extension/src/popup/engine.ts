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
import { toEmbedding, toRawText, toPageId, type Embedding, type EnrichedResult, type ChunkId } from '../types';
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

export async function search(query: string, onProgress?: ProgressFn): Promise<EnrichedResult[]> {
  await ensureIndex();
  await embedPending(onProgress);
  const qe = await embed(query);
  const hits = store.search(qe, 20);
  return metadataStore.enrichResults(hits);
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

/** Reset the in-memory index after a data clear. */
export async function resetIndex(): Promise<void> {
  await store.reset();
  indexReady = Promise.resolve();
}

/**
 * Index the currently-active tab directly from the popup (no content-script /
 * service-worker dependency). Returns the number of chunks stored, or 0 if the
 * page can't be indexed or was already captured.
 */
export async function indexCurrentPage(): Promise<number> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !tab.url.startsWith('http')) return 0;

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
