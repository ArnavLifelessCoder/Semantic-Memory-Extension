import { DEFAULT_SETTINGS, type ExtensionSettings } from '../types';
import browser from 'webextension-polyfill';

export async function getSettings(): Promise<ExtensionSettings> {
  try {
    const r = await browser.storage.local.get('settings');
    const stored = r['settings'] as Partial<ExtensionSettings> | undefined;
    // Merge with defaults so settings added in newer versions are always present.
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export async function getRecentSearches(): Promise<string[]> {
  try {
    const r = await browser.storage.local.get('recentSearches');
    return (r['recentSearches'] as string[] | undefined) ?? [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(query: string): Promise<void> {
  const q = query.trim();
  if (!q) return;
  try {
    const recent = await getRecentSearches();
    const next = [q, ...recent.filter((s) => s !== q)].slice(0, 10);
    await browser.storage.local.set({ recentSearches: next });
  } catch {
    /* ignore */
  }
}
