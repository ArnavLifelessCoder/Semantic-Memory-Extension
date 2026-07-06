import { useState, useEffect } from 'react';
import { Icon, type IconName } from '../Icon';
import { Favicon } from '../components/Favicon';
import { metadataStore } from '../../store/metadata-store';
import type { BrowsingStats, DomainStat } from '../../types';

function StatCard({ value, label, icon }: { value: string | number; label: string; icon: IconName }) {
  return (
    <div className="stat-card">
      <Icon name={icon} size={15} style={{ color: 'var(--text-tertiary)', marginBottom: '2px' }} />
      <div className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function DomainBar({ domain, percentage }: { domain: DomainStat; percentage: number }) {
  return (
    <div className="domain-bar">
      <Favicon src={domain.favicon} domain={domain.domain} size={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '3px' }}>
          <span className="truncate text-xs font-medium" style={{ maxWidth: '200px' }}>
            {domain.domain}
          </span>
          <span className="text-xs text-muted">{domain.count}</span>
        </div>
        <div className="domain-bar-fill">
          <div className="domain-bar-fill-inner" style={{ width: `${percentage}%` }} />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsTab() {
  const [stats, setStats] = useState<BrowsingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void metadataStore.getStats().then((s) => {
      if (!alive) return;
      setStats(s);
      setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="shimmer" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
        <div className="shimmer" style={{ height: 20 }} />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="shimmer" style={{ height: 32, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon"><Icon name="chart" size={30} strokeWidth={1.5} /></div>
        <div className="empty-state-text">
          No analytics data yet.<br />
          Start browsing to build your knowledge base.
        </div>
      </div>
    );
  }

  const maxDomainCount = stats.topDomains.length > 0 ? stats.topDomains[0]!.count : 1;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        <StatCard icon="layers" value={stats.totalPages} label="Total Pages" />
        <StatCard icon="database" value={stats.totalChunks} label="Chunks" />
        <StatCard icon="globe" value={stats.totalDomains} label="Domains" />
        <StatCard icon="calendar" value={stats.todayCount} label="Today" />
        <StatCard icon="clock" value={stats.weekCount} label="This Week" />
        <StatCard icon="clock-read" value={`${stats.estimatedReadingMinutes}m`} label="Read Time" />
      </div>

      {/* Top domains */}
      {stats.topDomains.length > 0 && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
            <span className="font-semibold text-xs" style={{ color: 'var(--text-accent)' }}>
              Top Domains
            </span>
            <span className="text-xs text-muted">{stats.totalDomains} total</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {stats.topDomains.map((domain, i) => (
              <DomainBar
                key={i}
                domain={domain}
                percentage={Math.round((domain.count / maxDomainCount) * 100)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Last-7-days activity (real per-day counts) */}
      <div className="glass-card" style={{ padding: '12px' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-accent)' }}>
            Last 7 Days
          </span>
          <span className="text-xs text-muted">{stats.weekCount} pages</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '48px' }}>
          {stats.dailyCounts.map((count, i) => {
            const max = Math.max(1, ...stats.dailyCounts);
            const day = new Date(Date.now() - (6 - i) * 86_400_000);
            const label = day.toLocaleDateString('en-US', { weekday: 'short' });
            return (
              <div
                key={i}
                className={`activity-bar ${i === 6 ? 'today' : ''}`}
                style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
                title={`${label}: ${count} page${count !== 1 ? 's' : ''}`}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
          {stats.dailyCounts.map((_, i) => {
            const day = new Date(Date.now() - (6 - i) * 86_400_000);
            return (
              <div key={i} style={{
                flex: 1, textAlign: 'center', fontSize: '9px',
                color: i === 6 ? 'var(--text-accent)' : 'var(--text-tertiary)',
                fontWeight: i === 6 ? 600 : 400,
              }}>
                {day.toLocaleDateString('en-US', { weekday: 'narrow' })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
