import { expect, test } from 'vitest';
import {
  downloadMetaLabel,
  downloadProgressPercent,
  downloadStateLabel,
  ensureFilenameExtension,
  formatDownloadSize,
  recentBrowserDownloads,
  suggestedDownloadKind,
  suggestedSaveFilename,
} from './browserDownloads';

test('classifies download kinds and progress', () => {
  expect(suggestedDownloadKind('clip.mp4')).toBe('video');
  expect(suggestedDownloadKind('track.m4a')).toBe('audio');
  expect(suggestedDownloadKind('cover.png')).toBe('image');
  expect(downloadProgressPercent({ receivedBytes: 25, totalBytes: 100, state: 'progressing' })).toBe(25);
  expect(downloadProgressPercent({ receivedBytes: 0, totalBytes: 0, state: 'completed' })).toBe(100);
  expect(downloadStateLabel('progressing')).toBe('저장 중');
});

test('formats download sizes like the chrome bubble', () => {
  expect(formatDownloadSize(0)).toBe('0B');
  expect(formatDownloadSize(28160)).toBe('27.5KB');
  expect(formatDownloadSize(1024)).toBe('1KB');
  expect(downloadMetaLabel({ receivedBytes: 28160, totalBytes: 28160, state: 'completed' })).toBe('27.5KB • 완료');
  expect(downloadMetaLabel({ receivedBytes: 512, totalBytes: 1024, state: 'progressing' })).toBe('512B / 1KB • 저장 중');
});

test('keeps an image extension on save-as filenames', () => {
  expect(suggestedSaveFilename({ url: 'https://cdn.example/photo.png' })).toBe('photo.png');
  expect(suggestedSaveFilename({ url: 'https://pbs.twimg.com/media/abc?format=jpg&name=large' })).toBe('abc.jpg');
  expect(suggestedSaveFilename({ url: 'https://img.example/hash', mime: 'image/webp' })).toBe('hash.webp');
  expect(suggestedSaveFilename({ url: 'https://img.example/hash', kind: 'image' })).toBe('hash.jpg');
  expect(suggestedSaveFilename({ filename: 'cover', mime: 'image/png', kind: 'image' })).toBe('cover.png');
  expect(ensureFilenameExtension('C:\\Downloads\\cover', 'cover.png')).toBe('C:\\Downloads\\cover.png');
  expect(ensureFilenameExtension('C:\\Downloads\\cover.jpg', 'cover.png')).toBe('C:\\Downloads\\cover.jpg');
});

test('keeps the five most recent downloads for the bubble', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  expect(recentBrowserDownloads(items)).toEqual([1, 2, 3, 4, 5]);
  expect(recentBrowserDownloads(items, 2)).toEqual([1, 2]);
});
