export type BrowserPageImage = {
  url: string;
  width?: number;
  height?: number;
};

const MIN_IMAGE_EDGE = 32;

export function normalizePageImageUrl(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function collectUniquePageImages(raw: unknown): BrowserPageImage[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const images: BrowserPageImage[] = [];
  raw.forEach((item) => {
    const source = typeof item === 'string' ? item : item?.url;
    const url = normalizePageImageUrl(String(source || ''));
    if (!url || seen.has(url)) return;
    const width = Number(item?.width);
    const height = Number(item?.height);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      if (width < MIN_IMAGE_EDGE && height < MIN_IMAGE_EDGE) return;
    }
    seen.add(url);
    images.push({
      url,
      width: Number.isFinite(width) && width > 0 ? width : undefined,
      height: Number.isFinite(height) && height > 0 ? height : undefined,
    });
  });
  return images;
}

export function filenameFromImageUrl(url: string, index: number) {
  try {
    const parsed = new URL(url);
    const base = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base.slice(0, 120);
  } catch {
    // fall through
  }
  return `image-${String(index + 1).padStart(2, '0')}.jpg`;
}

export function getCollectBrowserPageImagesScript() {
  return `(() => {
    const urls = [];
    const abs = (value) => {
      try { return new URL(String(value || ''), location.href).toString(); } catch { return ''; }
    };
    const push = (url, width, height) => {
      const resolved = abs(url);
      if (!resolved) return;
      urls.push({ url: resolved, width: Number(width) || 0, height: Number(height) || 0 });
    };
    document.querySelectorAll('img').forEach((img) => {
      push(img.currentSrc || img.src, img.naturalWidth, img.naturalHeight);
      const srcset = img.srcset || '';
      srcset.split(',').forEach((part) => {
        const candidate = part.trim().split(/\\s+/)[0];
        if (candidate) push(candidate, img.naturalWidth, img.naturalHeight);
      });
    });
    document.querySelectorAll('source[srcset]').forEach((source) => {
      String(source.getAttribute('srcset') || '').split(',').forEach((part) => {
        const candidate = part.trim().split(/\\s+/)[0];
        if (candidate) push(candidate, 0, 0);
      });
    });
    document.querySelectorAll('[style*="background"]').forEach((node) => {
      const match = String(node.getAttribute('style') || '').match(/url\\((['"]?)(.*?)\\\\1\\)/i);
      if (match && match[2]) push(match[2], 0, 0);
    });
    return urls;
  })()`;
}
