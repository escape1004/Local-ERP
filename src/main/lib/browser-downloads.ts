export type BrowserDownloadKind = 'file' | 'video' | 'audio' | 'image';
export type BrowserDownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted';

export type BrowserDownloadItem = {
  id: string;
  filename: string;
  url: string;
  filePath: string;
  mime?: string;
  kind: BrowserDownloadKind;
  state: BrowserDownloadState;
  receivedBytes: number;
  totalBytes: number;
  createdAt: string;
  completedAt?: string;
};

export function suggestedDownloadKind(filename: string, mime = ''): BrowserDownloadKind {
  const name = filename.toLowerCase();
  const type = mime.toLowerCase();
  if (type.startsWith('video/') || /\.(mp4|webm|mkv|mov|avi)$/i.test(name)) return 'video';
  if (type.startsWith('audio/') || /\.(m4a|mp3|aac|wav|ogg)$/i.test(name)) return 'audio';
  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  return 'file';
}
