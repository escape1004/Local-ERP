import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import unzipper from 'unzipper';
import {
  appDataDir,
  currentProfileId,
  db,
  getCurrentProfileIdOrThrow,
  getProfileById,
  getSqlPlaceholders,
  log,
} from '../store';
import crypto from 'crypto';
import { getRecordThumbnailHash, getThumbnailHash } from '../lib/files';
import { getAutoThumbnailTimestamp } from '../lib/media-time';
import { cleanupRelationReferencesForDatabase } from '../database/relations';
import { electronDistDir, getFfmpegToolPaths, getUnpackedFfprobePath } from '../ffmpeg-paths';
import {
  ARCHIVE_IMAGE_RE,
  ARCHIVE_VIDEO_RE,
  ensureArchiveVideoExtracted,
  listArchiveFileEntries,
  normalizeZipPath,
} from './archives';
import { extractEmbeddedVideoCover } from './video-cover';

export { getAutoThumbnailTimestamp };

export const CUSTOM_THUMBNAIL_FLAG = '__customThumbnail';

export function setRecordCustomThumbnailFlag(recordId, enabled) {
  if (!recordId) return;

  try {
    const row = db.prepare('SELECT data FROM records WHERE id = ?').get(recordId);
    if (!row?.data) return;

    const data = JSON.parse(row.data);
    const currentlyEnabled = data[CUSTOM_THUMBNAIL_FLAG] === true;
    if (enabled) {
      if (currentlyEnabled) return;
      data[CUSTOM_THUMBNAIL_FLAG] = true;
    } else if (Object.prototype.hasOwnProperty.call(data, CUSTOM_THUMBNAIL_FLAG)) {
      delete data[CUSTOM_THUMBNAIL_FLAG];
    } else {
      return;
    }

    db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), recordId);
  } catch (error) {
    log('커스텀 썸네일 플래그 갱신 실패:', {
      recordId,
      enabled,
      error: error?.message,
    });
  }
}

export function generateUUID() {
  return crypto.randomUUID();
}

export function sanitizeThumbnailPathSegment(value, fallback = 'unknown') {
  const sanitized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
}

export function getThumbnailRootDir() {
  return path.join(appDataDir, 'thumbnails');
}

export function getLegacyThumbnailPath(filePath) {
  const hash = getThumbnailHash(filePath);
  return path.join(getThumbnailRootDir(), `thumb_${hash}.jpg`);
}

export function getThumbnailCategorySegments(categoryId, profileId) {
  if (!categoryId || !profileId) {
    return ['uncategorized'];
  }

  const categories: any[] = db.prepare('SELECT id, name, parentId FROM categories WHERE profileId = ?').all(profileId);
  const categoriesById = new Map(categories.map(category => [category.id, category]));
  const segments: string[] = [];
  const seen = new Set();
  let current = categoriesById.get(categoryId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    segments.unshift(sanitizeThumbnailPathSegment(current.name, current.id));
    current = current.parentId ? categoriesById.get(current.parentId) : null;
  }

  return segments.length > 0 ? segments : ['uncategorized'];
}

export function resolveThumbnailContext(context: any = {}) {
  let recordId = context?.recordId || null;
  let categoryId = context?.categoryId || null;
  let profileId = context?.profileId || currentProfileId || null;

  if (recordId) {
    const record = profileId
      ? db.prepare('SELECT id, categoryId, profileId FROM records WHERE id = ? AND profileId = ?').get(recordId, profileId)
      : db.prepare('SELECT id, categoryId, profileId FROM records WHERE id = ?').get(recordId);

    if (record) {
      categoryId = record.categoryId || categoryId;
      profileId = record.profileId || profileId;
    }
  }

  return { recordId, categoryId, profileId };
}

