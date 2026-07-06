import { useState } from 'react';

interface FaviconProps {
  src?: string | undefined;
  /** Used for the letter fallback when the image is missing or fails to load. */
  domain?: string | undefined;
  size?: number;
}

/**
 * Favicon with a local letter-tile fallback. Never calls third-party favicon
 * services — the extension promises that no browsing data leaves the device.
 */
export function Favicon({ src, domain, size = 16 }: FaviconProps) {
  const [failed, setFailed] = useState(false);
  const letter = (domain ?? '?').replace(/^www\./, '').charAt(0) || '?';

  if (!src || failed) {
    return (
      <span
        className="favicon-fallback"
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.55) }}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 3, flexShrink: 0, opacity: 0.9 }}
      onError={() => setFailed(true)}
    />
  );
}
