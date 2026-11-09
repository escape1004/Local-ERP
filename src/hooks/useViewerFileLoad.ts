import { useEffect } from 'react';
import type { ViewerFileType } from '../components/viewer/types';
import { toViewerFileType } from '../components/viewer/viewerLogic';
import { getLocalVideoHttpUrl } from '../lib/local-media';

interface UseViewerFileLoadOptions {
  displayFilePath: string;
  displayFileType: ViewerFileType | null;
  setDataUrl: (url: string | null) => void;
  setLoading: (value: boolean) => void;
  setFileNotFound: (value: boolean) => void;
  setDetectedFileType: (value: ViewerFileType | null) => void;
  loadArchiveFiles: () => Promise<void> | void;
  resetArchiveState: () => void;
  setIsPlaying: (value: boolean) => void;
  setVideoError: (value: string | null) => void;
  setPlaybackSpeed: (value: number) => void;
}

export function useViewerFileLoad({
  displayFilePath,
  displayFileType,
  setDataUrl,
  setLoading,
  setFileNotFound,
  setDetectedFileType,
  loadArchiveFiles,
  resetArchiveState,
  setIsPlaying,
  setVideoError,
  setPlaybackSpeed,
}: UseViewerFileLoadOptions) {
  useEffect(() => {
    if (!displayFilePath) {
      setDataUrl(null);
      resetArchiveState();
      setIsPlaying(false);
      setVideoError(null);
      setFileNotFound(false);
      setPlaybackSpeed(1.0);
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
          setPlaybackSpeed(1.0);
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
          Promise.resolve(loadArchiveFiles()).catch((error) => {
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
      setPlaybackSpeed(1.0);
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
      void loadArchiveFiles();
    } else {
      setDataUrl(null);
    }

    return () => {
      cancelled = true;
    };
  }, [
    loadArchiveFiles,
    resetArchiveState,
    displayFilePath,
    displayFileType,
    setDataUrl,
    setDetectedFileType,
    setFileNotFound,
    setIsPlaying,
    setLoading,
    setPlaybackSpeed,
    setVideoError,
  ]);
}
