import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '../Icon';
import { Favicon } from '../components/Favicon';
import { metadataStore } from '../../store/metadata-store';
import { deletePageFromIndex } from '../engine';
import type { TimelineEntry, PageMetadata } from '../../types';
import browser from 'webextension-polyfill';

function formatTimelineDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function PageItem({ page, onDelete }: { page: PageMetadata; onDelete: (page: PageMetadata) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="timeline-item"
      onClick={() => void browser.tabs.create({ url: page.url })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Favicon src={page.favicon} domain={page.domain} size={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="truncate" style={{ fontSize: '12px', fontWeight: 500 }}>
          {page.title}
        </div>
        <div className="flex items-center gap-xs" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
          <span className="truncate" style={{ maxWidth: '140px' }}>
            {page.domain ?? 'unknown'}
          </span>
          <span>·</span>
          <span>{formatTime(page.timestamp)}</span>
          {page.readingTime && (
            <>
              <span>·</span>
              <span>{page.readingTime}m read</span>
            </>
          )}
          {(page.visitCount ?? 1) > 1 && (
            <>
              <span>·</span>
              <span>{page.visitCount} visits</span>
            </>
          )}
        </div>
      </div>
      {hovered && (
        <button
          className="btn btn-ghost btn-sm animate-fade-in"
          style={{ padding: '3px', color: 'var(--error)', flexShrink: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(page);
          }}
          title="Remove from index"
          aria-label="Remove from index"
        >
          <Icon name="trash" size={12} />
        </button>
      )}
    </div>
  );
}

export function TimelineTab() {
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void metadataStore.getTimeline(range).then((t) => {
      if (!alive) return;
      setTimeline(t);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range]);

  const handleDelete = useCallback(async (page: PageMetadata) => {
    try {
      await deletePageFromIndex(page.pageId);
      setTimeline((prev) => prev
        .map((entry) => ({ ...entry, pages: entry.pages.filter((p) => p.pageId !== page.pageId) }))
        .filter((entry) => entry.pages.length > 0));
    } catch (err) {
      console.error('[Timeline] delete failed:', err);
    }
  }, []);

  // Client-side title/domain filter over the loaded range.
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return timeline;
    return timeline
      .map((entry) => ({
        ...entry,
        pages: entry.pages.filter((p) =>
          p.title.toLowerCase().includes(q) || (p.domain ?? '').toLowerCase().includes(q)),
      }))
      .filter((entry) => entry.pages.length > 0);
  }, [timeline, filter]);

  const totalPages = visible.reduce((sum, t) => sum + t.pages.length, 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Range selector */}
      <div className="flex gap-xs">
        {(['today', 'week', 'month', 'all'] as const).map(r => (
          <button
            key={r}
            className={`chip ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
            style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize', border: 'none', fontFamily: 'inherit' }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Quick filter */}
      <input
        className="input"
        style={{ fontSize: '12px', padding: '7px 12px' }}
        placeholder="Filter by title or domain…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter timeline"
      />

      {/* Count */}
      {!loading && (
        <div className="text-xs text-muted" style={{ paddingLeft: '4px' }}>
          {totalPages} page{totalPages !== 1 ? 's' : ''}{filter ? ' matching' : ''} in this period
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="shimmer" style={{ height: 36, borderRadius: 'var(--radius-sm)' }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="calendar" size={30} strokeWidth={1.5} /></div>
          <div className="empty-state-text">
            {filter
              ? 'Nothing matches your filter in this period.'
              : <>No browsing history in this period.<br />Browse some pages and they&apos;ll appear here.</>}
          </div>
        </div>
      )}

      {/* Timeline */}
      {!loading && visible.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '4px',
          maxHeight: '350px', overflowY: 'auto',
        }}>
          {visible.map(entry => (
            <div key={entry.date}>
              <div className="timeline-date">
                {formatTimelineDate(entry.date)}
                <span className="badge badge-accent" style={{ marginLeft: '4px' }}>
                  {entry.pages.length}
                </span>
              </div>
              <div className="stagger-children">
                {entry.pages.map((page, i) => (
                  <PageItem key={`${page.pageId}-${i}`} page={page} onDelete={(p) => void handleDelete(p)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
