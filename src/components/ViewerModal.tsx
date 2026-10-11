import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, FileImage, FileVideo, RotateCcw, RotateCw, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { AnimatedModal } from './ui/animated-modal';
import { ArchiveViewer } from './viewer/ArchiveViewer';
import { ImageViewer } from './viewer/ImageViewer';
import { VideoViewer } from './viewer/VideoViewer';
import type { ViewerFileType, ViewerModalProps } from './viewer/types';
import {
  clampPanOffset,
  findArchiveSubtitles,
  formatMediaTime,
  getOpenViewerSourceKey,
  hasBookmarkAtTime,
  isVideoFileName,
  nextWheelScale,
  toViewerFileType,
} from './viewer/viewerLogic';
import { parseSubtitle } from '../lib/subtitle';
import { getLocalVideoHttpUrl } from '../lib/local-media';
import { useArchiveViewer } from '../hooks/useArchiveViewer';
import { useMediaKeyboard } from '../hooks/useMediaKeyboard';
import { exitPictureInPicture } from '../hooks/pictureInPicture';
import { useVideoPlayback } from '../hooks/useVideoPlayback';

export type { ViewerModalProps };

const tooltipClassName = "relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words";

export const ViewerModal: React.FC<ViewerModalProps> = ({ isOpen, filePath, fileType, categoryId = '', recordId = '', onClose }) => {
  const [displayFilePath, setDisplayFilePath] = useState(filePath);
  const [displayFileType, setDisplayFileType] = useState(fileType);
  const [displayCategoryId, setDisplayCategoryId] = useState(categoryId);
  const [displayRecordId, setDisplayRecordId] = useState(recordId);
  const [displaySourceKey, setDisplaySourceKey] = useState(() => (
    getOpenViewerSourceKey(isOpen, categoryId, recordId, filePath)
  ));
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detectedFileType, setDetectedFileType] = useState<ViewerFileType | null>(null);
  const [fileNotFound, setFileNotFound] = useState(false);
  const [imgScale, setImgScale] = useState(1);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [archiveImgScale, setArchiveImgScale] = useState(1);
  const [archiveImgOffset, setArchiveImgOffset] = useState({ x: 0, y: 0 });
  const [archiveIsPanning, setArchiveIsPanning] = useState(false);
  const [archiveVideoScale, setArchiveVideoScale] = useState(1);
  const [archiveVideoOffset, setArchiveVideoOffset] = useState({ x: 0, y: 0 });
  const [archiveVideoIsPanning, setArchiveVideoIsPanning] = useState(false);
  const [videoScale, setVideoScale] = useState(1);
  const [videoOffset, setVideoOffset] = useState({ x: 0, y: 0 });
  const [videoIsPanning, setVideoIsPanning] = useState(false);
  const [imgRotation, setImgRotation] = useState(0);
  const [videoRotation, setVideoRotation] = useState(0);
  const [archiveImgRotation, setArchiveImgRotation] = useState(0);
  const [isImageGifPaused, setIsImageGifPaused] = useState(false);
  const [isArchiveGifPaused, setIsArchiveGifPaused] = useState(false);
  const [subtitles, setSubtitles] = useState<import('./viewer/types').SubtitleSource[]>([]);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleSize, setSubtitleSize] = useState<import('./viewer/types').SubtitleSize>(() => {
    const saved = localStorage.getItem('subtitleSize');
    return saved === 'small' || saved === 'large' ? saved : 'medium';
  });
  const [subtitleColor, setSubtitleColor] = useState<import('./viewer/types').SubtitleColor>(() => (
    localStorage.getItem('subtitleColor') === 'yellow' ? 'yellow' : 'white'
  ));
  const [subtitleBackground, setSubtitleBackground] = useState<import('./viewer/types').SubtitleBackground>(() => {
    const saved = localStorage.getItem('subtitleBackground');
    return saved === 'none' || saved === 'dark' ? saved : 'translucent';
  });
  const [bookmarks, setBookmarks] = useState<{ time: number; createdAt: string }[]>([]);
  const [timelinePreview, setTimelinePreview] = useState<{ time: number; left: number } | null>(null);
  const [timelinePreviewSeeking, setTimelinePreviewSeeking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const archiveVideoRef = useRef<HTMLVideoElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const imageGifCanvasRef = useRef<HTMLCanvasElement>(null);
  const archiveImgRef = useRef<HTMLImageElement>(null);
  const archiveGifCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelinePreviewVideoRef = useRef<HTMLVideoElement>(null);
  const panStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const archivePanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const archiveVideoPanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const videoPanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const imgScaleRef = useRef(1);
  const videoScaleRef = useRef(1);
  const archiveImgScaleRef = useRef(1);
  const archiveVideoScaleRef = useRef(1);
  const countedViewKeyRef = useRef<string | null>(null);
  const incomingSourceKey = getOpenViewerSourceKey(isOpen, categoryId, recordId, filePath);
  if (incomingSourceKey && incomingSourceKey !== displaySourceKey) {
    setDisplaySourceKey(incomingSourceKey);
    setDisplayFilePath(filePath);
    setDisplayFileType(fileType);
    setDisplayCategoryId(categoryId);
    setDisplayRecordId(recordId);
    setDataUrl(null);
    setDetectedFileType(fileType);
    setFileNotFound(false);
    setLoading(true);
    setImgScale(1);
    setImgOffset({ x: 0, y: 0 });
    setVideoScale(1);
    setVideoOffset({ x: 0, y: 0 });
    setArchiveImgScale(1);
    setArchiveImgOffset({ x: 0, y: 0 });
    setArchiveVideoScale(1);
    setArchiveVideoOffset({ x: 0, y: 0 });
    setImgRotation(0);
    setVideoRotation(0);
    setArchiveImgRotation(0);
  }

  const archive = useArchiveViewer({
    isOpen,
    filePath,
    displayFilePath,
    fileType,
    detectedFileType,
    setLoading,
    setFileNotFound,
  });

  const playback = useVideoPlayback({
    fileType,
    detectedFileType,
    archiveFiles: archive.archiveFiles,
    currentArchiveIndex: archive.currentArchiveIndex,
    videoRef,
    archiveVideoRef,
  });

  const handleClose = useCallback(() => {
    const exitFullscreen = playback.isFullscreen
      ? window.electronAPI.setViewerFullscreen(false).catch(() => null)
      : Promise.resolve(null);
    void exitFullscreen
      .then(() => exitPictureInPicture())
      .finally(onClose);
  }, [onClose, playback.isFullscreen]);

  const handleEscape = useCallback(() => {
    if (playback.isFullscreen) {
      void window.electronAPI.setViewerFullscreen(false);
      return;
    }
    handleClose();
  }, [handleClose, playback.isFullscreen]);

  useEffect(() => {
    if (!isOpen && playback.isFullscreen) {
      void window.electronAPI.setViewerFullscreen(false);
    }
  }, [isOpen, playback.isFullscreen]);

  const handleKeyDown = useMediaKeyboard({
    fileType,
    detectedFileType,
    archiveFiles: archive.archiveFiles,
    currentArchiveIndex: archive.currentArchiveIndex,
    videoSeekSeconds: playback.videoSeekSeconds,
    volume: playback.volume,
    playbackSpeed: playback.playbackSpeed,
    onClose: handleEscape,
    onPlayPause: playback.handlePlayPause,
    onVolumeChange: playback.handleVolumeChange,
    onSeekBySeconds: playback.seekBySeconds,
    onSeekByFrame: playback.seekByFrame,
    onSpeedChange: playback.handleSpeedChange,
    onFullscreenToggle: () => void playback.handleFullscreenToggle(),
    onPreviousArchive: () => void archive.handlePrevious(),
    onNextArchive: () => void archive.handleNext(),
  });

  const activeSubtitleCues = useMemo(() => {
    const activeSubtitle = subtitles.find((subtitle) => subtitle.id === activeSubtitleId);
    return activeSubtitle?.cues || [];
  }, [activeSubtitleId, subtitles]);

  useEffect(() => {
    if (!isOpen) {
      countedViewKeyRef.current = null;
      return;
    }
    if (!categoryId || !recordId) return;
    const viewKey = `${categoryId}:${recordId}:${filePath}`;
    if (countedViewKeyRef.current === viewKey) return;
    countedViewKeyRef.current = viewKey;
    void window.electronAPI.incrementRecordViewCount(categoryId, recordId)
      .then((result) => {
        if (result.success) {
          window.dispatchEvent(new CustomEvent('record:view-counted'));
          return;
        }
        countedViewKeyRef.current = null;
      })
      .catch(() => {
        countedViewKeyRef.current = null;
      });
  }, [categoryId, filePath, isOpen, recordId]);

  useEffect(() => {
    if (!isOpen) void exitPictureInPicture();
  }, [isOpen]);

  useEffect(() => {
    void exitPictureInPicture();
  }, [displayFilePath]);

  useEffect(() => () => {
    void exitPictureInPicture();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseBack = (event: MouseEvent) => {
      if (event.button !== 3) return;
      event.preventDefault();
      event.stopPropagation();
      handleClose();
    };
    window.addEventListener('mousedown', handleMouseBack, true);
    return () => window.removeEventListener('mousedown', handleMouseBack, true);
  }, [handleClose, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    window.electronAPI.getConfig().then((config) => {
      if (cancelled) return;
      playback.setVideoSeekSeconds(Math.max(1, Number(config?.videoSeekSeconds ?? 5)));
      playback.setVideoAutoPlay(config?.videoAutoPlay !== false);
    }).catch(() => {
      if (cancelled) return;
      playback.setVideoSeekSeconds(5);
      playback.setVideoAutoPlay(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, playback.setVideoAutoPlay, playback.setVideoSeekSeconds]);

  useEffect(() => {
    localStorage.setItem('subtitleSize', subtitleSize);
  }, [subtitleSize]);
  useEffect(() => {
    localStorage.setItem('subtitleColor', subtitleColor);
  }, [subtitleColor]);
  useEffect(() => {
    localStorage.setItem('subtitleBackground', subtitleBackground);
  }, [subtitleBackground]);

  useEffect(() => {
    if (!isOpen) {
      setSubtitles([]);
      setActiveSubtitleId(null);
      return;
    }

    let cancelled = false;
    const loadSubtitles = async () => {
      const effectiveType = displayFileType || detectedFileType;
      let loadedSubtitles: typeof subtitles = [];
      try {
        if (effectiveType === 'video' && displayFilePath) {
          const sources = await window.electronAPI.getVideoSubtitles(displayFilePath);
          loadedSubtitles = sources
            .map((source) => ({
              id: source.id,
              name: source.name,
              cues: parseSubtitle(source.content, source.name),
            }))
            .filter((source) => source.cues.length > 0);
        } else if (effectiveType === 'archive' && archive.currentArchiveIndex >= 0) {
          const currentFile = archive.archiveFiles[archive.currentArchiveIndex];
          if (currentFile && isVideoFileName(currentFile.name)) {
            const matches = findArchiveSubtitles(archive.archiveFiles, currentFile.name);
            const sources = await Promise.all(matches.map(async (subtitle) => ({
              id: `archive:${subtitle.name}`,
              name: subtitle.name.replace(/\\/g, '/').split('/').pop() || subtitle.name,
              content: await window.electronAPI.getArchiveFileText(displayFilePath, subtitle.name),
            })));
            loadedSubtitles = sources
              .filter((source): source is typeof source & { content: string } => typeof source.content === 'string')
              .map((source) => ({
                id: source.id,
                name: source.name,
                cues: parseSubtitle(source.content, source.name),
              }))
              .filter((source) => source.cues.length > 0);
          }
        }
      } catch (error) {
        console.error('자막 로드 실패:', error);
      }

      if (!cancelled) {
        setSubtitles(loadedSubtitles);
        setActiveSubtitleId(loadedSubtitles[0]?.id ?? null);
        setSubtitleOffset(0);
      }
    };

    void loadSubtitles();
    return () => {
      cancelled = true;
    };
  }, [archive.archiveFiles, archive.currentArchiveIndex, detectedFileType, displayFilePath, displayFileType, isOpen]);

  useEffect(() => {
    playback.clearLoopSelection();
  }, [archive.currentArchiveIndex, displayFilePath, displayFileType, isOpen, playback.clearLoopSelection]);

  useEffect(() => {
    setIsImageGifPaused(false);
  }, [dataUrl, displayFilePath]);

  useEffect(() => {
    setIsArchiveGifPaused(false);
  }, [archive.currentArchiveDataUrl, archive.currentArchiveIndex]);

  useEffect(() => {
    if (fileNotFound && fileType === 'video' && categoryId && recordId) {
      void (async () => {
        try {
          if ((window.electronAPI as any).removeAllBookmarks) {
            const res = await (window.electronAPI as any).removeAllBookmarks(categoryId, recordId);
            if (res && res.error) console.error('북마크 자동 삭제 실패:', res.error);
          }
        } catch (error) {
          console.error('북마크 삭제 중 오류:', error);
        }
      })();
    }
  }, [categoryId, fileNotFound, fileType, recordId]);

  useEffect(() => {
    const effectiveType = fileType || detectedFileType;
    if (effectiveType === 'video' && isOpen && filePath && categoryId && recordId) {
      window.electronAPI.getBookmarks(categoryId, recordId).then((res) => {
        if (res.success) setBookmarks(res.bookmarks);
        else setBookmarks([]);
      });
    } else {
      setBookmarks([]);
    }
  }, [categoryId, detectedFileType, filePath, fileType, isOpen, recordId]);

  useEffect(() => { videoScaleRef.current = videoScale; }, [videoScale]);
  useEffect(() => { imgScaleRef.current = imgScale; }, [imgScale]);
  useEffect(() => { archiveImgScaleRef.current = archiveImgScale; }, [archiveImgScale]);
  useEffect(() => { archiveVideoScaleRef.current = archiveVideoScale; }, [archiveVideoScale]);

  useEffect(() => {
    if (!displayFilePath) {
      setDataUrl(null);
      archive.resetArchiveState();
      playback.setIsPlaying(false);
      playback.setVideoError(null);
      setFileNotFound(false);
      playback.setPlaybackSpeed(1.0);
      setDetectedFileType(null);
      return;
    }

    let cancelled = false;
    const applyDataUrl = (url: string | null) => {
      if (cancelled) return;
      if (url === null || url === 'error') {
        setFileNotFound(true);
        setDataUrl(null);
      } else {
        setDataUrl(url);
      }
      setLoading(false);
    };

    if (!displayFileType) {
      setLoading(true);
      setFileNotFound(false);
      setDetectedFileType(null);
      window.electronAPI.getFileType(displayFilePath).then((detectedType) => {
        if (cancelled) return;
        setDetectedFileType(toViewerFileType(detectedType));
        if (detectedType === 'image' || detectedType === 'video') {
          playback.setPlaybackSpeed(1.0);
          window.electronAPI.getFileDataUrl(displayFilePath).then(async (url) => {
            if (cancelled) return;
            if (detectedType === 'video' && url === 'stream') {
              applyDataUrl(await getLocalVideoHttpUrl(displayFilePath));
              return;
            }
            applyDataUrl(url);
          }).catch((error) => {
            if (cancelled) return;
            console.error('파일 로드 실패:', error);
            setFileNotFound(true);
            setDataUrl(null);
            setLoading(false);
          });
        } else if (detectedType === 'archive') {
          archive.loadArchiveFiles().catch((error) => {
            if (cancelled) return;
            console.error('압축파일 로드 실패:', error);
            setFileNotFound(true);
            setLoading(false);
          });
        } else {
          setFileNotFound(true);
          setDataUrl(null);
          setLoading(false);
        }
      }).catch((error) => {
        if (cancelled) return;
        console.error('파일 타입 확인 실패:', error);
        setFileNotFound(true);
        setDataUrl(null);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    if (displayFileType === 'image' || displayFileType === 'video') {
      playback.setPlaybackSpeed(1.0);
      setLoading(true);
      setFileNotFound(false);
      window.electronAPI.getFileDataUrl(displayFilePath).then(async (url) => {
        if (cancelled) return;
        if (displayFileType === 'video' && url === 'stream') {
          applyDataUrl(await getLocalVideoHttpUrl(displayFilePath));
          return;
        }
        applyDataUrl(url);
      }).catch((error) => {
        if (cancelled) return;
        console.error('파일 로드 실패:', error);
        setFileNotFound(true);
        setDataUrl(null);
        setLoading(false);
      });
    } else if (displayFileType === 'archive') {
      setLoading(true);
      setFileNotFound(false);
      void archive.loadArchiveFiles();
    } else {
      setDataUrl(null);
    }

    return () => {
      cancelled = true;
    };
  }, [archive.loadArchiveFiles, archive.resetArchiveState, displayFilePath, displayFileType, playback.setIsPlaying, playback.setPlaybackSpeed, playback.setVideoError]);

  useEffect(() => {
    if (!timelinePreview) return;
    const timeoutId = window.setTimeout(() => {
      const previewVideo = timelinePreviewVideoRef.current;
      if (!previewVideo || previewVideo.readyState < HTMLMediaElement.HAVE_METADATA) return;
      previewVideo.currentTime = Math.min(timelinePreview.time, previewVideo.duration || timelinePreview.time);
    }, 40);
    return () => window.clearTimeout(timeoutId);
  }, [timelinePreview]);

  useEffect(() => {
    setTimelinePreview(null);
    setTimelinePreviewSeeking(false);
  }, [archive.currentArchiveDataUrl, archive.currentArchiveIndex, dataUrl, isOpen]);

  useEffect(() => {
    setVideoScale(1);
    setVideoOffset({ x: 0, y: 0 });
    setImgScale(1);
    setImgOffset({ x: 0, y: 0 });
    setImgRotation(0);
    setVideoRotation(0);
    setArchiveImgRotation(0);
    setArchiveImgScale(1);
    setArchiveImgOffset({ x: 0, y: 0 });
    setArchiveVideoScale(1);
    setArchiveVideoOffset({ x: 0, y: 0 });
  }, [filePath, fileType, archive.currentArchiveIndex]);

  const clampToContainer = useCallback((offset: { x: number; y: number }, scale: number) => {
    if (!imgContainerRef.current) return offset;
    const rect = imgContainerRef.current.getBoundingClientRect();
    return clampPanOffset(offset, scale, rect.width, rect.height);
  }, []);

  useEffect(() => {
    const effectiveType = fileType || detectedFileType;
    if (effectiveType !== 'video' || !dataUrl) return;
    const video = videoRef.current;
    if (!video) return;
    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale = nextWheelScale(videoScaleRef.current, event.deltaY);
      setVideoScale(nextScale);
      setVideoOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
    };
    video.addEventListener('wheel', wheelHandler, { passive: false });
    return () => video.removeEventListener('wheel', wheelHandler);
  }, [clampToContainer, dataUrl, detectedFileType, fileType]);

  useEffect(() => {
    const effectiveType = fileType || detectedFileType;
    if (effectiveType !== 'image' || !dataUrl) return;
    const img = /\.gif$/i.test(displayFilePath) ? imageGifCanvasRef.current : imgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return;
    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale = nextWheelScale(imgScaleRef.current, event.deltaY);
      setImgScale(nextScale);
      setImgOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
    };
    img.addEventListener('wheel', wheelHandler, { passive: false });
    container.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      img.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [clampToContainer, dataUrl, detectedFileType, displayFilePath, fileType]);

  useEffect(() => {
    const effectiveType = fileType || detectedFileType;
    const currentFile = archive.archiveFiles[archive.currentArchiveIndex];
    const isArchiveImage = !!currentFile && /\.(jpg|jpeg|png|gif|webp)$/i.test(currentFile.name);
    if (effectiveType !== 'archive' || !archive.currentArchiveDataUrl || !isArchiveImage) return;
    const img = /\.gif$/i.test(currentFile.name) ? archiveGifCanvasRef.current : archiveImgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return;
    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale = nextWheelScale(archiveImgScaleRef.current, event.deltaY);
      setArchiveImgScale(nextScale);
      setArchiveImgOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
    };
    img.addEventListener('wheel', wheelHandler, { passive: false });
    container.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      img.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [archive.archiveFiles, archive.currentArchiveDataUrl, archive.currentArchiveIndex, clampToContainer, detectedFileType, fileType]);

  useEffect(() => {
    const effectiveType = fileType || detectedFileType;
    const currentFile = archive.archiveFiles[archive.currentArchiveIndex];
    if (effectiveType !== 'archive' || !archive.currentArchiveDataUrl || !isVideoFileName(currentFile?.name)) return;
    const video = archiveVideoRef.current;
    if (!video) return;
    const wheelHandler = (event: WheelEvent) => {
      event.preventDefault();
      const nextScale = nextWheelScale(archiveVideoScaleRef.current, event.deltaY);
      setArchiveVideoScale(nextScale);
      setArchiveVideoOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
    };
    video.addEventListener('wheel', wheelHandler, { passive: false });
    return () => video.removeEventListener('wheel', wheelHandler);
  }, [archive.archiveFiles, archive.currentArchiveDataUrl, archive.currentArchiveIndex, clampToContainer, detectedFileType, fileType]);

  useEffect(() => {
    if (!isOpen) return;
    const focusModal = () => modalContainerRef.current?.focus();
    focusModal();
    const timeoutId = window.setTimeout(focusModal, 0);
    const rafId = window.requestAnimationFrame(focusModal);
    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(rafId);
    };
  }, [archive.currentArchiveDataUrl, dataUrl, detectedFileType, isOpen]);

  useEffect(() => {
    const volumeSliders = document.querySelectorAll('#volume-slider');
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.05 : 0.05;
      playback.handleVolumeChange((playback.isMuted ? 0 : playback.volume) + delta);
    };
    volumeSliders.forEach((slider) => slider.addEventListener('wheel', handleWheel, { passive: false }));
    return () => {
      volumeSliders.forEach((slider) => slider.removeEventListener('wheel', handleWheel));
    };
  }, [playback.handleVolumeChange, playback.isMuted, playback.volume]);

  const handleAddBookmark = () => {
    if ((fileType || detectedFileType) !== 'video') return;
    window.electronAPI.addBookmark(categoryId, recordId, playback.currentTime).then((res) => {
      if (res.success) setBookmarks((prev) => [...prev, res.bookmark].sort((left, right) => left.time - right.time));
      else console.error('북마크 추가 실패:', res.error);
    });
  };

  const handleRemoveBookmark = (time: number) => {
    if ((fileType || detectedFileType) !== 'video') return;
    window.electronAPI.removeBookmark(categoryId, recordId, time).then((res) => {
      if (res.success) setBookmarks((prev) => prev.filter((bookmark) => Math.abs(bookmark.time - time) >= 1));
      else console.error('북마크 삭제 실패:', res.error);
    });
  };

  if (!isOpen || !displayFilePath) return null;

  const currentFile = archive.archiveFiles[archive.currentArchiveIndex];
  const fileName = displayFilePath.split(/[\\/]/).pop() || '';
  const currentFileExt = currentFile?.name.toLowerCase().split('.').pop();
  const isFirstArchiveFile = archive.navigableArchiveFiles.length === 0 || archive.currentArchiveNavigationIndex === 0;
  const isLastArchiveFile = archive.navigableArchiveFiles.length === 0
    || archive.currentArchiveNavigationIndex === archive.navigableArchiveFiles.length - 1;
  const effectiveFileType = displayFileType || detectedFileType;
  const isImageGif = effectiveFileType === 'image' && /\.gif$/i.test(displayFilePath);
  const isArchiveGif = effectiveFileType === 'archive' && /\.gif$/i.test(currentFile?.name || '');
  const timelinePreviewSource = effectiveFileType === 'video'
    ? dataUrl
    : effectiveFileType === 'archive' && isVideoFileName(currentFile?.name)
      ? archive.currentArchiveDataUrl
      : null;

  const subtitleMenu = {
    subtitles,
    activeSubtitleId,
    onSubtitleChange: setActiveSubtitleId,
    onSubtitleSizeChange: setSubtitleSize,
    onSubtitleColorChange: setSubtitleColor,
    onSubtitleBackgroundChange: setSubtitleBackground,
    onSubtitleOffsetChange: setSubtitleOffset,
  };

  const handleTimelinePreviewMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!Number.isFinite(playback.duration) || playback.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pointerX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    setTimelinePreviewSeeking(true);
    setTimelinePreview({
      time: (pointerX / rect.width) * playback.duration,
      left: Math.min(rect.width - 88, Math.max(88, pointerX)),
    });
  };

  const renderTimelinePreview = () => (
    timelinePreviewSource ? (
      <div
        className={`pointer-events-none absolute bottom-10 z-30 w-44 -translate-x-1/2 transition-opacity duration-100 ${
          timelinePreview ? 'visible opacity-100' : 'invisible opacity-0'
        }`}
        style={{ left: `${timelinePreview?.left ?? 88}px` }}
      >
        <div className="overflow-hidden rounded-xl border border-white/50 bg-black shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          <video
            ref={timelinePreviewVideoRef}
            src={timelinePreviewSource}
            muted
            playsInline
            preload="auto"
            disablePictureInPicture
            className={`aspect-video w-full bg-black object-contain transition-[filter,opacity,transform] duration-150 ${
              timelinePreviewSeeking ? 'scale-[1.02] blur-[2px] opacity-75' : 'scale-100 blur-0 opacity-100'
            }`}
            onLoadedMetadata={(event) => {
              if (!timelinePreview) return;
              const previewVideo = event.currentTarget;
              previewVideo.currentTime = Math.min(timelinePreview.time, previewVideo.duration || timelinePreview.time);
            }}
            onSeeking={() => setTimelinePreviewSeeking(true)}
            onSeeked={(event) => {
              if (!timelinePreview || Math.abs(event.currentTarget.currentTime - timelinePreview.time) < 0.2) {
                setTimelinePreviewSeeking(false);
              }
            }}
          />
        </div>
        <div className="mx-auto mt-2 w-fit rounded-full bg-[#202124]/90 px-4 py-1.5 text-center text-sm font-medium leading-none text-white shadow-lg">
          {formatMediaTime(timelinePreview?.time ?? 0)}
        </div>
      </div>
    ) : null
  );

  const sharedVideoProps = {
    autoPlay: playback.videoAutoPlay,
    videoError: playback.videoError,
    codecInfo: playback.codecInfo,
    showVolumeOverlay: playback.showVolumeOverlay,
    isMuted: playback.isMuted,
    volume: playback.volume,
    showPlaybackOverlay: playback.showPlaybackOverlay,
    playbackOverlayState: playback.playbackOverlayState,
    playbackOverlayVisible: playback.playbackOverlayVisible,
    showControls: playback.showControls,
    currentTime: playback.currentTime,
    duration: playback.duration,
    loopRange: playback.loopRange,
    loopDraft: playback.loopDraft,
    isPlaying: playback.isPlaying,
    isLooping: playback.isLooping,
    playbackSpeed: playback.playbackSpeed,
    showSpeedMenu: playback.showSpeedMenu,
    isFullscreen: playback.isFullscreen,
    timelinePreview: renderTimelinePreview(),
    subtitleCues: activeSubtitleCues,
    subtitleOffset,
    subtitleSize,
    subtitleColor,
    subtitleBackground,
    subtitleMenu,
    onPlay: () => playback.setIsPlaying(true),
    onPause: () => playback.setIsPlaying(false),
    onLoadedMetadata: playback.handleLoadedMetadata,
    onTimeUpdate: playback.handleTimeUpdate,
    onEnded: playback.handleLoopRangeEnded,
    onPictureInPicture: () => void playback.handlePictureInPicture(),
    onPictureInPictureStateChange: playback.handlePictureInPictureStateChange,
    onCanPlay: () => playback.setVideoError(null),
    onContainerMouseMove: playback.revealControls,
    onContainerMouseLeave: () => playback.setShowControls(false),
    onSeek: playback.handleSeek,
    onSeekBarMouseDown: playback.handleSeekBarMouseDown,
    onTimelinePreviewMove: handleTimelinePreviewMove,
    onTimelinePreviewLeave: () => {
      setTimelinePreview(null);
      setTimelinePreviewSeeking(false);
    },
    onPlayPause: playback.handlePlayPause,
    onMuteToggle: playback.handleMuteToggle,
    onVolumeChange: playback.handleVolumeChange,
    onLoopToggle: playback.handleLoopToggle,
    onSpeedMenuToggle: playback.handleSpeedMenuToggle,
    onSpeedChange: playback.handleSpeedChange,
    onFullscreenToggle: playback.handleFullscreenToggle,
  };

  return (
    <AnimatedModal
      isOpen={isOpen}
      className="z-[60] bg-black/95"
      contentClassName={playback.isFullscreen
        ? 'relative flex h-screen w-screen flex-col bg-black shadow-2xl rounded-none'
        : 'relative bg-discord-bg rounded-xl shadow-2xl w-[95vw] h-[95vh] flex flex-col'}
      animateContent={false}
      exitAnimation={false}
    >
      <div
        ref={modalContainerRef}
        className={playback.isFullscreen
          ? 'relative flex h-screen w-screen flex-col bg-black shadow-2xl rounded-none'
          : 'relative bg-discord-bg rounded-xl shadow-2xl w-[95vw] h-[95vh] flex flex-col'}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        data-modal-container
      >
        {!playback.isFullscreen && <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {effectiveFileType === 'image' && <FileImage size={20} className="text-blue-400" />}
            {effectiveFileType === 'video' && <FileVideo size={20} className="text-green-400" />}
            {effectiveFileType === 'archive' && <Archive size={20} className="text-orange-400" />}
            <span className="text-discord-text font-medium truncate max-w-md">{fileName}</span>
            {effectiveFileType === 'archive' && (
              <span className="text-discord-muted text-sm">
                ({Math.max(0, archive.currentArchiveNavigationIndex + 1)} / {archive.navigableArchiveFiles.length})
              </span>
            )}
          </div>
          <button onClick={handleClose} className="text-discord-muted hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>}

        <div className="flex-1 min-h-0 flex items-center justify-center relative" style={{ overflow: 'hidden' }}>
          {((effectiveFileType === 'image') || (effectiveFileType === 'video') || (effectiveFileType === 'archive' && currentFile && (currentFileExt !== 'txt'))) && (
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        if (effectiveFileType === 'image') setImgRotation((value) => (value - 90) % 360);
                        else if (effectiveFileType === 'video') setVideoRotation((value) => (value - 90) % 360);
                        else if (effectiveFileType === 'archive' && currentFileExt !== 'txt') setArchiveImgRotation((value) => (value - 90) % 360);
                      }}
                      className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                    >
                      <RotateCcw size={20} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className={tooltipClassName}>왼쪽으로 90도 회전</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        if (effectiveFileType === 'image') setImgRotation((value) => (value + 90) % 360);
                        else if (effectiveFileType === 'video') setVideoRotation((value) => (value + 90) % 360);
                        else if (effectiveFileType === 'archive' && currentFileExt !== 'txt') setArchiveImgRotation((value) => (value + 90) % 360);
                      }}
                      className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                    >
                      <RotateCw size={20} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className={tooltipClassName}>오른쪽으로 90도 회전</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-discord-accent"></div>
            </div>
          ) : fileNotFound ? (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <div className="text-6xl mb-4">📁</div>
              <div className="text-2xl font-bold text-discord-text mb-2">원본 파일을 찾을 수 없습니다</div>
              <div className="text-discord-muted mb-4 max-w-md">
                파일이 삭제되었거나 이동되었을 수 있습니다.<br />
                파일 경로: <span className="font-mono text-sm bg-discord-sidebar px-2 py-1 rounded">{filePath}</span>
              </div>
              <div className="text-sm text-discord-muted">
                이 파일과 관련된 북마크는 자동으로 삭제됩니다.
              </div>
            </div>
          ) : (
            <>
              {effectiveFileType === 'image' && dataUrl && (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <ImageViewer
                    src={dataUrl}
                    alt="이미지 뷰어"
                    isGif={isImageGif}
                    paused={isImageGifPaused}
                    scale={imgScale}
                    offset={imgOffset}
                    rotation={imgRotation}
                    isPanning={isPanning}
                    imageRef={imgRef}
                    gifCanvasRef={imageGifCanvasRef}
                    containerRef={imgContainerRef}
                    showPlaybackOverlay={playback.showPlaybackOverlay}
                    playbackOverlayState={playback.playbackOverlayState}
                    playbackOverlayVisible={playback.playbackOverlayVisible}
                    wrapperClassName="relative flex-1 w-full h-full flex items-center justify-center"
                    containerStyle={{
                      maxHeight: '80vh',
                      maxWidth: '100%',
                      overflow: imgScale > 1 ? 'hidden' : 'visible',
                    }}
                    onMouseDown={(event) => {
                      if (imgScale === 1) return;
                      setIsPanning(true);
                      panStart.current = { x: event.clientX, y: event.clientY, offsetX: imgOffset.x, offsetY: imgOffset.y };
                    }}
                    onMouseMove={(event) => {
                      if (!isPanning || !panStart.current) return;
                      setImgOffset(clampToContainer({
                        x: panStart.current.offsetX + event.clientX - panStart.current.x,
                        y: panStart.current.offsetY + event.clientY - panStart.current.y,
                      }, imgScale));
                    }}
                    onMouseUp={() => setIsPanning(false)}
                    onGifClick={() => {
                      if (imgScale > 1) return;
                      const nextPaused = !isImageGifPaused;
                      setIsImageGifPaused(nextPaused);
                      playback.showPlaybackFeedback(nextPaused ? 'pause' : 'play');
                    }}
                  />
                </div>
              )}

              {effectiveFileType === 'video' && dataUrl && (
                <VideoViewer
                  {...sharedVideoProps}
                  src={dataUrl}
                  videoRef={videoRef}
                  containerRef={imgContainerRef}
                  scale={videoScale}
                  offset={videoOffset}
                  rotation={videoRotation}
                  isPanning={videoIsPanning}
                  showBookmarks
                  bookmarks={bookmarks}
                  subtitleSourceKey={dataUrl}
                  onRetry={() => {
                    playback.setVideoError(null);
                    playback.setCodecInfo(null);
                    videoRef.current?.load();
                  }}
                  onMouseDown={(event) => {
                    if (videoScale === 1) return;
                    setVideoIsPanning(true);
                    videoPanStart.current = { x: event.clientX, y: event.clientY, offsetX: videoOffset.x, offsetY: videoOffset.y };
                  }}
                  onMouseMove={(event) => {
                    if (!videoIsPanning || !videoPanStart.current) return;
                    setVideoOffset(clampToContainer({
                      x: videoPanStart.current.offsetX + event.clientX - videoPanStart.current.x,
                      y: videoPanStart.current.offsetY + event.clientY - videoPanStart.current.y,
                    }, videoScale));
                  }}
                  onMouseUp={() => setVideoIsPanning(false)}
                  onVideoClick={() => playback.handleVideoClick(videoScale, archiveVideoScale)}
                  onError={(event) => {
                    const video = event.target as HTMLVideoElement;
                    if (video.error) console.error('동영상 재생 에러:', video.error.message);
                    playback.setVideoError('동영상을 재생할 수 없습니다.');
                    playback.setCodecInfo(null);
                    if (filePath) window.electronAPI.getVideoCodecInfo(filePath).then(playback.setCodecInfo);
                  }}
                  onBookmarkClick={(time) => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = time;
                      playback.setCurrentTime(time);
                    }
                  }}
                  onBookmarkContextMenu={handleRemoveBookmark}
                  onToggleBookmark={() => {
                    if (hasBookmarkAtTime(bookmarks, playback.currentTime)) {
                      const bookmarkToRemove = bookmarks.find((bookmark) => Math.abs(bookmark.time - playback.currentTime) < 1);
                      if (bookmarkToRemove) handleRemoveBookmark(bookmarkToRemove.time);
                    } else {
                      handleAddBookmark();
                    }
                  }}
                />
              )}

              {effectiveFileType === 'archive' && (
                <ArchiveViewer
                  currentFile={currentFile}
                  currentFileExt={currentFileExt}
                  filteredArchiveFiles={archive.filteredArchiveFiles}
                  currentArchiveIndex={archive.currentArchiveIndex}
                  archiveSearchQuery={archive.archiveSearchQuery}
                  currentArchiveDataUrl={archive.currentArchiveDataUrl}
                  currentArchiveText={archive.currentArchiveText}
                  isFirstArchiveFile={isFirstArchiveFile}
                  isLastArchiveFile={isLastArchiveFile}
                  isArchiveGif={isArchiveGif}
                  archiveImgScale={archiveImgScale}
                  archiveVideoScale={archiveVideoScale}
                  imgContainerRef={imgContainerRef}
                  onSearchChange={archive.setArchiveSearchQuery}
                  onClearSearch={() => archive.setArchiveSearchQuery('')}
                  onSelectFile={(index) => void archive.selectArchiveFile(index)}
                  onOpenUnsupportedFile={(file) => void archive.handleOpenUnsupportedArchiveFile(file)}
                  onPrevious={() => void archive.handlePrevious()}
                  onNext={() => void archive.handleNext()}
                  imageViewer={{
                    src: archive.currentArchiveDataUrl || '',
                    alt: currentFile?.name || '압축 파일 이미지',
                    isGif: isArchiveGif,
                    paused: isArchiveGifPaused,
                    scale: archiveImgScale,
                    offset: archiveImgOffset,
                    rotation: archiveImgRotation,
                    isPanning: archiveIsPanning,
                    imageRef: archiveImgRef,
                    gifCanvasRef: archiveGifCanvasRef,
                    showPlaybackOverlay: playback.showPlaybackOverlay,
                    playbackOverlayState: playback.playbackOverlayState,
                    playbackOverlayVisible: playback.playbackOverlayVisible,
                    onMouseDown: (event) => {
                      if (archiveImgScale === 1) return;
                      setArchiveIsPanning(true);
                      archivePanStart.current = { x: event.clientX, y: event.clientY, offsetX: archiveImgOffset.x, offsetY: archiveImgOffset.y };
                    },
                    onMouseMove: (event) => {
                      if (!archiveIsPanning || !archivePanStart.current) return;
                      setArchiveImgOffset(clampToContainer({
                        x: archivePanStart.current.offsetX + event.clientX - archivePanStart.current.x,
                        y: archivePanStart.current.offsetY + event.clientY - archivePanStart.current.y,
                      }, archiveImgScale));
                    },
                    onMouseUp: () => setArchiveIsPanning(false),
                    onGifClick: () => {
                      if (archiveImgScale > 1) return;
                      const nextPaused = !isArchiveGifPaused;
                      setIsArchiveGifPaused(nextPaused);
                      playback.showPlaybackFeedback(nextPaused ? 'pause' : 'play');
                    },
                  }}
                  videoViewer={{
                    ...sharedVideoProps,
                    src: archive.currentArchiveDataUrl || '',
                    videoRef: archiveVideoRef,
                    scale: archiveVideoScale,
                    offset: archiveVideoOffset,
                    rotation: archiveImgRotation,
                    isPanning: archiveVideoIsPanning,
                    subtitleSourceKey: archive.currentArchiveDataUrl,
                    onRetry: () => {
                      playback.setVideoError(null);
                      playback.setCodecInfo(null);
                      archiveVideoRef.current?.load();
                    },
                    onMouseDown: (event) => {
                      if (archiveVideoScale === 1) return;
                      setArchiveVideoIsPanning(true);
                      archiveVideoPanStart.current = { x: event.clientX, y: event.clientY, offsetX: archiveVideoOffset.x, offsetY: archiveVideoOffset.y };
                    },
                    onMouseMove: (event) => {
                      if (!archiveVideoIsPanning || !archiveVideoPanStart.current) return;
                      setArchiveVideoOffset(clampToContainer({
                        x: archiveVideoPanStart.current.offsetX + event.clientX - archiveVideoPanStart.current.x,
                        y: archiveVideoPanStart.current.offsetY + event.clientY - archiveVideoPanStart.current.y,
                      }, archiveVideoScale));
                    },
                    onMouseUp: () => setArchiveVideoIsPanning(false),
                    onVideoClick: () => playback.handleVideoClick(videoScale, archiveVideoScale),
                    onError: (event) => {
                      const video = event.target as HTMLVideoElement;
                      if (video.error) console.error('동영상 재생 에러:', video.error.message);
                      playback.setVideoError('동영상을 재생할 수 없습니다.');
                      playback.setCodecInfo(null);
                      if (filePath) window.electronAPI.getVideoCodecInfo(filePath).then(playback.setCodecInfo);
                    },
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </AnimatedModal>
  );
};
