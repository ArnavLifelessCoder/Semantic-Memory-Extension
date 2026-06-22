import { useState, useEffect } from 'react';
import { Icon, type IconName } from '../Icon';
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
      <img
        src={domain.favicon ?? `https://${domain.domain}/favicon.ico`}
        alt=""
        style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
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

      {/* Activity sparkline concept */}
      <div className="glass-card" style={{ padding: '12px' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--text-accent)', marginBottom: '8px' }}>
          Activity Overview
        </div>
        <div className="flex items-center justify-between gap-sm">
          <div style={{ flex: 1 }}>
            <div className="text-xs text-muted" style={{ marginBottom: '4px' }}>
              This week vs last
            </div>
            <div className="flex items-center gap-xs">
              <span className="font-bold" style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
                {stats.weekCount}
              </span>
              <span className="badge badge-success" style={{ fontSize: '10px' }}>
                active
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: '2px', height: '32px',
          }}>
            {/* Simple bar chart visualization */}
            {[
              stats.monthCount > 0 ? Math.max(20, (stats.weekCount / stats.monthCount) * 100 * 0.3) : 20,
              stats.monthCount > 0 ? Math.max(20, (stats.weekCount / stats.monthCount) * 100 * 0.5) : 30,
              stats.monthCount > 0 ? Math.max(20, (stats.weekCount / stats.monthCount) * 100 * 0.7) : 50,
              stats.monthCount > 0 ? Math.max(20, (stats.weekCount / stats.monthCount) * 100 * 0.8) : 65,
              stats.monthCount > 0 ? Math.max(25, (stats.todayCount / Math.max(1, stats.weekCount)) * 100) : 80,
            ].map((h, i) => (
              <div key={i} style={{
                width: '8px',
                height: `${Math.min(100, h)}%`,
                borderRadius: '2px',
                background: i === 4 ? 'var(--gradient-accent)' : 'var(--bg-glass-hover)',
                transition: 'height 0.5s ease',
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
