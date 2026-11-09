import React from 'react';
import { Pause, Play } from 'lucide-react';
import { AnimatedGif } from '../AnimatedGif';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { ViewerFitMenuItems } from './ViewerFitMenu';
import type { PlaybackOverlayState, ViewerFitMode } from './types';
import { getViewerImageClassName } from './viewerLogic';

interface ImageViewerProps {
  src: string;
  alt: string;
  isGif: boolean;
  paused: boolean;
  scale: number;
  offset: { x: number; y: number };
  rotation: number;
  isPanning: boolean;
  imageRef: React.RefObject<HTMLImageElement>;
  gifCanvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  fitMode: ViewerFitMode;
  onFitModeChange: (mode: ViewerFitMode) => void;
  showPlaybackOverlay?: boolean;
  playbackOverlayState?: PlaybackOverlayState;
  playbackOverlayVisible?: boolean;
  className?: string;
  wrapperClassName?: string;
  containerStyle?: React.CSSProperties;
  onMouseDown: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseUp: () => void;
  onGifClick?: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({
  src,
  alt,
  isGif,
  paused,
  scale,
  offset,
  rotation,
  isPanning,
  imageRef,
  gifCanvasRef,
  containerRef,
  fitMode,
  onFitModeChange,
  showPlaybackOverlay = false,
  playbackOverlayState = 'play',
  playbackOverlayVisible = false,
  className,
  wrapperClassName = 'relative flex h-full w-full items-center justify-center overflow-hidden',
  containerStyle,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onGifClick,
}) => {
  const mediaClassName = className ?? getViewerImageClassName(fitMode);
  const style: React.CSSProperties = {
    ...(fitMode === 'contain'
      ? { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }
      : { maxWidth: '100%', maxHeight: '100%' }),
    transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px) rotate(${rotation}deg)`,
    cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : (isGif ? 'pointer' : 'default'),
    transition: isPanning ? 'none' : 'transform 0.2s',
  };

  const pointerHandlers = {
    onMouseDown: (event: React.MouseEvent) => {
      event.stopPropagation();
      onMouseDown(event);
    },
    onMouseMove: (event: React.MouseEvent) => {
      event.stopPropagation();
      onMouseMove(event);
    },
    onMouseUp: (event: React.MouseEvent) => {
      event.stopPropagation();
      onMouseUp();
    },
    onMouseLeave: (event: React.MouseEvent) => {
      event.stopPropagation();
      onMouseUp();
    },
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div ref={containerRef} className={wrapperClassName} style={containerStyle} data-viewer-zoom>
          {isGif ? (
            <AnimatedGif
              ref={gifCanvasRef}
              src={src}
              paused={paused}
              aria-label={alt}
              className={mediaClassName}
              style={style}
              {...pointerHandlers}
              onClick={onGifClick}
            />
          ) : (
            <img
              src={src}
              alt={alt}
              className={mediaClassName}
              style={style}
              draggable={false}
              ref={imageRef}
              {...pointerHandlers}
            />
          )}
          {isGif && showPlaybackOverlay && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className={`flex h-20 w-20 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-all duration-300 ${
                playbackOverlayVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
              }`}>
                {playbackOverlayState === 'pause' ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" className="ml-1" />}
              </div>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[80] min-w-[180px]">
        <ViewerFitMenuItems fitMode={fitMode} onFitModeChange={onFitModeChange} />
      </ContextMenuContent>
    </ContextMenu>
  );
};
