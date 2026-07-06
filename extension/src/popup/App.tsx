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
import { MapTab } from './tabs/MapTab';
import { Icon, type IconName } from './Icon';
import {
  search as engineSearch, indexCurrentPage, deletePageFromIndex,
  isQuestion, answerFromResults, type AskResult,
} from './engine';
import { addRecentSearch, getSettings } from './storage';
import { applyTheme } from './theme';
import type { EnrichedResult, SearchRange } from '../types';
import browser from 'webextension-polyfill';

type Tab = 'search' | 'map' | 'timeline' | 'analytics' | 'settings';

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
  { id: 'map', label: 'Map', icon: 'map' },
  { id: 'timeline', label: 'History', icon: 'calendar' },
  { id: 'analytics', label: 'Stats', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const RANGES: { id: SearchRange; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
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
  const [range, setRange] = useState<SearchRange>('all');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [answer, setAnswer] = useState<AskResult | null>(null);
  const [answerLoading, setAnswerLoading] = useState(false);
  const reqId = useRef(0);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // Apply saved theme, then guarantee the current page is captured.
  useEffect(() => {
    void getSettings().then((s) => applyTheme(s.theme));
    void indexCurrentPage().then((n) => { if (n > 0) setStatsKey((k) => k + 1); });
  }, []);

  const handleSearch = useCallback(async (searchQuery: string, searchRange?: SearchRange) => {
    if (!searchQuery.trim()) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedIndex(-1);
    setHasSearched(true);
    setLastQuery(searchQuery);
    setAnswer(null);
    setAnswerLoading(false);
    void addRecentSearch(searchQuery);
    setStatus('');

    try {
      const hits = await engineSearch(searchQuery, (done, total) => {
        if (myReq === reqId.current && done < total) setStatus(`Indexing pages… ${done}/${total}`);
      }, { range: searchRange ?? rangeRef.current });
      if (myReq !== reqId.current) return; // a newer search superseded this one
      setStatus('');
      const deduped = dedupeByPage(hits);
      setResults(deduped);

      // Question-shaped queries also get a synthesized answer (async, after results show).
      if (isQuestion(searchQuery) && deduped.length > 0) {
        setAnswerLoading(true);
        void answerFromResults(searchQuery, deduped)
          .then((a) => { if (myReq === reqId.current) setAnswer(a); })
          .catch(() => { /* answer is best-effort */ })
          .finally(() => { if (myReq === reqId.current) setAnswerLoading(false); });
      }
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
    setSelectedIndex(-1);
    setAnswer(null);
    setAnswerLoading(false);
  }, []);

  const handleRangeChange = useCallback((r: SearchRange) => {
    setRange(r);
    if (lastQuery) void handleSearch(lastQuery, r);
  }, [lastQuery, handleSearch]);

  const handleDeleteResult = useCallback(async (r: EnrichedResult) => {
    try {
      await deletePageFromIndex(r.metadata.pageId);
      setResults((prev) => prev.filter((x) => x.metadata.pageId !== r.metadata.pageId));
      setStatsKey((k) => k + 1);
    } catch (err) {
      console.error('[App] delete failed:', err);
    }
  }, []);

  // Keyboard navigation over search results (↑/↓ select, Enter opens).
  useEffect(() => {
    if (activeTab !== 'search' || results.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        // Capture phase + stopPropagation so the search input's Enter handler
        // doesn't also re-run the search.
        e.preventDefault();
        e.stopPropagation();
        const r = results[selectedIndex];
        if (r) void browser.tabs.create({ url: r.metadata.url });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeTab, results, selectedIndex]);

  // Keep the selected card in view.
  useEffect(() => {
    if (selectedIndex < 0) return;
    document.getElementById(`result-${selectedIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

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

            {/* Time-range filter */}
            {hasSearched && (
              <div className="flex gap-xs animate-fade-in" role="group" aria-label="Filter results by time">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    className={`chip ${range === r.id ? 'active' : ''}`}
                    style={{ flex: 1, justifyContent: 'center', border: 'none', fontFamily: 'inherit' }}
                    onClick={() => handleRangeChange(r.id)}
                    disabled={loading}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

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

            {/* Ask My Memory — synthesized answer for question queries */}
            {!loading && (answerLoading || answer) && (
              <div className="glass-card animate-fade-in" style={{ padding: '12px 14px' }}>
                <div className="flex items-center gap-xs" style={{ marginBottom: '8px' }}>
                  <Icon name="sparkle" size={14} style={{ color: 'var(--accent)' }} />
                  <span className="font-semibold" style={{ fontSize: '12px' }}>
                    {answerLoading ? 'Composing answer…' : 'Answer from your memory'}
                  </span>
                </div>
                {answerLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="shimmer" style={{ height: 11, width: '100%' }} />
                    <div className="shimmer" style={{ height: 11, width: '72%' }} />
                  </div>
                ) : answer && (
                  <>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '8px' }}>
                      {answer.answer}
                    </p>
                    <div className="flex gap-xs" style={{ flexWrap: 'wrap' }}>
                      {answer.sources.map((s) => (
                        <span
                          key={s.url}
                          className="chip"
                          style={{ fontSize: '10px' }}
                          onClick={() => void browser.tabs.create({ url: s.url })}
                          title={s.title}
                        >
                          <Icon name="external" size={10} /> {s.domain || s.title}
                        </span>
                      ))}
                    </div>
                  </>
                )}
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
                    <ResultCard
                      key={`${r.id as unknown as number}-${i}`}
                      result={r}
                      index={i}
                      query={lastQuery}
                      selected={i === selectedIndex}
                      onDelete={() => void handleDeleteResult(r)}
                    />
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

        {/* Memory Map Tab */}
        {activeTab === 'map' && <MapTab />}

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