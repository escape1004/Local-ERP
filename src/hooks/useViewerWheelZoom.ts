import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ViewerFileType } from '../components/viewer/types';
import {
  isImageFileName,
  isVideoFileName,
  isViewerVolumeSliderTarget,
  isViewerWheelZoomTarget,
  nextVolumeFromWheel,
  nextWheelScale,
  shouldBindViewerWheelZoom,
} from '../components/viewer/viewerLogic';

type Offset = { x: number; y: number };

interface UseViewerWheelZoomOptions {
  isOpen: boolean;
  fileType: ViewerFileType | null;
  detectedFileType: ViewerFileType | null;
  dataUrl: string | null;
  archiveFiles: Array<{ name: string }>;
  currentArchiveIndex: number;
  currentArchiveDataUrl: string | null;
  imgScaleRef: MutableRefObject<number>;
  videoScaleRef: MutableRefObject<number>;
  archiveImgScaleRef: MutableRefObject<number>;
  archiveVideoScaleRef: MutableRefObject<number>;
  setImgScale: Dispatch<SetStateAction<number>>;
  setImgOffset: Dispatch<SetStateAction<Offset>>;
  setVideoScale: Dispatch<SetStateAction<number>>;
  setVideoOffset: Dispatch<SetStateAction<Offset>>;
  setArchiveImgScale: Dispatch<SetStateAction<number>>;
  setArchiveImgOffset: Dispatch<SetStateAction<Offset>>;
  setArchiveVideoScale: Dispatch<SetStateAction<number>>;
  setArchiveVideoOffset: Dispatch<SetStateAction<Offset>>;
  clampToContainer: (offset: Offset, scale: number) => Offset;
}

export function useViewerWheelZoom({
  isOpen,
  fileType,
  detectedFileType,
  dataUrl,
  archiveFiles,
  currentArchiveIndex,
  currentArchiveDataUrl,
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
}: UseViewerWheelZoomOptions) {
  useEffect(() => {
    if (!shouldBindViewerWheelZoom(isOpen)) return;

    const handleWheel = (event: WheelEvent) => {
      if (!isViewerWheelZoomTarget(event.target)) return;

      const effectiveType = fileType || detectedFileType;
      const currentArchiveFile = archiveFiles[currentArchiveIndex];
      const isArchiveImage = isImageFileName(currentArchiveFile?.name);
      const isArchiveVideo = isVideoFileName(currentArchiveFile?.name);

      let currentScale = 0;
      let applyScale: ((nextScale: number) => void) | null = null;

      if (effectiveType === 'image' && dataUrl) {
        currentScale = imgScaleRef.current;
        applyScale = (nextScale) => {
          setImgScale(nextScale);
          setImgOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
        };
      } else if (effectiveType === 'video' && dataUrl) {
        currentScale = videoScaleRef.current;
        applyScale = (nextScale) => {
          setVideoScale(nextScale);
          setVideoOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
        };
      } else if (effectiveType === 'archive' && currentArchiveDataUrl && isArchiveImage) {
        currentScale = archiveImgScaleRef.current;
        applyScale = (nextScale) => {
          setArchiveImgScale(nextScale);
          setArchiveImgOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
        };
      } else if (effectiveType === 'archive' && currentArchiveDataUrl && isArchiveVideo) {
        currentScale = archiveVideoScaleRef.current;
        applyScale = (nextScale) => {
          setArchiveVideoScale(nextScale);
          setArchiveVideoOffset((prevOffset) => (nextScale === 1 ? { x: 0, y: 0 } : clampToContainer(prevOffset, nextScale)));
        };
      }

      if (!applyScale) return;

      event.preventDefault();
      applyScale(nextWheelScale(currentScale, event.deltaY));
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [
    archiveFiles,
    currentArchiveDataUrl,
    currentArchiveIndex,
    clampToContainer,
    dataUrl,
    detectedFileType,
    fileType,
    isOpen,
  ]);
}

export function useViewerVolumeWheel({
  isOpen,
  volume,
  isMuted,
  onVolumeChange,
}: {
  isOpen: boolean;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
}) {
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const onVolumeChangeRef = useRef(onVolumeChange);
  volumeRef.current = volume;
  isMutedRef.current = isMuted;
  onVolumeChangeRef.current = onVolumeChange;

  useEffect(() => {
    if (!shouldBindViewerWheelZoom(isOpen)) return;

    const handleWheel = (event: WheelEvent) => {
      if (!isViewerVolumeSliderTarget(event.target)) return;
      event.preventDefault();
      onVolumeChangeRef.current(nextVolumeFromWheel(volumeRef.current, isMutedRef.current, event.deltaY));
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [isOpen]);
}
