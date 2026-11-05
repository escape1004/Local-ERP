import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, dialog, net, session, webContents } from 'electron';
import { getFfmpegToolPaths } from '../ffmpeg-paths';
import { chromeLikeUserAgent } from '../lib/embedded-browser-policy';
import {
  applyBrowserVideoCapture,
  classifyBrowserVideoRequest,
  collapseRelatedBrowserVideos,
  listRememberedBrowserVideos,
  listVisibleBrowserVideos,
  rememberBrowserVideo,
  serializeBrowserDetectedVideo,
  suggestedBrowserVideoFilename,
  titleFromVideoUrl,
} from '../lib/browser-video-detect';
import { classifyMediaTrack, mergeBrowserVideoQualities, parseHlsPlaylist, parseVideoManifest, resolveQualityLabel } from '../lib/browser-video-playlist';
import { log } from '../app/state';

const BROWSER_PARTITION = 'persist:erp-browser';
const PREVIEW_SECONDS = 12;

function headerMap(headers) {
  const next = {};
  Object.entries(headers || {}).forEach(([key, value]) => {
    next[String(key).toLowerCase()] = String(Array.isArray(value) ? value[0] : value || '');
  });
  return next;
}

function originFromUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
  } catch {
    // Ignore invalid page URLs.
  }
  return '';
}

function pageUrlFromDetails(details) {
  try {
    const contents = details.webContentsId != null ? webContents.fromId(details.webContentsId) : null;
    if (contents && !contents.isDestroyed()) {
      return contents.getURL() || details.referrer || '';
    }
  } catch {
    // Guest contents can disappear while the request completes.
  }
  return details.referrer || '';
}

function titleFromDetails(details, url) {
  try {
    const contents = details.webContentsId != null ? webContents.fromId(details.webContentsId) : null;
    if (contents && !contents.isDestroyed()) {
      return titleFromVideoUrl(url, contents.getTitle());
    }
  } catch {
    // Ignore missing guest titles.
  }
  return titleFromVideoUrl(url, '');
}

export function inspectCompletedBrowserRequest(details) {
  if (!details || details.statusCode < 200 || details.statusCode >= 400) return;
  const headers = headerMap(details.responseHeaders);
  const classified = classifyBrowserVideoRequest({
    url: details.url,
    resourceType: details.resourceType,
    mime: headers['content-type'],
    bytes: Number(headers['content-length']),
  });
  if (!classified) return;
  rememberBrowserVideo({
    ...classified,
    pageUrl: pageUrlFromDetails(details),
    title: titleFromDetails(details, classified.url),
  });
}

let videoSnifferAttached = false;

export function attachBrowserVideoSniffer(ses) {
  if (!ses || videoSnifferAttached) return;
  videoSnifferAttached = true;
  ses.webRequest.onCompleted({ urls: ['http://*/*', 'https://*/*'] }, inspectCompletedBrowserRequest);
}

export function rememberBrowserVideoUrls(pageUrl, urls, pageTitle) {
  (Array.isArray(urls) ? urls : []).forEach((url) => {
    const classified = classifyBrowserVideoRequest({ url, resourceType: 'media' });
    if (!classified) return;
    rememberBrowserVideo({
      ...classified,
      pageUrl,
      title: titleFromVideoUrl(classified.url, pageTitle),
    });
  });
  return listRememberedBrowserVideos(pageUrl);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function cookieHeaderFor(url) {
  if (!url) return '';
  const ses = session.fromPartition(BROWSER_PARTITION);
  const cookies = await ses.cookies.get({ url });
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

async function mediaHeaders(pageUrl, mediaUrl) {
  const ses = session.fromPartition(BROWSER_PARTITION);
  return {
    userAgent: chromeLikeUserAgent(ses.getUserAgent(), process.versions.chrome),
    referer: pageUrl,
    origin: originFromUrl(pageUrl),
    cookie: (await cookieHeaderFor(mediaUrl)) || (await cookieHeaderFor(pageUrl)),
  };
}

function applyRequestHeaders(request, headers) {
  if (headers.referer) request.setHeader('Referer', headers.referer);
  if (headers.origin) request.setHeader('Origin', headers.origin);
  if (headers.userAgent) request.setHeader('User-Agent', headers.userAgent);
}

function fetchText(url, headers) {
  const ses = session.fromPartition(BROWSER_PARTITION);
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      session: ses,
      useSessionCookies: true,
      redirect: 'follow',
    });
    applyRequestHeaders(request, headers);
    const chunks = [];
    let size = 0;
    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        reject(new Error(`서버가 ${response.statusCode}로 거절했습니다.`));
        return;
      }
      response.on('error', reject);
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 1_500_000) {
          reject(new Error('재생목록이 너무 큽니다.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('error', reject);
    request.end();
  });
}

