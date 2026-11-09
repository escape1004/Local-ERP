import type { SubtitleCue } from '../../lib/subtitle';

export type ViewerFileType = 'image' | 'video' | 'archive';
export type ViewerFitMode = 'original' | 'contain';

export interface ViewerModalProps {
  isOpen: boolean;
  filePath: string;
  fileType: ViewerFileType | null;
  categoryId?: string;
  recordId?: string;
  onClose: () => void;
}

export interface ArchiveFile {
  name: string;
  size: number;
  isDirectory: boolean;
  isSupported?: boolean;
  data?: Buffer;
}

export interface SubtitleSource {
  id: string;
  name: string;
  cues: SubtitleCue[];
}

export type SubtitleSize = 'small' | 'medium' | 'large';
export type SubtitleColor = 'white' | 'yellow';
export type SubtitleBackground = 'none' | 'translucent' | 'dark';

export type PlaybackOverlayState = 'play' | 'pause';

export interface LoopRange {
  start: number;
  end: number;
}

export interface MediaBookmark {
  time: number;
  createdAt: string;
}
