import { parseExternalHttpUrl } from './security';

export function getEmbeddedBrowserHash(url?: string) {
  const parsed = url ? parseExternalHttpUrl(String(url)) : null;
  if (!parsed) return '/browser';
  return `/browser?url=${encodeURIComponent(parsed.toString())}`;
}
