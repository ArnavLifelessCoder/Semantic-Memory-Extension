import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Favicon } from './components/Favicon';
import type { EnrichedResult } from '../types';
import browser from 'webextension-polyfill';

interface ResultCardProps {
  result: EnrichedResult;
  index: number;
  query?: string;
  selected?: boolean;
  onDelete?: () => void;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'with', 'that', 'this', 'is', 'are', 'was', 'were', 'about', 'how', 'what',
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Wrap query terms found in `text` with a highlight span (case-insensitive). */
function highlight(text: string, query?: string): ReactNode {
  if (!query) return text;
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map(t => t.replace(/[^\p{L}\p{N}]/gu, ''))
        .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    )
  );
  if (terms.length === 0) return text;

  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const termSet = new Set(terms);
  // split() with a capturing group yields the matched substrings as elements;
  // those are exactly the terms (case-insensitively), so a membership test is enough.
  return text.split(re).map((part, i) =>
    termSet.has(part.toLowerCase()) ? (
      <mark key={i} className="hl">{part}</mark>
    ) : (
      part
    )
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

export function ResultCard({ result, index, query, selected = false, onDelete }: ResultCardProps) {
  const [hovered, setHovered] = useState(false);
  const similarityPct = Math.round(result.score * 100);
  const domain = result.metadata.domain ?? getDomain(result.metadata.url);

  const barClass = similarityPct >= 80 ? 'high' : similarityPct >= 60 ? 'medium' : 'low';
  const badgeClass = similarityPct >= 80 ? 'badge-success' : similarityPct >= 60 ? 'badge-warning' : 'badge-muted';

  return (
    <div
      className={`glass-card ${selected ? 'result-selected' : ''}`}
      style={{
        padding: '12px 14px',
        cursor: 'pointer',
        animation: `fadeIn var(--transition-base) ease-out ${index * 60}ms both`,
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--shadow-md)' : undefined,
      }}
      onClick={() => void browser.tabs.create({ url: result.metadata.url })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      id={`result-${index}`}
    >
      {/* Header: favicon + title + score */}
      <div className="flex items-center gap-sm" style={{ marginBottom: '6px' }}>
        <Favicon src={result.metadata.favicon} domain={domain} size={16} />
        <div className="truncate font-semibold" style={{ flex: 1, fontSize: '12.5px' }}>
          {highlight(result.metadata.title, query)}
        </div>
        <span className={`badge ${badgeClass}`} style={{ flexShrink: 0 }}>
          {similarityPct}%
        </span>
      </div>

      {/* Similarity bar */}
      <div className="similarity-bar" style={{ marginBottom: '8px' }}>
        <div
          className={`similarity-bar-fill ${barClass}`}
          style={{ width: `${similarityPct}%` }}
        />
      </div>

      {/* Content preview */}
      <div className="line-clamp-2" style={{
        fontSize: '11.5px',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        marginBottom: '8px',
      }}>
        {highlight(result.chunkText, query)}
      </div>

      {/* Footer: domain + time + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-xs">
          <span className="chip" style={{
            fontSize: '10px', padding: '1px 6px',
            cursor: 'inherit',
          }}>
            {domain}
          </span>
          <span className="text-xs text-muted">
            {formatDate(result.metadata.timestamp)}
          </span>
        </div>
        {hovered && (
          <div className="flex gap-xs animate-fade-in" style={{ marginRight: '-2px' }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '4px' }}
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(result.metadata.url);
              }}
              title="Copy link"
              aria-label="Copy link"
            >
              <Icon name="copy" size={13} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '4px' }}
              onClick={(e) => {
                e.stopPropagation();
                void browser.tabs.create({ url: result.metadata.url });
              }}
              title="Open in new tab"
              aria-label="Open in new tab"
            >
              <Icon name="external" size={13} />
            </button>
            {onDelete && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '4px', color: 'var(--error)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Remove from index"
                aria-label="Remove from index"
              >
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}