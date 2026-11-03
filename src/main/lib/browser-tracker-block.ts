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
  'outbrain.com',
  'outbrainimg.com',
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

export function shouldBlockBrowserRequest(options) {
  const pageUrl = options?.pageUrl;
  const requestUrl = options?.requestUrl;
  const resourceType = options?.resourceType;
  if (resourceType === 'mainFrame') return false;

  const requestHost = hostnameFromUrl(requestUrl);
  if (!requestHost) return false;
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
