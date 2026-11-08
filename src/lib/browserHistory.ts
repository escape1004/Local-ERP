export {
  MAX_BROWSER_HISTORY,
  BROWSER_HISTORY_DEDUP_MS,
  shouldRecordBrowserHistoryUrl,
  shouldMergeBrowserHistoryVisit,
} from '../main/lib/browser-history';

export type BrowserHistoryItem = {
  id: string;
  url: string;
  title: string;
  visitedAt: string;
};

export function filterBrowserHistory(items: BrowserHistoryItem[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return items;
  return items.filter((item) => (
    item.title.toLowerCase().includes(term) || item.url.toLowerCase().includes(term)
  ));
}
