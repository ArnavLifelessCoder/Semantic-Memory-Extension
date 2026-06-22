import { toChunkId, type ChunkId } from '../types';

/** Deterministic FNV-1a hash of (pageId, chunkIndex) → stable 32-bit chunk id. */
export function makeChunkId(pageId: number, chunkIndex: number): ChunkId {
  let hash = 2166136261;
  const combined = `${pageId}:${chunkIndex}`;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return toChunkId(hash >>> 0);
}
