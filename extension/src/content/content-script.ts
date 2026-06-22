import { Readability } from '@mozilla/readability';
import { ArticleSchema } from './content-schema';
import { chunkText } from './chunker';
import { toRawText, toPageId } from '../types';
import type { RuntimeMessage, ExtensionSettings } from '../types';
import browser from 'webextension-polyfill';

// --- Domain blacklist ---

async function getBlacklistedDomains(): Promise<string[]> {
  try {
    const result = await browser.storage.local.get('settings');
    const settings = result['settings'] as ExtensionSettings | undefined;
    return settings?.blacklistedDomains ?? [];
  } catch {
    return [];
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

function extractFavicon(url: string): string {
  try {
    const u = new URL(url);
    // Use a local favicon path — tab.favIconUrl is preferred when available,
    // but from the content script we fall back to /favicon.ico on the same origin.
    return `${u.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function estimateReadingTime(text: string): number {
  const wordCount = text.split(/\s+/).length;
  return Math.max(1, Math.round(wordCount / 200)); // 200 wpm average
}

function extractPageContent(): void {
  const domain = extractDomain(location.href);

  // Skip chrome:// pages and other non-http pages
  if (!location.href.startsWith('http')) return;

  // Check blacklist asynchronously, then proceed
  getBlacklistedDomains().then(blacklist => {
    if (blacklist.some(d => domain.includes(d))) {
      console.debug('[SemanticMemory] skipping blacklisted domain:', domain);
      return;
    }

    const parsed = new Readability(document.cloneNode(true) as Document).parse();
    const result = ArticleSchema.safeParse({
      title: parsed?.title ?? document.title,
      textContent: parsed?.textContent ?? document.body.innerText,
      url: location.href,
    });

    if (!result.success) {
      console.debug('[SemanticMemory] skipping page — failed validation', result.error.flatten());
      return;
    }

    const cleanText = toRawText(result.data.textContent);
    const chunks = chunkText(cleanText);

    if (chunks.length === 0) return;

    // Combine timestamp with random bits to avoid collision on simultaneous tab loads
    const pageId = toPageId(Date.now() * 1000 + Math.floor(Math.random() * 1000));

    const favicon = extractFavicon(location.href);
    const readingTime = estimateReadingTime(result.data.textContent);

    const msg: RuntimeMessage = {
      type: 'PAGE_CONTENT',
      payload: {
        chunks,
        pageId,
        url: result.data.url,
        title: result.data.title,
        favicon,
        readingTime,
        domain,
      },
    };

    void browser.runtime.sendMessage(msg);
  }).catch(err => {
    console.error('[SemanticMemory] error checking blacklist:', err);
  });
}

if (document.readyState === 'complete') {
  extractPageContent();
} else {
  window.addEventListener('load', extractPageContent, { once: true });
}
