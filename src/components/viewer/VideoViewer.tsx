import React from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { SubtitleOverlay } from '../SubtitleOverlay';
import { SubtitleController } from './SubtitleController';
import { ViewerToolbar } from './ViewerToolbar';
import type {
  LoopRange,
  MediaBookmark,
  PlaybackOverlayState,
  SubtitleBackground,
  SubtitleColor,
  SubtitleSize,
  SubtitleSource,
  ViewerFitMode,
} from './types';
import type { SubtitleCue } from '../../lib/subtitle';
import { getViewerVideoClassName } from './viewerLogic';

interface VideoViewerProps {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  autoPlay: boolean;
  scale: number;
  offset: { x: number; y: number };
  rotation: number;
  isPanning: boolean;
  videoError: string | null;
  codecInfo: any;
  filePath?: string;
  showVolumeOverlay: boolean;
  isMuted: boolean;
  volume: number;
  showPlaybackOverlay: boolean;
  playbackOverlayState: PlaybackOverlayState;
  playbackOverlayVisible: boolean;
  showControls: boolean;
  currentTime: number;
  duration: number;
  loopRange: LoopRange | null;
  loopDraft: LoopRange | null;
  isPlaying: boolean;
  isLooping: boolean;
  playbackSpeed: number;
  showSpeedMenu: boolean;
  isFullscreen: boolean;
  showBookmarks?: boolean;
  bookmarks?: MediaBookmark[];
  timelinePreview: React.ReactNode;
  toolbarOverlayClassName?: string;
  layout?: 'page' | 'embedded';
  videoClassName?: string;
  fitMode: ViewerFitMode;
  onFitModeChange: (mode: ViewerFitMode) => void;
  subtitleCues: SubtitleCue[];
  subtitleOffset: number;
  subtitleSize: SubtitleSize;
  subtitleColor: SubtitleColor;
  subtitleBackground: SubtitleBackground;
  subtitleSourceKey?: string | null;
  subtitleMenu: {
    subtitles: SubtitleSource[];
    activeSubtitleId: string | null;
    onSubtitleChange: (id: string | null) => void;
    onSubtitleSizeChange: (size: SubtitleSize) => void;
    onSubtitleColorChange: (color: SubtitleColor) => void;
    onSubtitleBackgroundChange: (background: SubtitleBackground) => void;
    onSubtitleOffsetChange: (offset: number) => void;
  };
  onRetry: () => void;
  onMouseDown: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseUp: () => void;
  onPlay: () => void;
  onPause: () => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onEnded: () => void;
  onPictureInPicture: () => void;
  onPictureInPictureStateChange: (active: boolean) => void;
  onVideoClick: () => void;
  onError: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onCanPlay: () => void;
  onContainerMouseMove: () => void;
  onContainerMouseLeave: () => void;
  onSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekBarMouseDown: (event: React.MouseEvent<HTMLInputElement>) => void;
  onTimelinePreviewMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onTimelinePreviewLeave: () => void;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onLoopToggle: () => void;
  onSpeedMenuToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onFullscreenToggle: () => void;
  onBookmarkClick?: (time: number) => void;
  onBookmarkContextMenu?: (time: number) => void;
  onToggleBookmark?: () => void;
}

