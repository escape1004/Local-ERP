const ADDRESS_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function parseExternalHttpUrl(input: string): URL | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  const candidates = [trimmed];
  if (!ADDRESS_SCHEME_RE.test(trimmed)) {
    candidates.push(`https://${trimmed}`);
  }

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      if (parsed.username || parsed.password) continue;
      if (!parsed.hostname) continue;
      return parsed;
    } catch {
      // try next candidate
    }
  }

  return null;
}

function isNavigableHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost') return true;
  if (IPV4_RE.test(host) || host.includes(':')) return true;
  return host.includes('.');
}

export function googleSearchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function resolveBrowserAddressInput(input: string): string | null {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!trimmed || trimmed.length > 2048) return null;

  const looksLikeHostPort = /^[\w.-]+:\d+(?:[/?#]|$)/.test(trimmed);
  if (ADDRESS_SCHEME_RE.test(trimmed) && !looksLikeHostPort) {
    return parseExternalHttpUrl(trimmed)?.toString() || null;
  }

  if (/\s/.test(trimmed)) return googleSearchUrl(trimmed);

  const parsed = parseExternalHttpUrl(looksLikeHostPort ? `https://${trimmed}` : trimmed);
  if (parsed && isNavigableHostname(parsed.hostname)) return parsed.toString();
  return googleSearchUrl(trimmed);
}

export function getInAppBrowserRoute(url: string) {
  return `/browser?url=${encodeURIComponent(url)}`;
}

export function isStandaloneBrowserRole(search?: string) {
  const query = search
    ?? (typeof window !== 'undefined' ? window.location.search : '');
  try {
    return new URLSearchParams(query).get('role') === 'browser';
  } catch {
    return false;
  }
}

export function isStandaloneBrowserWindow() {
  return isStandaloneBrowserRole();
}
