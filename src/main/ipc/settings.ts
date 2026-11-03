import { app, BrowserWindow, ipcMain, shell } from 'electron';
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
  normalizeTranslationDisplayMode,
  getConfiguredTranslationTargetLanguage,
  normalizeTranslationModel,
  getConfiguredTranslationModel,
  getConfiguredTranslationDisplayMode,
  normalizeBackupInterval,
  getConfiguredBackupInterval,
  getConfiguredBackupDir,
  normalizePasswordLockMaxAttempts,
  normalizePasswordLockDurationMinutes,
  getConfiguredPasswordLockMaxAttempts,
  getConfiguredPasswordLockDurationMinutes,
  normalizeIdleLockMinutes,
  getConfiguredIdleLockMinutes,
  normalizeBrowserStartupMode,
  getConfiguredBrowserStartupMode,
  getConfiguredBrowserTrackerBlocking,
  getConfiguredBrowserBlockedDomains,
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
import { normalizeBrowserBlockedDomains } from '../lib/browser-tracker-block';
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
import { hasOpenAiApiKey } from '../services/openai-secret';
import { resolveEmbeddedBrowserSession } from '../lib/browser-window-url';

export function registerSettingsHandlers() {


  ipcMain.handle('getConfig', () => {
    const browserSession = resolveEmbeddedBrowserSession({
      lastTabs: appConfig.browserLastTabs,
      lastTabIndex: appConfig.browserLastTabIndex,
      lastUrl: appConfig.browserLastUrl,
      startupMode: getConfiguredBrowserStartupMode(),
    });
    return {
      dbPath: dbPath,
      backupDir: getConfiguredBackupDir(),
      backupInterval: getConfiguredBackupInterval(),
      backupEnabled: appConfig.backupEnabled !== false,
      rememberWindowBounds: appConfig.rememberWindowBounds,
      rememberBrowserWindowBounds: appConfig.rememberBrowserWindowBounds === true,
      browserStartupMode: getConfiguredBrowserStartupMode(),
      browserTrackerBlocking: getConfiguredBrowserTrackerBlocking(),
      browserBlockedDomains: getConfiguredBrowserBlockedDomains(),
      browserLastTabs: browserSession.urls,
      browserLastTabIndex: browserSession.activeIndex,
      muteAudioWhenBackgrounded: appConfig.muteAudioWhenBackgrounded === true,
      zoomPercent: getConfiguredZoomPercent(),
      hasAppPassword: Boolean(appConfig.passwordHash),
      passwordLockMaxAttempts: getConfiguredPasswordLockMaxAttempts(),
      passwordLockDurationMinutes: getConfiguredPasswordLockDurationMinutes(),
      passwordLockUntil: getPasswordLockUntil(),
      idleLockMinutes: getConfiguredIdleLockMinutes(),
      videoSeekSeconds: appConfig.videoSeekSeconds || 5,
      videoAutoPlay: appConfig.videoAutoPlay !== false,
      listThumbnailFit: appConfig.listThumbnailFit === 'contain' ? 'contain' : 'cover',
      videoHoverPreviewEnabled: appConfig.videoHoverPreviewEnabled !== false,
      thumbnailPreviewScale: getConfiguredThumbnailPreviewScale(),
      defaultGalleryZoom: getConfiguredDefaultGalleryZoom(),
      dateParseFormats: normalizeDateParseFormats(appConfig.dateParseFormats),
      hasOpenAiApiKey: hasOpenAiApiKey(),
      translationTargetLanguage: getConfiguredTranslationTargetLanguage(),
      translationModel: getConfiguredTranslationModel(),
      translationDisplayMode: getConfiguredTranslationDisplayMode()
    };
  });

  ipcMain.handle('setAppPassword', async (_event, password) => {
    if (!password || String(password).trim().length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    try {
      appConfig.passwordHash = await createPasswordHash(password);
      resetPasswordLockState();
      saveAppConfig();
      return { success: true };
    } catch (error) {
      log('비밀번호 해시 생성 실패:', error);
      return { success: false, error: '비밀번호를 안전하게 저장하지 못했습니다.' };
    }
  });

  ipcMain.handle('clearAppPassword', () => {
    appConfig.passwordHash = null;
    resetPasswordLockState();
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('verifyAppPassword', async (_event, password) => {
    if (!appConfig.passwordHash) {
      return { success: true };
    }

    const lockUntil = getPasswordLockUntil();
    if (lockUntil) {
      return {
        success: false,
        locked: true,
        lockUntil,
        remainingMs: lockUntil - Date.now(),
        error: 'Too many password attempts.'
      };
    }

    if (appConfig.passwordLockUntil) {
      resetPasswordLockState();
      saveAppConfig();
    }

    let verification;
    try {
      verification = await verifyStoredPassword(password, appConfig.passwordHash);
    } catch (error) {
      log('비밀번호 검증 실패:', error);
      return { success: false, error: '비밀번호를 확인하지 못했습니다.' };
    }

    if (verification.valid) {
      if (verification.needsUpgrade) {
        try {
          appConfig.passwordHash = await createPasswordHash(password);
        } catch (error) {
          log('기존 비밀번호 해시 마이그레이션 실패:', error);
        }
      }

      if (verification.needsUpgrade || appConfig.passwordFailedAttempts || appConfig.passwordLockUntil) {
        resetPasswordLockState();
        saveAppConfig();
      }
      return { success: true };
    }

    const failedAttempts = Math.max(0, Number(appConfig.passwordFailedAttempts) || 0) + 1;
    const maxAttempts = getConfiguredPasswordLockMaxAttempts();
    if (failedAttempts >= maxAttempts) {
      const nextLockUntil = Date.now() + getConfiguredPasswordLockDurationMinutes() * 60 * 1000;
      appConfig.passwordFailedAttempts = 0;
      appConfig.passwordLockUntil = nextLockUntil;
      saveAppConfig();
      return {
        success: false,
        locked: true,
        lockUntil: nextLockUntil,
        remainingMs: nextLockUntil - Date.now(),
        error: 'Too many password attempts.'
      };
    }

    appConfig.passwordFailedAttempts = failedAttempts;
    saveAppConfig();
    return {
      success: false,
      remainingAttempts: maxAttempts - failedAttempts,
      error: 'Invalid password.'
    };
  });

  ipcMain.handle('setIdleLockMinutes', (_event, minutes) => {
    const normalizedMinutes = normalizeIdleLockMinutes(minutes);
    if (normalizedMinutes === null) {
      return { success: false, error: 'Invalid idle lock minutes.' };
    }

    appConfig.idleLockMinutes = normalizedMinutes;
    saveAppConfig();
    return { success: true, idleLockMinutes: normalizedMinutes };
  });

  ipcMain.handle('setPasswordLockSettings', (_event, maxAttempts, durationMinutes) => {
    const normalizedMaxAttempts = normalizePasswordLockMaxAttempts(maxAttempts);
    const normalizedDurationMinutes = normalizePasswordLockDurationMinutes(durationMinutes);
    if (normalizedMaxAttempts === null || normalizedDurationMinutes === null) {
      return { success: false, error: 'Invalid password lock settings.' };
    }

    appConfig.passwordLockMaxAttempts = normalizedMaxAttempts;
    appConfig.passwordLockDurationMinutes = normalizedDurationMinutes;
    saveAppConfig();
    return {
      success: true,
      passwordLockMaxAttempts: normalizedMaxAttempts,
      passwordLockDurationMinutes: normalizedDurationMinutes
    };
  });

  ipcMain.handle('setVideoSeekSeconds', (_event, seconds) => {
    const normalized = Number(seconds);
    if (!Number.isFinite(normalized) || normalized < 1) {
      return { success: false, error: 'Seconds must be at least 1.' };
    }

    appConfig.videoSeekSeconds = Math.floor(normalized);
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('setZoomPercent', (_event, percent) => {
    const normalized = normalizeZoomPercent(percent);
    if (normalized === null) {
      return { success: false, error: 'Zoom percent must be a number.' };
    }

    appConfig.zoomPercent = normalized;
    saveAppConfig();

    for (const browserWindow of BrowserWindow.getAllWindows()) {
      applyWindowZoom(browserWindow);
    }

    return { success: true };
  });

  ipcMain.handle('setThumbnailPreviewScale', (_event, scale) => {
    const normalized = normalizeThumbnailPreviewScale(scale);
    if (normalized === null) {
      return { success: false, error: 'Thumbnail preview scale must be a number.' };
    }

    appConfig.thumbnailPreviewScale = normalized;
    saveAppConfig();
    return { success: true, thumbnailPreviewScale: normalized };
  });

  ipcMain.handle('setVideoAutoPlay', (_event, enabled) => {
    appConfig.videoAutoPlay = enabled !== false;
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('setBrowserStartupMode', (_event, mode) => {
    const normalized = normalizeBrowserStartupMode(mode);
    appConfig.browserStartupMode = normalized;
    saveAppConfig();
    return { success: true, browserStartupMode: normalized };
  });

  ipcMain.handle('setBrowserTrackerBlocking', (_event, enabled) => {
    appConfig.browserTrackerBlocking = enabled === true;
    saveAppConfig();
    return { success: true, browserTrackerBlocking: appConfig.browserTrackerBlocking };
  });

  ipcMain.handle('setBrowserBlockedDomains', (_event, domains) => {
    const normalized = normalizeBrowserBlockedDomains(domains);
    appConfig.browserBlockedDomains = normalized;
    saveAppConfig();
    return { success: true, browserBlockedDomains: normalized };
  });

  ipcMain.handle('setListThumbnailFit', (_event, fit) => {
    if (fit !== 'cover' && fit !== 'contain') {
      return { success: false, error: 'Thumbnail fit must be cover or contain.' };
    }

    appConfig.listThumbnailFit = fit;
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('setVideoHoverPreviewEnabled', (_event, enabled) => {
    appConfig.videoHoverPreviewEnabled = enabled === true;
    saveAppConfig();
    return { success: true, videoHoverPreviewEnabled: appConfig.videoHoverPreviewEnabled };
  });

  ipcMain.handle('setDefaultGalleryZoom', (_event, scale) => {
    const normalized = normalizeDefaultGalleryZoom(scale);
    if (normalized === null) {
      return { success: false, error: 'Gallery zoom must be a number.' };
    }

    appConfig.defaultGalleryZoom = normalized;
    saveAppConfig();
    return { success: true, defaultGalleryZoom: normalized };
  });

  ipcMain.handle('setDateParseFormats', (_event, formats) => {
    appConfig.dateParseFormats = normalizeDateParseFormats(formats);
    saveAppConfig();
    return { success: true, dateParseFormats: appConfig.dateParseFormats ?? [] };
  });
}
