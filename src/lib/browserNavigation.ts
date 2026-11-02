export function parseExternalHttpUrl(input: string): URL | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;

  const candidates = [trimmed];
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
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