export function getStructuredThumbnailDir(context: any = {}) {
  const { categoryId, profileId } = resolveThumbnailContext(context);
  const profile = profileId ? getProfileById(profileId) : null;
  const profileSegment = sanitizeThumbnailPathSegment(profile?.name || profileId, 'profile');
  const categorySegments = getThumbnailCategorySegments(categoryId, profileId);

  return path.join(getThumbnailRootDir(), profileSegment, ...categorySegments);
}

export function getThumbnailPathForContext(filePath, context: any = {}) {
  const thumbnailDir = getStructuredThumbnailDir(context);
  const { recordId } = resolveThumbnailContext(context);
  const hash = getRecordThumbnailHash(filePath, recordId);
  return {
    thumbnailDir,
    thumbnailPath: path.join(thumbnailDir, `thumb_${hash}.jpg`)
  };
}

export function getPreviousStructuredThumbnailPath(filePath, context: any = {}) {
  return path.join(getStructuredThumbnailDir(context), `thumb_${getThumbnailHash(filePath)}.jpg`);
}

export function ensureThumbnailDirForContext(filePath, context: any = {}) {
  const target = getThumbnailPathForContext(filePath, context);
  if (!fs.existsSync(target.thumbnailDir)) {
    fs.mkdirSync(target.thumbnailDir, { recursive: true });
    log('thumbnail directory created:', target.thumbnailDir);
  }

  return target;
}

export function getThumbnailContextForRecordLike(record) {
  if (!record) {
    return resolveThumbnailContext({});
  }

  return resolveThumbnailContext({
    recordId: record.id,
    categoryId: record.categoryId,
    profileId: record.profileId || currentProfileId || null
  });
}

export function copyLegacyThumbnailToStructuredPath(filePath, context: any = {}) {
  try {
    const { thumbnailPath } = ensureThumbnailDirForContext(filePath, context);
    const candidatePaths = [
      getPreviousStructuredThumbnailPath(filePath, context),
      getLegacyThumbnailPath(filePath)
    ];

    for (const sourcePath of [...new Set(candidatePaths)]) {
      if (sourcePath === thumbnailPath || !fs.existsSync(sourcePath)) {
        continue;
      }

      if (!fs.existsSync(thumbnailPath)) {
        // A path-based thumbnail may still be shared by records created before
        // record-scoped storage was introduced. Copy it and leave cleanup to the
        // orphan-thumbnail pass after every record has migrated.
        fs.copyFileSync(sourcePath, thumbnailPath);
      }

      return fs.existsSync(thumbnailPath) ? thumbnailPath : null;
    }

    return null;
  } catch (error) {
    log('legacy thumbnail migration failed:', error);
    return null;
  }
}

export function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function removeEmptyThumbnailDirsUpward(startDir) {
  if (!startDir) return;

  const thumbnailRoot = getThumbnailRootDir();
  let currentDir = startDir;

  while (currentDir) {
    const relative = path.relative(thumbnailRoot, currentDir);
    const isInsideRoot = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    if (!isInsideRoot) {
      break;
    }

    if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
      currentDir = path.dirname(currentDir);
      continue;
    }

    if (fs.readdirSync(currentDir).length > 0) {
      break;
    }

    fs.rmdirSync(currentDir);
    if (currentDir === thumbnailRoot) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }
}

export function relocateThumbnailFile(sourcePath, targetPath) {
  if (!sourcePath || !targetPath || sourcePath === targetPath || !fs.existsSync(sourcePath)) {
    return false;
  }

  ensureDirectoryExists(path.dirname(targetPath));

  if (!fs.existsSync(targetPath)) {
    try {
      fs.renameSync(sourcePath, targetPath);
    } catch (_error) {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
    }
  } else if (fs.existsSync(sourcePath)) {
    fs.unlinkSync(sourcePath);
  }

  removeEmptyThumbnailDirsUpward(path.dirname(sourcePath));
  return true;
}

