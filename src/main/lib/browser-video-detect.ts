import crypto from 'crypto';
import { isBlockedTrackerHost } from './browser-tracker-block';
import {
  classifyMediaTrack,
  dropdownBrowserVideoQualities,
  isCombinedBrowserVideo,
  mediaPlaylistGroupKey,
  mergeBrowserVideoQualities,
  resolveQualityLabel,
  sortBrowserVideoQualities,
  stampBrowserVideoQuality,
} from './browser-video-playlist';

export type BrowserVideoKind = 'file' | 'hls' | 'dash';

export type BrowserDetectedVideo = {
  id: string;
  url: string;
  pageUrl: string;
  kind: BrowserVideoKind;
  mime: string;
  bytes: number | null;
  title: string;
  host: string;
  duration: number | null;
  preview: string;
  poster: string;
  width?: number | null;
  height?: number | null;
  qualities: Array<{
    url: string;
    label: string;
    width: number | null;
    height: number | null;
    bandwidth: number | null;
    track: 'av' | 'video' | 'audio';
  }>;
  audioQualities?: Array<{
    url: string;
    label: string;
    width: number | null;
    height: number | null;
    bandwidth: number | null;
    track: 'av' | 'video' | 'audio';
  }>;
  videoQualities?: Array<{
    url: string;
    label: string;
    width: number | null;
    height: number | null;
    bandwidth: number | null;
    track: 'av' | 'video' | 'audio';
  }>;
};

const SKIP_HOST_SUFFIXES = [
  'youtube.com',
  'youtu.be',
  'googlevideo.com',
  'ytimg.com',
  'gvt1.com',
];

const SKIP_EXTENSIONS = new Set([
  'ts',
  'm4s',
  'm4a',
  'aac',
  'key',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'vtt',
  'srt',
  'js',
  'css',
  'json',
  'html',
  'htm',
]);

const MIN_FILE_BYTES = 150 * 1024;
const MAX_VIDEOS_PER_PAGE = 40;
const MAX_PAGES = 30;

const videosByPage = new Map();

function hostnameFromUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function hostMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function browserVideoPageKey(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    parsed.hash = '';
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isUnsupportedBrowserVideoHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return Boolean(host) && SKIP_HOST_SUFFIXES.some((suffix) => hostMatchesSuffix(host, suffix));
}

export function isUnsupportedBrowserVideoPage(pageUrl) {
  return isUnsupportedBrowserVideoHost(hostnameFromUrl(pageUrl));
}

export function hostLabelForVideoUrl(url) {
  return hostnameFromUrl(url).replace(/^www\./, '');
}

export function readResponseHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return '';
  const target = String(name || '').toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  if (!entry) return '';
  const value = entry[1];
  return String(Array.isArray(value) ? value[0] : value || '').trim();
}

function extensionFromPath(pathname) {
  const match = String(pathname || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : '';
}

function kindFromMime(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.includes('mpegurl') || value.includes('x-mpegurl')) return 'hls';
  if (value.includes('dash+xml')) return 'dash';
  if (value.startsWith('video/') || value === 'application/octet-stream') return 'file';
  return '';
}

function kindFromExtension(ext) {
  if (ext === 'm3u8') return 'hls';
  if (ext === 'mpd') return 'dash';
  if (ext === 'mp4' || ext === 'webm' || ext === 'm4v' || ext === 'mov' || ext === 'mkv') return 'file';
  return '';
}

type ClassifyBrowserVideoRequestOptions = {
  url?: string;
  mime?: string;
  resourceType?: string;
  bytes?: number | string | null;
};

export function classifyBrowserVideoRequest(options: ClassifyBrowserVideoRequestOptions = {}) {
  const url = String(options.url || '').trim();
  if (!url || url.length > 8192 || url.startsWith('blob:') || url.startsWith('data:')) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isUnsupportedBrowserVideoHost(parsed.hostname) || isBlockedTrackerHost(parsed.hostname)) return null;

  const ext = extensionFromPath(parsed.pathname);
  if (SKIP_EXTENSIONS.has(ext)) return null;

  const mime = String(options.mime || '').toLowerCase();
  const resourceType = String(options.resourceType || '');
  const kind = kindFromMime(mime) || kindFromExtension(ext) || (resourceType === 'media' ? 'file' : '');
  if (!kind) return null;

  const bytes = Number(options.bytes);
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : null;
  if (kind === 'file' && size != null && size < MIN_FILE_BYTES) return null;

  return {
    url: parsed.toString(),
    kind,
    mime: mime || (
      kind === 'hls'
        ? 'application/vnd.apple.mpegurl'
        : kind === 'dash'
          ? 'application/dash+xml'
          : 'video/mp4'
    ),
    bytes: size,
  };
}

export function titleFromVideoUrl(url, pageTitle) {
  try {
    const parsed = new URL(url);
    const base = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    const cleaned = base.replace(/\.(m3u8|mpd|mp4|webm|m4v|mov|mkv)$/i, '');
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  } catch {
    // fall through to page title
  }
  const fallback = String(pageTitle || '').trim();
  return fallback || 'video';
}

