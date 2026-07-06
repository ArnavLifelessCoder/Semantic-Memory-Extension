import { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../Icon';
import { getMemoryMap, type MapPoint } from '../engine';
import browser from 'webextension-polyfill';

const PALETTE = ['#7c8aff', '#3ecf8e', '#e0b341', '#f0726f', '#59a4f5', '#c579e8'];
const CANVAS_W = 372;
const CANVAS_H = 290;
const PAD = 18;
const HIT_RADIUS = 10;

function toCanvas(p: MapPoint): { cx: number; cy: number } {
  return {
    cx: PAD + p.x * (CANVAS_W - PAD * 2),
    cy: PAD + p.y * (CANVAS_H - PAD * 2),
  };
}

export function MapTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<MapPoint | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    let alive = true;
    getMemoryMap((done, total) => {
      if (alive && done < total) setStatus(`Embedding pages… ${done}/${total}`);
    }).then(({ points: pts, clusterLabels }) => {
      if (!alive) return;
      setPoints(pts);
      setLabels(clusterLabels);
      setLoading(false);
    }).catch((err) => {
      console.error('[MapTab] failed:', err);
      if (!alive) return;
      setError('Could not build the map — the model may have failed to load.');
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    for (const p of points) {
      const { cx, cy } = toCanvas(p);
      const color = PALETTE[p.cluster % PALETTE.length]!;
      const isHover = hovered?.pageId === p.pageId;
      ctx.beginPath();
      ctx.arc(cx, cy, isHover ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color + (isHover ? 'ff' : 'b8');
      ctx.fill();
      if (isHover) {
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.strokeStyle = color + '66';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [points, hovered]);

  const findPoint = useCallback((x: number, y: number): MapPoint | null => {
    let best: MapPoint | null = null;
    let bestDist = HIT_RADIUS;
    for (const p of points) {
      const { cx, cy } = toCanvas(p);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return best;
  }, [points]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMouse({ x, y });
    setHovered(findPoint(x, y));
  }, [findPoint]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = findPoint(e.clientX - rect.left, e.clientY - rect.top);
    if (p) void browser.tabs.create({ url: p.url });
  }, [findPoint]);

  if (loading) {
    return (
      <div className="animate-fade-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '12px', padding: '40px 24px',
      }}>
        <div className="spinner" />
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {status || 'Projecting your knowledge space…'}
        </div>
        <div className="text-xs text-muted" style={{ textAlign: 'center' }}>
          Every page is embedded, PCA-projected to 2D and clustered into topics — all on-device.
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-error animate-fade-in">{error}</div>;
  }

  if (points.length === 0) {
    return (
      <div className="empty-state animate-fade-in">
        <div className="empty-state-icon"><Icon name="map" size={30} strokeWidth={1.5} /></div>
        <div className="empty-state-text">
          Not enough indexed pages to draw a map yet.<br />
          Browse a few more pages, then come back.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div className="text-xs text-muted" style={{ paddingLeft: '2px' }}>
        {points.length} pages · nearby dots are semantically related · click to open
      </div>

      <div className="glass-card" style={{ position: 'relative', padding: '4px', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width: CANVAS_W, height: CANVAS_H, display: 'block', cursor: hovered ? 'pointer' : 'crosshair' }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
          onClick={handleClick}
        />
        {hovered && (
          <div style={{
            position: 'absolute',
            left: Math.min(mouse.x + 12, CANVAS_W - 170),
            top: Math.min(mouse.y + 12, CANVAS_H - 40),
            maxWidth: 170,
            padding: '5px 8px',
            background: 'var(--bg-card-hover)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
            zIndex: 20,
          }}>
            <div className="truncate" style={{ fontSize: '11px', fontWeight: 600 }}>{hovered.title}</div>
            <div className="truncate" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{hovered.domain}</div>
          </div>
        )}
      </div>

      {/* Cluster legend */}
      <div className="flex gap-xs" style={{ flexWrap: 'wrap' }}>
        {labels.map((label, i) => (
          <span key={i} className="chip" style={{ cursor: 'default' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: PALETTE[i % PALETTE.length],
              display: 'inline-block',
            }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
