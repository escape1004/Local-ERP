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
import { deleteRelatedRecordLinksForProfile } from '../lib/record-references';

export function registerProfileHandlers() {


  ipcMain.handle('profiles:getAll', () => {
    log('profiles:getAll');
    return db.prepare('SELECT * FROM profiles ORDER BY createdAt ASC').all();
  });

  ipcMain.handle('profiles:getCurrent', () => {
    return ensureCurrentProfileExists();
  });

  ipcMain.handle('profiles:select', (_event, profileId) => {
    log('profiles:select', { profileId });
    const profile = getProfileById(profileId);
    if (!profile) {
      log('profiles:select:not-found', { profileId });
      return { success: false, error: 'Profile not found.' };
    }

    setCurrentProfileId(profile.id);
    log('profiles:select:success', { profileId: profile.id });
    return { success: true, profile };
  });

  ipcMain.handle('profiles:clearCurrent', () => {
    setCurrentProfileId(null);
    return { success: true };
  });

  ipcMain.handle('profiles:create', (_event, payload = {}) => {
    try {
      log('profiles:create', payload);
      const profile = createProfile(payload.name, payload.avatarColor);
      log('profiles:create:success', { profileId: profile.id, name: profile.name });
      return { success: true, profile };
    } catch (error) {
      log('profiles:create:error', { message: error.message, stack: error.stack });
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('profiles:update', (_event, profileId, updates = {}) => {
    const profile = getProfileById(profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found.' };
    }

    const name = String(updates.name ?? profile.name).trim();
    if (!name) {
      return { success: false, error: 'Profile name is required.' };
    }

    const avatarColor = updates.avatarColor || profile.avatarColor || DEFAULT_PROFILE_COLOR;
    const categoryIds = db.prepare('SELECT id FROM categories WHERE profileId = ?').all(profileId).map(row => row.id);
    const thumbnailEntries = collectThumbnailMigrationEntries(categoryIds, profileId);
    const previousCategoryDirs = getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId);
    const previousProfileDir = path.join(getThumbnailRootDir(), sanitizeThumbnailPathSegment(profile.name || profileId, 'profile'));
    db.prepare(`
      UPDATE profiles
      SET name = ?, avatarColor = ?, updatedAt = ?
      WHERE id = ?
    `).run(name, avatarColor, new Date().toISOString(), profileId);

    migrateStructuredThumbnailEntries(thumbnailEntries);
    previousCategoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
    removeEmptyThumbnailDirsUpward(previousProfileDir);

    return { success: true, profile: getProfileById(profileId) };
  });

  ipcMain.handle('profiles:delete', (_event, profileId) => {
    const profile = getProfileById(profileId);
    if (!profile) {
      return { success: false, error: 'Profile not found.' };
    }

    const profileCount = db.prepare('SELECT COUNT(*) as count FROM profiles').get();
    if ((profileCount?.count || 0) <= 1) {
      return { success: false, error: 'At least one profile must remain.' };
    }

    const categoryIds = db.prepare('SELECT id FROM categories WHERE profileId = ?').all(profileId).map(row => row.id);
    const categoryDirs = getStructuredThumbnailDirsForCategoryIds(categoryIds, profileId);
    const profileDir = path.join(getThumbnailRootDir(), sanitizeThumbnailPathSegment(profile.name || profileId, 'profile'));
    categoryIds.forEach(categoryId => {
      cleanupThumbnailsForCategory(categoryId);
    });

    deleteRelatedRecordLinksForProfile(db, profileId);
    db.prepare('DELETE FROM records WHERE profileId = ?').run(profileId);
    db.prepare('DELETE FROM categories WHERE profileId = ?').run(profileId);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
    categoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
    removeEmptyThumbnailDirsUpward(profileDir);

    if (currentProfileId === profileId) {
      setCurrentProfileId(null);
    }

    return { success: true };
  });
}
