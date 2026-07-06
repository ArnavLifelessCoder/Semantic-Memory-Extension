/**
 * Filters out pages that pollute the index with noise: search-engine result
 * pages, chat/LLM app shells, webmail, and local dev servers. Their text is
 * transient UI, not content the user will ever want to recall semantically.
 */

const NOISE_PATTERNS: RegExp[] = [
  // Search engine results pages
  /^https?:\/\/([a-z0-9-]+\.)*google\.[a-z.]+\/(search|webhp|imgres)/i,
  /^https?:\/\/(www\.)?bing\.com\/(search|images|videos|news)/i,
  /^https?:\/\/duckduckgo\.com\//i,
  /^https?:\/\/search\.(yahoo|brave)\.com\//i,
  /^https?:\/\/(www\.)?ecosia\.org\/search/i,
  /^https?:\/\/(www\.)?startpage\.com\//i,
  // Chat / LLM app shells (session UI, not stable content)
  /^https?:\/\/(www\.)?(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|(www\.)?perplexity\.ai|poe\.com)\//i,
  // Webmail and messaging
  /^https?:\/\/mail\.google\.com\//i,
  /^https?:\/\/outlook\.(live|office)\.com\//i,
  /^https?:\/\/web\.(whatsapp\.com|telegram\.org)\//i,
  // Local development servers
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?\//i,
  // Auth/checkout flows
  /^https?:\/\/accounts\.google\.com\//i,
  /^https?:\/\/([a-z0-9-]+\.)*(login|signin|auth|checkout)\./i,
];

export function isNoiseUrl(url: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(url));
}

/** Full indexability check: http(s), not noise, not user-blacklisted. */
export function shouldIndexUrl(url: string, blacklistedDomains: string[]): boolean {
  if (!url.startsWith('http')) return false;
  if (isNoiseUrl(url)) return false;
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    if (blacklistedDomains.some((d) => domain.includes(d))) return false;
  } catch {
    return false;
  }
  return true;
}
