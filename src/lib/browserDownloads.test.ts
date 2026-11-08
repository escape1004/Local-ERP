import { expect, test } from 'vitest';
import {
  downloadMetaLabel,
  downloadProgressPercent,
  downloadStateLabel,
  formatDownloadSize,
  recentBrowserDownloads,
  suggestedDownloadKind,
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

test('keeps the five most recent downloads for the bubble', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  expect(recentBrowserDownloads(items)).toEqual([1, 2, 3, 4, 5]);
  expect(recentBrowserDownloads(items, 2)).toEqual([1, 2]);
});
