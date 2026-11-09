import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import url from 'url';
import unzipper from 'unzipper';
import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import {
  logPath,
  logStream,
  isDev,
  isPreview,
  projectRoot,
  appDataDir,
  dbPath,
  backupDir,
  configPath,
  DEFAULT_TRANSLATION_MODEL,
  SUPPORTED_TRANSLATION_MODELS,
  defaultConfig,
  appConfig,
  currentProfileId,
  setCurrentProfileId,
  DEFAULT_PROFILE_COLOR,
  DEFAULT_DATE_PARSE_FORMATS,
  loadAppConfig,
  saveAppConfig,
  normalizeZoomPercent,
  getConfiguredZoomPercent,
  normalizeThumbnailPreviewScale,
  getConfiguredThumbnailPreviewScale,
  normalizeDefaultGalleryZoom,
  getConfiguredDefaultGalleryZoom,
  normalizeTranslationTargetLanguage,
  getConfiguredTranslationTargetLanguage,
  normalizeTranslationModel,
  getConfiguredTranslationModel,
  normalizeBackupInterval,
  getConfiguredBackupInterval,
  getConfiguredBackupDir,
  normalizePasswordLockMaxAttempts,
  normalizePasswordLockDurationMinutes,
  getConfiguredPasswordLockMaxAttempts,
  getConfiguredPasswordLockDurationMinutes,
  normalizeIdleLockMinutes,
  getConfiguredIdleLockMinutes,
  getPasswordLockUntil,
  resetPasswordLockState,
  getTranslationLanguageLabel,
  normalizeDateParseFormats,
  normalizeDateParseFormat,
  getDateParseFormats,
  getStoredDateOutputFormat,
  extractResponseText,
  translateTextWithOpenAi,
  normalizeImportedDateValue,
  applyWindowZoom,
  PASSWORD_SCRYPT_PREFIX,
  PASSWORD_SCRYPT_KEY_LENGTH,
  PASSWORD_SCRYPT_OPTIONS,
  hashLegacyPassword,
  derivePasswordKey,
  createPasswordHash,
  timingSafeBufferEqual,
  verifyStoredPassword,
  getCurrentProfileIdOrThrow,
  getProfileById,
  ensureCurrentProfileExists,
  getScopedCategory,
  getScopedRecord,
  ensureCategoryBelongsToCurrentProfile,
  getCategorySubtreeIds,
  getSqlPlaceholders,
  ensureRecordBelongsToCurrentProfile,
  createProfile,
  ensureDefaultProfile,
  log,
  db
} from '../store';
import { initializeDatabase } from '../database';
import { getFileTypeFromPath, getThumbnailHash } from '../lib/files';
import { electronDistDir, getFfmpegToolPaths, getUnpackedFfprobePath } from '../ffmpeg-paths';
import {
  MAX_AUTOMATIC_BACKUPS,
  automaticBackupTimer,
  automaticBackupInProgress,
  createBackupTimestamp,
  cleanupOldAutomaticBackups,
  createDatabaseBackup,
  runAutomaticBackup,
  startAutomaticBackup,
  stopAutomaticBackup
} from '../backup';
import {
  normalizeZipPath,
  isSameZipEntry,
  getArchiveVideoCachePath,
  archiveVideoExtractPromises,
  ARCHIVE_TEXT_MAX_BYTES,
  ARCHIVE_DATA_URL_MAX_BYTES,
  archiveIoQueue,
  enqueueArchiveIo,
  findArchiveEntry,
  readArchiveEntryBuffer,
  ensureArchiveVideoExtracted,
  ARCHIVE_IMAGE_RE,
  ARCHIVE_VIDEO_RE,
  listArchiveFileEntries
} from '../media/archives';
import {
  generateUUID,
  sanitizeThumbnailPathSegment,
  getThumbnailRootDir,
  getLegacyThumbnailPath,
  getThumbnailCategorySegments,
  resolveThumbnailContext,
  getStructuredThumbnailDir,
  getThumbnailPathForContext,
  ensureThumbnailDirForContext,
  getThumbnailContextForRecordLike,
  copyLegacyThumbnailToStructuredPath,
  ensureDirectoryExists,
  removeEmptyThumbnailDirsUpward,
  relocateThumbnailFile,
  collectThumbnailMigrationEntries,
  getStructuredThumbnailDirsForCategoryIds,
  migrateStructuredThumbnailEntries,
  deleteThumbnail,
  getAutoThumbnailTimestamp,
  getThumbnailTimestampForFile,
  writeVideoFileThumbnail,
  generateThumbnailFromArchive,
  generateThumbnail,
  cleanupThumbnailsForCategory,
  cleanupRelationReferences
} from '../media/thumbnails';
import {
  hasEmbeddedVideoCover,
  extractEmbeddedVideoCover,
  persistCustomThumbnailToVideoMetadata,
  removeEmbeddedVideoCover
} from '../media/video-cover';
import {
  renameFileWithRetry,
  removeFileWithRetry
} from '../fs-retry';
import {
  checkDuplicateFields,
  IMPORT_EXPORT_BATCH_SIZE,
  sanitizeFileName,
  sanitizeExcelSheetName,
  ensureUniqueSheetName,
  getCategoryOrThrow,
  getCategoryRecordsForProfile,
  getCategoryExportSubtree,
  getDashboardWarnings,
  getRelationKeyField,
  buildRelationResolvers,
  getRelationExportValue,
  getExcelHeaderLabel,
  getExportHeaders,
  getExportRowValues,
  getExcelColumnWidth,
  buildDiscordStyleSheetXml,
  applyDiscordExcelStyling,
  serializeExportValue,
  escapeCsvCell,
  buildCategoryRecordsCsvContent,
  appendCategoryRecordsWorksheet,
  parseBooleanImportValue,
  parseArrayImportValue,
  parsePercentageImportPart,
  normalizePercentageImportValue,
  parseImportedFieldValue,
  resolveImportedRelationValue,
  createDefaultRecordData,
  getHeaderFieldMap,
  getUniqueFieldValueSets,
  insertImportedRecordsBatch,
  exportCategoryRecordsToCsv,
  exportCategoryRecordsToExcel,
  readImportRowsFromFile,
  importCategoryRecordsFromRows
} from '../import-export';
import {
  deleteRelatedRecordLinks,
  listRelatedRecords,
  saveRelatedRecordIds,
  searchRelatedRecordCandidates,
} from '../lib/record-references';

