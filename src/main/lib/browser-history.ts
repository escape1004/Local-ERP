export const MAX_BROWSER_HISTORY = 500;
export const BROWSER_HISTORY_DEDUP_MS = 2000;

export function shouldRecordBrowserHistoryUrl(url: string) {
  const value = String(url || '').trim();
  if (!value || value === 'about:blank') return false;
  return /^https?:\/\//i.test(value);
}

export function shouldMergeBrowserHistoryVisit(
  previous: { url: string; at: number } | null,
  url: string,
  now = Date.now(),
) {
  if (!previous) return false;
  return previous.url === url && now - previous.at < BROWSER_HISTORY_DEDUP_MS;
}
