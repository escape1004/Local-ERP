import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { toast } from '../components/ui/use-toast';
import type { LoopRange, PlaybackOverlayState, ViewerFileType } from '../components/viewer/types';
import { clampVolume, getSeekTimeFromPointer, isVideoFileName } from '../components/viewer/viewerLogic';

interface UseVideoPlaybackOptions {
  fileType: ViewerFileType | null;
  detectedFileType: ViewerFileType | null;
  archiveFiles: Array<{ name: string }>;
  currentArchiveIndex: number;
  videoRef: RefObject<HTMLVideoElement>;
  archiveVideoRef: RefObject<HTMLVideoElement>;
}

export function useVideoPlayback({
  fileType,
  detectedFileType,
  archiveFiles,
  currentArchiveIndex,
  videoRef,
  archiveVideoRef,
}: UseVideoPlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('videoVolume');
    return savedVolume ? parseFloat(savedVolume) : 0.5;
  });
  const [isMuted, setIsMuted] = useState(() => {
    const savedMuted = localStorage.getItem('videoMuted');
    return savedMuted ? JSON.parse(savedMuted) : false;
  });
  const [isLooping, setIsLooping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopRange, setLoopRange] = useState<LoopRange | null>(null);
  const [loopDraft, setLoopDraft] = useState<LoopRange | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [codecInfo, setCodecInfo] = useState<any>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const [showPlaybackOverlay, setShowPlaybackOverlay] = useState(false);
  const [playbackOverlayState, setPlaybackOverlayState] = useState<PlaybackOverlayState>('play');
  const [playbackOverlayVisible, setPlaybackOverlayVisible] = useState(false);
  const [videoSeekSeconds, setVideoSeekSeconds] = useState(5);
  const [videoAutoPlay, setVideoAutoPlay] = useState(true);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const volumeOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const playbackOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const playbackOverlayFadeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const loopSelectionRef = useRef<{ input: HTMLInputElement; anchorTime: number } | null>(null);

  const getEffectiveFileType = useCallback(
    () => fileType || detectedFileType,
    [detectedFileType, fileType],
  );

  const getActiveVideoElement = useCallback(() => {
    const effectiveType = getEffectiveFileType();
    if (effectiveType === 'video') return videoRef.current;
    if (effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) return archiveVideoRef.current;
    }
    return null;
  }, [archiveFiles, archiveVideoRef, currentArchiveIndex, getEffectiveFileType, videoRef]);

  const clearLoopSelection = useCallback(() => {
    loopSelectionRef.current = null;
    setLoopDraft(null);
    setLoopRange(null);
  }, []);

  useEffect(() => {
    localStorage.setItem('videoVolume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('videoMuted', JSON.stringify(isMuted));
  }, [isMuted]);

  useEffect(() => {
    const effectiveType = getEffectiveFileType();
    if (videoRef.current && effectiveType === 'video') {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
    if (archiveVideoRef.current && effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) {
        archiveVideoRef.current.volume = isMuted ? 0 : volume;
        archiveVideoRef.current.muted = isMuted;
      }
    }
  }, [archiveFiles, archiveVideoRef, currentArchiveIndex, getEffectiveFileType, isMuted, videoRef, volume]);

  useEffect(() => {
    const effectiveType = getEffectiveFileType();
    if (videoRef.current && effectiveType === 'video') {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (archiveVideoRef.current && effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) {
        archiveVideoRef.current.playbackRate = playbackSpeed;
      }
    }
  }, [archiveFiles, archiveVideoRef, currentArchiveIndex, getEffectiveFileType, playbackSpeed, videoRef]);

  useEffect(() => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    activeVideo.loop = isLooping && !loopRange;
  }, [getActiveVideoElement, isLooping, loopRange]);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      const target = event.target as Element;
      if (showSpeedMenu && !target.closest('[data-speed-menu]')) {
        setShowSpeedMenu(false);
      }
    };

    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeedMenu]);

  useEffect(() => {
    return window.electronAPI.onViewerFullscreenChange(setIsFullscreen);
  }, []);

  const resolveSeekTime = useCallback((clientX: number, input: HTMLInputElement) => {
    const rect = input.getBoundingClientRect();
    return getSeekTimeFromPointer(clientX, rect.width, rect.left, duration);
  }, [duration]);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const selection = loopSelectionRef.current;
      if (!selection) return;
      const nextTime = resolveSeekTime(event.clientX, selection.input);
      setLoopDraft({
        start: Math.min(selection.anchorTime, nextTime),
        end: Math.max(selection.anchorTime, nextTime),
      });
    };

    const handleMouseUp = (event: globalThis.MouseEvent) => {
      const selection = loopSelectionRef.current;
      if (!selection) return;
      const nextTime = resolveSeekTime(event.clientX, selection.input);
      const start = Math.min(selection.anchorTime, nextTime);
      const end = Math.max(selection.anchorTime, nextTime);
      loopSelectionRef.current = null;
      setLoopDraft(null);
      if (end - start < 0.1) return;
      setLoopRange({ start, end });
      const activeVideo = getActiveVideoElement();
      if (activeVideo && activeVideo.currentTime < start) {
        activeVideo.currentTime = start;
        setCurrentTime(start);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getActiveVideoElement, resolveSeekTime]);

  const showPlaybackFeedback = useCallback((action: PlaybackOverlayState) => {
    setPlaybackOverlayState(action);
    setShowPlaybackOverlay(true);
    setPlaybackOverlayVisible(true);
    if (playbackOverlayFadeTimeoutRef.current) clearTimeout(playbackOverlayFadeTimeoutRef.current);
    if (playbackOverlayTimeoutRef.current) clearTimeout(playbackOverlayTimeoutRef.current);
    playbackOverlayFadeTimeoutRef.current = setTimeout(() => {
      setPlaybackOverlayVisible(false);
    }, 420);
    playbackOverlayTimeoutRef.current = setTimeout(() => {
      setShowPlaybackOverlay(false);
      setPlaybackOverlayVisible(false);
    }, 700);
  }, []);

  const handlePlayPause = useCallback(() => {
    const effectiveType = getEffectiveFileType();
    const nextAction = isPlaying ? 'pause' : 'play';
    if (videoRef.current && effectiveType === 'video') {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
    }
    if (archiveVideoRef.current && effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) {
        if (isPlaying) archiveVideoRef.current.pause();
        else archiveVideoRef.current.play();
      }
    }
    showPlaybackFeedback(nextAction);
  }, [archiveFiles, archiveVideoRef, currentArchiveIndex, getEffectiveFileType, isPlaying, showPlaybackFeedback, videoRef]);

  const handleVolumeChange = useCallback((newVolume: number) => {
    const effectiveType = getEffectiveFileType();
    const nextVolume = clampVolume(newVolume);
    const nextMuted = nextVolume === 0;
    setVolume(nextVolume);
    setIsMuted(nextMuted);
    if (videoRef.current && effectiveType === 'video') {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextMuted;
    }
    if (archiveVideoRef.current && effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) {
        archiveVideoRef.current.volume = nextVolume;
        archiveVideoRef.current.muted = nextMuted;
      }
    }
    setShowVolumeOverlay(true);
    if (volumeOverlayTimeoutRef.current) clearTimeout(volumeOverlayTimeoutRef.current);
    volumeOverlayTimeoutRef.current = setTimeout(() => {
      setShowVolumeOverlay(false);
    }, 1500);
  }, [archiveFiles, archiveVideoRef, currentArchiveIndex, getEffectiveFileType, videoRef]);

  const handleMuteToggle = useCallback(() => {
    const effectiveType = getEffectiveFileType();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current && effectiveType === 'video') videoRef.current.muted = nextMuted;
    if (archiveVideoRef.current && effectiveType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (isVideoFileName(currentFile?.name)) archiveVideoRef.current.muted = nextMuted;
    }
  }, [archiveFiles, archiveVideoRef, currentArchiveIndex, getEffectiveFileType, isMuted, videoRef]);

  const handleLoopToggle = useCallback(() => {
    const nextLooping = !isLooping;
    setIsLooping(nextLooping);
    const activeVideo = getActiveVideoElement();
    if (activeVideo) activeVideo.loop = nextLooping && !loopRange;
  }, [getActiveVideoElement, isLooping, loopRange]);

  const handleFullscreenToggle = useCallback(async () => {
    try {
      const activeVideo = getActiveVideoElement();
      if (!activeVideo) {
        toast({
          title: '전체화면 전환 실패',
          description: '전체화면으로 표시할 동영상을 찾을 수 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      const result = await window.electronAPI.setViewerFullscreen(!isFullscreen);
      if (!result.success) {
        throw new Error(result.error || 'Fullscreen transition failed');
      }
      setIsFullscreen(result.isFullscreen);
    } catch (error) {
      console.error('동영상 전체화면 전환 실패:', error);
      toast({
        title: '전체화면 전환 실패',
        description: '전체화면을 시작할 수 없습니다. 다시 시도해주세요.',
        variant: 'destructive',
      });
    }
  }, [getActiveVideoElement, isFullscreen]);

  const handlePictureInPictureStateChange = useCallback((active: boolean) => {
    void window.electronAPI.setPictureInPictureActive(active).catch((error) => {
      console.error('PIP 오디오 상태 동기화 실패:', error);
    });
  }, []);

  const handlePictureInPicture = useCallback(async () => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) {
      toast({
        title: 'PIP 재생 실패',
        description: '재생할 동영상을 찾을 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (!document.pictureInPictureEnabled || !activeVideo.requestPictureInPicture) {
        throw new Error('현재 환경에서는 PIP 재생을 지원하지 않습니다.');
      }
      if (document.pictureInPictureElement !== activeVideo) {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        await activeVideo.requestPictureInPicture();
        handlePictureInPictureStateChange(true);
      }
      if (activeVideo.paused) await activeVideo.play();
    } catch (error) {
      toast({
        title: 'PIP 재생 실패',
        description: error instanceof Error ? error.message : 'PIP 모드를 시작하지 못했습니다.',
        variant: 'destructive',
      });
    }
  }, [getActiveVideoElement, handlePictureInPictureStateChange]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  const handleVideoClick = useCallback((videoScale: number, archiveVideoScale: number) => {
    const effectiveType = getEffectiveFileType();
    const currentFile = archiveFiles[currentArchiveIndex];
    const isArchiveVideo = effectiveType === 'archive' && isVideoFileName(currentFile?.name);
    if (effectiveType === 'video' && videoScale > 1) {
      setShowControls(true);
      return;
    }
    if (isArchiveVideo && archiveVideoScale > 1) {
      setShowControls(true);
      return;
    }
    handlePlayPause();
    revealControls();
  }, [archiveFiles, currentArchiveIndex, getEffectiveFileType, handlePlayPause, revealControls]);

  const handleTimeUpdate = useCallback(() => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    if (loopRange && activeVideo.currentTime >= loopRange.end) {
      activeVideo.currentTime = loopRange.start;
      if (activeVideo.paused) activeVideo.play().catch(() => {});
      setCurrentTime(loopRange.start);
      return;
    }
    setCurrentTime(activeVideo.currentTime);
  }, [getActiveVideoElement, loopRange]);

  const handleLoadedMetadata = useCallback(() => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    setDuration(activeVideo.duration);
    activeVideo.volume = isMuted ? 0 : volume;
    activeVideo.muted = isMuted;
    activeVideo.loop = isLooping && !loopRange;
    activeVideo.playbackRate = playbackSpeed;
    if (!videoAutoPlay) {
      activeVideo.pause();
      activeVideo.currentTime = 0;
      setIsPlaying(false);
    }
  }, [getActiveVideoElement, isLooping, isMuted, loopRange, playbackSpeed, videoAutoPlay, volume]);

  const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(event.target.value);
    setCurrentTime(newTime);
    const activeVideo = getActiveVideoElement();
    if (activeVideo) activeVideo.currentTime = newTime;
  }, [getActiveVideoElement]);

  const handleSeekBarMouseDown = useCallback((event: ReactMouseEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.shiftKey) {
      event.preventDefault();
      const anchorTime = resolveSeekTime(event.clientX, input);
      loopSelectionRef.current = { input, anchorTime };
      setLoopDraft({ start: anchorTime, end: anchorTime });
      return;
    }
    if (loopRange) clearLoopSelection();
  }, [clearLoopSelection, loopRange, resolveSeekTime]);

  const handleLoopRangeEnded = useCallback(() => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo || !loopRange) return;
    activeVideo.currentTime = loopRange.start;
    setCurrentTime(loopRange.start);
    activeVideo.play().catch(() => {});
  }, [getActiveVideoElement, loopRange]);

  const seekByFrame = useCallback((direction: 'backward' | 'forward') => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    const frameDuration = 1 / 30;
    const nextTime = direction === 'backward'
      ? Math.max(0, activeVideo.currentTime - frameDuration)
      : Math.min(duration, activeVideo.currentTime + frameDuration);
    activeVideo.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [duration, getActiveVideoElement]);

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  }, []);

  const seekBySeconds = useCallback((delta: number) => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    const newTime = delta < 0
      ? Math.max(0, activeVideo.currentTime + delta)
      : Math.min(duration, activeVideo.currentTime + delta);
    activeVideo.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration, getActiveVideoElement]);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (volumeOverlayTimeoutRef.current) clearTimeout(volumeOverlayTimeoutRef.current);
      if (playbackOverlayTimeoutRef.current) clearTimeout(playbackOverlayTimeoutRef.current);
      if (playbackOverlayFadeTimeoutRef.current) clearTimeout(playbackOverlayFadeTimeoutRef.current);
    };
  }, []);

  return {
    isPlaying,
    setIsPlaying,
    volume,
    isMuted,
    isLooping,
    isFullscreen,
    showControls,
    setShowControls,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    loopRange,
    loopDraft,
    videoError,
    setVideoError,
    codecInfo,
    setCodecInfo,
    playbackSpeed,
    setPlaybackSpeed,
    showSpeedMenu,
    setShowSpeedMenu,
    showVolumeOverlay,
    showPlaybackOverlay,
    playbackOverlayState,
    playbackOverlayVisible,
    videoSeekSeconds,
    setVideoSeekSeconds,
    videoAutoPlay,
    setVideoAutoPlay,
    getEffectiveFileType,
    getActiveVideoElement,
    clearLoopSelection,
    handlePlayPause,
    handleVolumeChange,
    handleMuteToggle,
    handleLoopToggle,
    handleFullscreenToggle,
    handlePictureInPicture,
    handlePictureInPictureStateChange,
    handleVideoClick,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleSeek,
    handleSeekBarMouseDown,
    handleLoopRangeEnded,
    seekByFrame,
    seekBySeconds,
    handleSpeedChange,
    handleSpeedMenuToggle: () => setShowSpeedMenu((value) => !value),
    revealControls,
    showPlaybackFeedback,
    resolveSeekTime,
  };
}
