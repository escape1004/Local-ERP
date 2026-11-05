export type BrowserMediaTrack = 'av' | 'video' | 'audio';

export type BrowserVideoQuality = {
  url: string;
  label: string;
  width: number | null;
  height: number | null;
  bandwidth: number | null;
  track: BrowserMediaTrack;
};

const VIDEO_CODEC = /(avc1|avc3|hvc1|hev1|vp09|vp8|vp9|av01|dvh1)/i;
const AUDIO_CODEC = /(mp4a|opus|ac-3|ec-3|ac3|eac3|flac|mp3)/i;

function resolvePlaylistUrl(baseUrl, value) {
  try {
    return new URL(String(value || ''), baseUrl).toString();
  } catch {
    return '';
  }
}

function parseAttrList(raw) {
  const attrs: Record<string, string> = {};
  String(raw || '').replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi, (_match, key, value) => {
    attrs[String(key).toUpperCase()] = String(value || '').replace(/^"|"$/g, '');
    return '';
  });
  return attrs;
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

function heightFromResolution(value) {
  const match = String(value || '').match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (!match) return { width: null, height: null };
  return { width: Number(match[1]) || null, height: Number(match[2]) || null };
}

export function videoDimensionsFromUrl(url) {
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

type ClassifyMediaTrackOptions = {
  mediaType?: string;
  codecs?: string;
  url?: string;
  height?: number | null;
  separateAudio?: boolean;
};

export function classifyMediaTrack(options: ClassifyMediaTrackOptions = {}) {
  const mediaType = String(options.mediaType || '').toUpperCase();
  if (mediaType === 'AUDIO') return 'audio';
  if (mediaType === 'VIDEO') return 'video';

  const codecs = String(options.codecs || '');
  const hasVideo = VIDEO_CODEC.test(codecs);
  const hasAudio = AUDIO_CODEC.test(codecs);
  if (hasVideo && hasAudio) return 'av';
  if (hasVideo) return 'video';
  if (hasAudio) return 'audio';

  const path = pathnameOf(options.url);
  if (/(^|\/)(aud|audio)(\/|$)/i.test(path) || /\/mp4a[^/]*(\/|$)/i.test(path)) return 'audio';
  if (/(^|\/)(vid|video)(\/|$)/i.test(path) || /\/(avc1|hvc1|hev1)(\/|$)/i.test(path)) return 'video';
  if (Number(options.height) > 0 && options.separateAudio) return 'video';
  return 'av';
}

export function qualityLabelFromHeight(height, bandwidth, track) {
  if (track === 'audio') {
    const rate = qualityLabelFromHeight(null, bandwidth, 'av');
    return rate ? `${rate} 오디오` : '오디오';
  }
  const px = Number(height);
  if (Number.isFinite(px) && px > 0) {
    return `${Math.round(px)}P`;
  }
  const rate = Number(bandwidth);
  if (Number.isFinite(rate) && rate > 0) {
    const kbps = Math.round(rate / 1000);
    return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`;
  }
  return '';
}

type QualityLabelFallback = {
  width?: number | null;
  height?: number | null;
};

export function stampBrowserVideoQuality(quality) {
  const fromUrl = videoDimensionsFromUrl(quality?.url);
  const width = Number(quality?.width) || fromUrl.width || null;
  const height = Number(quality?.height) || fromUrl.height || null;
  const next = {
    ...quality,
    width,
    height,
  };
  const label = resolveQualityLabel(next);
  return {
    ...next,
    label: label && label !== '기본' ? label : '',
  };
}

export function resolveQualityLabel(quality, fallback: QualityLabelFallback = {}) {
  const fromUrl = videoDimensionsFromUrl(quality?.url);
  const height = Number(quality?.height) || Number(fallback.height) || fromUrl.height;
  const width = Number(quality?.width) || Number(fallback.width) || fromUrl.width;
  const track = quality?.track;
  const labeled = qualityLabelFromHeight(height, quality?.bandwidth, track);
  if (labeled) return labeled;
  if (width > 0 && height > 0) return `${Math.round(width)}x${Math.round(height)}`;
  if (width > 0) return `${Math.round(width)}P`;
  if (quality?.label && quality.label !== '기본') return quality.label;
  return '';
}

function trackRank(track) {
  if (track === 'audio') return 0;
  if (track === 'video') return 1;
  return 2;
}

export function sortBrowserVideoQualities(qualities) {
  return [...(Array.isArray(qualities) ? qualities : [])]
    .filter((item) => item?.url)
    .sort((left, right) => (
      trackRank(right.track) - trackRank(left.track)
      || (Number(right.height) || 0) - (Number(left.height) || 0)
      || (Number(right.bandwidth) || 0) - (Number(left.bandwidth) || 0)
    ));
}

function preferTrack(current, incoming) {
  if (incoming && incoming !== 'av') return incoming;
  return current || incoming || 'av';
}

export function mergeBrowserVideoQualities(current, incoming) {
  const merged = new Map();
  [...(current || []), ...(incoming || [])].forEach((item) => {
    if (!item?.url) return;
    const previous = merged.get(item.url);
    const track = preferTrack(previous?.track, item.track || classifyMediaTrack({
      url: item.url,
      height: item.height,
    }));
    merged.set(item.url, stampBrowserVideoQuality({
      url: item.url,
      width: item.width ?? previous?.width ?? null,
      height: item.height ?? previous?.height ?? null,
      bandwidth: item.bandwidth ?? previous?.bandwidth ?? null,
      track,
    }));
  });
  return sortBrowserVideoQualities([...merged.values()]);
}

export function mediaPlaylistGroupKey(url) {
  try {
    const parsed = new URL(url);
    const file = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.(m3u8|mpd)$/i, '');
    const parent = parsed.pathname
      .replace(/\/[^/]+$/, '')
      .replace(/\/(pl|vid|video|aud|audio|hls)(?=\/|$)/gi, '')
      .replace(/\/(avc1|hvc1|hev1|mp4a[^/]*)(?=\/|$)/gi, '')
      .replace(/\/\d{2,4}x\d{2,4}(?=\/|$)/gi, '')
      .replace(/\/\d{3,4}p(?=\/|$)/gi, '')
      .replace(/\/\d{4,9}(?=\/|$)/gi, '')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
    return `${parsed.origin}${parent}::${file}`;
  } catch {
    return String(url || '');
  }
}

function qualityHasDisplayLabel(item) {
  return Boolean(resolveQualityLabel(item) || (item?.label && item.label !== '기본'));
}

export function dropdownBrowserVideoQualities(qualities) {
  const list = Array.isArray(qualities) ? qualities : [];
  const playable = list.filter((item) => item.track !== 'audio');
  const labeled = playable.filter((item) => qualityHasDisplayLabel(item));
  const avSized = labeled.filter((item) => item.track === 'av' && (item.height || videoDimensionsFromUrl(item.url).height));
  if (avSized.length > 0) return sortBrowserVideoQualities(avSized);
  const videoSized = labeled.filter((item) => item.track === 'video' || item.track === 'av');
  if (videoSized.length > 0) return sortBrowserVideoQualities(videoSized);
  if (labeled.length > 0) return sortBrowserVideoQualities(labeled);
  const av = playable.filter((item) => item.track === 'av');
  if (av.length > 0) return sortBrowserVideoQualities(av);
  return sortBrowserVideoQualities(playable);
}

export function isCombinedBrowserVideo(video) {
  if (video?.kind === 'file') return true;
  const tracks = new Set((video?.qualities || []).map((item) => item.track || classifyMediaTrack({ url: item.url })));
  if (tracks.has('av')) return true;
  return tracks.has('audio') && tracks.has('video');
}

export function parseHlsPlaylist(text, playlistUrl) {
  const lines = String(text || '').split(/\r?\n/);
  const variants = [];
  let duration = 0;
  let isMaster = false;
  let separateAudio = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith('#EXT-X-MEDIA:')) {
      isMaster = true;
      const attrs = parseAttrList(line.slice('#EXT-X-MEDIA:'.length));
      if (String(attrs.TYPE || '').toUpperCase() === 'AUDIO' && attrs.URI) {
        separateAudio = true;
        const url = resolvePlaylistUrl(playlistUrl, attrs.URI);
        if (!url) continue;
        variants.push({
          url,
          width: null,
          height: null,
          bandwidth: Number(attrs.BANDWIDTH) || null,
          track: 'audio',
          label: attrs.NAME ? `${attrs.NAME} 오디오` : '오디오',
        });
      }
    }
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      isMaster = true;
      const attrs = parseAttrList(line.slice('#EXT-X-STREAM-INF:'.length));
      const next = String(lines[index + 1] || '').trim();
      const url = next && !next.startsWith('#') ? resolvePlaylistUrl(playlistUrl, next) : '';
      if (!url) continue;
      const fromAttr = heightFromResolution(attrs.RESOLUTION);
      const fromUrl = videoDimensionsFromUrl(url);
      const width = fromAttr.width || fromUrl.width;
      const height = fromAttr.height || fromUrl.height;
      const track = classifyMediaTrack({
        url,
        codecs: attrs.CODECS,
        height,
        separateAudio: separateAudio || Boolean(attrs.AUDIO),
      });
      variants.push({
        url,
        width,
        height,
        bandwidth: Number(attrs.BANDWIDTH) || null,
        track,
        label: qualityLabelFromHeight(height, attrs.BANDWIDTH, track),
      });
    }
    if (line.startsWith('#EXTINF:')) {
      duration += Number(line.slice(8).split(',')[0]) || 0;
    }
  }
  if (isMaster) {
    return { type: 'master', variants: sortBrowserVideoQualities(variants), duration: null };
  }
  const fallback = videoDimensionsFromUrl(playlistUrl);
  const track = classifyMediaTrack({ url: playlistUrl, height: fallback.height });
  return {
    type: 'media',
    variants: [{
      url: playlistUrl,
      width: fallback.width,
      height: fallback.height,
      bandwidth: null,
      track,
      label: qualityLabelFromHeight(fallback.height, null, track),
    }],
    duration: duration > 0 ? duration : null,
  };
}

export function parseDashManifest(text, playlistUrl) {
  const variants = [];
  const source = String(text || '');
  const representationRe = /<Representation\b([^>]*)>/gi;
  let match = representationRe.exec(source);
  while (match) {
    const attrs = parseAttrList(String(match[1] || '').replace(/[\s/]+/g, ',').replace(/="/g, '='));
    const width = Number(attrs.WIDTH) || null;
    const height = Number(attrs.HEIGHT) || null;
    const mime = String(attrs.MIMETYPE || '').toLowerCase();
    const track = mime.startsWith('audio/')
      ? 'audio'
      : mime.startsWith('video/') && !AUDIO_CODEC.test(attrs.CODECS || '')
        ? 'video'
        : classifyMediaTrack({
          url: playlistUrl,
          codecs: attrs.CODECS,
          height,
        });
    variants.push({
      url: playlistUrl,
      width,
      height,
      bandwidth: Number(attrs.BANDWIDTH) || null,
      track,
      label: qualityLabelFromHeight(height, attrs.BANDWIDTH, track),
    });
    match = representationRe.exec(source);
  }
  const durationMatch = source.match(/mediaPresentationDuration="([^"]+)"/i);
  return {
    type: 'dash',
    variants: sortBrowserVideoQualities(variants),
    duration: parseIsoDuration(durationMatch?.[1]),
  };
}

export function parseIsoDuration(value) {
  const text = String(value || '');
  const match = text.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/i);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

export function parseVideoManifest(kind, text, playlistUrl) {
  if (kind === 'dash') return parseDashManifest(text, playlistUrl);
  return parseHlsPlaylist(text, playlistUrl);
}
