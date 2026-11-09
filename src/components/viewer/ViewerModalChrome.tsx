import { Archive, FileImage, FileVideo, Minimize, RotateCcw, RotateCw, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export const viewerTooltipClassName = "relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words";

interface ViewerModalHeaderProps {
  isFullscreen: boolean;
  fileName: string;
  effectiveFileType: 'image' | 'video' | 'archive' | null;
  archivePositionLabel?: string;
  onClose: () => void;
}

export function ViewerModalHeader({
  isFullscreen,
  fileName,
  effectiveFileType,
  archivePositionLabel,
  onClose,
}: ViewerModalHeaderProps) {
  if (isFullscreen) return null;

  return (
    <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700">
      <div className="flex items-center gap-3">
        {effectiveFileType === 'image' && <FileImage size={20} className="text-blue-400" />}
        {effectiveFileType === 'video' && <FileVideo size={20} className="text-green-400" />}
        {effectiveFileType === 'archive' && <Archive size={20} className="text-orange-400" />}
        <span className="text-discord-text font-medium truncate max-w-md">{fileName}</span>
        {effectiveFileType === 'archive' && archivePositionLabel && (
          <span className="text-discord-muted text-sm">{archivePositionLabel}</span>
        )}
      </div>
      <button onClick={onClose} className="text-discord-muted hover:text-white transition-colors">
        <X size={24} />
      </button>
    </div>
  );
}

interface ViewerRotateOverlayProps {
  isFullscreen: boolean;
  canRotateCurrentFile: boolean;
  isCurrentVideo: boolean;
  onExitFullscreen: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
}

export function ViewerRotateOverlay({
  isFullscreen,
  canRotateCurrentFile,
  isCurrentVideo,
  onExitFullscreen,
  onRotateLeft,
  onRotateRight,
}: ViewerRotateOverlayProps) {
  if (!(canRotateCurrentFile || (isFullscreen && !isCurrentVideo))) return null;

  return (
    <div className="absolute top-4 right-4 z-20 flex gap-2">
      {isFullscreen && !isCurrentVideo && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onExitFullscreen}
                aria-label="전체화면 해제"
                className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
              >
                <Minimize size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className={viewerTooltipClassName}>전체화면 해제 (F)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {canRotateCurrentFile && (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRotateLeft}
                  className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                >
                  <RotateCcw size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className={viewerTooltipClassName}>왼쪽으로 90도 회전</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRotateRight}
                  className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                >
                  <RotateCw size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className={viewerTooltipClassName}>오른쪽으로 90도 회전</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  );
}
