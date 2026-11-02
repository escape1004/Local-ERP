const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'feature',
  'si',
  'pp',
  'spm',
]);

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
]);

export function extractYoutubeVideoId(parsed: URL): string | null {
  const host = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id || null;
  }

  if (parsed.pathname === '/watch' || parsed.pathname.startsWith('/watch/')) {
    return parsed.searchParams.get('v');
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1]) {
    return parts[1];
  }

  return parsed.searchParams.get('v');
}

export function canonicalizeBrowserUrl(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  const youtubeId = extractYoutubeVideoId(parsed);
  if (youtubeId) {
    return `https://www.youtube.com/watch?v=${youtubeId}`;
  }

  parsed.hash = '';
  TRACKING_PARAMS.forEach((key) => parsed.searchParams.delete(key));

  const queryKeys = [...parsed.searchParams.keys()].sort();
  const nextSearch = new URLSearchParams();
  queryKeys.forEach((key) => {
    parsed.searchParams.getAll(key).forEach((value) => nextSearch.append(key, value));
  });
  parsed.search = nextSearch.toString() ? `?${nextSearch.toString()}` : '';

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

export function urlsReferToSameResource(left: string, right: string): boolean {
  const a = canonicalizeBrowserUrl(left);
  const b = canonicalizeBrowserUrl(right);
  return Boolean(a && b && a === b);
}

export function matchUrlPattern(pattern: string, url: string): boolean {
  const normalizedPattern = String(pattern || '').trim();
  const target = String(url || '').trim();
  if (!normalizedPattern || !target) return false;
  if (normalizedPattern === '*') return true;

  const escaped = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  try {
    return new RegExp(`^${escaped}$`, 'i').test(target);
  } catch {
    return false;
  }
}

export function isHttpUrlString(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/.+/i.test(value.trim());
}

export function collectHttpUrls(value: unknown, bucket: string[] = []): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isHttpUrlString(trimmed)) bucket.push(trimmed);
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectHttpUrls(item, bucket));
    return bucket;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectHttpUrls(item, bucket));
  }
  return bucket;
}
