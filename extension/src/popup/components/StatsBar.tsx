import { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { metadataStore } from '../../store/metadata-store';
import type { BrowsingStats } from '../../types';

function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const end = value;
    const duration = 600;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value]);

  return <>{display.toLocaleString()}{suffix}</>;
}

export function StatsBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<BrowsingStats | null>(null);

  useEffect(() => {
    let alive = true;
    void metadataStore.getStats().then((s) => { if (alive) setStats(s); }).catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);

  if (!stats) {
    return (
      <div className="flex items-center justify-between" style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '11px',
        color: 'var(--text-tertiary)',
      }}>
        <div className="flex items-center gap-sm">
          <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
          <span>Loading stats...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between animate-fade-in" style={{
      padding: '8px 16px',
      borderTop: '1px solid var(--border-subtle)',
      fontSize: '11px',
      color: 'var(--text-tertiary)',
      background: 'var(--bg-glass)',
    }}>
      <div className="flex items-center gap-md tabular">
        <span className="flex items-center gap-xs" title="Pages indexed">
          <Icon name="layers" size={13} style={{ color: 'var(--text-tertiary)' }} />
          <AnimatedNumber value={stats.totalPages} />
        </span>
        <span className="flex items-center gap-xs" title="Domains tracked">
          <Icon name="globe" size={13} style={{ color: 'var(--text-tertiary)' }} />
          <AnimatedNumber value={stats.totalDomains} />
        </span>
        <span className="flex items-center gap-xs" title="Content chunks">
          <Icon name="database" size={13} style={{ color: 'var(--text-tertiary)' }} />
          <AnimatedNumber value={stats.totalChunks} />
        </span>
      </div>
      <div className="flex items-center gap-xs" style={{ color: 'var(--success)' }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--success)',
          display: 'inline-block',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: '10px' }}>Index active</span>
      </div>
    </div>
  );
}
