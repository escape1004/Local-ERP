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
import { deleteRelatedRecordLinksForCategories } from '../lib/record-references';

export function registerCategoryHandlers() {


  ipcMain.handle('db:getCategories', async () => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const categories = db.prepare('SELECT * FROM categories WHERE profileId = ? ORDER BY order_num').all(profileId);
      // fields를 배열로 변환
      return categories.map(cat => ({
        ...cat,
        order: cat.order_num ?? 0,
        itemType: cat.itemType === 'separator' ? 'separator' : 'category',
        memo: typeof cat.memo === 'string' ? cat.memo : '',
        fields: JSON.parse(cat.fields)
      }));
    } catch (error) {
      log('Error getting categories:', error);
      throw error;
    }
  });

  ipcMain.handle('db:addCategory', async (_, category) => {
    const profileId = getCurrentProfileIdOrThrow();
    const id = generateUUID();
    const now = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO categories (id, profileId, name, parentId, fields, order_num, itemType, memo, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        profileId,
        category.name,
        category.itemType === 'separator' ? null : (category.parentId || null),
        JSON.stringify(category.itemType === 'separator' ? [] : (category.fields || [])),
        category.order_num ?? category.order ?? 0,
        category.itemType === 'separator' ? 'separator' : 'category',
        category.itemType === 'separator' ? '' : (typeof category.memo === 'string' ? category.memo : ''),
        now,
        now
      );
      return id;
    } catch (error) {
      log('Error adding category:', error);
      throw error;
    }
  });

  ipcMain.handle('db:deleteCategory', async (_, id) => {
    const profileId = getCurrentProfileIdOrThrow();
    ensureCategoryBelongsToCurrentProfile(id);
    const subtreeIds = getCategorySubtreeIds(id, profileId);
    const relationCleanupCount = subtreeIds.reduce((count, categoryId) => count + cleanupRelationReferences(categoryId), 0);
    const categoryDirs = getStructuredThumbnailDirsForCategoryIds(subtreeIds, profileId);
    let totalThumbnailCount = 0;

    subtreeIds.forEach(categoryId => {
      totalThumbnailCount += cleanupThumbnailsForCategory(categoryId);
    });

    deleteRelatedRecordLinksForCategories(db, profileId, subtreeIds);
    db.prepare(`DELETE FROM records WHERE profileId = ? AND categoryId IN (${getSqlPlaceholders(subtreeIds.length)})`).run(profileId, ...subtreeIds);
    db.prepare(`DELETE FROM categories WHERE profileId = ? AND id IN (${getSqlPlaceholders(subtreeIds.length)})`).run(profileId, ...subtreeIds);
    categoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));

    return {
      success: true,
      thumbnailCleanupCount: totalThumbnailCount,
      relationCleanupCount: relationCleanupCount
    };
  });

  function getCategorySubtree(rootId, allCategories) {
    const childrenMap = new Map();
    for (const cat of allCategories) {
      const parentKey = cat.parentId || null;
      if (!childrenMap.has(parentKey)) {
        childrenMap.set(parentKey, []);
      }
      childrenMap.get(parentKey).push(cat);
    }
    // preserve order within parent
    for (const [key, list] of childrenMap.entries()) {
      list.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    }

    const result = [];
    const stack = [rootId];
    const visited = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      const node = allCategories.find(c => c.id === current);
      if (!node) continue;
      result.push(node);
      const children = childrenMap.get(current) || [];
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i].id);
      }
    }
    return result;
  }

  ipcMain.handle('category:export', async (_, categoryId) => {
    try {
      const categories = db.prepare('SELECT id, name, parentId, fields, order_num, itemType, memo, createdAt, updatedAt FROM categories').all();
      const subtree = getCategorySubtree(categoryId, categories);
      if (subtree.length === 0) {
        return { success: false, error: 'Category not found' };
      }

      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        rootCategoryId: categoryId,
        categories: subtree.map(cat => ({
          id: cat.id,
          name: cat.name,
          parentId: cat.parentId,
          fields: JSON.parse(cat.fields),
          order_num: cat.order_num ?? 0,
          itemType: cat.itemType === 'separator' ? 'separator' : 'category',
          memo: typeof cat.memo === 'string' ? cat.memo : '',
          createdAt: cat.createdAt,
          updatedAt: cat.updatedAt
        }))
      };

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: '카테고리 추출 저장',
        defaultPath: `category-${categoryId}.json`,
        filters: [{ name: 'Category Export', extensions: ['json'] }]
      });
      if (canceled || !filePath) return { success: false };

      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      return { success: true, path: filePath };
    } catch (error) {
      log('Error exporting category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('category:import', async () => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: '카테고리 붙여넣기',
        filters: [{ name: 'Category Export', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (canceled || !filePaths || filePaths.length === 0) return { success: false };

      const raw = fs.readFileSync(filePaths[0], 'utf-8');
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.categories)) {
        return { success: false, error: 'Invalid category export file' };
      }

      const now = new Date().toISOString();
      const oldToNew = new Map();
      const categories = data.categories;
      const categoryMap = new Map(categories.map(c => [c.id, c]));
      const childrenMap = new Map();
      for (const cat of categories) {
        const parentKey = categoryMap.has(cat.parentId) ? cat.parentId : null;
        if (!childrenMap.has(parentKey)) childrenMap.set(parentKey, []);
        childrenMap.get(parentKey).push(cat);
      }
      for (const [key, list] of childrenMap.entries()) {
        list.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      }

      const getNextOrder = (() => {
        const cache = new Map();
        return (parentId) => {
          const key = parentId || null;
          if (!cache.has(key)) {
            const row = parentId
              ? db.prepare('SELECT MAX(order_num) as maxOrder FROM categories WHERE parentId = ? AND profileId = ?').get(parentId, profileId)
              : db.prepare('SELECT MAX(order_num) as maxOrder FROM categories WHERE parentId IS NULL AND profileId = ?').get(profileId);
            cache.set(key, Number.isFinite(row?.maxOrder) ? row.maxOrder + 1 : 0);
          }
          const next = cache.get(key);
          cache.set(key, next + 1);
          return next;
        };
      })();

      const insertStmt = db.prepare(`
        INSERT INTO categories (id, profileId, name, parentId, fields, order_num, itemType, memo, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const dfsInsert = (parentId) => {
        const children = childrenMap.get(parentId || null) || [];
        for (const child of children) {
          const newId = generateUUID();
          oldToNew.set(child.id, newId);
          const isSeparator = child.itemType === 'separator';
          const newParentId = isSeparator ? null : (parentId ? oldToNew.get(parentId) : null);
          const orderNum = getNextOrder(newParentId || null);
          insertStmt.run(
            newId,
            profileId,
            child.name,
            newParentId,
            JSON.stringify(isSeparator ? [] : (child.fields || [])),
            orderNum,
            isSeparator ? 'separator' : 'category',
            isSeparator ? '' : (typeof child.memo === 'string' ? child.memo : ''),
            now,
            now
          );
          dfsInsert(child.id);
        }
      };

      dfsInsert(null);

      return { success: true, importedCount: oldToNew.size };
    } catch (error) {
      log('Error importing category:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('category:exportRecords', async (_, categoryId, format = 'csv') => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!categoryId) {
        throw new Error('Category ID is required');
      }

      ensureCategoryBelongsToCurrentProfile(categoryId);
      const category = getCategoryOrThrow(categoryId, profileId);
      const subtreeCategories = getCategoryExportSubtree(categoryId, profileId);
      const categoryRecords = subtreeCategories.map((subtreeCategory) => ({
        category: subtreeCategory,
        records: getCategoryRecordsForProfile(subtreeCategory.id, profileId)
      }));
      const hasDescendants = subtreeCategories.length > 1;
      const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'csv';
      const extension = normalizedFormat === 'xlsx' ? 'xlsx' : (hasDescendants ? 'zip' : 'csv');
      const safeCategoryName = sanitizeFileName(category.name);

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: normalizedFormat === 'xlsx' ? 'Excel 내보내기' : 'CSV 내보내기',
        defaultPath: `${safeCategoryName}.${extension}`,
        filters: [
          {
            name: normalizedFormat === 'xlsx'
              ? 'Excel Workbook'
              : (hasDescendants ? 'ZIP Archive' : 'CSV File'),
            extensions: [extension]
          }
        ]
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      if (normalizedFormat === 'xlsx') {
        if (hasDescendants) {
          const workbook = XLSX.utils.book_new();
          const usedSheetNames = new Set();
          const sheetDimensions = [];

          categoryRecords.forEach(({ category: exportCategory, records: exportRecords }) => {
            const preferredSheetName = exportCategory.exportPathNames.join(' - ');
            const sheetName = ensureUniqueSheetName(preferredSheetName, usedSheetNames);
            sheetDimensions.push(appendCategoryRecordsWorksheet(workbook, sheetName, exportCategory, exportRecords));
          });

          const workbookBuffer = XLSX.write(workbook, {
            type: 'buffer',
            bookType: 'xlsx',
            compression: true
          });
          const styledBuffer = applyDiscordExcelStyling(workbookBuffer, { sheetDimensions });
          fs.writeFileSync(filePath, styledBuffer);
        } else {
          exportCategoryRecordsToExcel(filePath, category, categoryRecords[0]?.records || []);
        }
      } else {
        if (hasDescendants) {
          const zip = new AdmZip();
          categoryRecords.forEach(({ category: exportCategory, records: exportRecords }) => {
            const entryPath = `${exportCategory.exportPathNames.map((segment) => sanitizeFileName(segment)).join('/')}.csv`;
            zip.addFile(entryPath, Buffer.from(buildCategoryRecordsCsvContent(exportCategory, exportRecords), 'utf8'));
          });
          zip.writeZip(filePath);
        } else {
          await exportCategoryRecordsToCsv(filePath, category, categoryRecords[0]?.records || []);
        }
      }

      return {
        success: true,
        path: filePath,
        recordCount: categoryRecords.reduce((sum, entry) => sum + entry.records.length, 0),
        format: normalizedFormat
      };
    } catch (error) {
      log('Error exporting category records:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('category:importRecords', async (_, categoryId, format = 'csv') => {
    try {
      const profileId = getCurrentProfileIdOrThrow();
      if (!categoryId) {
        throw new Error('Category ID is required');
      }

      ensureCategoryBelongsToCurrentProfile(categoryId);
      const category = getCategoryOrThrow(categoryId, profileId);
      const normalizedFormat = format === 'xlsx' ? 'xlsx' : 'csv';
      const extensions = normalizedFormat === 'xlsx' ? ['xlsx', 'xls'] : ['csv'];

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: normalizedFormat === 'xlsx' ? 'Excel 가져오기' : 'CSV 가져오기',
        properties: ['openFile'],
        filters: [
          {
            name: normalizedFormat === 'xlsx' ? 'Excel Workbook' : 'CSV File',
            extensions
          }
        ]
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const rows = readImportRowsFromFile(filePaths[0]);
      const result = importCategoryRecordsFromRows(categoryId, category.fields, rows, profileId);

      return {
        success: true,
        path: filePaths[0],
        format: normalizedFormat,
        ...result
      };
    } catch (error) {
      log('Error importing category records:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:updateCategory', (event, id, updates) => {
    const profileId = getCurrentProfileIdOrThrow();
    const existingCategory = ensureCategoryBelongsToCurrentProfile(id);
    const subtreeIds = getCategorySubtreeIds(id, profileId);
    const nextItemType = updates.itemType === 'separator' || existingCategory.itemType === 'separator'
      ? 'separator'
      : (updates.itemType || existingCategory.itemType || 'category');
    const nextParentId = nextItemType === 'separator' ? null : (updates.parentId || null);

    if (nextParentId) {
      if (nextParentId === id || subtreeIds.includes(nextParentId)) {
        throw new Error('자기 자신 또는 자신의 하위 카테고리를 상위 카테고리로 지정할 수 없습니다.');
      }

      const parentCategory = db.prepare(`
        SELECT id, parentId, itemType
        FROM categories
        WHERE id = ? AND profileId = ?
      `).get(nextParentId, profileId);
      if (!parentCategory || parentCategory.itemType === 'separator') {
        throw new Error('선택한 상위 카테고리를 찾을 수 없습니다.');
      }
      if (parentCategory.parentId) {
        throw new Error('최상위 카테고리만 상위 카테고리로 지정할 수 있습니다.');
      }
    }

    const thumbnailEntries = collectThumbnailMigrationEntries(subtreeIds, profileId);
    const previousCategoryDirs = getStructuredThumbnailDirsForCategoryIds(subtreeIds, profileId);
    const previousParentId = existingCategory.parentId || null;
    const parentChanged = previousParentId !== nextParentId;
    const hasExplicitOrder = updates.order_num !== undefined || updates.order !== undefined;
    let nextOrder = updates.order_num ?? updates.order ?? existingCategory.order_num ?? 0;

    if (parentChanged && !hasExplicitOrder) {
      const maxOrderRow = nextParentId
        ? db.prepare(`
            SELECT COALESCE(MAX(order_num), -1) AS maxOrder
            FROM categories
            WHERE profileId = ? AND parentId = ? AND id != ?
          `).get(profileId, nextParentId, id)
        : db.prepare(`
            SELECT COALESCE(MAX(order_num), -1) AS maxOrder
            FROM categories
            WHERE profileId = ? AND parentId IS NULL AND id != ?
          `).get(profileId, id);
      const maxOrder = Number(maxOrderRow?.maxOrder);
      nextOrder = (Number.isFinite(maxOrder) ? maxOrder : -1) + 1;
    }

    const nextFields = nextItemType === 'separator' ? [] : (updates.fields ?? JSON.parse(existingCategory.fields || '[]'));
    const nextMemo = nextItemType === 'separator'
      ? ''
      : (updates.memo !== undefined ? String(updates.memo ?? '') : (existingCategory.memo || ''));
    const stmt = db.prepare(`
      UPDATE categories
      SET name = ?, parentId = ?, fields = ?, order_num = ?, itemType = ?, memo = ?, updatedAt = ?
      WHERE id = ? AND profileId = ?
    `);
    stmt.run(
      updates.name,
      nextParentId,
      JSON.stringify(nextFields),
      nextOrder,
      nextItemType,
      nextMemo,
      new Date().toISOString(),
      id,
      profileId
    );
    migrateStructuredThumbnailEntries(thumbnailEntries);
    previousCategoryDirs
      .sort((a: string, b: string) => b.length - a.length)
      .forEach(dirPath => removeEmptyThumbnailDirsUpward(dirPath));
    return { success: true };
  });

  ipcMain.handle('db:moveCategoryToProfile', (_event, categoryId, targetProfileId) => {
    try {
      const sourceProfileId = getCurrentProfileIdOrThrow();
      const category = ensureCategoryBelongsToCurrentProfile(categoryId);

      if (category.parentId) {
        return { success: false, error: 'Only root categories can be moved.' };
      }

      const targetProfile = getProfileById(targetProfileId);
      if (!targetProfile) {
        return { success: false, error: 'Target profile not found.' };
      }

      if (targetProfileId === sourceProfileId) {
        return { success: false, error: 'Category is already in that profile.' };
      }

      const subtreeIds = getCategorySubtreeIds(categoryId, sourceProfileId);
      const targetRootOrder = db.prepare(`
        SELECT COALESCE(MAX(order_num), -1) + 1 AS nextOrder
        FROM categories
        WHERE profileId = ? AND parentId IS NULL
      `).get(targetProfileId)?.nextOrder ?? 0;

      const updateCategoryProfileStmt = db.prepare(`
        UPDATE categories
        SET profileId = ?, updatedAt = ?
        WHERE id = ?
      `);
      const updateRecordProfileStmt = db.prepare(`
        UPDATE records
        SET profileId = ?, updatedAt = ?
        WHERE categoryId = ? AND profileId = ?
      `);
      const updateRootOrderStmt = db.prepare(`
        UPDATE categories
        SET order_num = ?, updatedAt = ?
        WHERE id = ?
      `);

      const moveCategoryTree = db.transaction(() => {
        const now = new Date().toISOString();

        subtreeIds.forEach(subtreeCategoryId => {
          updateCategoryProfileStmt.run(targetProfileId, now, subtreeCategoryId);
          updateRecordProfileStmt.run(targetProfileId, now, subtreeCategoryId, sourceProfileId);
        });

        updateRootOrderStmt.run(targetRootOrder, now, categoryId);
      });

      moveCategoryTree();
      return { success: true };
    } catch (error) {
      log('Error moving category to profile:', error);
      return { success: false, error: error.message };
    }
  });
}
