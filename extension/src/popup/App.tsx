import { useState, useCallback, useRef, useEffect } from 'react';
import './styles.css';
import { SearchBar } from './SearchBar';
import { ResultCard } from './ResultCard';
import { StatsBar } from './components/StatsBar';
import { QuickSummary } from './components/QuickSummary';
import { SimilarPages } from './components/SimilarPages';
import { TimelineTab } from './tabs/TimelineTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { Icon, type IconName } from './Icon';
import { search as engineSearch, indexCurrentPage } from './engine';
import { addRecentSearch } from './storage';
import type { EnrichedResult } from '../types';

type Tab = 'search' | 'timeline' | 'analytics' | 'settings';

/**
 * Search returns one hit per chunk, so the same page can appear several times.
 * Keep only the best-scoring chunk per page (results arrive sorted by score).
 */
function dedupeByPage(results: EnrichedResult[]): EnrichedResult[] {
  const seen = new Set<string>();
  const out: EnrichedResult[] = [];
  for (const r of results) {
    const key = r.metadata.url || String(r.metadata.pageId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'timeline', label: 'Timeline', icon: 'calendar' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [results, setResults] = useState<EnrichedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [status, setStatus] = useState('');
  const [statsKey, setStatsKey] = useState(0);
  const reqId = useRef(0);

  // Guarantee the current page is captured when the popup opens.
  useEffect(() => {
    void indexCurrentPage().then((n) => { if (n > 0) setStatsKey((k) => k + 1); });
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);
    setLastQuery(searchQuery);
    void addRecentSearch(searchQuery);
    setStatus('');

    try {
      const hits = await engineSearch(searchQuery, (done, total) => {
        if (myReq === reqId.current && done < total) setStatus(`Indexing pages… ${done}/${total}`);
      });
      if (myReq !== reqId.current) return; // a newer search superseded this one
      setStatus('');
      setResults(dedupeByPage(hits));
    } catch (err) {
      if (myReq !== reqId.current) return;
      console.error('[App] search failed:', err);
      setError('Search failed — the model could not load. Open the popup console for details.');
    }
    setLoading(false);
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    setHasSearched(false);
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: '540px',
      position: 'relative', zIndex: 1,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 12px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <div style={{
          width: 30, height: 30,
          borderRadius: 'var(--radius-md)',
          background: 'var(--gradient-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#0b0c12', flexShrink: 0,
        }}>
          <Icon name="logo" size={17} strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: '15px', fontWeight: 650,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}>
            Semantic Memory
          </h1>
          <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', letterSpacing: '0.01em' }}>
            On-device semantic history
          </div>
        </div>
        <div className="badge badge-muted" style={{ fontSize: '9.5px', letterSpacing: '0.04em' }}>
          PRIVATE
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="tab-bar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              id={`tab-${tab.id}`}
            >
              <Icon name={tab.icon} size={14} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 16px',
        display: 'flex', flexDirection: 'column', gap: '10px',
      }}>
        {/* Search Tab */}
        {activeTab === 'search' && (
          <>
            <SearchBar
              query={query}
              onQueryChange={setQuery}
              onSearch={handleSearch}
              onClear={handleClear}
              loading={loading}
            />

            {/* Quick actions (when not searching) */}
            {!loading && !hasSearched && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <QuickSummary />
                <SimilarPages />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="alert alert-error animate-fade-in">
                <Icon name="alert" size={16} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>{error}</div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: '4px', padding: '3px 8px', fontSize: '10.5px', gap: '4px' }}
                    onClick={() => handleSearch(query)}
                  >
                    <Icon name="retry" size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="animate-fade-in" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '12px', padding: '24px',
              }}>
                <div className="spinner" />
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {status || 'Searching your memory…'}
                </div>
                <div className="text-xs text-muted">
                  {status ? 'First run embeds your pages — this is one-time' : 'Embedding query → vector search → ranking'}
                </div>
              </div>
            )}

            {/* Results */}
            {!loading && results.length > 0 && (
              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                  <span className="text-xs text-muted">
                    {results.length} result{results.length !== 1 ? 's' : ''} found
                  </span>
                  <span className="text-xs text-muted">
                    Best match: {Math.round(results[0]!.score * 100)}%
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {results.map((r, i) => (
                    <ResultCard key={`${r.id as unknown as number}-${i}`} result={r} index={i} query={lastQuery} />
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {!loading && results.length === 0 && hasSearched && !error && (
              <div className="empty-state animate-fade-in">
                <div className="empty-state-icon"><Icon name="search" size={32} strokeWidth={1.5} /></div>
                <div className="empty-state-text">
                  No matching memories found.<br />
                  Try a different query or browse more pages to build your index.
                </div>
              </div>
            )}

            {/* Welcome state */}
            {!hasSearched && !loading && (
              <div className="empty-state" style={{ padding: '12px 16px', gap: '10px' }}>
                <div className="empty-state-icon"><Icon name="sparkle" size={30} strokeWidth={1.5} /></div>
                <div className="empty-state-text">
                  Search by meaning, not keywords.
                </div>
                <div className="flex gap-xs" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    'that article about neural networks',
                    'how to cook pasta',
                    'travel tips I read',
                    'productivity advice',
                  ].map(example => (
                    <span
                      key={example}
                      className="chip"
                      onClick={() => { setQuery(example); void handleSearch(example); }}
                    >
                      {example}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && <TimelineTab />}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && <AnalyticsTab />}

        {/* Settings Tab */}
        {activeTab === 'settings' && <SettingsTab />}
      </div>

      {/* Bottom stats bar */}
      <StatsBar refreshKey={statsKey} />
    </div>
  );
}