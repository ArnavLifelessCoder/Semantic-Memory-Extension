import { useState, useCallback } from 'react';
import { Icon } from '../Icon';
import { summarize } from '../engine';
import browser from 'webextension-polyfill';

export function QuickSummary() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState('');

  const handleSummarize = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSummary(null);
    setKeyPoints([]);

    try {
      // Get current tab content
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith('http')) {
        setError('Cannot summarize this page');
        setLoading(false);
        return;
      }
      setPageTitle(tab.title ?? 'Current Page');

      // Execute script to get CLEANED page text (strip nav/header/footer/TOC).
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const main = document.querySelector(
            'main, article, [role="main"], #mw-content-text, #content, .post-content, .article-body'
          );
          const root = main ?? document.body;
          const SKIP = 'nav, header, footer, aside, table, figure, .toc, #toc, .navbox, .infobox, .sidebar, .mw-editsection, [role="navigation"], [aria-hidden="true"]';
          const blocks = root.querySelectorAll('p, h1, h2, h3, h4, li');
          const parts: string[] = [];
          blocks.forEach((el) => {
            if ((el as HTMLElement).closest(SKIP)) return;
            const t = (el as HTMLElement).innerText.trim();
            if (t.length > 30) parts.push(t);
          });
          const text = parts.join('\n');
          return text.length > 200 ? text : document.body.innerText;
        },
      });
      const text = results[0]?.result as string | undefined;
      if (!text || text.length < 100) {
        setError('Not enough content to summarize');
        setLoading(false);
        return;
      }

      try {
        const result = await summarize(text.slice(0, 10000));
        setSummary(result.summary);
        setKeyPoints(result.keyPoints);
      } catch (err) {
        console.error('[QuickSummary] failed:', err);
        setError('Summarization failed — the model could not load. See popup console.');
      }
      setLoading(false);
    } catch (err) {
      setError('Failed to access page content');
      setLoading(false);
    }
  }, []);

  if (!summary && !loading && !error) {
    return (
      <div className="animate-fade-in" style={{ padding: '0 4px' }}>
        <button className="btn btn-ghost w-full" onClick={handleSummarize}
          style={{ justifyContent: 'flex-start', gap: '10px', padding: '10px 12px' }}>
          <Icon name="sparkle" size={16} style={{ color: 'var(--accent)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>Summarize this page</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
              Extractive summary + key points
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ padding: '0 4px' }}>
      <div className="glass-card" style={{ padding: '14px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
          <div className="flex items-center gap-sm">
            <Icon name="sparkle" size={14} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold" style={{ fontSize: '12px' }}>
              {loading ? 'Analyzing…' : 'Summary'}
            </span>
          </div>
          {!loading && (
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px' }} onClick={() => { setSummary(null); setKeyPoints([]); setError(null); }}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="shimmer" style={{ height: 12, width: '100%' }} />
            <div className="shimmer" style={{ height: 12, width: '80%' }} />
            <div className="shimmer" style={{ height: 12, width: '60%' }} />
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {summary && (
          <>
            {pageTitle && (
              <div className="truncate text-xs text-muted" style={{ marginBottom: '8px' }}>
                {pageTitle}
              </div>
            )}
            <p style={{
              fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6,
              marginBottom: keyPoints.length > 0 ? '10px' : 0,
            }}>
              {summary}
            </p>
            {keyPoints.length > 0 && (
              <div>
                <div className="text-xs font-medium text-accent" style={{ marginBottom: '6px' }}>
                  Key Points
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {keyPoints.map((point, i) => (
                    <li key={i} className="text-xs" style={{
                      color: 'var(--text-secondary)', paddingLeft: '12px',
                      position: 'relative', lineHeight: 1.5,
                    }}>
                      <span style={{
                        position: 'absolute', left: 0, color: 'var(--accent-start)',
                      }}>•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
