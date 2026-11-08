import React from 'react';
import { Archive, HelpCircle, ImageOff, ImagePlus, RefreshCw } from 'lucide-react';
import type { DataRecord } from '../../types';
import { getLocalVideoHttpUrl } from '../../lib/local-media';
import { isCustomThumbnailRecord, shouldShowCustomThumbnailBadge, VIDEO_HOVER_PREVIEW_PATTERN } from '../../lib/recordFields';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { formatVideoDurationLabel } from '../viewer/viewerLogic';
import { FIELD_TOOLTIP_CLASSNAME } from './FieldValueRenderer';

const embeddedCoverCache = new Map<string, boolean>();

export const CustomThumbnailBadge: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <div
    className="absolute top-1 left-1 z-20 rounded bg-black/70 p-0.5"
    title="커스텀 썸네일"
  >
    <ImagePlus size={size} className="text-white" />
  </div>
);

export const HoverVideoPreview: React.FC<{
  filePath: string;
  className: string;
  delayMs?: number;
}> = ({ filePath, className, delayMs = 500 }) => {
  const [videoSrc, setVideoSrc] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void window.electronAPI.getFileDataUrl(filePath)
        .then(async (result) => {
          if (cancelled || !result || result === 'error') return;
          if (result === 'stream') {
            setVideoSrc(await getLocalVideoHttpUrl(filePath));
            return;
          }
          setVideoSrc(result);
        })
        .catch(() => {
          if (!cancelled) setVideoSrc(null);
        });
    }, delayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, filePath]);

  if (!videoSrc) return null;

  return (
    <video
      src={videoSrc}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
    />
  );
};

export type ThumbnailPreviewState = {
  dataUrl: string | null;
  filePath: string;
  missingFile: boolean;
  thumbnailFit: 'cover' | 'contain';
  isVideo: boolean;
};