export function collectThumbnailMigrationEntries(categoryIds, profileId) {
  if (!categoryIds?.length || !profileId) {
    return [];
  }

  const categories = db.prepare(`SELECT id, fields FROM categories WHERE profileId = ? AND id IN (${getSqlPlaceholders(categoryIds.length)})`).all(profileId, ...categoryIds);
  const fileFieldByCategoryId = new Map();

  categories.forEach(category => {
    const fields = JSON.parse(category.fields);
    const fileField = fields.find(field => field.type === 'file');
    if (fileField) {
      fileFieldByCategoryId.set(category.id, fileField.id);
    }
  });

  if (fileFieldByCategoryId.size === 0) {
    return [];
  }

  const records = db.prepare(`SELECT id, categoryId, profileId, data, thumbnailPath FROM records WHERE profileId = ? AND categoryId IN (${getSqlPlaceholders(categoryIds.length)})`).all(profileId, ...categoryIds);

  return records.flatMap(record => {
    const fileFieldId = fileFieldByCategoryId.get(record.categoryId);
    if (!fileFieldId) {
      return [];
    }

    const data = JSON.parse(record.data);
    const filePath = data[fileFieldId];
    if (!filePath || typeof filePath !== 'string' || filePath === '-') {
      return [];
    }

    return [{
      recordId: record.id,
      categoryId: record.categoryId,
      profileId: record.profileId || profileId,
      filePath,
      thumbnailPath: record.thumbnailPath || null
    }];
  });
}

export function getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId): string[] {
  return [...new Set(
    (categoryIds || []).map(categoryId => getStructuredThumbnailDir({ categoryId, profileId }))
  )] as string[];
}

export function migrateStructuredThumbnailEntries(entries) {
  let migratedCount = 0;
  let updatedCount = 0;

  entries.forEach(entry => {
    try {
      const normalizedPath = path.isAbsolute(entry.filePath) ? entry.filePath : path.join(appDataDir, entry.filePath);
      const { thumbnailPath: expectedPath } = getThumbnailPathForContext(normalizedPath, {
        recordId: entry.recordId,
        categoryId: entry.categoryId,
        profileId: entry.profileId
      });

      const candidatePaths = [
        entry.thumbnailPath,
        getPreviousStructuredThumbnailPath(normalizedPath, {
          recordId: entry.recordId,
          categoryId: entry.categoryId,
          profileId: entry.profileId
        }),
        getLegacyThumbnailPath(normalizedPath)
      ].filter(Boolean);

      for (const candidatePath of [...new Set(candidatePaths)]) {
        if (candidatePath && candidatePath !== expectedPath && fs.existsSync(candidatePath)) {
          ensureDirectoryExists(path.dirname(expectedPath));
          if (!fs.existsSync(expectedPath)) {
            fs.copyFileSync(candidatePath, expectedPath);
            migratedCount++;
          }
          break;
        }
      }

      if (fs.existsSync(expectedPath)) {
        db.prepare('UPDATE records SET thumbnailPath = ? WHERE id = ?').run(expectedPath, entry.recordId);
        updatedCount++;
      }
    } catch (error) {
      log('thumbnail entry migration failed:', {
        recordId: entry.recordId,
        categoryId: entry.categoryId,
        message: error.message
      });
    }
  });

  return { migratedCount, updatedCount };
}

// 썸네일 파일 삭제 함수
export const deleteThumbnail = (filePath, context: any = {}) => {
  try {
    const normalizedPath = path.isAbsolute(filePath) ? filePath : path.join(appDataDir, filePath);
    const expectedPath = getThumbnailPathForContext(normalizedPath, context).thumbnailPath;
    const candidatePaths = context?.recordId
      ? [expectedPath]
      : [context?.thumbnailPath, expectedPath, getLegacyThumbnailPath(normalizedPath)].filter(Boolean);

    let deleted = false;
    for (const thumbnailPath of [...new Set(candidatePaths)]) {
      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
        removeEmptyThumbnailDirsUpward(path.dirname(thumbnailPath));
        deleted = true;
      }
    }
    return deleted;
  } catch (error) {
    log('썸네일 삭제 실패:', error);
    return false;
  }
};

