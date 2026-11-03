const MULTI_PART_TLDS = new Set([
  'ac.kr',
  'ac.uk',
  'co.in',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.uk',
  'com.au',
  'com.br',
  'com.hk',
  'com.mx',
  'com.sg',
  'com.tw',
  'go.kr',
  'gov.uk',
  'ne.kr',
  'net.au',
  'or.kr',
  'org.au',
  'org.uk',
  're.kr',
]);

const NEVER_BLOCK_EXACT = new Set([
  'google.com',
  'www.google.com',
]);

const NEVER_BLOCK_SUFFIXES = [
  'accounts.google.com',
  'apple.com',
  'cloudflare.com',
  'facebook.com',
  'facebook.net',
  'fbcdn.net',
  'ggpht.com',
  'googleapis.com',
  'googleusercontent.com',
  'google.co.kr',
  'gstatic.com',
  'gvt1.com',
  'gvt2.com',
  'gvt3.com',
  'icloud.com',
  'instagram.com',
  'live.com',
  'microsoft.com',
  'microsoftonline.com',
  'office.com',
  'recaptcha.net',
  'twimg.com',
  'twitter.com',
  'x.com',
  'youtu.be',
  'youtube.com',
  'ytimg.com',
  'googlevideo.com',
];

const LOGIN_POPUP_SUFFIXES = [
  'amazon.co.kr',
  'amazon.com',
  'discord.com',
  'dropbox.com',
  'github.com',
  'gitlab.com',
  'kakao.co.kr',
  'kakao.com',
  'line.me',
  'naver.com',
  'paypal.com',
  'slack.com',
  'steamcommunity.com',
  'twitch.tv',
];

const BLOCKED_HOST_SUFFIXES = [
  '2mdn.net',
  '3lift.com',
  'adform.net',
  'adnxs.com',
  'ads-twitter.com',
  'ads.linkedin.com',
  'adservice.google.com',
  'adsafeprotected.com',
  'adsrvr.org',
  'adsymptotic.com',
  'advertising.com',
  'amazon-adsystem.com',
  'bidswitch.net',
  'casalemedia.com',
  'criteo.com',
  'criteo.net',
  'doubleclick.net',
  'exelator.com',
  'googleadservices.com',
  'googlesyndication.com',
  'imrworldwide.com',
  'indexww.com',
  'krxd.net',
  'liadm.com',
  'media.net',
  'mgid.com',
  'moatads.com',
  'openx.net',
  'onclickads.net',
  'outbrain.com',
  'outbrainimg.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'pubmatic.com',
  'quantserve.com',
  'realclick.co.kr',
  'revcontent.com',
  'rlcdn.com',
  'rubiconproject.com',
  'scorecardresearch.com',
  'serving-sys.com',
  'sharethrough.com',
  'smartadserver.com',
  'taboola.com',
  'teads.tv',
  'triplelift.com',
  'widerplanet.com',
  'yieldmo.com',
  'zemanta.com',
];

function hostnameFromUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return String(parsed.hostname || '').toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function hostMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function hostMatchesAnySuffix(hostname, suffixes) {
  return suffixes.some((suffix) => hostMatchesSuffix(hostname, suffix));
}

export const MAX_BROWSER_BLOCKED_DOMAINS = 100;

export function parseBrowserBlockedDomain(raw) {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed || trimmed.length > 253) return null;

  let host = trimmed;
  if (host.startsWith('*.')) host = host.slice(2);
  if (host.includes('://') || host.includes('/') || host.includes(':')) {
    try {
      const parsed = new URL(host.includes('://') ? host : `https://${host}`);
      host = String(parsed.hostname || '').toLowerCase();
    } catch {
      return null;
    }
  }

  host = host.replace(/^\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return null;
  }
  return host;
}

export function normalizeBrowserBlockedDomains(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const domains = [];
  value.forEach((item) => {
    const host = parseBrowserBlockedDomain(item);
    if (!host || seen.has(host) || domains.length >= MAX_BROWSER_BLOCKED_DOMAINS) return;
    seen.add(host);
    domains.push(host);
  });
  return domains;
}

export function isUserBlockedBrowserHost(hostname, blockedDomains) {
  const host = String(hostname || '').toLowerCase();
  if (!host || !Array.isArray(blockedDomains) || blockedDomains.length === 0) return false;
  return blockedDomains.some((domain) => hostMatchesSuffix(host, domain));
}

export function isUserBlockedBrowserUrl(url, blockedDomains) {
  return isUserBlockedBrowserHost(hostnameFromUrl(url), blockedDomains);
}

export function getRegistrableDomain(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return host;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return lastTwo;
}

export function hostnameFromBrowserUrl(value) {
  return hostnameFromUrl(value);
}

export function siteKeyFromBrowserUrl(value) {
  return getRegistrableDomain(hostnameFromUrl(value));
}

export function isTrustedBrowserHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return NEVER_BLOCK_EXACT.has(host)
    || hostMatchesAnySuffix(host, NEVER_BLOCK_SUFFIXES)
    || hostMatchesAnySuffix(host, LOGIN_POPUP_SUFFIXES);
}

export function isBlockedTrackerHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return Boolean(host) && hostMatchesAnySuffix(host, BLOCKED_HOST_SUFFIXES);
}

export function shouldBlockForcedWindowOpen(options) {
  const targetHost = hostnameFromUrl(options?.targetUrl);
  if (!targetHost) return false;
  if (isUserBlockedBrowserHost(targetHost, options?.blockedDomains)) return true;
  if (options?.trackerBlocking === false) return false;
  if (String(options?.disposition || '') === 'background-tab') return false;
  if (isTrustedBrowserHost(targetHost)) return false;
  if (isBlockedTrackerHost(targetHost)) return true;

  const openerHost = hostnameFromUrl(options?.openerUrl);
  if (!openerHost) return false;
  return getRegistrableDomain(openerHost) !== getRegistrableDomain(targetHost);
}

export function shouldBlockBounceNavigation(openerSite, targetUrl, blockedDomains) {
  const targetHost = hostnameFromUrl(targetUrl);
  if (!targetHost) return false;
  if (isUserBlockedBrowserHost(targetHost, blockedDomains)) return true;
  if (!openerSite) return false;
  if (isTrustedBrowserHost(targetHost)) return false;
  return getRegistrableDomain(targetHost) !== openerSite;
}

export function shouldBlockBrowserRequest(options) {
  const pageUrl = options?.pageUrl;
  const requestUrl = options?.requestUrl;
  const resourceType = options?.resourceType;
  const requestHost = hostnameFromUrl(requestUrl);
  if (!requestHost) return false;
  if (isUserBlockedBrowserHost(requestHost, options?.blockedDomains)) return true;
  if (options?.trackerBlocking === false) return false;
  if (resourceType === 'mainFrame') return false;
  if (NEVER_BLOCK_EXACT.has(requestHost) || hostMatchesAnySuffix(requestHost, NEVER_BLOCK_SUFFIXES)) {
    return false;
  }
  if (!hostMatchesAnySuffix(requestHost, BLOCKED_HOST_SUFFIXES)) {
    return false;
  }

  const pageHost = hostnameFromUrl(pageUrl);
  if (pageHost) {
    const pageDomain = getRegistrableDomain(pageHost);
    const requestDomain = getRegistrableDomain(requestHost);
    if (pageDomain && pageDomain === requestDomain) return false;
  }

  return true;
}