export function registerRecordHandlers() {


  async function handleUpdateRecord(_, id, data, relatedRecordIds) {
    try {
      log('=== handleUpdateRecord 시작 ===', { id, dataKeys: Object.keys(data) });

      const profileId = getCurrentProfileIdOrThrow();
      const record = db.prepare('SELECT categoryId, duration, thumbnailTimestamp FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
      if (!record) {
        throw new Error('Record not found');
      }

      const dataToSave = { ...data };
      const requestedThumbnailTimestamp = Number(dataToSave.__thumbnailTimestamp);
      delete dataToSave.__thumbnailTimestamp;
      delete dataToSave.relatedRecordIds;

      await checkDuplicateFields(record.categoryId, dataToSave, id, profileId);

      // 기존 duration 값 유지
      let duration = record.duration;
      let thumbnailTimestamp = Number.isFinite(requestedThumbnailTimestamp)
        ? Math.max(0, requestedThumbnailTimestamp)
        : record.thumbnailTimestamp;

      // duration이 없거나 파일 경로가 변경된 경우에만 새로 계산
      const fileField = Object.values(dataToSave).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
      if (fileField && (!duration || duration === null)) {
        try {
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
          log('[addRecord] 동영상 duration 계산 시도', { fileField, ffmpegPath, ffprobePath });
          if (!ffmpegPath || !ffprobePath) {
            log('[addRecord] ffmpeg/ffprobe 경로를 찾을 수 없음, duration=null', { ffmpegPath, ffprobePath });
            duration = null;
          } else {
            ffmpeg.setFfmpegPath(ffmpegPath);
            ffmpeg.setFfprobePath(ffprobePath);
            duration = await new Promise((resolve: (value: any) => void) => {
              ffmpeg.ffprobe(fileField as string, (err, metadata) => {
                if (err) {
                  log('[addRecord] ffprobe 에러', { fileField, err: err.message, stack: err.stack });
                  return resolve(null);
                }
                if (!metadata || !metadata.format || !metadata.format.duration) {
                  log('[addRecord] ffprobe 결과에 duration 없음', { fileField, metadata });
                  return resolve(null);
                }
                resolve(Math.floor(metadata.format.duration));
              });
            });
          }
        } catch (e) {
          log('[addRecord] duration 계산 중 예외', { fileField, error: e.message, stack: e.stack });
          duration = null;
        }
      }

      // 파일 경로 변경 감지를 위해 업데이트 전에 이전 데이터 조회
      let prevFilePath = null;
      try {
        log('=== 파일 경로 변경 감지 시작 ===');
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          log('=== 카테고리 필드 ===', { fields: fields.map(f => ({ id: f.id, type: f.type, name: f.name })) });

          const fileField = fields.find(f => f.type === 'file');
          if (fileField) {
            log('=== 파일 필드 발견 ===', { fileFieldId: fileField.id, fileFieldName: fileField.name });

            // 업데이트 전에 이전 파일 경로 조회
            const prevRecord = db.prepare('SELECT data FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
            if (prevRecord) {
              const prevData = JSON.parse(prevRecord.data);
              prevFilePath = prevData[fileField.id] || null;
              log('=== 이전 파일 경로 조회 완료 ===', { prevFilePath });
            } else {
              log('=== 이전 레코드 데이터 없음 ===');
            }
          } else {
            log('=== 파일 필드 없음 ===');
          }
        } else {
          log('=== 카테고리 없음 ===');
        }
      } catch (error) {
        log('이전 파일 경로 조회 중 오류:', error);
      }

      log('=== DB 업데이트 시작 ===');
      const stmt = db.prepare(`
        UPDATE records
        SET data = ?, updatedAt = ?, duration = ?, thumbnailTimestamp = ?
        WHERE id = ? AND profileId = ?
      `);

      stmt.run(
        JSON.stringify(dataToSave),
        new Date().toISOString(),
        duration,
        thumbnailTimestamp,
        id,
        profileId
      );
      log('=== DB 업데이트 완료 ===');

      // 파일 필드가 있으면 썸네일 자동 생성
      try {
        log('=== 썸네일 생성 로직 시작 ===');
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find(f => f.type === 'file');
          if (fileField && dataToSave[fileField.id]) {
            const newFilePath = dataToSave[fileField.id];
            log('=== 새 파일 경로 ===', { newFilePath });
            log('=== 파일 경로 변경 여부 ===', {
              prevFilePath,
              newFilePath,
              isChanged: newFilePath !== prevFilePath,
              prevType: typeof prevFilePath,
              newType: typeof newFilePath
            });

            if (newFilePath !== prevFilePath) {
              log('=== 썸네일 생성 시작 (파일 경로 변경됨) ===', { newFilePath });

              // 파일 경로가 변경되었으므로 기존 북마크 삭제
              try {
                const recordData = db.prepare('SELECT data FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
                if (recordData) {
                  const data = JSON.parse(recordData.data);
                  if (data.bookmarks && data.bookmarks.length > 0) {
                    data.bookmarks = [];
                    db.prepare("UPDATE records SET data = ?, updatedAt = ? WHERE id = ? AND profileId = ?")
                      .run(JSON.stringify(data), new Date().toISOString(), id, profileId);
                    log('=== 파일 변경으로 인해 북마크 삭제 완료 ===', { recordId: id, deletedCount: data.bookmarks.length });
                  } else {
                    log('=== 파일 변경됨, 북마크 없음 ===', { recordId: id });
                  }
                }
              } catch (error) {
                log('북마크 삭제 중 오류:', error);
                // 북마크 삭제 실패는 레코드 업데이트를 막지 않음
              }

              // 썸네일 생성
              const thumbnailResult = await generateThumbnail(newFilePath, { recordId: id, categoryId: record.categoryId, profileId });
              if (thumbnailResult) {
                log('=== 썸네일 생성 완료 ===', { thumbnailResult });

                // 새 레코드의 경우 썸네일 경로를 DB에 저장
                thumbnailTimestamp = getThumbnailTimestampForFile(newFilePath, duration);
                db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = ? WHERE id = ? AND profileId = ?').run(thumbnailResult, thumbnailTimestamp, id, profileId);
                log('[updateRecord] thumbnail path saved', { recordId: id, thumbnailPath: thumbnailResult, thumbnailTimestamp });
              } else {
                log('=== 썸네일 생성 실패 ===');
              }
            } else {
              log('=== 파일 경로 동일, 썸네일 재생성 생략 ===');
            }
          } else {
            log('=== 파일 필드가 없거나 파일 경로가 비어있음 ===', {
              hasFileField: !!fileField,
              fileFieldId: fileField?.id,
              hasFilePath: fileField ? !!dataToSave[fileField.id] : false,
              filePath: fileField ? dataToSave[fileField.id] : null
            });
          }
        } else {
          log('=== 카테고리를 찾을 수 없음 ===');
        }
      } catch (error) {
        log('썸네일 생성 중 오류:', error);
        // 썸네일 생성 실패는 레코드 업데이트를 막지 않음
      }

      saveRelatedRecordIds(db, id, relatedRecordIds, profileId);

      log('=== handleUpdateRecord 완료 ===');
      return { success: true };
    } catch (error) {
      log('Error in updateRecord:', error);
      throw error;
    }
  }
  ipcMain.handle('updateRecord', handleUpdateRecord);
  ipcMain.handle('db:updateRecord', handleUpdateRecord);

  ipcMain.handle('db:getRecords', async (_, categoryId) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!categoryId) throw new Error('Category ID is required');
      ensureCategoryBelongsToCurrentProfile(categoryId);
      const records = db.prepare('SELECT id, categoryId, data, createdAt, updatedAt, duration, thumbnailPath, thumbnailTimestamp FROM records WHERE categoryId = ? AND profileId = ? ORDER BY createdAt DESC').all(categoryId, profileId);
      return records.map(record => ({
        ...record,
        data: JSON.parse(record.data)
      }));
    } catch (error) {
      log('Error getting records:', error);
      throw error;
    }
  });

  ipcMain.handle('db:addRecord', async (_, record) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!record || typeof record !== 'object') {
        throw new Error('Record must be an object');
      }
      if (!record.categoryId || !record.data) {
        throw new Error('Missing required fields');
      }
      ensureCategoryBelongsToCurrentProfile(record.categoryId);
      await checkDuplicateFields(record.categoryId, record.data, null, profileId);
      const recordId = record.id || crypto.randomUUID();
      const stmt = db.prepare(`
        INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt, duration, thumbnailTimestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      // duration 계산
      let duration = null;
      const fileField = Object.values(record.data).find(v => typeof v === 'string' && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(v));
      if (fileField) {
        try {
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
          log('[addRecord] 동영상 duration 계산 시도', { fileField, ffmpegPath, ffprobePath });
          if (!ffmpegPath || !ffprobePath) {
            log('[addRecord] ffmpeg/ffprobe 경로를 찾을 수 없음, duration=null', { ffmpegPath, ffprobePath });
            duration = null;
          } else {
            ffmpeg.setFfmpegPath(ffmpegPath);
            ffmpeg.setFfprobePath(ffprobePath);
            duration = await new Promise((resolve: (value: any) => void) => {
              ffmpeg.ffprobe(fileField as string, (err, metadata) => {
                if (err) {
                  log('[addRecord] ffprobe 에러', { fileField, err: err.message, stack: err.stack });
                  return resolve(null);
                }
                if (!metadata || !metadata.format || !metadata.format.duration) {
                  log('[addRecord] ffprobe 결과에 duration 없음', { fileField, metadata });
                  return resolve(null);
                }
                resolve(Math.floor(metadata.format.duration));
              });
            });
          }
        } catch (e) {
          log('[addRecord] duration 계산 중 예외', { fileField, error: e.message, stack: e.stack });
          duration = null;
        }
      }
      try {
        stmt.run(
          recordId,
          profileId,
          record.categoryId,
          JSON.stringify(record.data),
          record.createdAt || now,
          record.updatedAt || now,
          duration,
          null
        );
      } catch (e) {
        log('[addRecord] DB insert 예외', { recordId, error: e.message, stack: e.stack });
        throw e;
      }
      // 파일 필드가 있으면 썸네일 자동 생성
      try {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileFieldObj = fields.find(f => f.type === 'file');
          if (fileFieldObj && record.data[fileFieldObj.id]) {
            const filePath = record.data[fileFieldObj.id];
            log('[addRecord] 썸네일 생성 시작', { filePath });
            try {
              const thumbnailResult = await generateThumbnail(filePath, { recordId, categoryId: record.categoryId, profileId });
              if (thumbnailResult) {
                log('[addRecord] 썸네일 생성 완료', { thumbnailResult });

                // 새 레코드의 경우 썸네일 경로를 DB에 저장
                const thumbnailTimestamp = getThumbnailTimestampForFile(filePath, duration);
                db.prepare('UPDATE records SET thumbnailPath = ?, thumbnailTimestamp = ? WHERE id = ? AND profileId = ?').run(thumbnailResult, thumbnailTimestamp, recordId, profileId);
                log('[addRecord] thumbnail path saved', { recordId, thumbnailPath: thumbnailResult, thumbnailTimestamp });
              } else {
                log('[addRecord] 썸네일 생성 실패(결과 null)', { filePath });
              }
            } catch (thumbErr) {
              log('[addRecord] 썸네일 생성 중 예외', { filePath, error: thumbErr.message, stack: thumbErr.stack });
            }
          }
        }
      } catch (error) {
        log('썸네일 생성 블록 예외', { error: error.message, stack: error.stack });
      }
      saveRelatedRecordIds(db, recordId, record.relatedRecordIds, profileId);
      return recordId;
    } catch (error) {
      log('[addRecord] 최상위 예외', { error: error.message, stack: error.stack });
      throw error;
    }
  });

  ipcMain.handle('db:deleteRecord', async (_, id) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const record = db.prepare('SELECT categoryId, data, thumbnailPath FROM records WHERE id = ? AND profileId = ?').get(id, profileId);
      if (!record) {
        throw new Error('Record not found');
      }

      // 썸네일 삭제
      try {
        const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(record.categoryId, profileId);
        if (category) {
          const fields = JSON.parse(category.fields);
          const fileField = fields.find(f => f.type === 'file');
          if (fileField) {
            const data = JSON.parse(record.data);
            if (data[fileField.id]) {
              const filePath = data[fileField.id];
              log('레코드 삭제 시 썸네일 삭제 시작:', filePath);

              const thumbnailDeleted = deleteThumbnail(filePath, { recordId: id, categoryId: record.categoryId, profileId, thumbnailPath: record.thumbnailPath });
              if (thumbnailDeleted) {
                log('썸네일 삭제 완료:', filePath);
              }
            }
          }
        }
      } catch (error) {
        log('썸네일 삭제 중 오류:', error);
        // 썸네일 삭제 실패는 레코드 삭제를 막지 않음
      }

      deleteRelatedRecordLinks(db, id);
      db.prepare('DELETE FROM records WHERE id = ? AND profileId = ?').run(id, profileId);
      return { success: true };
    } catch (error) {
      log('Error in deleteRecord:', error);
      throw error;
    }
  });

  ipcMain.handle('db:listRelatedRecords', async (_, recordId) => {
    const profileId = getCurrentProfileIdOrThrow();
    if (!recordId) throw new Error('Record ID is required');
    ensureRecordBelongsToCurrentProfile(recordId);
    return listRelatedRecords(db, recordId, profileId);
  });

  ipcMain.handle('db:searchRelatedRecords', async (_, payload = {}) => {
    const profileId = getCurrentProfileIdOrThrow();
    return searchRelatedRecordCandidates(db, {
      profileId,
      query: payload?.query,
      excludeId: payload?.excludeId,
      limit: payload?.limit,
    });
  });

  ipcMain.handle('db:checkDuplicate', async (_, categoryId, fieldId, value, recordId = null) => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const category = db.prepare('SELECT fields FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId);
      if (!category) {
        throw new Error(`Category not found: ${categoryId}`);
      }

      const fields = JSON.parse(category.fields);
      const field = fields.find(f => f.id === fieldId);

      if (!field || !field.unique) {
        return { isDuplicate: false };
      }

      if (value === undefined || value === null || value === '') {
        return { isDuplicate: false };
      }

      let query = `
        SELECT id FROM records
        WHERE categoryId = ?
        AND profileId = ?
        AND json_extract(data, '$.${fieldId}') = ?
      `;
      let params = [categoryId, profileId, String(value)];

      if (recordId) {
        query += ' AND id != ?';
        params.push(recordId);
      }

      const duplicate = db.prepare(query).get(...params);
      return { isDuplicate: !!duplicate };
    } catch (error) {
      log('Error in checkDuplicate:', error);
      throw error;
    }
  });

  ipcMain.handle('dashboard:getWarnings', async (_, previewLimit = 8, categoryIds) => {
    try {
      return getDashboardWarnings(previewLimit, getCurrentProfileIdOrThrow(), categoryIds);
    } catch (error) {
      log('Error getting dashboard warnings:', error);
      return {
        totalCount: 0,
        counts: {
          missingFiles: 0,
          brokenRelations: 0
        },
        items: []
      };
    }
  });

  ipcMain.handle('record:incrementViewCount', (_event, categoryId, recordId) => {
    const profileId = getCurrentProfileIdOrThrow();
    const category = getCategoryOrThrow(categoryId, profileId);
    const fileField = category.fields.find((field) => field.type === 'file' && !field.thumbnailOnly);
    if (!fileField) {
      return { success: false, error: 'This category does not have a trackable file field.' };
    }

    const record = db.prepare(`
      SELECT data
      FROM records
      WHERE id = ? AND categoryId = ? AND profileId = ?
    `).get(recordId, categoryId, profileId);
    if (!record) {
      return { success: false, error: 'Record not found.' };
    }

    const recordData = JSON.parse(record.data);
    if (!recordData[fileField.id]) {
      return { success: false, error: 'Record does not have an attached file.' };
    }

    db.prepare(`
      INSERT INTO record_view_counts (profileId, recordId, categoryId, viewCount, updatedAt)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(profileId, recordId) DO UPDATE SET
        viewCount = record_view_counts.viewCount + 1,
        categoryId = excluded.categoryId,
        updatedAt = excluded.updatedAt
    `).run(profileId, recordId, categoryId, new Date().toISOString());

    return { success: true };
  });

  ipcMain.handle('dashboard:getRecordViewCounts', () => {
    const profileId = getCurrentProfileIdOrThrow();
    return db.prepare(`
      SELECT recordId, categoryId, viewCount
      FROM record_view_counts
      WHERE profileId = ?
    `).all(profileId);
  });
}
