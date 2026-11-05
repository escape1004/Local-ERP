import { expect, test } from 'vitest';
import {
  classifyMediaTrack,
  dropdownBrowserVideoQualities,
  isCombinedBrowserVideo,
  mediaPlaylistGroupKey,
  parseHlsPlaylist,
  parseIsoDuration,
  qualityLabelFromHeight,
  resolveQualityLabel,
} from './browser-video-playlist.ts';

const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080.m3u8
`;

const MEDIA = `#EXTM3U
#EXTINF:5.0,
seg0.ts
#EXTINF:5.0,
seg1.ts
#EXTINF:2.5,
seg2.ts
#EXT-X-ENDLIST
`;

test('parses HLS master playlists into height-sorted qualities', () => {
  const parsed = parseHlsPlaylist(MASTER, 'https://video.twimg.com/clip/master.m3u8');
  expect(parsed.type).toBe('master');
  expect(parsed.variants.map((item) => item.label)).toEqual(['1080P', '720P', '360P']);
  expect(parsed.variants[0].url).toBe('https://video.twimg.com/clip/1080.m3u8');
});

test('sums HLS media playlist duration and reads resolution from the path', () => {
  const parsed = parseHlsPlaylist(MEDIA, 'https://cdn.example.com/vid/1280x720/index.m3u8');
  expect(parsed.type).toBe('media');
  expect(parsed.duration).toBe(12.5);
  expect(parsed.variants[0].label).toBe('720P');
});

test('groups quality-specific playlist paths together', () => {
  expect(mediaPlaylistGroupKey('https://cdn.example.com/a/1280x720/play.m3u8'))
    .toBe(mediaPlaylistGroupKey('https://cdn.example.com/a/640x360/play.m3u8'));
  expect(mediaPlaylistGroupKey('https://video.twimg.com/ext_tw_video/1/pu/pl/abc.m3u8'))
    .toBe(mediaPlaylistGroupKey('https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/720x1280/abc.m3u8'));
  expect(mediaPlaylistGroupKey('https://video.twimg.com/ext_tw_video/1/pu/pl/abc.m3u8'))
    .toBe(mediaPlaylistGroupKey('https://video.twimg.com/ext_tw_video/1/pu/aud/mp4a/128000/abc.m3u8'));
  expect(qualityLabelFromHeight(1080, null)).toBe('1080P');
  expect(qualityLabelFromHeight(null, null)).toBe('');
  expect(resolveQualityLabel({
    url: 'https://cdn.example.com/vid/1280x720/index.m3u8',
    track: 'video',
  })).toBe('720P');
  expect(resolveQualityLabel({
    url: 'https://cdn.example.com/index.m3u8',
    label: '기본',
    track: 'av',
  }, { height: 1080 })).toBe('1080P');
  expect(dropdownBrowserVideoQualities([
    { url: 'https://cdn.example.com/pl/a.m3u8', label: '', width: null, height: null, bandwidth: null, track: 'av' },
    { url: 'https://cdn.example.com/vid/720x1280/a.m3u8', label: '', width: null, height: null, bandwidth: null, track: 'video' },
  ]).map((item) => item.url)).toEqual(['https://cdn.example.com/vid/720x1280/a.m3u8']);
  expect(parseIsoDuration('PT1H2M5S')).toBe(3725);
});

test('classifies muxed, video-only, and audio-only HLS tracks', () => {
  expect(classifyMediaTrack({ codecs: 'avc1.4d401f,mp4a.40.2' })).toBe('av');
  expect(classifyMediaTrack({ codecs: 'avc1.4d401f', height: 720 })).toBe('video');
  expect(classifyMediaTrack({ codecs: 'mp4a.40.2' })).toBe('audio');
  expect(classifyMediaTrack({ url: 'https://cdn.example.com/aud/mp4a/a.m3u8' })).toBe('audio');
  expect(isCombinedBrowserVideo({
    kind: 'hls',
    qualities: [
      { url: 'https://cdn.example.com/vid.m3u8', track: 'video' },
      { url: 'https://cdn.example.com/aud.m3u8', track: 'audio' },
    ],
  })).toBe(true);
  expect(isCombinedBrowserVideo({
    kind: 'hls',
    qualities: [{ url: 'https://cdn.example.com/aud.m3u8', track: 'audio' }],
  })).toBe(false);
});

test('parses separate audio media and video-only variants from an HLS master', () => {
  const parsed = parseHlsPlaylist(`#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401e",AUDIO="audio"
360.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
muxed.m3u8
`, 'https://cdn.example.com/master.m3u8');
  expect(parsed.variants.some((item) => item.track === 'audio')).toBe(true);
  expect(parsed.variants.some((item) => item.track === 'video' && item.label === '360P')).toBe(true);
  expect(parsed.variants.some((item) => item.track === 'av' && item.label === '720P')).toBe(true);
});