function unlinkQuietly(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup after a failed download.
  }
}

function previewDir() {
  const dir = path.join(app.getPath('temp'), 'local-erp-browser-preview');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hashedName(value, ext) {
  const hash = crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 20);
  return `${hash}.${ext}`;
}

type FfmpegRunOptions = {
  duration?: number | null;
  useAdts?: boolean;
  extraInput?: string;
  videoOnly?: boolean;
  audioOnly?: boolean;
};

function ffmpegHeaderArgs(headers) {
  const args = [];
  const headerLines = [];
  if (headers.referer) headerLines.push(`Referer: ${headers.referer}`);
  if (headers.origin) headerLines.push(`Origin: ${headers.origin}`);
  if (headers.cookie) headerLines.push(`Cookie: ${headers.cookie}`);
  if (headers.userAgent) args.push('-user_agent', headers.userAgent);
  if (headerLines.length > 0) args.push('-headers', `${headerLines.join('\r\n')}\r\n`);
  return args;
}

function runFfmpeg(inputUrl, outputPath, headers, options: FfmpegRunOptions = {}) {
  const { ffmpegPath } = getFfmpegToolPaths();
  if (!ffmpegPath) {
    return Promise.reject(new Error('ffmpeg를 찾지 못했습니다.'));
  }
  const args = [
    '-hide_banner',
    '-y',
    '-loglevel',
    'error',
    '-protocol_whitelist',
    'file,http,https,tcp,tls,crypto',
    '-allowed_extensions',
    'ALL',
  ];
  args.push(...ffmpegHeaderArgs(headers), '-i', inputUrl);
  if (options.extraInput) args.push(...ffmpegHeaderArgs(headers), '-i', options.extraInput);
  if (options.duration) args.push('-t', String(options.duration));
  args.push('-c', 'copy');
  if (options.extraInput) args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
  if (options.videoOnly) args.push('-an');
  if (options.audioOnly) args.push('-vn');
  if (options.useAdts) args.push('-bsf:a', 'aac_adtstoasc');
  args.push('-movflags', '+faststart', outputPath);

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve(outputPath);
        return;
      }
      unlinkQuietly(outputPath);
      reject(new Error(stderr.trim().split('\n').pop() || '영상을 저장하지 못했습니다.'));
    });
  });
}

async function downloadStreamedVideo(url, outputPath, headers, kind, duration = null, extra: FfmpegRunOptions = {}) {
  const useAdts = kind === 'hls' && !extra.videoOnly;
  try {
    await runFfmpeg(url, outputPath, headers, { useAdts, duration, ...extra });
    return;
  } catch {
    await runFfmpeg(url, outputPath, headers, { useAdts: false, duration, ...extra });
  }
}

function downloadDirectFile(url, outputPath, headers) {
  const ses = session.fromPartition(BROWSER_PARTITION);
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      session: ses,
      useSessionCookies: true,
      redirect: 'follow',
    });
    applyRequestHeaders(request, headers);
    const output = fs.createWriteStream(outputPath);
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      unlinkQuietly(outputPath);
      reject(error);
    };
    request.on('response', (response) => {
      if (response.statusCode >= 400) {
        fail(new Error(`서버가 ${response.statusCode}로 거절했습니다.`));
        return;
      }
      const contentType = String(headerMap(response.headers)['content-type'] || '').toLowerCase();
      if (contentType.includes('text/html')) {
        fail(new Error('영상 대신 웹 페이지가 내려왔습니다.'));
        return;
      }
      response.on('error', fail);
      output.on('error', fail);
      output.on('finish', () => {
        if (settled) return;
        settled = true;
        resolve(outputPath);
      });
      response.on('data', (chunk) => {
        output.write(chunk);
      });
      response.on('end', () => output.end());
    });
    request.on('error', fail);
    request.end();
  });
}