export function getThumbnailTimestampForFile(filePath, duration) {
  if (typeof filePath !== 'string' || !/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(filePath)) {
    return null;
  }
  return getAutoThumbnailTimestamp(duration);
}

export async function writeVideoFileThumbnail(sourcePath, thumbnailPath, thumbnailDir) {
  const { ffmpegPath, ffprobePath } = getFfmpegToolPaths();
  if (!ffmpegPath || !ffprobePath) {
    log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
    return false;
  }

  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);

  const duration = await new Promise((resolve) => {
    ffmpeg.ffprobe(sourcePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) return resolve(null);
      resolve(Number(metadata.format.duration));
    });
  });

  const embeddedCoverPath = await extractEmbeddedVideoCover(sourcePath, thumbnailPath);
  if (embeddedCoverPath && fs.existsSync(embeddedCoverPath)) {
    return true;
  }

  await new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .screenshots({
        timestamps: [getAutoThumbnailTimestamp(duration)],
        filename: path.basename(thumbnailPath),
        folder: thumbnailDir,
        size: '400x?'
      })
      .on('end', resolve)
      .on('error', reject);
  });

  return fs.existsSync(thumbnailPath);
}

export async function generateThumbnailFromArchive(archivePath, thumbnailPath, thumbnailDir) {
  try {
    const ext = path.extname(archivePath).toLowerCase();
    if (ext === '.7z') {
      log('7z 아카이브 썸네일은 지원하지 않음');
      return null;
    }

    const directory = await unzipper.Open.file(archivePath);
    const files = listArchiveFileEntries(directory);
    const firstImage = files.find((entry) => ARCHIVE_IMAGE_RE.test(entry.path));

    if (firstImage) {
      const buffer = await firstImage.buffer();
      await sharp(buffer)
        .resize(400, 400, { fit: 'inside' })
        .toFile(thumbnailPath);
      log('아카이브 이미지 썸네일 생성 완료:', thumbnailPath);
      return thumbnailPath;
    }

    const firstVideo = files.find((entry) => ARCHIVE_VIDEO_RE.test(entry.path));
    if (!firstVideo) {
      log('아카이브에서 이미지/영상을 찾을 수 없음');
      return null;
    }

    log('아카이브 내 첫 영상으로 썸네일 생성 시도:', firstVideo.path);
    const extractedPath = await ensureArchiveVideoExtracted(archivePath, firstVideo.path);
    if (!extractedPath || !fs.existsSync(extractedPath)) {
      log('아카이브 영상 추출 실패:', firstVideo.path);
      return null;
    }

    const created = await writeVideoFileThumbnail(extractedPath, thumbnailPath, thumbnailDir);
    if (!created) {
      log('아카이브 영상 썸네일 생성 실패:', firstVideo.path);
      return null;
    }

    log('아카이브 영상 썸네일 생성 완료:', thumbnailPath);
    return thumbnailPath;
  } catch (error) {
    log('아카이브 썸네일 생성 실패:', error);
    return null;
  }
}

