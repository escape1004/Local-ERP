export type {
  BrowserDownloadItem,
  BrowserDownloadKind,
  BrowserDownloadState,
} from '../main/lib/browser-downloads';
export { suggestedDownloadKind } from '../main/lib/browser-downloads';

import type { BrowserDownloadItem, BrowserDownloadState } from '../main/lib/browser-downloads';

export function downloadProgressPercent(item: Pick<BrowserDownloadItem, 'receivedBytes' | 'totalBytes' | 'state'>) {
  if (item.state === 'completed') return 100;
  if (item.totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100)));
}

export function downloadStateLabel(state: BrowserDownloadState) {
  if (state === 'completed') return '완료';
  if (state === 'cancelled') return '취소됨';
  if (state === 'interrupted') return '중단됨';
  return '저장 중';
}

export function formatDownloadSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded}${units[unit]}`;
}

export function downloadMetaLabel(item: Pick<BrowserDownloadItem, 'receivedBytes' | 'totalBytes' | 'state'>) {
  const state = downloadStateLabel(item.state);
  if (item.state === 'progressing') {
    const received = formatDownloadSize(item.receivedBytes);
    const total = formatDownloadSize(item.totalBytes);
    const amount = total ? `${received} / ${total}` : received;
    return [amount, state].filter(Boolean).join(' • ');
  }
  const size = formatDownloadSize(item.totalBytes || item.receivedBytes);
  return [size, state].filter(Boolean).join(' • ');
}

export const RECENT_DOWNLOAD_COUNT = 5;

export function recentBrowserDownloads<T>(items: T[], limit = RECENT_DOWNLOAD_COUNT) {
  return items.slice(0, Math.max(0, limit));
}

export function filterBrowserDownloads(items: BrowserDownloadItem[], query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return items;
  return items.filter((item) => (
    item.filename.toLowerCase().includes(term) || item.url.toLowerCase().includes(term)
  ));
}
