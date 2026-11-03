export function faviconUrlFor(pageUrl: string, size = 32): string | null {
  if (typeof pageUrl !== 'string') return null;
  try {
    const host = new URL(pageUrl).hostname;
    if (!host) return null;
    const pixels = Number(size);
    const sz = Number.isFinite(pixels) && pixels > 0 ? Math.min(128, Math.round(pixels)) : 32;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${sz}`;
  } catch {
    return null;
  }
}

export function shortcutLabelForBookmark(bookmark: { title?: string; url?: string }) {
  const title = String(bookmark?.title || '').trim();
  if (title) return title;
  try {
    return new URL(String(bookmark?.url || '')).hostname.replace(/^www\./, '') || String(bookmark?.url || '');
  } catch {
    return String(bookmark?.url || '');
  }
}
