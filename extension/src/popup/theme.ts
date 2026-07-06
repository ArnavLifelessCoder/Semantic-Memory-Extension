import type { ExtensionSettings } from '../types';

export type Theme = ExtensionSettings['theme'];

let mediaQuery: MediaQueryList | null = null;
let mediaListener: (() => void) | null = null;

/**
 * Apply the chosen theme by setting `data-theme` on <html>. 'auto' follows the
 * OS preference and live-updates while the popup is open.
 */
export function applyTheme(theme: Theme): void {
  if (mediaQuery && mediaListener) {
    mediaQuery.removeEventListener('change', mediaListener);
    mediaQuery = null;
    mediaListener = null;
  }

  const set = (resolved: 'dark' | 'light') => {
    document.documentElement.dataset['theme'] = resolved;
  };

  if (theme === 'auto') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaListener = () => set(mediaQuery!.matches ? 'light' : 'dark');
    mediaQuery.addEventListener('change', mediaListener);
    set(mediaQuery.matches ? 'light' : 'dark');
  } else {
    set(theme);
  }
}