function parseVideoSizeFromFfmpeg(text) {
  const match = String(text || '').match(/\bVideo:\s[^\n]*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!match) return null;
  return { width: Number(match[1]) || null, height: Number(match[2]) || null };
}

function probeVideoSizeWithFfprobe(url, headers): Promise<{ width: number | null; height: number | null }> {
  const { ffprobePath } = getFfmpegToolPaths();
  if (!ffprobePath) return Promise.reject(new Error('ffprobe를 찾지 못했습니다.'));
  const args = [
    '-v',
    'error',
    '-protocol_whitelist',
    'file,http,https,tcp,tls,crypto',
    '-allowed_extensions',
    'ALL',
    '-analyzeduration',
    '8M',
    '-probesize',
    '8M',
    ...ffmpegHeaderArgs(headers),
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    url,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, args, { windowsHide: true });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('영상을 분석하지 못했습니다.'));
        return;
      }
      try {
        const stream = JSON.parse(stdout)?.streams?.[0];
        const width = Number(stream?.width) || 0;
        const height = Number(stream?.height) || 0;
        if (width <= 0 && height <= 0) {
          reject(new Error('해상도를 찾지 못했습니다.'));
          return;
        }
        resolve({ width: width || null, height: height || null });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function probeVideoSizeWithFfmpeg(url, headers): Promise<{ width: number | null; height: number | null }> {
  const { ffmpegPath } = getFfmpegToolPaths();
  if (!ffmpegPath) return Promise.reject(new Error('ffmpeg를 찾지 못했습니다.'));
  const args = [
    '-hide_banner',
    '-nostats',
    '-protocol_whitelist',
    'file,http,https,tcp,tls,crypto',
    '-allowed_extensions',
    'ALL',
    '-analyzeduration',
    '8M',
    '-probesize',
    '8M',
    ...ffmpegHeaderArgs(headers),
    '-i',
    url,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    let settled = false;
    const finish = (size) => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* already exited */ }
      if (size?.height || size?.width) {
        resolve(size);
        return;
      }
      reject(new Error('해상도를 찾지 못했습니다.'));
    };
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      const size = parseVideoSizeFromFfmpeg(stderr);
      if (size) finish(size);
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', () => {
      finish(parseVideoSizeFromFfmpeg(stderr));
    });
  });
}

async function probeVideoSize(url, headers) {
  try {
    return await probeVideoSizeWithFfprobe(url, headers);
  } catch {
    return probeVideoSizeWithFfmpeg(url, headers);
  }
}

async function fillMissingDimensions(video, pageUrl) {
  const playable = (video.qualities || []).filter((item) => item.track !== 'audio');
  const unlabeled = playable.filter((item) => !item.height && !resolveQualityLabel(item, {
    width: video.width,
    height: video.height,
  }));
  const targetUrls: string[] = [];
  unlabeled.forEach((item) => {
    const url = String(item.url || '');
    if (url && !targetUrls.includes(url) && targetUrls.length < 6) targetUrls.push(url);
  });
  if (targetUrls.length === 0 && !video.height && !playable.some((item) => item.height) && video.url) {
    targetUrls.push(String(video.url));
  }
  const targets = targetUrls.map((url) => ({ url }));
  if (targets.length === 0) return video;
  const probed: Array<{ url: string; width: number | null; height: number | null } | null> = await Promise.all(targets.map(async (item) => {
    try {
      const headers = await mediaHeaders(pageUrl, item.url);
      const size = await withTimeout(probeVideoSize(item.url, headers), 5000);
      return size?.height || size?.width ? { url: item.url, width: size.width, height: size.height } : null;
    } catch {
      return null;
    }
  }));
  const found = probed.filter((item) => item && (item.height || item.width));
  const byUrl = new Map(found.map((item) => [item.url, item]));
  if (byUrl.size === 0) return video;
  const first = found[0];
  video.width = video.width || first.width;
  video.height = video.height || first.height;
  video.qualities = (video.qualities || []).map((item) => {
    if (item.track === 'audio' || item.height) return item;
    const size = byUrl.get(item.url) || (unlabeled.length <= 1 ? first : null);
    if (!size) return item;
    const next = {
      ...item,
      width: item.width || size.width,
      height: item.height || size.height,
    };
    return { ...next, label: resolveQualityLabel(next) };
  });
  return video;
}

