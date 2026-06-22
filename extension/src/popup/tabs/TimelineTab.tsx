import { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { metadataStore } from '../../store/metadata-store';
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

function PageItem({ page }: { page: PageMetadata }) {
  return (
    <div
      className="timeline-item"
      onClick={() => void browser.tabs.create({ url: page.url })}
    >
      <img
        src={page.favicon ?? (page.domain ? `https://${page.domain}/favicon.ico` : '')}
        alt=""
        style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
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
        </div>
      </div>
    </div>
  );
}

export function TimelineTab() {
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
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

  const totalPages = timeline.reduce((sum, t) => sum + t.pages.length, 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Range selector */}
      <div className="flex gap-xs">
        {(['today', 'week', 'month', 'all'] as const).map(r => (
          <button
            key={r}
            className={`chip ${range === r ? 'active' : ''}`}
            onClick={() => setRange(r)}
            style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Count */}
      {!loading && (
        <div className="text-xs text-muted" style={{ paddingLeft: '4px' }}>
          {totalPages} page{totalPages !== 1 ? 's' : ''} in this period
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
      {!loading && timeline.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon"><Icon name="calendar" size={30} strokeWidth={1.5} /></div>
          <div className="empty-state-text">
            No browsing history in this period.<br />
            Browse some pages and they'll appear here.
          </div>
        </div>
      )}

      {/* Timeline */}
      {!loading && timeline.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '4px',
          maxHeight: '350px', overflowY: 'auto',
        }}>
          {timeline.map(entry => (
            <div key={entry.date}>
              <div className="timeline-date">
                {formatTimelineDate(entry.date)}
                <span className="badge badge-accent" style={{ marginLeft: '4px' }}>
                  {entry.pages.length}
                </span>
              </div>
              <div className="stagger-children">
                {entry.pages.map((page, i) => (
                  <PageItem key={`${page.pageId}-${i}`} page={page} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
