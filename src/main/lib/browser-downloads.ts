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

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
};

const KNOWN_EXTENSIONS = new Set([
  ...Object.values(MIME_EXTENSIONS),
  'jpeg',
  'jfif',
  'mp4',
  'webm',
  'mkv',
  'mov',
  'avi',
  'm4a',
  'mp3',
  'aac',
  'wav',
  'ogg',
]);

function normalizeExtension(value: string) {
  const ext = String(value || '').replace(/^\./, '').toLowerCase();
  if (ext === 'jpeg' || ext === 'jfif') return 'jpg';
  return ext;
}

function isKnownExtension(value: string) {
  const ext = normalizeExtension(value);
  return Boolean(ext) && KNOWN_EXTENSIONS.has(ext);
}

function fileStem(name: string, fallback = 'download') {
  const cleaned = String(name || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  const base = cleaned.replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
  const stem = base.replace(/\.[a-z0-9]{2,5}$/i, '');
  return (stem || fallback).slice(0, 120);
}

export function extensionFromMime(mime = '') {
  const type = String(mime || '').toLowerCase().split(';')[0].trim();
  return MIME_EXTENSIONS[type] || '';
}

export function extensionFromDownloadUrl(url: string) {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    const match = last.match(/\.([a-z0-9]{2,5})$/i);
    if (match && isKnownExtension(match[1])) return normalizeExtension(match[1]);
    for (const key of ['format', 'fm', 'ext', 'type']) {
      const value = String(parsed.searchParams.get(key) || '');
      if (isKnownExtension(value)) return normalizeExtension(value);
    }
  } catch {
    // ignore invalid urls
  }
  return '';
}

export function filenameFromContentDisposition(header: string) {
  const text = String(header || '');
  const encoded = text.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      // keep looking at the plain filename
    }
  }
  const plain = text.match(/filename\s*=\s*("(?:\\.|[^"])*"|[^;]+)/i);
  if (!plain?.[1]) return '';
  return plain[1].trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
}

export function suggestedSaveFilename(input: {
  url?: string;
  filename?: string;
  mime?: string;
  kind?: BrowserDownloadKind;
} = {}) {
  const kind = input.kind;
  const fallback = kind === 'image' ? 'image' : 'download';
  let ext = '';
  const named = String(input.filename || '').trim();
  if (named) {
    const match = named.match(/\.([a-z0-9]{2,5})$/i);
    if (match && isKnownExtension(match[1])) ext = normalizeExtension(match[1]);
  }
  if (!ext) ext = extensionFromDownloadUrl(String(input.url || '')) || extensionFromMime(input.mime);
  if (!ext && kind === 'image') ext = 'jpg';

  let last = '';
  try {
    last = decodeURIComponent(new URL(String(input.url || '')).pathname.split('/').filter(Boolean).pop() || '');
  } catch {
    last = '';
  }
  const stem = fileStem(named || last, fallback);
  return ext ? `${stem}.${ext}` : stem;
}

export function ensureFilenameExtension(filePath: string, filename: string) {
  const current = String(filePath || '');
  if (!current) return current;
  if (/\.[a-z0-9]{2,5}$/i.test(current.split(/[/\\]/).pop() || '')) return current;
  const ext = String(filename || '').match(/\.([a-z0-9]{2,5})$/i)?.[1];
  return ext ? `${current}.${ext}` : current;
}
