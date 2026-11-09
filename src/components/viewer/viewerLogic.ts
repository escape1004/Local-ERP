import type { CSSProperties } from 'react';
import type { ArchiveFile, LoopRange, MediaBookmark, ViewerFileType } from './types';

export const SUPPORTED_ARCHIVE_FILE_PATTERN = /\.(jpg|jpeg|png|gif|webp|mp4|avi|mkv|mov|wmv|flv|webm|txt)$/i;
export const SUBTITLE_FILE_PATTERN = /\.(srt|vtt|ass)$/i;
export const VIDEO_FILE_PATTERN = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i;
export const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|gif|webp)$/i;
export const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const NATIVE_VIDEO_CLASSNAME = 'max-h-full max-w-full min-h-0 min-w-0 h-auto w-auto block bg-black object-contain';

export function getNativeContainedVideoScale(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
) {
  if (!(videoWidth > 0 && videoHeight > 0 && containerWidth > 0 && containerHeight > 0)) {
    return 0;
  }

  return Math.min(1, containerWidth / videoWidth, containerHeight / videoHeight);
}

export function isVideoFileName(name?: string) {
  return Boolean(name && VIDEO_FILE_PATTERN.test(name));
}

export function toViewerFileType(type: string | null | undefined): ViewerFileType | null {
  return type === 'image' || type === 'video' || type === 'archive' ? type : null;
}

export function getOpenViewerSourceKey(
  isOpen: boolean,
  categoryId: string,
  recordId: string,
  filePath: string,
) {
  if (!isOpen || !filePath) return '';
  return `${categoryId}:${recordId}:${filePath}`;
}

export function isImageFileName(name?: string) {
  return Boolean(name && IMAGE_FILE_PATTERN.test(name));
}

