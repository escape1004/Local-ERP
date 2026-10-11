import { useCallback, type KeyboardEvent } from 'react';
import type { ViewerFileType } from '../components/viewer/types';
import { clampVolume, isEditableKeyboardTarget, isVideoFileName, nextPlaybackSpeed } from '../components/viewer/viewerLogic';

interface UseMediaKeyboardOptions {
  fileType: ViewerFileType | null;
  detectedFileType: ViewerFileType | null;
  archiveFiles: Array<{ name: string }>;
  currentArchiveIndex: number;
  videoSeekSeconds: number;
  volume: number;
  playbackSpeed: number;
  isFullscreen: boolean;
  onClose: () => void;
  onPlayPause: () => void;
  onVolumeChange: (volume: number) => void;
  onSeekBySeconds: (delta: number) => void;
  onSeekByFrame: (direction: 'backward' | 'forward') => void;
  onSpeedChange: (speed: number) => void;
  onFullscreenToggle: () => void;
  onPreviousArchive: () => void;
  onNextArchive: () => void;
}

export function useMediaKeyboard({
  fileType,
  detectedFileType,
  archiveFiles,
  currentArchiveIndex,
  videoSeekSeconds,
  volume,
  playbackSpeed,
  isFullscreen,
  onClose,
  onPlayPause,
  onVolumeChange,
  onSeekBySeconds,
  onSeekByFrame,
  onSpeedChange,
  onFullscreenToggle,
  onPreviousArchive,
  onNextArchive,
}: UseMediaKeyboardOptions) {
  return useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (isEditableKeyboardTarget(event.target)) return;

    if (
      isFullscreen
      && event.key.toLowerCase() === 'f'
      && !event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && !event.repeat
    ) {
      event.preventDefault();
      onFullscreenToggle();
      return;
    }

    const effectiveType = fileType || detectedFileType;
    const applyVideoShortcuts = () => {
      if (
        event.key.toLowerCase() === 'f'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.repeat
      ) {
        event.preventDefault();
        onFullscreenToggle();
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          onPlayPause();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          onSeekBySeconds(-videoSeekSeconds);
          break;
        case 'ArrowRight':
          event.preventDefault();
          onSeekBySeconds(videoSeekSeconds);
          break;
        case 'ArrowUp':
          event.preventDefault();
          onVolumeChange(clampVolume(volume + 0.05));
          break;
        case 'ArrowDown':
          event.preventDefault();
          onVolumeChange(clampVolume(volume - 0.05));
          break;
        case '.':
          event.preventDefault();
          onSeekByFrame('forward');
          break;
        case ',':
          event.preventDefault();
          onSeekByFrame('backward');
          break;
        case ']':
          event.preventDefault();
          onSpeedChange(nextPlaybackSpeed(playbackSpeed, 'next'));
          break;
        case '[':
          event.preventDefault();
          onSpeedChange(nextPlaybackSpeed(playbackSpeed, 'previous'));
          break;
      }
    };

    if (effectiveType === 'video') {
      applyVideoShortcuts();
      return;
    }

    if (effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) {
        applyVideoShortcuts();
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        onPreviousArchive();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        onNextArchive();
      }
    }
  }, [
    archiveFiles,
    currentArchiveIndex,
    detectedFileType,
    fileType,
    isFullscreen,
    onClose,
    onNextArchive,
    onPlayPause,
    onPreviousArchive,
    onSeekByFrame,
    onSeekBySeconds,
    onSpeedChange,
    onFullscreenToggle,
    onVolumeChange,
    playbackSpeed,
    videoSeekSeconds,
    volume,
  ]);
}
