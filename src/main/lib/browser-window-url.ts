import { normalizeBrowserStartupMode } from './config-normalize';
import { parseExternalHttpUrl } from './security';

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

export function resolveEmbeddedBrowserOpenUrl(requestedUrl, lastUrl, startupMode) {
  const parsed = requestedUrl ? parseExternalHttpUrl(String(requestedUrl)) : null;
  if (parsed) return parsed.toString();
  if (normalizeBrowserStartupMode(startupMode) !== 'continue') return '';
  const restored = normalizeBrowserSessionUrl(lastUrl);
  return restored === 'about:blank' ? '' : restored;
}