export const VideoViewer: React.FC<VideoViewerProps> = ({
  src,
  videoRef,
  containerRef,
  autoPlay,
  scale,
  offset,
  rotation,
  isPanning,
  videoError,
  codecInfo,
  showVolumeOverlay,
  isMuted,
  volume,
  showPlaybackOverlay,
  playbackOverlayState,
  playbackOverlayVisible,
  showControls,
  currentTime,
  duration,
  loopRange,
  loopDraft,
  isPlaying,
  isLooping,
  playbackSpeed,
  showSpeedMenu,
  isFullscreen,
  showBookmarks,
  bookmarks,
  timelinePreview,
  toolbarOverlayClassName,
  layout = 'page',
  videoClassName,
  fitMode,
  onFitModeChange,
  subtitleCues,
  subtitleOffset,
  subtitleSize,
  subtitleColor,
  subtitleBackground,
  subtitleSourceKey,
  subtitleMenu,
  onRetry,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onPlay,
  onPause,
  onLoadedMetadata,
  onTimeUpdate,
  onEnded,
  onPictureInPicture,
  onPictureInPictureStateChange,
  onVideoClick,
  onError,
  onCanPlay,
  onContainerMouseMove,
  onContainerMouseLeave,
  onSeek,
  onSeekBarMouseDown,
  onTimelinePreviewMove,
  onTimelinePreviewLeave,
  onPlayPause,
  onMuteToggle,
  onVolumeChange,
  onLoopToggle,
  onSpeedMenuToggle,
  onSpeedChange,
  onFullscreenToggle,
  onBookmarkClick,
  onBookmarkContextMenu,
  onToggleBookmark,
}) => {
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const handleEnter = () => onPictureInPictureStateChange(true);
    const handleLeave = () => onPictureInPictureStateChange(false);
    video.addEventListener('enterpictureinpicture', handleEnter);
    video.addEventListener('leavepictureinpicture', handleLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnter);
      video.removeEventListener('leavepictureinpicture', handleLeave);
    };
  }, [onPictureInPictureStateChange, src, videoError, videoRef]);

  const resolvedVideoClassName = videoClassName ?? getViewerVideoClassName(fitMode);

  return (
  <div
    className={layout === 'page'
      ? 'relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center self-stretch bg-black'
      : 'relative flex h-full min-h-0 w-full flex-1 items-center justify-center self-stretch bg-black'}
    onMouseMove={onContainerMouseMove}
    onMouseLeave={onContainerMouseLeave}
    tabIndex={0}
    data-video-container
    data-viewer-zoom
  >
    {layout === 'page' ? (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black"
    >
      <div
        className="flex h-full w-full items-center justify-center"
        style={{
        transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px) rotate(${rotation}deg)`,
        transition: isPanning ? 'none' : 'transform 0.2s',
      }}>
        {videoError ? (
          <div className="flex flex-col items-center justify-center bg-black text-white p-8 rounded-lg">
            <div className="text-2xl mb-4">⚠️</div>
            <div className="text-lg font-semibold mb-2">{videoError}</div>
            <div className="text-sm text-gray-300 text-center">
              지원되지 않는 코덱이거나<br />
              파일이 손상되었을 수 있습니다.
            </div>
            {codecInfo && (
              <div className="mt-4 text-xs bg-gray-800 rounded p-2 text-left">
                <div className="mb-1 font-bold text-blue-300">코덱 정보</div>
                {codecInfo.error && <div className="text-red-400">{codecInfo.error}</div>}
                {codecInfo.video && (
                  <div>Video: {codecInfo.video.codec} {codecInfo.video.profile ? `(${codecInfo.video.profile})` : ''} {codecInfo.video.pix_fmt ? `[${codecInfo.video.pix_fmt}]` : ''}</div>
                )}
                {codecInfo.audio && (
                  <div>Audio: {codecInfo.audio.codec} {codecInfo.audio.sample_rate ? `@${codecInfo.audio.sample_rate}Hz` : ''} {codecInfo.audio.channels ? `채널:${codecInfo.audio.channels}` : ''}</div>
                )}
                {!codecInfo.video && !codecInfo.audio && !codecInfo.error && <div>코덱 정보를 찾을 수 없습니다.</div>}
              </div>
            )}
            <button
              onClick={onRetry}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <SubtitleController
            onPlayInPictureInPicture={onPictureInPicture}
            fitMode={fitMode}
            onFitModeChange={onFitModeChange}
            subtitles={subtitleMenu.subtitles}
            activeSubtitleId={subtitleMenu.activeSubtitleId}
            subtitleSize={subtitleSize}
            subtitleColor={subtitleColor}
            subtitleBackground={subtitleBackground}
            subtitleOffset={subtitleOffset}
            onSubtitleChange={subtitleMenu.onSubtitleChange}
            onSubtitleSizeChange={subtitleMenu.onSubtitleSizeChange}
            onSubtitleColorChange={subtitleMenu.onSubtitleColorChange}
            onSubtitleBackgroundChange={subtitleMenu.onSubtitleBackgroundChange}
            onSubtitleOffsetChange={subtitleMenu.onSubtitleOffsetChange}
          >
            <div
              className="relative grid h-full w-full place-items-center bg-black"
              onClick={(event) => {
                if (event.target === event.currentTarget) onVideoClick();
              }}
            >
              <video
                ref={videoRef}
                src={src}
                autoPlay={autoPlay}
                controls={false}
                className={resolvedVideoClassName}
                style={{
                  cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onMouseDown(event);
                }}
                onMouseMove={(event) => {
                  event.stopPropagation();
                  onMouseMove(event);
                }}
                onMouseUp={(event) => {
                  event.stopPropagation();
                  onMouseUp();
                }}
                onMouseLeave={(event) => {
                  event.stopPropagation();
                  onMouseUp();
                }}
                onPlay={onPlay}
                onPause={onPause}
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onEnded={onEnded}
                onClick={onVideoClick}
                onError={onError}
                onCanPlay={onCanPlay}
              />
              <SubtitleOverlay
                videoRef={videoRef}
                sourceKey={subtitleSourceKey}
                cues={subtitleCues}
                currentTime={currentTime}
                offsetSeconds={subtitleOffset}
                size={subtitleSize}
                color={subtitleColor}
                background={subtitleBackground}
              />
            </div>
          </SubtitleController>
        )}
      </div>
    </div>
    ) : (
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden bg-black"
        style={{
        transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px) rotate(${rotation}deg)`,
        transition: isPanning ? 'none' : 'transform 0.2s',
      }}>
        {videoError ? (
          <div className="flex flex-col items-center justify-center bg-black text-white p-8 rounded-lg">
            <div className="text-2xl mb-4">⚠️</div>
            <div className="text-lg font-semibold mb-2">{videoError}</div>
            <div className="text-sm text-gray-300 text-center">
              지원되지 않는 코덱이거나<br />
              파일이 손상되었을 수 있습니다.
            </div>
            {codecInfo && (
              <div className="mt-4 text-xs bg-gray-800 rounded p-2 text-left">
                <div className="mb-1 font-bold text-blue-300">코덱 정보</div>
                {codecInfo.error && <div className="text-red-400">{codecInfo.error}</div>}
                {codecInfo.video && (
                  <div>Video: {codecInfo.video.codec} {codecInfo.video.profile ? `(${codecInfo.video.profile})` : ''} {codecInfo.video.pix_fmt ? `[${codecInfo.video.pix_fmt}]` : ''}</div>
                )}
                {codecInfo.audio && (
                  <div>Audio: {codecInfo.audio.codec} {codecInfo.audio.sample_rate ? `@${codecInfo.audio.sample_rate}Hz` : ''} {codecInfo.audio.channels ? `채널:${codecInfo.audio.channels}` : ''}</div>
                )}
                {!codecInfo.video && !codecInfo.audio && !codecInfo.error && <div>코덱 정보를 찾을 수 없습니다.</div>}
              </div>
            )}
            <button
              onClick={onRetry}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <SubtitleController
            onPlayInPictureInPicture={onPictureInPicture}
            fitMode={fitMode}
            onFitModeChange={onFitModeChange}
            subtitles={subtitleMenu.subtitles}
            activeSubtitleId={subtitleMenu.activeSubtitleId}
            subtitleSize={subtitleSize}
            subtitleColor={subtitleColor}
            subtitleBackground={subtitleBackground}
            subtitleOffset={subtitleOffset}
            onSubtitleChange={subtitleMenu.onSubtitleChange}
            onSubtitleSizeChange={subtitleMenu.onSubtitleSizeChange}
            onSubtitleColorChange={subtitleMenu.onSubtitleColorChange}
            onSubtitleBackgroundChange={subtitleMenu.onSubtitleBackgroundChange}
            onSubtitleOffsetChange={subtitleMenu.onSubtitleOffsetChange}
          >
            <div
              className="relative grid h-full w-full place-items-center bg-black"
              onClick={(event) => {
                if (event.target === event.currentTarget) onVideoClick();
              }}
            >
              <video
                ref={videoRef}
                src={src}
                autoPlay={autoPlay}
                controls={false}
                className={resolvedVideoClassName}
                style={{
                  cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  onMouseDown(event);
                }}
                onMouseMove={(event) => {
                  event.stopPropagation();
                  onMouseMove(event);
                }}
                onMouseUp={(event) => {
                  event.stopPropagation();
                  onMouseUp();
                }}
                onMouseLeave={(event) => {
                  event.stopPropagation();
                  onMouseUp();
                }}
                onPlay={onPlay}
                onPause={onPause}
                onLoadedMetadata={onLoadedMetadata}
                onTimeUpdate={onTimeUpdate}
                onEnded={onEnded}
                onClick={onVideoClick}
                onError={onError}
                onCanPlay={onCanPlay}
              />
              <SubtitleOverlay
                videoRef={videoRef}
                sourceKey={subtitleSourceKey}
                cues={subtitleCues}
                currentTime={currentTime}
                offsetSeconds={subtitleOffset}
                size={subtitleSize}
                color={subtitleColor}
                background={subtitleBackground}
              />
            </div>
          </SubtitleController>
        )}
      </div>
    )}

    {showVolumeOverlay && (
      <div className="absolute top-4 left-4 transition-opacity duration-300">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 bg-discord-accent rounded-full">
            {isMuted || volume === 0 ? (
              <VolumeX size={16} className="text-white" />
            ) : (
              <Volume2 size={16} className="text-white" />
            )}
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-white">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </div>
          </div>
        </div>
      </div>
    )}

    {showPlaybackOverlay && (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all duration-300 ${
          playbackOverlayVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        }`}>
          {playbackOverlayState === 'pause' ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1" />}
        </div>
      </div>
    )}

    <ViewerToolbar
      showControls={showControls}
      currentTime={currentTime}
      duration={duration}
      loopRange={loopRange}
      loopDraft={loopDraft}
      isPlaying={isPlaying}
      isMuted={isMuted}
      volume={volume}
      isLooping={isLooping}
      playbackSpeed={playbackSpeed}
      showSpeedMenu={showSpeedMenu}
      isFullscreen={isFullscreen}
      showBookmarks={showBookmarks}
      bookmarks={bookmarks}
      timelinePreview={timelinePreview}
      overlayClassName={toolbarOverlayClassName}
      onSeek={onSeek}
      onSeekBarMouseDown={onSeekBarMouseDown}
      onTimelinePreviewMove={onTimelinePreviewMove}
      onTimelinePreviewLeave={onTimelinePreviewLeave}
      onPlayPause={onPlayPause}
      onMuteToggle={onMuteToggle}
      onVolumeChange={onVolumeChange}
      onLoopToggle={onLoopToggle}
      onSpeedMenuToggle={onSpeedMenuToggle}
      onSpeedChange={onSpeedChange}
      onFullscreenToggle={onFullscreenToggle}
      onBookmarkClick={onBookmarkClick}
      onBookmarkContextMenu={onBookmarkContextMenu}
      onToggleBookmark={onToggleBookmark}
    />
  </div>
  );
};
