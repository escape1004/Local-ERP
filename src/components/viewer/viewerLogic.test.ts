import { expect, test } from 'vitest';
import {
  clampPanOffset,
  clampSubtitleOffset,
  clampVolume,
  filterArchiveFiles,
  findArchiveSubtitles,
  formatMediaTime,
  formatVideoDurationLabel,
  getAdjacentArchiveOriginalIndex,
  getArchiveNavigationIndex,
  getLoopRangePercents,
  getNavigableArchiveFiles,
  getNativeContainedVideoScale,
  getOpenViewerSourceKey,
  getSeekTimeFromPointer,
  hasBookmarkAtTime,
  isEditableKeyboardTarget,
  isVideoFileName,
  nextPlaybackSpeed,
  toViewerFileType,
  nextWheelScale,
  isViewerWheelZoomTarget,
  prepareArchiveEntries,
  shouldBindViewerWheelZoom,
} from './viewerLogic';

test('keeps native video size unless the frame is larger than the viewer', () => {
  expect(getNativeContainedVideoScale(640, 360, 1920, 1080)).toBe(1);
  expect(getNativeContainedVideoScale(1920, 1080, 960, 540)).toBe(0.5);
  expect(getNativeContainedVideoScale(800, 600, 400, 400)).toBe(0.5);
  expect(getNativeContainedVideoScale(0, 360, 1920, 1080)).toBe(0);
});

test('identifies the open viewer source only while the modal is showing a file', () => {
  expect(getOpenViewerSourceKey(false, 'cat', 'rec', 'C:\\clip.mp4')).toBe('');
  expect(getOpenViewerSourceKey(true, 'cat', 'rec', '')).toBe('');
  expect(getOpenViewerSourceKey(true, 'cat', 'rec', 'C:\\clip.mp4')).toBe('cat:rec:C:\\clip.mp4');
});

test('binds wheel zoom only while the viewer is open and the cursor is over the zoom surface', () => {
  expect(shouldBindViewerWheelZoom(false)).toBe(false);
  expect(shouldBindViewerWheelZoom(true)).toBe(true);
  expect(isViewerWheelZoomTarget(null)).toBe(false);
  expect(isViewerWheelZoomTarget({
    closest: (selector: string) => (selector === '[data-viewer-zoom]' ? {} : null),
  } as EventTarget)).toBe(true);
  expect(isViewerWheelZoomTarget({
    closest: (selector: string) => (
      selector === '[data-viewer-zoom]' || selector === '#volume-slider' ? {} : null
    ),
  } as EventTarget)).toBe(false);
});

test('formats media time and clamps invalid values', () => {
  expect(formatMediaTime(0)).toBe('0:00');
  expect(formatMediaTime(125)).toBe('2:05');
  expect(formatMediaTime(-3)).toBe('0:00');
  expect(formatMediaTime(Number.NaN)).toBe('0:00');
});

test('formats gallery video duration with hours when needed', () => {
  expect(formatVideoDurationLabel(0)).toBe('0:00');
  expect(formatVideoDurationLabel(125)).toBe('2:05');
  expect(formatVideoDurationLabel(3661)).toBe('1:01:01');
  expect(formatVideoDurationLabel(Number.NaN)).toBe('0:00');
});

test('matches archive subtitles in the same folder with optional language suffix', () => {
  const files = [
    { name: 'clip/en.srt', size: 1, isDirectory: false },
    { name: 'clip/movie.srt', size: 1, isDirectory: false },
    { name: 'clip/movie.ko.ass', size: 1, isDirectory: false },
    { name: 'other/movie.srt', size: 1, isDirectory: false },
    { name: 'clip/notes.txt', size: 1, isDirectory: false },
  ];

  expect(findArchiveSubtitles(files, 'clip/movie.mkv').map((file) => file.name)).toEqual([
    'clip/movie.srt',
    'clip/movie.ko.ass',
  ]);
});

test('prepares and filters archive entries without changing unsupported files', () => {
  const entries = prepareArchiveEntries([
    { name: 'folder', size: 0, isDirectory: true },
    { name: 'b.xyz', size: 1, isDirectory: false },
    { name: 'a.jpg', size: 1, isDirectory: false },
  ]);
  expect(entries.map((file) => file.name)).toEqual(['a.jpg', 'b.xyz']);
  expect(entries[0].isSupported).toBe(true);
  expect(entries[1].isSupported).toBe(false);

  const filtered = filterArchiveFiles(entries, 'JPG');
  expect(filtered).toEqual([{ file: entries[0], originalIndex: 0 }]);
  expect(getNavigableArchiveFiles(filterArchiveFiles(entries, ''))).toEqual([
    { file: entries[0], originalIndex: 0 },
  ]);
});

test('navigates archive files and identifies video names', () => {
  const navigable = [{ originalIndex: 2 }, { originalIndex: 5 }];
  expect(getArchiveNavigationIndex(navigable, 5)).toBe(1);
  expect(getAdjacentArchiveOriginalIndex(navigable, 1, 'previous')).toBe(2);
  expect(getAdjacentArchiveOriginalIndex(navigable, 1, 'next')).toBeUndefined();
  expect(isVideoFileName('inside/clip.MKV')).toBe(true);
  expect(isVideoFileName('photo.png')).toBe(false);
});

test('computes playback, volume, seek, loop, bookmark, and pan helpers', () => {
  expect(nextPlaybackSpeed(1, 'next')).toBe(1.25);
  expect(nextPlaybackSpeed(2, 'next')).toBe(0.25);
  expect(nextPlaybackSpeed(0.25, 'previous')).toBe(2);
  expect(clampVolume(1.4)).toBe(1);
  expect(clampVolume(-0.2)).toBe(0);
  expect(nextWheelScale(1, -2000)).toBe(3);
  expect(nextWheelScale(1, 2000)).toBe(1);
  expect(getSeekTimeFromPointer(50, 100, 0, 200)).toBe(100);
  expect(getLoopRangePercents({ start: 10, end: 30 }, 100)).toEqual({
    startPercent: 10,
    endPercent: 30,
  });
  expect(hasBookmarkAtTime([{ time: 12, createdAt: 'now' }], 12.4)).toBe(true);
  expect(clampSubtitleOffset(12)).toBe(10);
  expect(clampPanOffset({ x: 500, y: -500 }, 2, 200, 100)).toEqual({ x: 100, y: -50 });
});

test('maps detected file types to viewer types', () => {
  expect(toViewerFileType('image')).toBe('image');
  expect(toViewerFileType('video')).toBe('video');
  expect(toViewerFileType('archive')).toBe('archive');
  expect(toViewerFileType('other')).toBeNull();
  expect(toViewerFileType(undefined)).toBeNull();
});

test('ignores keyboard shortcuts while typing in editable fields', () => {
  expect(isEditableKeyboardTarget(null)).toBe(false);
  expect(isEditableKeyboardTarget({ nodeName: 'INPUT' } as EventTarget)).toBe(true);
  expect(isEditableKeyboardTarget({ nodeName: 'TEXTAREA' } as EventTarget)).toBe(true);
  expect(isEditableKeyboardTarget({ nodeName: 'DIV', isContentEditable: true } as EventTarget)).toBe(true);
  expect(isEditableKeyboardTarget({ nodeName: 'DIV' } as EventTarget)).toBe(false);
});
