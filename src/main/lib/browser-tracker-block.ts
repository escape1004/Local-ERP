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
  'cloudflareinsights.com',
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
  'hcaptcha.com',
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
  '33across.com',
  '3lift.com',
  'ad-delivery.net',
  'ad-maven.com',
  'ad-score.com',
  'adcash.com',
  'addthis.com',
  'adform.net',
  'adition.com',
  'adk2x.com',
  'adlightning.com',
  'admachine.co.kr',
  'admanmedia.com',
  'admedo.com',
  'adnium.com',
  'adnxs.com',
  'adop.cc',
  'adotmob.com',
  'adpopcorn.com',
  'adpushup.com',
  'ads-twitter.com',
  'ads.linkedin.com',
  'ads.naver.com',
  'adskeeper.com',
  'adsterra.com',
  'adservice.google.com',
  'adsafeprotected.com',
  'adsrvr.org',
  'adsymptotic.com',
  'adtech.de',
  'adtechus.com',
  'adtelligent.com',
  'adtng.com',
  'adtrafficquality.google',
  'advertising.com',
  'adxcore.com',
  'amazon-adsystem.com',
  'appier.net',
  'bidswitch.net',
  'buysellads.com',
  'carbonads.com',
  'casalemedia.com',
  'clickadu.com',
  'clickaine.com',
  'comscore.com',
  'contentabc.com',
  'contextweb.com',
  'crakmedia.com',
  'crakrevenue.com',
  'creativecdn.com',
  'criteo.com',
  'criteo.net',
  'crwdcntrl.net',
  'dable.io',
  'demdex.net',
  'doubleclick.net',
  'doubleverify.com',
  'everesttech.net',
  'exdynsrv.com',
  'exelator.com',
  'exoclick.com',
  'exosrv.com',
  'ezoic.com',
  'ezoic.net',
  'flashtalking.com',
  'galaksion.com',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagservices.com',
  'gumgum.com',
  'highperformanceformat.com',
  'hilltopads.com',
  'hilltopads.net',
  'id5-sync.com',
  'imrworldwide.com',
  'indexww.com',
  'inmobi.com',
  'juicyads.com',
  'krxd.net',
  'liadm.com',
  'lijit.com',
  'liveintent.com',
  'magsrv.com',
  'media.net',
  'mgid.com',
  'moatads.com',
  'moat.com',
  'nativo.com',
  'nitropay.com',
  'omtrdc.net',
  'onclickads.net',
  'onclickmega.com',
  'onclicksuper.com',
  'openx.net',
  'outbrain.com',
  'outbrainimg.com',
  'plugrush.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'propellerclick.com',
  'pubmatic.com',
  'pulsepoint.com',
  'quantcount.com',
  'quantserve.com',
  'realclick.co.kr',
  'realsrv.com',
  'revcontent.com',
  'richads.com',
  'rlcdn.com',
  'rollerads.com',
  'rubiconproject.com',
  'runative-syndicate.com',
  'scorecardresearch.com',
  'seedtag.com',
  'serving-sys.com',
  'sharethrough.com',
  'sizmek.com',
  'smaato.net',
  'smartadserver.com',
  'sonobi.com',
  'sovrn.com',
  'spotx.tv',
  'spotxchange.com',
  'stickyadstv.com',
  'taboola.com',
  'teads.tv',
  'thetradedesk.com',
  'tnkfactory.com',
  'trafficjunky.com',
  'trafficjunky.net',
  'trafficstars.com',
  'triplelift.com',
  'tsyndicate.com',
  'twinred.com',
  'venatusmedia.com',
  'widerplanet.com',
  'wpadmngr.com',
  'xandr.com',
  'yieldmo.com',
  'zemanta.com',
];

const AD_HOST_LABELS = new Set([
  'ad',
  'adc',
  'adcdn',
  'adimg',
  'adn',
  'ads',
  'adserv',
  'adserver',
  'adserving',
  'adsystem',
  'adtech',
  'advert',
  'advertising',
  'adx',
  'banner',
  'banners',
  'pixel',
  'pixels',
  'popads',
  'popup',
  'popups',
  'popunder',
  'popunders',
  'sponsor',
  'sponsored',
  'tracker',
  'trackers',
  'tracking',
]);

const AD_PATH_PATTERN = /(?:^|\/)(?:ads?|adserver|adserve|advert|advertising|advertisement|banners?|popunders?|popads)(?:[-_/.\?]|$)/i;
const AD_QUERY_PATTERN = /[?&](?:ads?|adid|adunit|adslot|ad_type|bannerid|popunder)=/i;

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

function hostHasAdLabel(hostname) {
  const labels = String(hostname || '').toLowerCase().split('.').filter(Boolean);
  if (labels.length < 2) return false;
  return labels.slice(0, -1).some((label) => AD_HOST_LABELS.has(label));
}

function isAdRequestPath(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return AD_PATH_PATTERN.test(parsed.pathname) || AD_QUERY_PATTERN.test(parsed.search);
  } catch {
    return false;
  }
}

export function isBlockedTrackerHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return Boolean(host) && (hostMatchesAnySuffix(host, BLOCKED_HOST_SUFFIXES) || hostHasAdLabel(host));
}

export function shouldBlockForcedWindowOpen(options) {
  const targetHost = hostnameFromUrl(options?.targetUrl);
  if (!targetHost) return false;
  if (isUserBlockedBrowserHost(targetHost, options?.blockedDomains)) return true;
  if (options?.trackerBlocking === false) return false;
  if (isTrustedBrowserHost(targetHost)) return false;
  if (isBlockedTrackerHost(targetHost)) return true;
  if (String(options?.disposition || '') === 'background-tab') return false;

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
  if (NEVER_BLOCK_EXACT.has(requestHost) || hostMatchesAnySuffix(requestHost, NEVER_BLOCK_SUFFIXES)) {
    return false;
  }

  const pageHost = hostnameFromUrl(pageUrl);
  const sameParty = Boolean(
    pageHost
    && getRegistrableDomain(pageHost)
    && getRegistrableDomain(pageHost) === getRegistrableDomain(requestHost),
  );
  if (sameParty) return false;

  if (isBlockedTrackerHost(requestHost)) return true;
  return resourceType !== 'mainFrame' && isAdRequestPath(requestUrl);
}
