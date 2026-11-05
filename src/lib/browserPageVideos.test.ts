import { expect, test } from 'vitest';
import {
  browserVideoKindLabel,
  displayBrowserVideoName,
  formatBrowserVideoBytes,
  formatBrowserVideoCountBadge,
  formatBrowserVideoDuration,
  formatBrowserVideoQualityLabel,
  browserVideoQualityOptions,
  mergeBrowserVideoCaptures,
  getCollectBrowserPageVideosScript,
  isUnsupportedBrowserVideoPage,
  parseCollectedBrowserPageVideos,
} from './browserPageVideos';

test('marks YouTube watch pages as unsupported', () => {
  expect(isUnsupportedBrowserVideoPage('https://www.youtube.com/watch?v=abc')).toBe(true);
  expect(isUnsupportedBrowserVideoPage('https://youtu.be/abc')).toBe(true);
  expect(isUnsupportedBrowserVideoPage('https://watch.example.com/v/1')).toBe(false);
});

test('collects duration, preview, and http video URLs from the page script result', () => {
  expect(getCollectBrowserPageVideosScript()).toContain('querySelectorAll(\'video\')');
  expect(getCollectBrowserPageVideosScript()).toContain('toDataURL');
  expect(parseCollectedBrowserPageVideos([
    {
      url: 'https://cdn.example.com/a.m3u8',
      urls: ['https://cdn.example.com/a.m3u8', 'blob:https://watch.example.com/1'],
      duration: 12.5,
      width: 1920,
      height: 1080,
      poster: '',
      preview: 'data:image/jpeg;base64,abc',
    },
  ])).toEqual([{
    url: 'https://cdn.example.com/a.m3u8',
    urls: ['https://cdn.example.com/a.m3u8'],
    duration: 12.5,
    width: 1920,
    height: 1080,
    poster: '',
    preview: 'data:image/jpeg;base64,abc',
  }]);
});

test('formats FetchV-like duration, size, and filename', () => {
  expect(formatBrowserVideoDuration(5)).toBe('00:00:05');
  expect(formatBrowserVideoDuration(3725)).toBe('01:02:05');
  expect(formatBrowserVideoBytes(2_000_000)).toBe('1.9 MB');
  expect(browserVideoKindLabel('hls')).toBe('HLS');
  expect(displayBrowserVideoName({ title: 'clip', url: 'https://cdn.example.com/a.m3u8' })).toBe('clip.m3u8');
  expect(formatBrowserVideoCountBadge(1)).toBe('1');
  expect(formatBrowserVideoCountBadge(9)).toBe('9');
  expect(formatBrowserVideoCountBadge(10)).toBe('9+');
  expect(formatBrowserVideoCountBadge(0)).toBe('');
  expect(formatBrowserVideoQualityLabel({ label: '기본', height: 1080 })).toBe('1080P');
  expect(formatBrowserVideoQualityLabel({ label: '', height: 720 })).toBe('720P');
  expect(formatBrowserVideoQualityLabel({ label: '기본', width: 1920 })).toBe('1920P');
  expect(formatBrowserVideoQualityLabel({ label: '기본' })).toBe('');
  expect(formatBrowserVideoQualityLabel({
    label: '',
    url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/720x1280/abc.m3u8',
  })).toBe('1280P');
  expect(browserVideoQualityOptions({
    url: 'https://video.twimg.com/ext_tw_video/1/pu/pl/abc.m3u8',
    qualities: [
      { url: 'https://video.twimg.com/ext_tw_video/1/pu/pl/abc.m3u8', label: '', track: 'av' },
      {
        url: 'https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/720x1280/abc.m3u8',
        label: '',
        track: 'video',
      },
    ],
  }).map((item) => item.label)).toEqual(['1280P']);
  expect(browserVideoQualityOptions(mergeBrowserVideoCaptures([{
    url: 'https://cdn.example.com/clip.mp4',
    qualities: [{
      url: 'https://cdn.example.com/clip.mp4',
      label: '기본',
      width: null,
      height: null,
      bandwidth: null,
      track: 'av',
    }],
  }], [{
    url: '',
    urls: [],
    duration: 12,
    width: 1920,
    height: 1080,
    poster: '',
    preview: '',
  }])[0]).map((item) => item.label)).toEqual(['1080P']);
});
