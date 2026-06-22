import type { RawText, ChunkText } from '../types';
import { toChunkText } from '../types';

export function chunkText(text: RawText, maxTokens = 512, overlap = 64): ChunkText[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text as unknown as string];
  const chunks: ChunkText[] = [];
  let current: string[] = [];
  let tokenCount = 0;

  for (const sentence of sentences) {
    const tokens = sentence.split(' ').length;
    if (tokenCount + tokens > maxTokens) {
      chunks.push(toChunkText(current.join(' ')));
      const overlapSentences = current.slice(-Math.ceil(overlap / 15));
      current = [...overlapSentences, sentence];
      tokenCount = overlapSentences.join(' ').split(' ').length + tokens;
    } else {
      current.push(sentence);
      tokenCount += tokens;
    }
  }
  if (current.length) chunks.push(toChunkText(current.join(' ')));
  return chunks;
}
