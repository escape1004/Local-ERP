export type BrowserPageVideoCapture = {
  url: string;
  urls: string[];
  duration: number | null;
  width: number | null;
  height: number | null;
  poster: string;
  preview: string;
};

export function isUnsupportedBrowserVideoPage(url: string) {
  try {
    const host = new URL(String(url || '')).hostname.toLowerCase().replace(/\.$/, '');
    return (
      host === 'youtu.be'
      || host === 'youtube.com'
      || host.endsWith('.youtube.com')
      || host === 'googlevideo.com'
      || host.endsWith('.googlevideo.com')
    );
  } catch {
    return false;
  }
}

export function getCollectBrowserPageVideosScript() {
  return `(() => {
    const items = [];
    document.querySelectorAll('video').forEach((el) => {
      const sources = [];
      const push = (value) => {
        if (typeof value === 'string' && /^https?:\\/\\//i.test(value) && !sources.includes(value)) sources.push(value);
      };
      push(el.currentSrc);
      push(el.src);
      el.querySelectorAll('source').forEach((source) => push(source.src));
      let preview = '';
      try {
        if (el.readyState >= 2 && el.videoWidth > 0) {
          const canvas = document.createElement('canvas');
          const width = 320;
          const height = Math.max(1, Math.round((width * el.videoHeight) / el.videoWidth));
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          if (context) {
            context.drawImage(el, 0, 0, width, height);
            preview = canvas.toDataURL('image/jpeg', 0.72);
          }
        }
      } catch (error) {}
      items.push({
        url: sources[0] || '',
        urls: sources.slice(0, 8),
        duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
        poster: typeof el.poster === 'string' && /^https?:\\/\\//i.test(el.poster) ? el.poster : '',
        preview,
      });
    });
    return items.slice(0, 10);
  })()`;
}

export function parseCollectedBrowserPageVideos(result: unknown): BrowserPageVideoCapture[] {
  if (!Array.isArray(result)) return [];
  return result.slice(0, 10).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const urls = Array.isArray(record.urls)
      ? record.urls.filter((value): value is string => typeof value === 'string' && /^https?:\/\//i.test(value))
      : [];
    const url = typeof record.url === 'string' && /^https?:\/\//i.test(record.url) ? record.url : (urls[0] || '');
    return {
      url,
      urls: url && !urls.includes(url) ? [url, ...urls] : urls,
      duration: Number.isFinite(Number(record.duration)) && Number(record.duration) > 0 ? Number(record.duration) : null,
      width: Number(record.width) > 0 ? Number(record.width) : null,
      height: Number(record.height) > 0 ? Number(record.height) : null,
      poster: typeof record.poster === 'string' ? record.poster : '',
      preview: typeof record.preview === 'string' && record.preview.startsWith('data:image/') ? record.preview : '',
    };
  });
}

export function formatBrowserVideoBytes(bytes: number | null | undefined) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatBrowserVideoDuration(seconds: number | null | undefined) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

export function browserVideoKindLabel(kind: string) {
  if (kind === 'hls') return 'HLS';
  if (kind === 'dash') return 'DASH';
  return '파일';
}

export function formatBrowserVideoCountBadge(count: number) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';
  return value > 9 ? '9+' : String(Math.floor(value));
}

function dimensionsFromVideoUrl(url?: string) {
  try {
    const parsed = new URL(String(url || ''));
    const text = `${parsed.pathname}${parsed.search}`;
    const sized = text.match(/\/(\d{2,4})x(\d{2,4})\b/i) || text.match(/(\d{2,4})x(\d{2,4})/i);
    if (sized) return { width: Number(sized[1]) || null, height: Number(sized[2]) || null };
    const named = text.match(/[_\-./?=](\d{3,4})p\b/i) || text.match(/\b(\d{3,4})p\b/i);
    if (named) return { width: null, height: Number(named[1]) || null };
  } catch {
    // Ignore invalid media URLs.
  }
  return { width: null, height: null };
}

export function formatBrowserVideoQualityLabel(quality: {
  label?: string;
  height?: number | null;
  width?: number | null;
  bandwidth?: number | null;
  url?: string;
}) {
  const label = String(quality?.label || '').trim();
  if (label && label !== '기본') return label;
  const fromUrl = dimensionsFromVideoUrl(quality?.url);
  const height = Number(quality?.height) || fromUrl.height;
  if (Number.isFinite(height) && height > 0) return `${Math.round(height)}P`;
  const width = Number(quality?.width) || fromUrl.width;
  if (Number.isFinite(width) && width > 0) return `${Math.round(width)}P`;
  const rate = Number(quality?.bandwidth);
  if (Number.isFinite(rate) && rate > 0) {
    const kbps = Math.round(rate / 1000);
    return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
  }
  return '';
}

