import { normalizeBrowserStartupMode } from './config-normalize';
import { parseExternalHttpUrl } from './security';

export const MAX_BROWSER_SESSION_TABS = 16;

export function getEmbeddedBrowserHash(url?: string) {
  const parsed = url ? parseExternalHttpUrl(String(url)) : null;
  if (!parsed) return '/browser';
  return `/browser?url=${encodeURIComponent(parsed.toString())}`;
}

export function normalizeBrowserSessionUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text === 'about:blank') return 'about:blank';
  const parsed = parseExternalHttpUrl(text);
  return parsed ? parsed.toString() : '';
}

export function normalizeBrowserSessionTabs(value) {
  if (!Array.isArray(value)) return [];
  const urls = [];
  for (const item of value) {
    const raw = typeof item === 'string'
      ? item
      : (item && typeof item === 'object' ? item.url : '');
    const normalized = normalizeBrowserSessionUrl(raw);
    if (!normalized) continue;
    urls.push(normalized);
    if (urls.length >= MAX_BROWSER_SESSION_TABS) break;
  }
  return urls;
}

export function normalizePersistedBrowserSession(tabs, activeIndex, lastUrl) {
  const urls = normalizeBrowserSessionTabs(tabs);
  const fallback = normalizeBrowserSessionUrl(lastUrl);
  const nextUrls = urls.length > 0 ? urls : (fallback ? [fallback] : []);
  let index = Number.parseInt(String(activeIndex), 10);
  if (!Number.isInteger(index) || index < 0 || index >= nextUrls.length) {
    const matched = fallback ? nextUrls.indexOf(fallback) : -1;
    index = matched >= 0 ? matched : 0;
  }
  return { urls: nextUrls, activeIndex: nextUrls.length ? index : 0 };
}

export function resolveEmbeddedBrowserSession(input) {
  const requestedUrl = input?.requestedUrl;
  const requested = requestedUrl ? parseExternalHttpUrl(String(requestedUrl)) : null;
  if (normalizeBrowserStartupMode(input?.startupMode) !== 'continue') {
    return { urls: requested ? [requested.toString()] : [], activeIndex: 0 };
  }
  return normalizePersistedBrowserSession(input?.lastTabs, input?.lastTabIndex, input?.lastUrl);
}

export function resolveEmbeddedBrowserOpenUrl(requestedUrl, lastUrl, startupMode) {
  const parsed = requestedUrl ? parseExternalHttpUrl(String(requestedUrl)) : null;
  if (parsed) return parsed.toString();
  if (normalizeBrowserStartupMode(startupMode) !== 'continue') return '';
  const restored = normalizeBrowserSessionUrl(lastUrl);
  return restored === 'about:blank' ? '' : restored;
}