async function enrichDetectedVideo(video, pageUrl) {
  if (video.kind === 'hls' || video.kind === 'dash') {
    try {
      const headers = await mediaHeaders(pageUrl, video.url);
      const text = await withTimeout(fetchText(video.url, headers), 5000);
      const parsed = parseVideoManifest(video.kind, text, video.url);
      if (parsed.variants.length > 0) {
        video.qualities = mergeBrowserVideoQualities(video.qualities, parsed.variants);
      }
      if (parsed.duration) video.duration = video.duration ?? parsed.duration;
      if (!video.duration && parsed.type === 'master' && parsed.variants[0]) {
        const mediaHeadersForVariant = await mediaHeaders(pageUrl, parsed.variants[0].url);
        const mediaText = await withTimeout(fetchText(parsed.variants[0].url, mediaHeadersForVariant), 5000);
        const media = parseHlsPlaylist(mediaText, parsed.variants[0].url);
        if (media.duration) video.duration = media.duration;
      }
    } catch {
      // Keep the sniffed URL even if the playlist cannot be read.
    }
  }
  await fillMissingDimensions(video, pageUrl);
  return video;
}

function captureUrls(capture) {
  return [capture?.url, ...(Array.isArray(capture?.urls) ? capture.urls : [])]
    .filter((item) => typeof item === 'string' && item);
}

export async function listAndEnrichPageVideos(payload) {
  const pageUrl = String(payload?.pageUrl || '');
  const pageTitle = String(payload?.pageTitle || '');
  const urls = Array.isArray(payload?.urls)
    ? payload.urls.filter((item) => typeof item === 'string').slice(0, 20)
    : [];
  const captures = Array.isArray(payload?.captures) ? payload.captures.slice(0, 10) : [];
  rememberBrowserVideoUrls(pageUrl, urls, pageTitle);
  captures.forEach((capture) => {
    rememberBrowserVideoUrls(pageUrl, captureUrls(capture), pageTitle);
    applyBrowserVideoCapture(pageUrl, capture);
  });
  if (payload?.enrich !== false) {
    const detected = listRememberedBrowserVideos(pageUrl);
    await Promise.all(detected.slice(0, 8).map((video) => enrichDetectedVideo(video, pageUrl)));
    captures.forEach((capture) => applyBrowserVideoCapture(pageUrl, capture));
  }
  return listVisibleBrowserVideos(pageUrl).map(serializeBrowserDetectedVideo);
}

export function listPageVideosSnapshot(pageUrl) {
  return listVisibleBrowserVideos(pageUrl).map(serializeBrowserDetectedVideo);
}

function pickTrackUrl(video, track, preferredUrl) {
  const qualities = video.qualities || [];
  if (preferredUrl && qualities.some((item) => item.url === preferredUrl && (!item.track || item.track === track || track === 'av'))) {
    return preferredUrl;
  }
  if (track === 'audio') {
    return qualities.find((item) => item.track === 'audio')?.url
      || (classifyMediaTrack({ url: video.url }) === 'audio' ? video.url : '');
  }
  if (track === 'video') {
    return qualities.find((item) => item.track === 'video' && (!preferredUrl || item.url === preferredUrl))?.url
      || qualities.find((item) => item.track === 'video')?.url
      || qualities.find((item) => item.url === preferredUrl)?.url
      || video.url;
  }
  return preferredUrl
    || qualities.find((item) => item.track === 'av')?.url
    || video.url;
}

function resolvePageVideo(payload) {
  const pageUrl = String(payload?.pageUrl || '');
  const collapsed = collapseRelatedBrowserVideos(listRememberedBrowserVideos(pageUrl));
  const raw = listRememberedBrowserVideos(pageUrl);
  const video = collapsed.find((item) => item.id === payload?.id)
    || collapsed.find((item) => item.url === payload?.url)
    || raw.find((item) => item.id === payload?.id)
    || raw.find((item) => item.url === payload?.url);
  if (!video) return null;
  const track = payload?.track === 'audio' || payload?.track === 'video' ? payload.track : 'av';
  const qualityUrl = String(payload?.qualityUrl || '');
  return {
    video,
    mediaUrl: pickTrackUrl(video, track, qualityUrl),
    pageUrl: pageUrl || video.pageUrl,
    track,
  };
}