export function formatMediaTime(time: number) {
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const minutes = Math.floor(safeTime / 60);
  const seconds = Math.floor(safeTime % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatVideoDurationLabel(time: number) {
  const safeTime = Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0;
  const hours = Math.floor(safeTime / 3600);
  const minutes = Math.floor((safeTime % 3600) / 60);
  const seconds = safeTime % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function findArchiveSubtitles(files: ArchiveFile[], videoName: string) {
  const normalizedVideoName = videoName.replace(/\\/g, '/');
  const lastSlashIndex = normalizedVideoName.lastIndexOf('/');
  const videoDirectory = normalizedVideoName.slice(0, Math.max(0, lastSlashIndex + 1)).toLocaleLowerCase();
  const videoFileName = normalizedVideoName.slice(lastSlashIndex + 1);
  const videoBase = videoFileName.replace(/\.[^.]+$/, '').toLocaleLowerCase();

  return files.filter((file) => {
    const normalizedName = file.name.replace(/\\/g, '/');
    const subtitleSlashIndex = normalizedName.lastIndexOf('/');
    const subtitleDirectory = normalizedName.slice(0, Math.max(0, subtitleSlashIndex + 1)).toLocaleLowerCase();
    const subtitleFileName = normalizedName.slice(subtitleSlashIndex + 1);
    const subtitleBase = subtitleFileName.replace(/\.[^.]+$/, '').toLocaleLowerCase();

    return !file.isDirectory
      && SUBTITLE_FILE_PATTERN.test(subtitleFileName)
      && subtitleDirectory === videoDirectory
      && (subtitleBase === videoBase || subtitleBase.startsWith(`${videoBase}.`));
  });
}

export function prepareArchiveEntries(files: ArchiveFile[]) {
  return files
    .filter((file) => !file.isDirectory)
    .map((file) => ({
      ...file,
      isSupported: SUPPORTED_ARCHIVE_FILE_PATTERN.test(file.name),
    }))
    .sort((left, right) => {
      if (left.isSupported !== right.isSupported) return left.isSupported ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

export function filterArchiveFiles(files: ArchiveFile[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return files
    .map((file, originalIndex) => ({ file, originalIndex }))
    .filter(({ file }) => !normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery));
}

export function getNavigableArchiveFiles(filteredFiles: Array<{ file: ArchiveFile; originalIndex: number }>) {
  return filteredFiles.filter(({ file }) => file.isSupported);
}

export function getArchiveNavigationIndex(
  navigableFiles: Array<{ originalIndex: number }>,
  currentArchiveIndex: number,
) {
  return navigableFiles.findIndex(({ originalIndex }) => originalIndex === currentArchiveIndex);
}

export function getAdjacentArchiveOriginalIndex(
  navigableFiles: Array<{ originalIndex: number }>,
  currentNavigationIndex: number,
  direction: 'previous' | 'next',
) {
  if (navigableFiles.length === 0) return undefined;

  const targetPosition = direction === 'previous'
    ? (currentNavigationIndex < 0 ? navigableFiles.length - 1 : currentNavigationIndex - 1)
    : (currentNavigationIndex < 0 ? 0 : currentNavigationIndex + 1);

  return navigableFiles[targetPosition]?.originalIndex;
}

export function nextPlaybackSpeed(currentSpeed: number, direction: 'previous' | 'next') {
  const currentIndex = PLAYBACK_SPEEDS.indexOf(currentSpeed);
  if (direction === 'next') {
    const nextIndex = currentIndex < PLAYBACK_SPEEDS.length - 1 ? currentIndex + 1 : 0;
    return PLAYBACK_SPEEDS[nextIndex];
  }

  const previousIndex = currentIndex > 0 ? currentIndex - 1 : PLAYBACK_SPEEDS.length - 1;
  return PLAYBACK_SPEEDS[previousIndex];
}

export function clampVolume(volume: number) {
  return Math.max(0, Math.min(1, volume));
}

export function nextWheelScale(currentScale: number, deltaY: number) {
  return Math.max(1, Math.min(5, currentScale - deltaY * 0.001));
}

export function shouldBindViewerWheelZoom(isOpen: boolean): boolean {
  return isOpen;
}

export function isViewerWheelZoomTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const element = target as Element;
  if (!element.closest('[data-viewer-zoom]')) return false;
  return !element.closest('#volume-slider');
}

export function isViewerVolumeSliderTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return Boolean((target as Element).closest('#volume-slider'));
}

export function nextVolumeFromWheel(volume: number, isMuted: boolean, deltaY: number) {
  const delta = deltaY > 0 ? -0.05 : 0.05;
  return (isMuted ? 0 : volume) + delta;
}

export function getSeekTimeFromPointer(clientX: number, width: number, left: number, duration: number) {
  const ratio = width <= 0 ? 0 : Math.min(1, Math.max(0, (clientX - left) / width));
  return ratio * duration;
}

export function getLoopRangePercents(range: LoopRange | null | undefined, duration: number) {
  if (!range || duration <= 0) return null;
  const startPercent = Math.max(0, Math.min(100, (range.start / duration) * 100));
  const endPercent = Math.max(startPercent, Math.min(100, (range.end / duration) * 100));
  return { startPercent, endPercent };
}

export function getSeekBarStyle(range: LoopRange | null | undefined, duration: number): CSSProperties {
  const percents = getLoopRangePercents(range, duration);
  if (!percents) return {};

  const { startPercent, endPercent } = percents;
  const gradient = `linear-gradient(to right, #4b5563 0%, #4b5563 ${startPercent}%, #5865f2 ${startPercent}%, #5865f2 ${endPercent}%, #4b5563 ${endPercent}%, #4b5563 100%)`;
  return {
    ['--slider-track-bg' as string]: gradient,
  };
}

export function hasBookmarkAtTime(bookmarks: MediaBookmark[], currentTime: number) {
  return bookmarks.some((bookmark) => Math.abs(bookmark.time - currentTime) < 1);
}

export function clampSubtitleOffset(offset: number) {
  return Math.max(-10, Math.min(10, offset));
}

export function clampPanOffset(
  offset: { x: number; y: number },
  scale: number,
  containerWidth: number,
  containerHeight: number,
) {
  const imageWidth = containerWidth * scale;
  const imageHeight = containerHeight * scale;
  const maxX = Math.max(0, (imageWidth - containerWidth) / 2);
  const maxY = Math.max(0, (imageHeight - containerHeight) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
}

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (target == null || typeof target !== 'object') return false;
  const element = target as { nodeName?: string; isContentEditable?: boolean };
  const nodeName = typeof element.nodeName === 'string' ? element.nodeName.toUpperCase() : '';
  return nodeName === 'INPUT' || nodeName === 'TEXTAREA' || element.isContentEditable === true;
}
