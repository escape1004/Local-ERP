import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedModal } from './ui/animated-modal';
import { ArchiveViewer } from './viewer/ArchiveViewer';
import { ImageViewer } from './viewer/ImageViewer';
import { VideoViewer } from './viewer/VideoViewer';
import { ViewerModalHeader, ViewerRotateOverlay } from './viewer/ViewerModalChrome';
import type { ViewerFitMode, ViewerModalProps } from './viewer/types';
import {
  formatMediaTime,
  hasBookmarkAtTime,
  isVideoFileName,
} from './viewer/viewerLogic';
import { useArchiveViewer } from '../hooks/useArchiveViewer';
import { useViewerFitMode } from '../hooks/useViewerFitMode';
import { useMediaKeyboard } from '../hooks/useMediaKeyboard';
import { exitPictureInPicture } from '../hooks/pictureInPicture';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import { useViewerFileLoad } from '../hooks/useViewerFileLoad';
import { useViewerSession } from '../hooks/useViewerSession';
import { useViewerSubtitles } from '../hooks/useViewerSubtitles';
import { useViewerVolumeWheel, useViewerWheelZoom } from '../hooks/useViewerWheelZoom';

export type { ViewerModalProps };

export const ViewerModal: React.FC<ViewerModalProps> = ({ isOpen, filePath, fileType, categoryId = '', recordId = '', onClose }) => {
  const session = useViewerSession({ isOpen, filePath, fileType, categoryId, recordId });
  const {
    displayFilePath,
    displayFileType,
    dataUrl,
    setDataUrl,
    loading,
    setLoading,
    detectedFileType,
    setDetectedFileType,
    fileNotFound,
    setFileNotFound,
    imgScale,
    setImgScale,
    imgOffset,
    setImgOffset,
    isPanning,
    setIsPanning,
    archiveImgScale,
    setArchiveImgScale,
    archiveImgOffset,
    setArchiveImgOffset,
    archiveIsPanning,
    setArchiveIsPanning,
    archiveVideoScale,
    setArchiveVideoScale,
    archiveVideoOffset,
    setArchiveVideoOffset,
    archiveVideoIsPanning,
    setArchiveVideoIsPanning,
    videoScale,
    setVideoScale,
    videoOffset,
    setVideoOffset,
    videoIsPanning,
    setVideoIsPanning,
    imgRotation,
    setImgRotation,
    videoRotation,
    setVideoRotation,
    archiveImgRotation,
    setArchiveImgRotation,
    modalContainerRef,
    imgContainerRef,
    imgRef,
    imageGifCanvasRef,
    archiveImgRef,
    archiveGifCanvasRef,
    panStart,
    archivePanStart,
    archiveVideoPanStart,
    videoPanStart,
    imgScaleRef,
    videoScaleRef,
    archiveImgScaleRef,
    archiveVideoScaleRef,
    resetTransforms,
    clampToContainer,
  } = session;

  const { fitMode, setFitMode } = useViewerFitMode();
  const handleFitModeChange = useCallback((mode: ViewerFitMode) => {
    setFitMode(mode);
    resetTransforms();
  }, [resetTransforms, setFitMode]);

  const [isImageGifPaused, setIsImageGifPaused] = useState(false);
  const [isArchiveGifPaused, setIsArchiveGifPaused] = useState(false);
  const [bookmarks, setBookmarks] = useState<{ time: number; createdAt: string }[]>([]);
  const [timelinePreview, setTimelinePreview] = useState<{ time: number; left: number } | null>(null);
  const [timelinePreviewSeeking, setTimelinePreviewSeeking] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const archiveVideoRef = useRef<HTMLVideoElement>(null);
  const timelinePreviewVideoRef = useRef<HTMLVideoElement>(null);
  const countedViewKeyRef = useRef<string | null>(null);

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

  const subtitles = useViewerSubtitles({
    isOpen,
    displayFilePath,
    displayFileType,
    detectedFileType,
    archiveFiles: archive.archiveFiles,
    currentArchiveIndex: archive.currentArchiveIndex,
  });

  useViewerFileLoad({
    displayFilePath,
    displayFileType,
    setDataUrl,
    setLoading,
    setFileNotFound,
    setDetectedFileType,
    loadArchiveFiles: archive.loadArchiveFiles,
    resetArchiveState: archive.resetArchiveState,
    setIsPlaying: playback.setIsPlaying,
    setVideoError: playback.setVideoError,
    setPlaybackSpeed: playback.setPlaybackSpeed,
  });

  useViewerVolumeWheel({
    isOpen,
    volume: playback.volume,
    isMuted: playback.isMuted,
    onVolumeChange: playback.handleVolumeChange,
  });

  useViewerWheelZoom({
    isOpen,
    fileType,
    detectedFileType,
    dataUrl,
    archiveFiles: archive.archiveFiles,
    currentArchiveIndex: archive.currentArchiveIndex,
    currentArchiveDataUrl: archive.currentArchiveDataUrl,
    imgScaleRef,
    videoScaleRef,
    archiveImgScaleRef,
    archiveVideoScaleRef,
    setImgScale,
    setImgOffset,
    setVideoScale,
    setVideoOffset,
    setArchiveImgScale,
    setArchiveImgOffset,
    setArchiveVideoScale,
    setArchiveVideoOffset,
    clampToContainer,
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
    isFullscreen: playback.isFullscreen,
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

  useEffect(() => {
    resetTransforms();
  }, [filePath, fileType, archive.currentArchiveIndex, resetTransforms]);

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
  const isCurrentVideo = effectiveFileType === 'video'
    || (effectiveFileType === 'archive' && isVideoFileName(currentFile?.name));
  const canRotateCurrentFile = effectiveFileType === 'image'
    || effectiveFileType === 'video'
    || (effectiveFileType === 'archive' && currentFile && currentFileExt !== 'txt');
  const timelinePreviewSource = effectiveFileType === 'video'
    ? dataUrl
    : effectiveFileType === 'archive' && isVideoFileName(currentFile?.name)
      ? archive.currentArchiveDataUrl
      : null;

  const subtitleMenu = {
    subtitles: subtitles.subtitles,
    activeSubtitleId: subtitles.activeSubtitleId,
    onSubtitleChange: subtitles.setActiveSubtitleId,
    onSubtitleSizeChange: subtitles.setSubtitleSize,
    onSubtitleColorChange: subtitles.setSubtitleColor,
    onSubtitleBackgroundChange: subtitles.setSubtitleBackground,
    onSubtitleOffsetChange: subtitles.setSubtitleOffset,
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

  const rotateCurrentFile = (direction: -90 | 90) => {
    if (effectiveFileType === 'image') setImgRotation((value) => (value + direction) % 360);
    else if (effectiveFileType === 'video') setVideoRotation((value) => (value + direction) % 360);
    else if (effectiveFileType === 'archive' && currentFileExt !== 'txt') setArchiveImgRotation((value) => (value + direction) % 360);
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
    subtitleCues: subtitles.activeSubtitleCues,
    subtitleOffset: subtitles.subtitleOffset,
    subtitleSize: subtitles.subtitleSize,
    subtitleColor: subtitles.subtitleColor,
    subtitleBackground: subtitles.subtitleBackground,
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
        <ViewerModalHeader
          isFullscreen={playback.isFullscreen}
          fileName={fileName}
          effectiveFileType={effectiveFileType}
          archivePositionLabel={`(${Math.max(0, archive.currentArchiveNavigationIndex + 1)} / ${archive.navigableArchiveFiles.length})`}
          onClose={handleClose}
        />

        <div className="flex-1 min-h-0 flex items-center justify-center relative" style={{ overflow: 'hidden' }}>
          <ViewerRotateOverlay
            isFullscreen={playback.isFullscreen}
            canRotateCurrentFile={Boolean(canRotateCurrentFile)}
            isCurrentVideo={Boolean(isCurrentVideo)}
            onExitFullscreen={() => void playback.handleFullscreenToggle()}
            onRotateLeft={() => rotateCurrentFile(-90)}
            onRotateRight={() => rotateCurrentFile(90)}
          />

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
                <div className="h-full min-h-0 w-full">
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
                    fitMode={fitMode}
                    onFitModeChange={handleFitModeChange}
                    showPlaybackOverlay={playback.showPlaybackOverlay}
                    playbackOverlayState={playback.playbackOverlayState}
                    playbackOverlayVisible={playback.playbackOverlayVisible}
                    wrapperClassName="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden"
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
                  fitMode={fitMode}
                  onFitModeChange={handleFitModeChange}
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
                    fitMode,
                    onFitModeChange: handleFitModeChange,
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
                    fitMode,
                    onFitModeChange: handleFitModeChange,
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
