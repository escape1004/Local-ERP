import path from 'path';
import crypto from 'crypto';
import { resolveUserFilePath } from './security';

// Keep in sync with src/lib/pathResolver.ts so dashboard warnings match the viewer.
export function resolveRecordStoredFilePath(rawPath, field) {
  if (rawPath == null) return null;

  const storedPath = String(rawPath).trim();
  if (!storedPath || storedPath === '-') return null;
  if (!field || field.pathMode !== 'base' || !field.basePath) return storedPath;

  const fileName = storedPath.split(/[\\/]/).pop();
  if (!fileName) return storedPath;

  const basePath = field.basePath;
  const sep = basePath.includes('\\') ? '\\' : '/';
  const trimmedBase =
    basePath.endsWith('\\') || basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  return `${trimmedBase}${sep}${fileName}`;
}

export function resolveRecordFileSystemPath(rawPath, field, rootDir) {
  const storedPath = resolveRecordStoredFilePath(rawPath, field);
  return storedPath ? resolveUserFilePath(storedPath, rootDir) : null;
}

export const FILE_EXTENSIONS = {
  image: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']),
  video: new Set(['.mp4', '.avi', '.mkv', '.mov']),
  archive: new Set(['.zip', '.7z'])
};

export function getFileTypeFromPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'other';

  const extension = path.win32.extname(filePath).toLowerCase();
  if (FILE_EXTENSIONS.image.has(extension)) return 'image';
  if (FILE_EXTENSIONS.video.has(extension)) return 'video';
  if (FILE_EXTENSIONS.archive.has(extension)) return 'archive';
  return 'other';
}

export function getThumbnailHash(filePath) {
  const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1').update(normalizedPath).digest('hex');
}

export function getRecordThumbnailHash(filePath, recordId = null) {
  if (!recordId) {
    return getThumbnailHash(filePath);
  }

  const normalizedPath = filePath.trim().replace(/\\/g, '/').toLowerCase();
  return crypto.createHash('sha1')
    .update(normalizedPath)
    .update('\0record:')
    .update(String(recordId))
    .digest('hex');
}
