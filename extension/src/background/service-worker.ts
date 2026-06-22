/**
 * Service worker — lightweight indexer + context menu.
 *
 * As you browse, content scripts send extracted page chunks here; the SW writes
 * the raw chunk text + page metadata to IndexedDB (no ML in the worker). The
 * popup later embeds those chunks and runs search locally. Keeping the SW free
 * of WASM/ML makes indexing reliable and avoids MV3 CSP eval pitfalls.
 */

import { metadataStore } from '../store/metadata-store';
import { makeChunkId } from '../store/chunk-id';
import type { RuntimeMessage, PageId, ChunkText } from '../types';
import browser from 'webextension-polyfill';

// --- Context menu ---

browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'semantic-memory-search',
    title: 'Search Semantic Memory for "%s"',
    contexts: ['selection'],
  });
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'semantic-memory-search' && info.selectionText) {
    void browser.storage.local.set({ pendingSearch: info.selectionText });
  }
});

// --- Indexing ---

async function indexPage(payload: {
  chunks: ChunkText[];
  pageId: PageId;
  url: string;
  title: string;
  favicon?: string;
  readingTime?: number;
  domain?: string;
}): Promise<void> {
  const { chunks, pageId, url, title, favicon, readingTime, domain } = payload;
  try {
    await metadataStore.saveMetadata(pageId, {
      pageId,
      url,
      title,
      timestamp: Date.now(),
      favicon,
      readingTime,
      domain,
    });
    await metadataStore.saveChunks(
      pageId,
      chunks.map((text, i) => ({ chunkId: makeChunkId(pageId as unknown as number, i), text }))
    );
    console.log(`[SW] indexed ${chunks.length} chunks: ${title}`);
  } catch (err) {
    console.error('[SW] indexing failed:', err);
  }
}

browser.runtime.onMessage.addListener((msg: RuntimeMessage, _sender) => {
  if (msg.type === 'PAGE_CONTENT') {
    return indexPage(msg.payload).then(() => ({ ok: true }));
  }
  return undefined;
});