export const ThumbnailCell: React.FC<{
  filePath: string | undefined;
  record: DataRecord | undefined;
  onThumbnailClick: (filePath: string) => void;
  thumbnailFit: 'cover' | 'contain';
  thumbnailOnly?: boolean;
  sizeClassName?: string;
  sizeStyle?: React.CSSProperties;
  videoHoverPreviewEnabled?: boolean;
  inlineVideoPreview?: boolean;
  showStatusIcons?: boolean;
  fileExtensionAlign?: 'left' | 'right';
  showVideoDuration?: boolean;
  onPreviewChange?: (preview: ThumbnailPreviewState | null) => void;
}> = ({
  filePath,
  record,
  onThumbnailClick,
  thumbnailFit,
  thumbnailOnly = false,
  sizeClassName = 'w-24 h-24',
  sizeStyle,
  videoHoverPreviewEnabled = true,
  inlineVideoPreview = false,
  showStatusIcons = true,
  fileExtensionAlign = 'right',
  showVideoDuration = false,
  onPreviewChange,
}) => {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [fileExists, setFileExists] = React.useState<boolean | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const [hasEmbeddedCover, setHasEmbeddedCover] = React.useState(false);
  const [customThumbnailOverride, setCustomThumbnailOverride] = React.useState<boolean | null>(null);
  const hasRetriedAfterErrorRef = React.useRef(false);
  const reloadThumbnail = React.useCallback(() => {
    if (!filePath || !record) {
      setDataUrl(null);
      return;
    }
    window.electronAPI.getThumbnailDataUrlHybrid(record, filePath).then((res) => {
      setDataUrl(res);
    });
  }, [filePath, record]);

  React.useEffect(() => {
    let ignore = false;
    if (filePath && record) {
      hasRetriedAfterErrorRef.current = false;
      window.electronAPI.getThumbnailDataUrlHybrid(record, filePath).then((res) => {
        if (!ignore) setDataUrl(res);
      });
    } else {
      setDataUrl(null);
    }
    return () => { ignore = true; };
  }, [filePath, record]);

  React.useEffect(() => {
    let ignore = false;
    if (thumbnailOnly) {
      setFileExists(true);
      return () => { ignore = true; };
    }
    if (filePath) {
      window.electronAPI.checkFileExists(filePath).then((exists) => {
        if (!ignore) setFileExists(exists);
      });
    } else {
      setFileExists(null);
    }
    return () => { ignore = true; };
  }, [filePath, thumbnailOnly]);

  const handleThumbnailImageError = React.useCallback(() => {
    if (!filePath || !record || hasRetriedAfterErrorRef.current) {
      setDataUrl(null);
      return;
    }
    hasRetriedAfterErrorRef.current = true;
    setDataUrl(null);
    window.electronAPI.regenerateThumbnail(filePath, {
      recordId: record.id,
      categoryId: record.categoryId,
    })
      .catch(() => null)
      .finally(() => {
        reloadThumbnail();
      });
  }, [filePath, record, reloadThumbnail]);

  const getFileExtension = (path: string) => path.slice(path.lastIndexOf('.')).toLowerCase();
  const isHashBased = record && !record.thumbnailPath;
  const missingFile = !thumbnailOnly && !!filePath && fileExists === false;
  const canOpen = !!filePath && fileExists !== false && !thumbnailOnly;
  const isArchiveFile = !!filePath && /\.(zip|7z)$/i.test(filePath);
  const isVideoFile = !!filePath && VIDEO_HOVER_PREVIEW_PATTERN.test(filePath);
  const flaggedCustomThumbnail = isCustomThumbnailRecord(record);
  const showCustomThumbnailBadge = shouldShowCustomThumbnailBadge({
    flagged: flaggedCustomThumbnail,
    hasEmbeddedCover,
    override: customThumbnailOverride,
  });

  React.useEffect(() => {
    setCustomThumbnailOverride(null);
  }, [filePath, record?.id]);

  React.useEffect(() => {
    if (customThumbnailOverride == null) return;
    if (customThumbnailOverride === flaggedCustomThumbnail) {
      setCustomThumbnailOverride(null);
    }
  }, [customThumbnailOverride, flaggedCustomThumbnail]);

  React.useEffect(() => {
    const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string; customThumbnail?: boolean }>) => {
      if (filePath && event.detail.filePath === filePath) {
        embeddedCoverCache.delete(filePath);
        setDataUrl(null);
        reloadThumbnail();
        if (typeof event.detail.customThumbnail === 'boolean') {
          setCustomThumbnailOverride(event.detail.customThumbnail);
        }
        if (!isVideoFile) {
          setHasEmbeddedCover(false);
          return;
        }
        window.electronAPI.getVideoCodecInfo(filePath)
          .then((info) => {
            const hasCover = info?.hasEmbeddedCover === true;
            embeddedCoverCache.set(filePath, hasCover);
            setHasEmbeddedCover(hasCover);
          })
          .catch(() => {
            embeddedCoverCache.set(filePath, false);
            setHasEmbeddedCover(false);
          });
      }
    };
    window.addEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
    return () => {
      window.removeEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
    };
  }, [filePath, isVideoFile, record, reloadThumbnail]);
  const showInlineVideoPreview = videoHoverPreviewEnabled
    && inlineVideoPreview
    && isHovered
    && isVideoFile
    && canOpen;

  React.useEffect(() => {
    if (!showStatusIcons || !isVideoFile || !filePath || flaggedCustomThumbnail) {
      setHasEmbeddedCover(false);
      return undefined;
    }

    const cached = embeddedCoverCache.get(filePath);
    if (cached !== undefined) {
      setHasEmbeddedCover(cached);
      return undefined;
    }

    let ignore = false;
    window.electronAPI.getVideoCodecInfo(filePath)
      .then((info) => {
        const hasCover = info?.hasEmbeddedCover === true;
        embeddedCoverCache.set(filePath, hasCover);
        if (!ignore) setHasEmbeddedCover(hasCover);
      })
      .catch(() => {
        embeddedCoverCache.set(filePath, false);
        if (!ignore) setHasEmbeddedCover(false);
      });

    return () => {
      ignore = true;
    };
  }, [filePath, flaggedCustomThumbnail, isVideoFile, showStatusIcons]);

  React.useEffect(() => {
    if (!onPreviewChange) return;
    if (!isHovered || !filePath) {
      onPreviewChange(null);
      return;
    }
    onPreviewChange({
      dataUrl,
      filePath,
      missingFile,
      thumbnailFit,
      isVideo: videoHoverPreviewEnabled && isVideoFile && canOpen,
    });
  }, [onPreviewChange, isHovered, filePath, dataUrl, missingFile, thumbnailFit, videoHoverPreviewEnabled, isVideoFile, canOpen]);

  const thumbnailBody = (
    <div
      className={cn('relative', sizeClassName)}
      style={sizeStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {dataUrl ? (
        <>
          <img
            src={dataUrl}
            alt="썸네일"
            className={`${sizeClassName} ${thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'} rounded border border-gray-700 ${canOpen ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
            style={sizeStyle}
            onClick={() => filePath && canOpen && onThumbnailClick(filePath)}
            onError={handleThumbnailImageError}
          />
          {showStatusIcons && showCustomThumbnailBadge && <CustomThumbnailBadge />}
          {showStatusIcons && isHashBased && !showCustomThumbnailBadge && (
            <div className="absolute top-1 left-1 z-10">
              <RefreshCw size={16} className="text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]" />
            </div>
          )}
          {missingFile && (
            <div className="absolute inset-0 flex items-center justify-center">
              <HelpCircle size={20} className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
            </div>
          )}
        </>
      ) : filePath ? (
        <div
          className={`${sizeClassName} flex items-center justify-center rounded border border-dashed border-[#4f545c] bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.20),_transparent_58%),linear-gradient(180deg,_#2b2d31_0%,_#1e1f22_100%)] text-[#b5bac1] transition-colors ${canOpen ? 'cursor-pointer hover:border-[#6d73c9] hover:bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.30),_transparent_58%),linear-gradient(180deg,_#313338_0%,_#232428_100%)]' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
          style={sizeStyle}
          onClick={() => canOpen && onThumbnailClick(filePath)}
        >
          {missingFile ? (
            <HelpCircle size={20} className="text-[#dcddde]" />
          ) : isArchiveFile ? (
            <Archive size={24} className="text-[#f0b232]" />
          ) : (
            <ImageOff size={22} className="text-[#b9bbbe]" />
          )}
        </div>
      ) : (
        <div className={`${sizeClassName} flex items-center justify-center rounded border border-dashed border-[#3b3f46] bg-[linear-gradient(180deg,_#232428_0%,_#18191c_100%)] text-[#72767d]`} style={sizeStyle}>
          <ImageOff size={20} className="text-[#72767d]" />
        </div>
      )}
      {showInlineVideoPreview && filePath && (
        <HoverVideoPreview
          filePath={filePath}
          className={`pointer-events-none absolute inset-0 h-full w-full rounded border border-gray-700 ${
            thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'
          }`}
        />
      )}
      {filePath && !thumbnailOnly && (
        <div className={`absolute bottom-1 z-10 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded ${
          fileExtensionAlign === 'left' ? 'left-1' : 'right-1'
        }`}>
          {getFileExtension(filePath)}
        </div>
      )}
      {showVideoDuration && isVideoFile && typeof record?.duration === 'number' && record.duration > 0 && (
        <div className="absolute bottom-1 right-1 z-10 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded">
          {formatVideoDurationLabel(record.duration)}
        </div>
      )}
    </div>
  );

  if (thumbnailOnly) return thumbnailBody;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {thumbnailBody}
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
          {filePath ? (missingFile ? '원본 파일이 존재하지 않습니다' : dataUrl ? '썸네일 클릭 시 뷰어 모달 열기' : isArchiveFile ? '클릭 시 뷰어 모달 열기 (압축파일)' : '클릭 시 뷰어 모달 열기 (썸네일 없음)') : '첨부파일이 없습니다'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
