const GOOGLE_SIGNIN_HOSTS = new Set([
  'accounts.google.com',
  'accounts.youtube.com',
  'accounts.google.co.kr',
]);

function hostnameOf(url: string) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isGoogleSignInUrl(url: string) {
  const host = hostnameOf(url);
  if (!host) return false;
  if (GOOGLE_SIGNIN_HOSTS.has(host)) return true;
  if (host === 'google.com' || host === 'www.google.com') {
    try {
      const path = new URL(url).pathname.toLowerCase();
      return path.startsWith('/accounts') || path.startsWith('/signin') || path.startsWith('/oauth');
    } catch {
      return false;
    }
  }
  return false;
}

export function rememberNonGoogleSignInUrl(previous: string | undefined, next: string) {
  const candidate = String(next || '').trim();
  if (candidate && !isGoogleSignInUrl(candidate)) return candidate;
  return String(previous || '').trim();
}
