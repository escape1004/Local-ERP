import { expect, test } from 'vitest';
import {
  applyBrowserVideoCapture,
  classifyBrowserVideoRequest,
  collapseRelatedBrowserVideos,
  listRememberedBrowserVideos,
  listVisibleBrowserVideos,
  rememberBrowserVideo,
  resetRememberedBrowserVideos,
  serializeBrowserDetectedVideo,
  suggestedBrowserVideoFilename,
} from './browser-video-detect.ts';

test('classifies HLS, DASH, and progressive video URLs', () => {
  expect(classifyBrowserVideoRequest({
    url: 'https://cdn.example.com/movie/master.m3u8',
    resourceType: 'xhr',
  })?.kind).toBe('hls');
  expect(classifyBrowserVideoRequest({
    url: 'https://cdn.example.com/movie/manifest.mpd',
    mime: 'application/dash+xml',
  })?.kind).toBe('dash');
  expect(classifyBrowserVideoRequest({
    url: 'https://cdn.example.com/clip.mp4',
    bytes: 2_000_000,
    resourceType: 'media',
  })?.kind).toBe('file');
});

test('ignores segments, tiny files, YouTube, and ad hosts', () => {
  expect(classifyBrowserVideoRequest({
    url: 'https://cdn.example.com/seg1.ts',
    resourceType: 'media',
  })).toBeNull();
  expect(classifyBrowserVideoRequest({
    url: 'https://cdn.example.com/ad.mp4',
    bytes: 20_000,
    resourceType: 'media',
  })).toBeNull();
  expect(classifyBrowserVideoRequest({
    url: 'https://rr1---sn-abc.googlevideo.com/videoplayback',
    resourceType: 'media',
  })).toBeNull();
  expect(classifyBrowserVideoRequest({
    url: 'https://adserver.juicyads.com/promo.mp4',
    bytes: 2_000_000,
    resourceType: 'media',
  })).toBeNull();
});

test('lists only videos from the current page', () => {
  resetRememberedBrowserVideos();
  rememberBrowserVideo({
    url: 'https://cdn.example.com/a.m3u8',
    pageUrl: 'https://watch.example.com/v/1',
    kind: 'hls',
    mime: 'application/vnd.apple.mpegurl',
    bytes: null,
    title: 'Episode 1',
  });
  rememberBrowserVideo({
    url: 'https://cdn.example.com/b.mp4',
    pageUrl: 'https://watch.example.com/v/2',
    kind: 'file',
    mime: 'video/mp4',
    bytes: 4_000_000,
    title: 'Clip',
  });
  expect(listRememberedBrowserVideos('https://watch.example.com/v/1')).toHaveLength(1);
  expect(listRememberedBrowserVideos('https://watch.example.com/v/2')[0].title).toBe('Clip');
  expect(listRememberedBrowserVideos('https://watch.example.com/v/9')).toHaveLength(0);
  expect(suggestedBrowserVideoFilename(listRememberedBrowserVideos('https://watch.example.com/v/2')[0])).toBe('Clip.mp4');
  resetRememberedBrowserVideos();
});

test('collapses HLS variant playlists into one video with qualities', () => {
  const collapsed = collapseRelatedBrowserVideos([
    {
      id: 'master',
      url: 'https://cdn.example.com/master.m3u8',
      pageUrl: 'https://watch.example.com/v/1',
      kind: 'hls',
      qualities: [
        { url: 'https://cdn.example.com/1080.m3u8', label: '1080P', width: 1920, height: 1080, bandwidth: 5000000, track: 'av' },
        { url: 'https://cdn.example.com/720.m3u8', label: '720P', width: 1280, height: 720, bandwidth: 2800000, track: 'av' },
      ],
    },
    {
      id: 'variant',
      url: 'https://cdn.example.com/720.m3u8',
      pageUrl: 'https://watch.example.com/v/1',
      kind: 'hls',
      qualities: [{ url: 'https://cdn.example.com/720.m3u8', label: '720P', width: 1280, height: 720, bandwidth: null, track: 'av' }],
    },
  ]);
  expect(collapsed).toHaveLength(1);
  expect(collapsed[0].id).toBe('master');
  expect(collapsed[0].qualities).toHaveLength(2);
});

