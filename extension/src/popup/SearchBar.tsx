import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { Icon } from './Icon';
import { getRecentSearches } from './storage';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onClear: () => void;
  loading: boolean;
}

export function SearchBar({ query, onQueryChange, onSearch, onClear, loading }: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches
  useEffect(() => {
    let alive = true;
    void getRecentSearches().then((r) => { if (alive) setRecentSearches(r); });
    return () => { alive = false; };
  }, []);

  // Check for pending search (from context menu)
  useEffect(() => {
    chrome.storage.local.get('pendingSearch').then(result => {
      const pending = result['pendingSearch'] as string | undefined;
      if (pending) {
        onQueryChange(pending);
        onSearch(pending);
        void chrome.storage.local.remove('pendingSearch');
      }
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onSearch(query);
        setShowRecent(false);
      }
      if (e.key === 'Escape') {
        if (showRecent) {
          setShowRecent(false);
        } else {
          onClear();
        }
      }
    },
    [query, onSearch, onClear, showRecent]
  );

  const handleRecentClick = useCallback((search: string) => {
    onQueryChange(search);
    onSearch(search);
    setShowRecent(false);
  }, [onQueryChange, onSearch]);

  const filteredRecent = recentSearches
    .filter(s => !query || s.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);

  return (
    <div style={{ position: 'relative' }}>
      {/* Search input + button */}
      <div className="flex gap-sm">
        <div style={{
          flex: 1,
          position: 'relative',
          borderRadius: 'var(--radius-md)',
          transition: 'all var(--transition-base)',
          boxShadow: focused ? 'var(--shadow-glow)' : 'none',
        }}>
          <div style={{
            position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
            display: 'flex', pointerEvents: 'none',
            color: focused ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            transition: 'color var(--transition-fast)',
          }}>
            <Icon name="search" size={15} />
          </div>
          <input
            ref={inputRef}
            className="input"
            type="text"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setShowRecent(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => { setFocused(true); setShowRecent(true); }}
            onBlur={() => { setFocused(false); setTimeout(() => setShowRecent(false), 200); }}
            placeholder='Search your memory...'
            disabled={loading}
            style={{
              paddingLeft: '36px',
              paddingRight: query ? '32px' : '14px',
            }}
            id="search-input"
          />
          {query && !loading && (
            <button
              onClick={() => { onClear(); inputRef.current?.focus(); }}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-tertiary)',
                cursor: 'pointer', fontSize: '14px', padding: '2px 4px',
                borderRadius: '4px', transition: 'color var(--transition-fast)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { onSearch(query); setShowRecent(false); }}
          disabled={loading || !query.trim()}
          style={{ minWidth: '80px' }}
          id="search-button"
        >
          {loading ? (
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          ) : 'Search'}
        </button>
      </div>

      {/* Recent searches dropdown */}
      {showRecent && filteredRecent.length > 0 && !loading && (
        <div className="animate-slide-down" style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '4px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 50,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 10px', fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Recent Searches
          </div>
          {filteredRecent.map((search, i) => (
            <div
              key={i}
              onClick={() => handleRecentClick(search)}
              style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-glass-hover)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              <Icon name="clock" size={13} style={{ color: 'var(--text-tertiary)' }} />
              <span className="truncate">{search}</span>
            </div>
          ))}
        </div>
      )}

      {/* Keyboard hint */}
      {!focused && !query && (
        <div className="text-xs text-muted" style={{ marginTop: '6px', textAlign: 'center' }}>
          <kbd style={{
            padding: '1px 5px', borderRadius: '3px',
            background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
            fontSize: '10px', fontFamily: 'var(--font-mono)',
          }}>Ctrl+Shift+S</kbd>
          {' '}to open · <kbd style={{
            padding: '1px 5px', borderRadius: '3px',
            background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)',
            fontSize: '10px', fontFamily: 'var(--font-mono)',
          }}>Enter</kbd> to search
        </div>
      )}
    </div>
  );
}