export function mergeBrowserVideoCaptures<T extends {
  url?: string;
  height?: number | null;
  width?: number | null;
  qualities?: Array<{
    url: string;
    label?: string;
    height?: number | null;
    width?: number | null;
    bandwidth?: number | null;
    track?: 'av' | 'video' | 'audio';
  }>;
}>(videos: T[], captures: BrowserPageVideoCapture[] = []) {
  const sized = captures.filter((item) => Number(item?.height) > 0);
  if (videos.length === 0 || sized.length === 0) return videos;
  const urlsOf = (capture: BrowserPageVideoCapture) => (
    [capture.url, ...(capture.urls || [])].filter((item) => typeof item === 'string' && item)
  );
  return videos.map((video) => {
    const capture = sized.find((item) => {
      const urls = urlsOf(item);
      return urls.includes(String(video.url || ''))
        || (video.qualities || []).some((quality) => urls.includes(quality.url));
    }) || (videos.length === 1 && sized.length === 1 ? sized[0] : null)
      || (sized.length === 1 && !video.height && !(video.qualities || []).some((item) => item.height) ? sized[0] : null);
    if (!capture) return video;
    const height = video.height || Number(capture.height) || null;
    const width = video.width || Number(capture.width) || null;
    const baseQualities = video.qualities?.length
      ? video.qualities
      : [{
        url: String(video.url || ''),
        label: '',
        width: null,
        height: null,
        bandwidth: null,
        track: 'av' as const,
      }];
    const stampAll = baseQualities.some((item) => item.track !== 'audio')
      && baseQualities.filter((item) => item.track !== 'audio').every((item) => !item.height);
    const qualities = baseQualities.map((item) => {
      if (item.track === 'audio' || item.height || !stampAll) {
        return {
          ...item,
          label: formatBrowserVideoQualityLabel({
            ...item,
            url: item.url,
            height: item.height || (stampAll ? height : null),
            width: item.width || (stampAll ? width : null),
          }),
        };
      }
      const next = { ...item, width: item.width || width, height: item.height || height };
      return {
        ...next,
        label: formatBrowserVideoQualityLabel({ ...next, url: next.url }),
      };
    });
    return { ...video, width, height, qualities };
  });
}

export function browserVideoQualityOptions(video: {
  url?: string;
  height?: number | null;
  width?: number | null;
  qualities?: Array<{
    url: string;
    label?: string;
    height?: number | null;
    width?: number | null;
    bandwidth?: number | null;
    track?: 'av' | 'video' | 'audio';
  }>;
}) {
  const playable = (video.qualities || []).filter((item) => item.track !== 'audio');
  const useVideoSize = playable.length <= 1 || playable.every((item) => !item.height);
  const mapped = (video.qualities || []).map((item) => ({
    ...item,
    label: formatBrowserVideoQualityLabel({
      ...item,
      height: item.height || (useVideoSize ? video.height : null),
      width: item.width || (useVideoSize ? video.width : null),
      url: item.url,
    }),
  }));
  const labeled = mapped.filter((item) => item.label);
  if (labeled.length > 0) return labeled;
  const fallback = formatBrowserVideoQualityLabel({
    height: video.height,
    width: video.width,
    url: video.url,
  });
  const source = mapped.filter((item) => item.url);
  if (!fallback) return source.filter((item) => item.label);
  if (source.length === 0) {
    return [{
      url: String(video.url || ''),
      label: fallback,
      width: video.width ?? null,
      height: video.height ?? null,
      bandwidth: null,
      track: 'av' as const,
    }];
  }
  return source.map((item) => ({ ...item, label: item.label || fallback }));
}

export function displayBrowserVideoName(video: { title?: string; url?: string }) {
  const title = String(video?.title || '').trim();
  if (title) {
    return /\.(m3u8|mpd|mp4|webm|m4v)$/i.test(title) ? title : `${title}${guessVideoExtension(video?.url)}`;
  }
  try {
    return decodeURIComponent(new URL(String(video?.url || '')).pathname.split('/').filter(Boolean).pop() || 'video');
  } catch {
    return 'video';
  }
}

function guessVideoExtension(url?: string) {
  if (/\.webm(?:$|\?)/i.test(String(url || ''))) return '.webm';
  if (/\.mpd(?:$|\?)/i.test(String(url || ''))) return '.mpd';
  if (/\.m3u8(?:$|\?)/i.test(String(url || ''))) return '.m3u8';
  return '.mp4';
}