test('groups audio-only and video-only playlists into one combined item', () => {
  resetRememberedBrowserVideos();
  rememberBrowserVideo({
    url: 'https://video.twimg.com/ext_tw_video/1/pu/pl/abc.m3u8',
    pageUrl: 'https://x.com/s/1',
    kind: 'hls',
    title: 'abc',
  });
  rememberBrowserVideo({
    url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/720x1280/abc.m3u8',
    pageUrl: 'https://x.com/s/1',
    kind: 'hls',
    title: 'abc',
  });
  rememberBrowserVideo({
    url: 'https://video.twimg.com/ext_tw_video/1/pu/aud/mp4a/128000/abc.m3u8',
    pageUrl: 'https://x.com/s/1',
    kind: 'hls',
    title: 'abc',
  });
  expect(listRememberedBrowserVideos('https://x.com/s/1')).toHaveLength(3);
  const visible = listVisibleBrowserVideos('https://x.com/s/1');
  expect(visible).toHaveLength(1);
  expect(visible[0].url).toContain('/pl/');
  expect(serializeBrowserDetectedVideo(visible[0]).qualities.every((item) => item.label)).toBe(true);
  expect(serializeBrowserDetectedVideo(visible[0]).qualities.map((item) => item.label)).toContain('1280P');
  resetRememberedBrowserVideos();
});

test('uses captured resolution instead of leaving the quality dropdown blank', () => {
  resetRememberedBrowserVideos();
  rememberBrowserVideo({
    url: 'https://cdn.example.com/clip.mp4',
    pageUrl: 'https://watch.example.com/v/1',
    kind: 'file',
    mime: 'video/mp4',
    bytes: 4_000_000,
    title: 'Clip',
  });
  applyBrowserVideoCapture('https://watch.example.com/v/1', {
    url: 'https://cdn.example.com/clip.mp4',
    urls: ['https://cdn.example.com/clip.mp4'],
    duration: 12,
    width: 1920,
    height: 1080,
    poster: '',
    preview: '',
  });
  const listed = listVisibleBrowserVideos('https://watch.example.com/v/1').map(serializeBrowserDetectedVideo);
  expect(listed[0].title).toBe('Clip');
  expect(listed[0].qualities[0].label).toBe('1080P');
  resetRememberedBrowserVideos();
  rememberBrowserVideo({
    url: 'https://cdn.example.com/other.mp4',
    pageUrl: 'https://watch.example.com/v/3',
    kind: 'file',
    mime: 'video/mp4',
    bytes: 4_000_000,
    title: 'Other',
  });
  applyBrowserVideoCapture('https://watch.example.com/v/3', {
    url: 'blob:https://watch.example.com/3',
    urls: ['blob:https://watch.example.com/3'],
    duration: 8,
    width: 1280,
    height: 720,
    poster: '',
    preview: '',
  });
  expect(listVisibleBrowserVideos('https://watch.example.com/v/3').map(serializeBrowserDetectedVideo)[0].qualities[0].label).toBe('720P');
  expect(serializeBrowserDetectedVideo({
    id: '1',
    url: 'https://cdn.example.com/a.m3u8',
    pageUrl: 'https://watch.example.com/v/1',
    kind: 'hls',
    mime: '',
    bytes: null,
    title: 'Episode',
    host: 'cdn.example.com',
    duration: 10,
    preview: '',
    poster: '',
    width: 1280,
    height: 720,
    qualities: [{
      url: 'https://cdn.example.com/a.m3u8',
      label: '기본',
      width: null,
      height: null,
      bandwidth: null,
      track: 'av',
    }],
  }).qualities[0].label).toBe('720P');
  resetRememberedBrowserVideos();
});
