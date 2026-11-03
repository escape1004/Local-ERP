const RESERVED_FRAME_NAMES = new Set(['', '_blank', '_self', '_parent', '_top']);

type PopupOpenDetails = {
  url?: string;
  frameName?: string;
  features?: string;
  disposition?: string;
};

type PopupBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
};

export function isBackgroundBrowserTabDisposition(disposition?: string) {
  return String(disposition || '') === 'background-tab';
}

export function isBrowserTabDisposition(disposition?: string) {
  const value = String(disposition || '');
  return value === 'background-tab' || value === 'foreground-tab';
}

export function shouldOpenEmbeddedBrowserPopup(details: PopupOpenDetails = {}) {
  if (isBrowserTabDisposition(details.disposition)) return false;
  const url = String(details.url || '');
  if (!url || url === 'about:blank') return true;

  const features = String(details.features || '');
  if (/(?:^|[,;\s])(?:width|height|innerwidth|innerheight)\s*=/i.test(features)) return true;

  const name = String(details.frameName || '').trim();
  return Boolean(name) && !RESERVED_FRAME_NAMES.has(name);
}

export function popupBoundsFromFeatures(features?: string, defaults: { width: number; height: number } = { width: 480, height: 720 }): PopupBounds {
  const parsed: Partial<Record<'width' | 'height' | 'left' | 'top', number>> = {};
  String(features || '').split(/[;,]/).forEach((part) => {
    const [rawKey, rawValue] = part.split('=');
    const key = String(rawKey || '').trim().toLowerCase().replace(/^inner/, '');
    const value = Number(String(rawValue || '').trim());
    if ((key === 'width' || key === 'height' || key === 'left' || key === 'top') && Number.isFinite(value)) {
      parsed[key] = Math.round(value);
    }
  });
  return {
    width: Math.min(1600, Math.max(360, parsed.width || defaults.width)),
    height: Math.min(1200, Math.max(400, parsed.height || defaults.height)),
    ...(Number.isFinite(parsed.left) ? { x: parsed.left } : {}),
    ...(Number.isFinite(parsed.top) ? { y: parsed.top } : {}),
  };
}

export function chromeMajorFromVersion(version) {
  const major = String(version || '').split('.')[0];
  return /^\d+$/.test(major) ? major : '';
}

export function chromeLikeUserAgent(userAgent, chromeVersion) {
  let next = String(userAgent || '')
    .replace(/\sElectron\/\S+/gi, '')
    .replace(/\sLocal ERP\/\S+/g, '')
    .replace(/\slocal-erp\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const major = chromeMajorFromVersion(chromeVersion);
  if (major) {
    next = next.replace(/Chrome\/[\d.]+/i, `Chrome/${major}.0.0.0`);
  }
  return next;
}

function withoutHeader(headers, name) {
  const target = String(name || '').toLowerCase();
  const next = { ...(headers || {}) };
  Object.keys(next).forEach((key) => {
    if (key.toLowerCase() === target) delete next[key];
  });
  return next;
}

function headerValue(headers, name) {
  const target = String(name || '').toLowerCase();
  const key = Object.keys(headers || {}).find((item) => item.toLowerCase() === target);
  return key ? String(headers[key] ?? '') : '';
}

export function applyChromeLikeClientHints(headers, chromeVersion, platform = 'win32') {
  const major = chromeMajorFromVersion(chromeVersion);
  let next = { ...(headers || {}) };
  const userAgent = chromeLikeUserAgent(headerValue(next, 'user-agent'), chromeVersion);
  if (userAgent) {
    next = withoutHeader(next, 'user-agent');
    next['User-Agent'] = userAgent;
  }
  if (!major) return next;

  next = withoutHeader(next, 'sec-ch-ua');
  next['sec-ch-ua'] = `"Google Chrome";v="${major}", "Chromium";v="${major}", "Not.A/Brand";v="99"`;
  next = withoutHeader(next, 'sec-ch-ua-full-version-list');
  next['sec-ch-ua-full-version-list'] = `"Google Chrome";v="${major}.0.0.0", "Chromium";v="${major}.0.0.0", "Not.A/Brand";v="10.0.0.0"`;
  next = withoutHeader(next, 'sec-ch-ua-mobile');
  next['sec-ch-ua-mobile'] = '?0';
  next = withoutHeader(next, 'sec-ch-ua-platform');
  next['sec-ch-ua-platform'] = platform === 'darwin' ? '"macOS"' : platform === 'linux' ? '"Linux"' : '"Windows"';
  return next;
}

export function isBotChallengeUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (
      host === 'challenges.cloudflare.com'
      || host.endsWith('.challenges.cloudflare.com')
      || host === 'hcaptcha.com'
      || host.endsWith('.hcaptcha.com')
      || host === 'recaptcha.net'
      || host.endsWith('.recaptcha.net')
      || (host === 'www.google.com' && path.startsWith('/recaptcha'))
    ) {
      return true;
    }
    return path.includes('/cdn-cgi/challenge-platform') || path.includes('/cdn-cgi/turnstile');
  } catch {
    return false;
  }
}
