export function faviconUrlFor(pageUrl: string): string | null {
  if (typeof pageUrl !== 'string') return null;
  try {
    const host = new URL(pageUrl).hostname;
    if (!host) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return null;
  }
}
