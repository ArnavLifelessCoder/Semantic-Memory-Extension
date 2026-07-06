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
import type { RuntimeMessage, PageId, ChunkText, ExtensionSettings } from '../types';
import browser from 'webextension-polyfill';

/** Re-index a URL at most this often; more frequent visits only bump metadata. */
const REINDEX_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

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

// --- Omnibox: type "mem <query>" in the address bar ---

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

if (browser.omnibox) {
  browser.omnibox.setDefaultSuggestion({
    description: 'Search your Semantic Memory (press Enter to open the popup search)',
  });

  browser.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const q = text.trim().toLowerCase();
    if (!q) {
      suggest([]);
      return;
    }
    try {
      const pages = await metadataStore.getAllMetadata();
      const terms = q.split(/\s+/).filter(Boolean);
      const matches = pages
        .filter((p) => {
          const haystack = `${p.title} ${p.domain ?? ''} ${p.url}`.toLowerCase();
          return terms.every((t) => haystack.includes(t));
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 6);
      // Plain escaped text only — Chrome parses descriptions as XML, Firefox
      // renders them literally, so markup tags are not portable.
      suggest(matches.map((p) => ({
        content: p.url,
        description: `${escapeXml(p.title)} — ${escapeXml(p.domain ?? p.url)}`,
      })));
    } catch (err) {
      console.error('[SW] omnibox suggest failed:', err);
      suggest([]);
    }
  });

  browser.omnibox.onInputEntered.addListener((text, disposition) => {
    if (text.startsWith('http')) {
      // A concrete suggestion was chosen — open it per the user's disposition.
      if (disposition === 'currentTab') {
        void browser.tabs.update({ url: text });
      } else {
        void browser.tabs.create({ url: text, active: disposition === 'newForegroundTab' });
      }
      return;
    }
    // Free-text query: hand it to the popup's semantic search.
    void browser.storage.local.set({ pendingSearch: text }).then(() => {
      // openPopup is not available in every browser/context — best effort.
      const action = browser.action as { openPopup?: () => Promise<void> };
      action.openPopup?.().catch(() => { /* user can open the popup manually */ });
    });
  });
}

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
    const settingsResult = await browser.storage.local.get('settings');
    const settings = settingsResult['settings'] as Partial<ExtensionSettings> | undefined;
    if (settings?.indexingEnabled === false) return;

    // Upsert: a re-visited URL updates the existing page instead of creating a
    // duplicate (which would inflate stats and produce duplicate search hits).
    const existing = await metadataStore.getPageByUrl(url);
    if (existing) {
      const fresh = Date.now() - existing.timestamp < REINDEX_INTERVAL_MS;
      await metadataStore.saveMetadata(existing.pageId, {
        ...existing,
        title,
        timestamp: Date.now(),
        favicon: favicon ?? existing.favicon,
        readingTime: readingTime ?? existing.readingTime,
        visitCount: (existing.visitCount ?? 1) + 1,
      });
      if (fresh) {
        console.log(`[SW] refreshed metadata (content still fresh): ${title}`);
        return;
      }
      // Content may have changed since last index — replace the old chunks.
      await metadataStore.deletePage(existing.pageId);
      await metadataStore.saveMetadata(existing.pageId, {
        ...existing,
        title,
        timestamp: Date.now(),
        favicon: favicon ?? existing.favicon,
        readingTime: readingTime ?? existing.readingTime,
        visitCount: (existing.visitCount ?? 1) + 1,
      });
      await metadataStore.saveChunks(
        existing.pageId,
        chunks.map((text, i) => ({ chunkId: makeChunkId(existing.pageId as unknown as number, i), text }))
      );
      console.log(`[SW] re-indexed ${chunks.length} chunks: ${title}`);
      return;
    }

    await metadataStore.saveMetadata(pageId, {
      pageId,
      url,
      title,
      timestamp: Date.now(),
      favicon,
      readingTime,
      domain,
      visitCount: 1,
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
