import { useState, useCallback } from 'react';
import { Icon } from '../Icon';
import { Favicon } from './Favicon';
import { findSimilar } from '../engine';
import type { EnrichedResult } from '../../types';
import browser from 'webextension-polyfill';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffHours < 1) return 'just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export function SimilarPages() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleFindSimilar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith('http')) {
        setError('Cannot analyze this page');
        setLoading(false);
        return;
      }

      const execResults = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerText,
      });
      const text = execResults[0]?.result as string | undefined;
      if (!text || text.length < 50) {
        setError('Not enough content on this page');
        setLoading(false);
        return;
      }

      try {
        const hits = await findSimilar(text.slice(0, 3000));
        const filtered = hits.filter(r => r.metadata.url !== tab.url);
        setResults(filtered.slice(0, 8));
      } catch (err) {
        console.error('[SimilarPages] failed:', err);
        setError('Failed — the model could not load. See popup console.');
      }
      setLoading(false);
    } catch {
      setError('Failed to analyze page');
      setLoading(false);
    }
  }, []);

  if (!hasSearched) {
    return (
      <div className="animate-fade-in" style={{ padding: '0 4px' }}>
        <button className="btn btn-ghost w-full" onClick={handleFindSimilar}
          style={{ justifyContent: 'flex-start', gap: '10px', padding: '10px 12px' }}>
          <Icon name="link" size={16} style={{ color: 'var(--accent)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>Find similar pages</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontWeight: 400 }}>
              Related content from your history
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
            <Icon name="link" size={14} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold" style={{ fontSize: '12px' }}>
              {loading ? 'Finding similar pages…' : `${results.length} similar page${results.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          {!loading && (
            <button className="btn btn-ghost btn-sm" style={{ padding: '4px' }} onClick={() => { setHasSearched(false); setResults([]); }}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 40, borderRadius: 'var(--radius-sm)' }} />
            ))}
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {!loading && results.length === 0 && hasSearched && !error && (
          <div className="text-xs text-muted" style={{ textAlign: 'center', padding: '12px' }}>
            No similar pages found in your history yet.
          </div>
        )}

        {results.length > 0 && (
          <div className="stagger-children" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {results.map((r, i) => (
              <div key={i}
                className="timeline-item"
                onClick={() => void browser.tabs.create({ url: r.metadata.url })}
                style={{ padding: '8px', borderRadius: 'var(--radius-sm)' }}
              >
                <Favicon src={r.metadata.favicon} domain={r.metadata.domain ?? new URL(r.metadata.url).hostname} size={14} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="truncate text-xs font-medium">{r.metadata.title}</div>
                  <div className="truncate" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    {r.metadata.domain ?? new URL(r.metadata.url).hostname} · {formatDate(r.metadata.timestamp)} · {Math.round(r.score * 100)}% match
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
