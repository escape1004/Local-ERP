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

export function chromeLikeUserAgent(userAgent) {
  return String(userAgent || '')
    .replace(/\sElectron\/\S+/gi, '')
    .replace(/\sLocal ERP\/\S+/g, '')
    .replace(/\slocal-erp\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