function defaultQualities(video) {
  if (Array.isArray(video?.qualities) && video.qualities.length > 0) {
    return mergeBrowserVideoQualities([], video.qualities);
  }
  const track = video.track || classifyMediaTrack({ url: video.url });
  return [stampBrowserVideoQuality({
    url: video.url,
    width: Number(video.width) || null,
    height: Number(video.height) || null,
    bandwidth: null,
    track,
  })];
}

export function rememberBrowserVideo(video) {
  const pageUrl = String(video?.pageUrl || '');
  const pageKey = browserVideoPageKey(pageUrl);
  if (!pageKey || !video?.url) return null;
  const id = crypto.createHash('sha1').update(video.url).digest('hex').slice(0, 16);
  const item: BrowserDetectedVideo = {
    id,
    url: video.url,
    pageUrl,
    kind: video.kind,
    mime: video.mime || '',
    bytes: video.bytes ?? null,
    title: String(video.title || titleFromVideoUrl(video.url, '')).slice(0, 120),
    host: hostLabelForVideoUrl(video.url),
    duration: Number.isFinite(Number(video.duration)) ? Number(video.duration) : null,
    preview: String(video.preview || '').slice(0, 180000),
    poster: String(video.poster || ''),
    width: Number(video.width) > 0 ? Number(video.width) : null,
    height: Number(video.height) > 0 ? Number(video.height) : null,
    qualities: defaultQualities(video),
  };
  const bucket = videosByPage.get(pageKey) || new Map();
  const previous = bucket.get(id);
  bucket.set(id, {
    ...previous,
    ...item,
    bytes: item.bytes ?? previous?.bytes ?? null,
    duration: item.duration ?? previous?.duration ?? null,
    preview: item.preview || previous?.preview || '',
    poster: item.poster || previous?.poster || '',
    title: item.title || previous?.title || 'video',
    width: item.width ?? previous?.width ?? null,
    height: item.height ?? previous?.height ?? null,
    qualities: mergeBrowserVideoQualities(previous?.qualities, item.qualities),
  });
  while (bucket.size > MAX_VIDEOS_PER_PAGE) {
    const first = bucket.keys().next().value;
    bucket.delete(first);
  }
  videosByPage.set(pageKey, bucket);
  while (videosByPage.size > MAX_PAGES) {
    const first = videosByPage.keys().next().value;
    videosByPage.delete(first);
  }
  return bucket.get(id);
}

export function listRememberedBrowserVideos(pageUrl) {
  const pageKey = browserVideoPageKey(pageUrl);
  if (!pageKey) return [];
  const bucket = videosByPage.get(pageKey);
  if (!bucket) return [];
  return [...bucket.values()].reverse();
}

function findCaptureTarget(pageUrl, capture) {
  const videos = listRememberedBrowserVideos(pageUrl);
  if (videos.length === 0) return null;
  const urls = new Set(
    [capture?.url, ...(Array.isArray(capture?.urls) ? capture.urls : [])]
      .filter((item) => typeof item === 'string' && item),
  );
  const matched = videos.find((video) => (
    urls.has(video.url) || (video.qualities || []).some((quality) => urls.has(quality.url))
  ));
  if (matched) return matched;
  if (videos.length === 1) return videos[0];
  const visible = listVisibleBrowserVideos(pageUrl);
  if (visible.length === 1) {
    return videos.find((video) => video.id === visible[0].id) || visible[0];
  }
  const unlabeled = visible.filter((video) => !video.height && !(video.qualities || []).some((item) => item.height));
  if (unlabeled.length === 1) {
    return videos.find((video) => video.id === unlabeled[0].id) || unlabeled[0];
  }
  return null;
}

export function applyBrowserVideoCapture(pageUrl, capture) {
  const target = findCaptureTarget(pageUrl, capture);
  if (!target) return null;
  if (Number.isFinite(Number(capture?.duration)) && capture.duration > 0) {
    target.duration = target.duration ?? Number(capture.duration);
  }
  if (capture?.preview) target.preview = String(capture.preview).slice(0, 180000);
  if (capture?.poster) target.poster = String(capture.poster);
  const captureWidth = Number(capture?.width) > 0 ? Number(capture.width) : null;
  const captureHeight = Number(capture?.height) > 0 ? Number(capture.height) : null;
  if (captureWidth) target.width = target.width ?? captureWidth;
  if (captureHeight) target.height = target.height ?? captureHeight;
  if (captureHeight) {
    const qualities = target.qualities || [];
    const playable = qualities.filter((item) => item.track !== 'audio');
    const missingHeight = playable.filter((item) => !item.height);
    if (missingHeight.length > 0 && missingHeight.length === playable.length) {
      target.qualities = qualities.map((item) => {
        if (item.track === 'audio' || item.height) return item;
        const next = {
          ...item,
          width: item.width || captureWidth,
          height: captureHeight,
        };
        return { ...next, label: resolveQualityLabel(next) };
      });
    }
  }
  return target;
}