export async function downloadRememberedBrowserVideo(payload, parentWindow) {
  const resolved = resolvePageVideo(payload);
  if (!resolved) return { success: false, error: '이 페이지에서 해당 영상을 찾지 못했습니다.' };
  const { video, mediaUrl, pageUrl, track } = resolved;

  const defaultName = suggestedBrowserVideoFilename(video, track);
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined, {
    title: track === 'audio' ? '음성 저장' : '영상 저장',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: track === 'audio'
      ? [{ name: 'Audio', extensions: ['m4a', 'aac', 'mp3'] }]
      : [{ name: 'Video', extensions: ['mp4', 'webm'] }],
  });
  if (canceled || !filePath) return { success: false };

  const headers = await mediaHeaders(pageUrl, mediaUrl);
  const audioUrl = pickTrackUrl(video, 'audio', '');
  const selectedTrack = (video.qualities || []).find((item) => item.url === mediaUrl)?.track
    || classifyMediaTrack({ url: mediaUrl });
  try {
    if (video.kind === 'file') {
      await downloadDirectFile(mediaUrl, filePath, headers);
      return { success: true, path: filePath };
    }
    if (track === 'audio') {
      await downloadStreamedVideo(mediaUrl || audioUrl || video.url, filePath, headers, video.kind, null, {
        audioOnly: selectedTrack !== 'audio',
      });
    } else if (track === 'video') {
      await downloadStreamedVideo(mediaUrl, filePath, headers, video.kind, null, { videoOnly: true });
    } else if (selectedTrack === 'video' && audioUrl && audioUrl !== mediaUrl) {
      await downloadStreamedVideo(mediaUrl, filePath, headers, video.kind, null, { extraInput: audioUrl });
    } else {
      await downloadStreamedVideo(mediaUrl, filePath, headers, video.kind);
    }
    return { success: true, path: filePath };
  } catch (error) {
    log('브라우저 영상 저장 실패:', error);
    return { success: false, error: error?.message || '영상을 저장하지 못했습니다.' };
  }
}

export async function previewRememberedBrowserVideo(payload) {
  const resolved = resolvePageVideo({ ...payload, track: 'av' });
  if (!resolved) return { success: false, error: '이 페이지에서 해당 영상을 찾지 못했습니다.' };
  const { video, mediaUrl, pageUrl } = resolved;
  const audioUrl = pickTrackUrl(video, 'audio', '');
  const selectedTrack = (video.qualities || []).find((item) => item.url === mediaUrl)?.track
    || classifyMediaTrack({ url: mediaUrl });
  const extraInput = selectedTrack === 'video' && audioUrl && audioUrl !== mediaUrl ? audioUrl : '';
  const outputPath = path.join(previewDir(), hashedName(`preview:${mediaUrl}:${extraInput}`, 'mp4'));
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
    return { success: true, path: outputPath };
  }
  const headers = await mediaHeaders(pageUrl, mediaUrl);
  try {
    if (video.kind === 'file') {
      await downloadDirectFile(mediaUrl, outputPath, headers);
    } else {
      await downloadStreamedVideo(mediaUrl, outputPath, headers, video.kind, PREVIEW_SECONDS, extraInput ? { extraInput } : {});
    }
    return { success: true, path: outputPath };
  } catch (error) {
    log('브라우저 영상 미리보기 실패:', error);
    return { success: false, error: error?.message || '미리보기를 만들지 못했습니다.' };
  }
}

export async function saveGuestMediaUrl(contents, mediaUrl, parentWindow) {
  const pageUrl = contents && !contents.isDestroyed() ? contents.getURL() : '';
  const pageTitle = contents && !contents.isDestroyed() ? contents.getTitle() : '';
  rememberBrowserVideoUrls(pageUrl, [mediaUrl], pageTitle);
  const result = await downloadRememberedBrowserVideo({ url: mediaUrl, pageUrl }, parentWindow);
  if (!result.success && result.error) {
    dialog.showErrorBox('영상 저장', result.error);
  }
  return result;
}

export function browserWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event?.sender) || null;
}
