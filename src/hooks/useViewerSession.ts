import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewerFileType } from '../components/viewer/types';
import { clampPanOffset, getOpenViewerSourceKey } from '../components/viewer/viewerLogic';

interface UseViewerSessionOptions {
  isOpen: boolean;
  filePath: string;
  fileType: ViewerFileType | null;
  categoryId?: string;
  recordId?: string;
}

export function useViewerSession({
  isOpen,
  filePath,
  fileType,
  categoryId = '',
  recordId = '',
}: UseViewerSessionOptions) {
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

  const modalContainerRef = useRef<HTMLDivElement>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const imageGifCanvasRef = useRef<HTMLCanvasElement>(null);
  const archiveImgRef = useRef<HTMLImageElement>(null);
  const archiveGifCanvasRef = useRef<HTMLCanvasElement>(null);
  const panStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const archivePanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const archiveVideoPanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const videoPanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const imgScaleRef = useRef(1);
  const videoScaleRef = useRef(1);
  const archiveImgScaleRef = useRef(1);
  const archiveVideoScaleRef = useRef(1);

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

  const resetTransforms = useCallback(() => {
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
  }, []);

  useEffect(() => { videoScaleRef.current = videoScale; }, [videoScale]);
  useEffect(() => { imgScaleRef.current = imgScale; }, [imgScale]);
  useEffect(() => { archiveImgScaleRef.current = archiveImgScale; }, [archiveImgScale]);
  useEffect(() => { archiveVideoScaleRef.current = archiveVideoScale; }, [archiveVideoScale]);

  const clampToContainer = useCallback((offset: { x: number; y: number }, scale: number) => {
    if (!imgContainerRef.current) return offset;
    const rect = imgContainerRef.current.getBoundingClientRect();
    return clampPanOffset(offset, scale, rect.width, rect.height);
  }, []);

  return {
    displayFilePath,
    displayFileType,
    displayCategoryId,
    displayRecordId,
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
  };
}