export async function generateThumbnail(filePath, context: any = {}) {
  try {
    let normalizedPath = filePath;

    if (!path.isAbsolute(filePath)) {
      // appDataDir 사용
      normalizedPath = path.join(appDataDir, filePath);
    }

    if (!fs.existsSync(normalizedPath)) {
      log('파일이 존재하지 않음:', normalizedPath);
      return null;
    }


    // ffmpeg/ffprobe 경로를 여러 후보에서 찾기
    const ffmpegCandidates = [
      path.join(process.resourcesPath, 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(electronDistDir, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffmpeg.exe')
    ];
    const ffprobeCandidates = [
      getUnpackedFfprobePath(),
      path.join(electronDistDir, '..', 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe'),
      path.join(electronDistDir, '..', 'node_modules', '.bin', 'ffprobe.exe')
    ];
    const ffmpegPath = ffmpegCandidates.find(fs.existsSync);
    const ffprobePath = ffprobeCandidates.find(fs.existsSync);
    if (!ffmpegPath || !ffprobePath) {
      log('ffmpeg/ffprobe 경로를 찾을 수 없음', { ffmpegPath, ffprobePath });
      return null;
    }
    ffmpeg.setFfmpegPath(ffmpegPath);
    ffmpeg.setFfprobePath(ffprobePath);

    const ext = path.extname(normalizedPath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    const isVideo = ['.mp4', '.avi', '.mkv', '.mov'].includes(ext);
    const isArchive = ['.zip', '.7z'].includes(ext);

    if (!isImage && !isVideo && !isArchive) {
      log('지원하지 않는 파일 형식:', ext);
      return null;
    }

    const { thumbnailDir, thumbnailPath } = ensureThumbnailDirForContext(normalizedPath, context);

    log('썸네일 생성 시작:', { filePath: normalizedPath, thumbnailPath, fileType: isImage ? 'image' : isVideo ? 'video' : 'archive' });

    if (isImage) {
      await sharp(normalizedPath)
        .resize(400, 400, { fit: 'inside' })
        .toFile(thumbnailPath);
      log('이미지 썸네일 생성 완료:', thumbnailPath);
    } else if (isVideo) {
      const duration = await new Promise((resolve) => {
        ffmpeg.ffprobe(normalizedPath, (err, metadata) => {
          if (err || !metadata?.format?.duration) return resolve(null);
          resolve(Number(metadata.format.duration));
        });
      });
      const embeddedCoverPath = await extractEmbeddedVideoCover(normalizedPath, thumbnailPath);
      if (embeddedCoverPath) {
        log('비디오 메타데이터 커버 썸네일 생성 완료:', embeddedCoverPath);
        return embeddedCoverPath;
      }
      await new Promise<void>((resolve, reject) => {
        ffmpeg(normalizedPath)
          .screenshots({
            timestamps: [getAutoThumbnailTimestamp(duration)],
            filename: path.basename(thumbnailPath),
            folder: thumbnailDir,
            size: '400x?'
          })
          .on('end', () => {
            log('비디오 썸네일 생성 완료:', thumbnailPath);
            resolve();
          })
          .on('error', (err) => {
            log('비디오 썸네일 생성 실패:', err);
            reject(err);
          });
      });
    } else if (isArchive) {
      const archiveThumbnail = await generateThumbnailFromArchive(normalizedPath, thumbnailPath, thumbnailDir);
      if (!archiveThumbnail) return null;
    }

    return thumbnailPath;
  } catch (e) {
    log('Error generating thumbnail:', e);
    return null;
  }
}

// 카테고리의 모든 레코드에서 썸네일 정리
export const cleanupThumbnailsForCategory = (categoryId) => {
  try {
    const category = db.prepare('SELECT fields, profileId FROM categories WHERE id = ?').get(categoryId);
    if (!category) return 0;

    const records = db.prepare('SELECT id, data, thumbnailPath FROM records WHERE categoryId = ? AND profileId = ?').all(categoryId, category.profileId);
    let deletedCount = 0;

    records.forEach(record => {
      const data = JSON.parse(record.data);
      const fields = JSON.parse(category.fields);
      const fileField = fields.find(f => f.type === 'file');

      if (fileField && data[fileField.id]) {
        const filePath = data[fileField.id];
        if (deleteThumbnail(filePath, { recordId: record.id, categoryId, profileId: category.profileId, thumbnailPath: record.thumbnailPath })) {
          deletedCount++;
        }
      }
    });

    return deletedCount;
  } catch (error) {
    log('썸네일 정리 중 오류:', error);
    return 0;
  }
};

// 관계형 데이터에서 참조 정리
export const cleanupRelationReferences = (categoryId) => (
  cleanupRelationReferencesForDatabase(db, categoryId)
);