function primaryRank(video) {
  const track = classifyMediaTrack({ url: video?.url });
  if (track === 'av') return 3;
  if (track === 'video') return 1;
  return 0;
}

function adoptPrimaryVideo(existing, incoming) {
  if (primaryRank(incoming) <= primaryRank(existing)) return;
  existing.url = incoming.url;
  existing.id = incoming.id;
  existing.title = incoming.title || existing.title;
  existing.host = incoming.host || existing.host;
  existing.kind = incoming.kind || existing.kind;
}

export function collapseRelatedBrowserVideos(videos) {
  const list = Array.isArray(videos) ? videos : [];
  const byUrl = new Map(list.map((video) => [video.url, video]));
  const drop = new Set();
  list.forEach((video) => {
    (video.qualities || []).forEach((quality) => {
      if (quality.url && quality.url !== video.url && byUrl.has(quality.url)) {
        drop.add(quality.url);
      }
    });
  });
  const groups = new Map();
  const kept = [];
  list.forEach((video) => {
    if (drop.has(video.url)) return;
    if (video.kind !== 'hls' && video.kind !== 'dash') {
      kept.push(video);
      return;
    }
    const key = `${video.kind}:${mediaPlaylistGroupKey(video.url)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, video);
      kept.push(video);
      return;
    }
    adoptPrimaryVideo(existing, video);
    existing.qualities = mergeBrowserVideoQualities(existing.qualities, [
      ...(video.qualities || []),
      { url: video.url, label: '', width: null, height: null, bandwidth: null, track: classifyMediaTrack({ url: video.url }) },
    ]);
    existing.duration = existing.duration ?? video.duration;
    existing.preview = existing.preview || video.preview;
    existing.poster = existing.poster || video.poster;
    existing.bytes = existing.bytes ?? video.bytes;
    existing.width = existing.width ?? video.width;
    existing.height = existing.height ?? video.height;
  });
  return kept.map((video) => {
    video.qualities = sortBrowserVideoQualities(video.qualities);
    return video;
  });
}

export function listVisibleBrowserVideos(pageUrl) {
  return collapseRelatedBrowserVideos(listRememberedBrowserVideos(pageUrl))
    .filter((video) => isCombinedBrowserVideo(video));
}

function canUseVideoDimensions(video) {
  const playable = (video?.qualities || []).filter((item) => item.track !== 'audio');
  if (playable.length <= 1) return true;
  return playable.every((item) => !item.height);
}

function labeledQuality(item, video) {
  const stamped = stampBrowserVideoQuality(item);
  const useVideoSize = !stamped.height && canUseVideoDimensions(video);
  const height = stamped.height || (useVideoSize ? video?.height : null) || null;
  const width = stamped.width || (useVideoSize ? video?.width : null) || null;
  const next = { ...stamped, width, height };
  const label = resolveQualityLabel(next, useVideoSize ? { width: video?.width, height: video?.height } : {});
  return { ...next, label: label && label !== '기본' ? label : '' };
}

export function serializeBrowserDetectedVideo(video) {
  const all = sortBrowserVideoQualities(video?.qualities?.length ? video.qualities : defaultQualities(video))
    .map((item) => labeledQuality(item, video));
  const dropdown = dropdownBrowserVideoQualities(all).map((item) => labeledQuality(item, video));
  const labeledDropdown = dropdown.filter((item) => item.label);
  const labeledAll = all.filter((item) => item.track !== 'audio' && item.label);
  const qualities = labeledDropdown.length > 0
    ? labeledDropdown
    : labeledAll.length > 0
      ? labeledAll
      : dropdown.filter((item) => item.track !== 'audio');
  return {
    id: video.id,
    url: video.url,
    pageUrl: video.pageUrl,
    kind: video.kind,
    mime: video.mime || '',
    bytes: video.bytes ?? null,
    title: video.title || titleFromVideoUrl(video.url, 'video'),
    host: video.host || hostLabelForVideoUrl(video.url),
    duration: video.duration ?? null,
    preview: video.preview || video.poster || '',
    poster: video.poster || '',
    width: Number(video.width) > 0 ? Number(video.width) : null,
    height: Number(video.height) > 0 ? Number(video.height) : null,
    qualities,
    audioQualities: all.filter((item) => item.track === 'audio'),
    videoQualities: all.filter((item) => item.track === 'video'),
  };
}

export function resetRememberedBrowserVideos() {
  videosByPage.clear();
}

export function suggestedBrowserVideoFilename(video, track = 'av') {
  const base = String(video?.title || titleFromVideoUrl(video?.url, 'video'))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'video';
  if (track === 'audio') return `${base}.m4a`;
  const ext = video?.kind === 'file' && /\.webm(?:$|\?)/i.test(String(video?.url || ''))
    ? 'webm'
    : 'mp4';
  return `${base}.${ext}`;
}
