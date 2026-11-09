import { useEffect, useMemo, useState } from 'react';
import type { ArchiveFile, SubtitleBackground, SubtitleColor, SubtitleSize, SubtitleSource, ViewerFileType } from '../components/viewer/types';
import { findArchiveSubtitles, isVideoFileName } from '../components/viewer/viewerLogic';
import { parseSubtitle } from '../lib/subtitle';

interface UseViewerSubtitlesOptions {
  isOpen: boolean;
  displayFilePath: string;
  displayFileType: ViewerFileType | null;
  detectedFileType: ViewerFileType | null;
  archiveFiles: ArchiveFile[];
  currentArchiveIndex: number;
}

export function useViewerSubtitles({
  isOpen,
  displayFilePath,
  displayFileType,
  detectedFileType,
  archiveFiles,
  currentArchiveIndex,
}: UseViewerSubtitlesOptions) {
  const [subtitles, setSubtitles] = useState<SubtitleSource[]>([]);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleSize, setSubtitleSize] = useState<SubtitleSize>(() => {
    const saved = localStorage.getItem('subtitleSize');
    return saved === 'small' || saved === 'large' ? saved : 'medium';
  });
  const [subtitleColor, setSubtitleColor] = useState<SubtitleColor>(() => (
    localStorage.getItem('subtitleColor') === 'yellow' ? 'yellow' : 'white'
  ));
  const [subtitleBackground, setSubtitleBackground] = useState<SubtitleBackground>(() => {
    const saved = localStorage.getItem('subtitleBackground');
    return saved === 'none' || saved === 'dark' ? saved : 'translucent';
  });

  const activeSubtitleCues = useMemo(() => {
    const activeSubtitle = subtitles.find((subtitle) => subtitle.id === activeSubtitleId);
    return activeSubtitle?.cues || [];
  }, [activeSubtitleId, subtitles]);

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
        } else if (effectiveType === 'archive' && currentArchiveIndex >= 0) {
          const currentFile = archiveFiles[currentArchiveIndex];
          if (currentFile && isVideoFileName(currentFile.name)) {
            const matches = findArchiveSubtitles(archiveFiles, currentFile.name);
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
  }, [archiveFiles, currentArchiveIndex, detectedFileType, displayFilePath, displayFileType, isOpen]);

  return {
    subtitles,
    activeSubtitleId,
    setActiveSubtitleId,
    subtitleOffset,
    setSubtitleOffset,
    subtitleSize,
    setSubtitleSize,
    subtitleColor,
    setSubtitleColor,
    subtitleBackground,
    setSubtitleBackground,
    activeSubtitleCues,
  };
}
