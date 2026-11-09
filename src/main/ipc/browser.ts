import crypto from 'crypto';
import path from 'path';
import { ipcMain } from 'electron';
import { electronDistDir } from '../ffmpeg-paths';
import { canonicalizeBrowserUrl } from '../lib/browser-url';
import { normalizePersistedBrowserSession, readBrowserSessionForProfile, writeBrowserSessionForProfile } from '../lib/browser-window-url';
import {
  BOOKMARK_BAR_FOLDER_ID,
  buildBrowserBookmarkTree,
  MANUAL_BOOKMARK_FOLDER_ID,
  nextManualFolderName,
} from '../lib/browser-bookmark-tree';
import { buildRecordUrlMatchIndex } from '../lib/browser-record-match';
import { moveManualTreeItem, normalizeManualParentId } from '../lib/browser-bookmark-move';
import { parseExternalHttpUrl } from '../lib/security';
import {
  appConfig,
  currentProfileId,
  db,
  getConfiguredTranslationModel,
  getCurrentProfileIdOrThrow,
  log,
  saveAppConfig,
} from '../store';
import {
  closeEmbeddedBrowserWindow,
  getEmbeddedBrowserIdleState,
  openEmbeddedBrowserWindow,
  sendEmbeddedBrowserMessage,
  setRememberEmbeddedBrowserWindowBounds,
} from '../app/browser-window';
import { generateBrowserScriptWithOpenAi } from '../services/browser-ai';
import {
  commitBrowserPassword,
  deleteBrowserPassword,
  dismissBrowserPassword,
  listBrowserPasswordSummaries,
  listBrowserPasswordsForOrigin,
  neverSaveBrowserOrigin,
  stageBrowserPassword,
  unlockBrowserPassword,
} from '../services/browser-password';
import { BROWSER_PARTITION } from '../services/embedded-browser';
import {
  browserWindowFromEvent,
  downloadRememberedBrowserVideo,
  listAndEnrichPageVideos,
  previewRememberedBrowserVideo,
} from '../services/browser-video-download';
import {
  clearBrowserHistory,
  deleteBrowserHistoryItem,
  listBrowserHistory,
} from '../lib/browser-history-store';
import {
  clearBrowserDownloads,
  deleteBrowserDownload,
  downloadBrowserFiles,
  listBrowserDownloads,
  openBrowserDownload,
  setBrowserDownloadsChangedListener,
  showBrowserDownloadInFolder,
} from '../lib/browser-download-manager';

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const RECORD_MATCH_CACHE_MS = 5000;
let recordMatchCache = { profileId: '', builtAt: 0, index: null };

function getRecordMatchIndex(profileId) {
  const now = Date.now();
  if (
    recordMatchCache.index
    && recordMatchCache.profileId === profileId
    && now - recordMatchCache.builtAt < RECORD_MATCH_CACHE_MS
  ) {
    return recordMatchCache.index;
  }

  const index = buildRecordUrlMatchIndex({
    categories: db.prepare('SELECT id, name, fields FROM categories WHERE profileId = ?').all(profileId),
    records: db.prepare('SELECT id, categoryId, data FROM records WHERE profileId = ?').all(profileId),
  });
  recordMatchCache = { profileId, builtAt: now, index };
  return index;
}

function findMatchingRecords(targetUrl) {
  const canonical = canonicalizeBrowserUrl(targetUrl);
  if (!canonical) return [];

  let profileId = '';
  try {
    profileId = getCurrentProfileIdOrThrow();
  } catch {
    return [];
  }

  return getRecordMatchIndex(profileId).lookup(canonical);
}

function currentBrowserProfileId() {
  try {
    return getCurrentProfileIdOrThrow();
  } catch {
    return '';
  }
}

function listManualBookmarkRows(profileId) {
  return db.prepare(`
    SELECT id, title, url, record_id AS recordId, folder_id AS folderId, sort_order AS sortOrder, created_at AS createdAt
    FROM browser_bookmarks
    WHERE profileId = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(profileId);
}

function listManualFolderRows(profileId) {
  return db.prepare(`
    SELECT id, name, parent_id AS parentId, sort_order AS sortOrder, created_at AS createdAt
    FROM browser_bookmark_folders
    WHERE profileId = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(profileId);
}

function nextManualSortOrder(table, parentColumn, parentId, profileId) {
  const row = parentId
    ? db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE profileId = ? AND ${parentColumn} = ?`).get(profileId, parentId)
    : db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE profileId = ? AND ${parentColumn} IS NULL`).get(profileId);
  return Number(row?.maxOrder ?? -1) + 1;
}

function listBookmarks() {
  const profileId = currentBrowserProfileId();
  if (!profileId) {
    return { items: [], tree: [], bar: [] };
  }

  const categories = db.prepare(`
    SELECT id, name, parentId, fields, order_num, itemType
    FROM categories
    WHERE profileId = ?
  `).all(profileId);
  const records = db.prepare(`
    SELECT id, categoryId, data, createdAt
    FROM records
    WHERE profileId = ?
  `).all(profileId);

  const result = buildBrowserBookmarkTree({
    categories,
    records,
    manualBookmarks: listManualBookmarkRows(profileId),
    manualFolders: listManualFolderRows(profileId),
  });

  if (result.overlappingManualIds.length > 0) {
    const remove = db.prepare('DELETE FROM browser_bookmarks WHERE id = ? AND profileId = ?');
    const removeOverlaps = db.transaction((ids) => {
      ids.forEach((id) => remove.run(id, profileId));
    });
    removeOverlaps(result.overlappingManualIds);
  }

  return {
    items: result.items,
    tree: result.tree,
    bar: result.bar,
  };
}

function resolveManualFolderId(folderId, profileId) {
  const text = String(folderId || '').trim();
  if (!text || text === MANUAL_BOOKMARK_FOLDER_ID) return null;
  if (text === BOOKMARK_BAR_FOLDER_ID) return BOOKMARK_BAR_FOLDER_ID;
  const folder = db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ? AND profileId = ?').get(text, profileId);
  return folder?.id || null;
}

function listScripts() {
  return db.prepare(`
    SELECT id, name, enabled, matches_json AS matchesJson, run_at AS runAt, source, updated_at AS updatedAt
    FROM browser_scripts
    ORDER BY name COLLATE NOCASE
  `).all().map((script) => ({
    ...script,
    enabled: Boolean(script.enabled),
    matches: parseJson(script.matchesJson, []),
  }));
}

export function registerBrowserHandlers() {
  setBrowserDownloadsChangedListener((items) => {
    sendEmbeddedBrowserMessage('browser:downloads-changed', items);
  });
  ipcMain.handle('browser:getPreloadPath', () => path.join(electronDistDir, 'browser-preload.js'));
  ipcMain.handle('browser:getPartition', () => BROWSER_PARTITION);
  ipcMain.handle('browser:openWindow', (_event, url) => openEmbeddedBrowserWindow(url));
  ipcMain.handle('browser:closeWindow', () => {
    closeEmbeddedBrowserWindow();
    return { success: true };
  });
  ipcMain.handle('browser:getIdleState', () => getEmbeddedBrowserIdleState());
  ipcMain.handle('setRememberBrowserWindowBounds', (_event, enabled) => (
    setRememberEmbeddedBrowserWindowBounds(enabled)
  ));
  ipcMain.handle('browser:saveLastUrl', (_event, payload) => {
    const urls = typeof payload === 'string'
      ? [payload]
      : (payload && typeof payload === 'object' ? payload.urls : []);
    const activeIndex = typeof payload === 'string'
      ? 0
      : payload?.activeIndex;
    const fallbackUrl = typeof payload === 'string'
      ? payload
      : (Array.isArray(urls) ? urls[Number(activeIndex) || 0] : '');
    const session = normalizePersistedBrowserSession(urls, activeIndex, fallbackUrl);
    const profileId = currentProfileId || '';
    const stored = readBrowserSessionForProfile(appConfig, profileId);
    const alreadyScoped = Boolean(profileId && appConfig.browserSessionsByProfile?.[profileId]);
    const same = alreadyScoped
      && JSON.stringify(stored.urls) === JSON.stringify(session.urls)
      && stored.activeIndex === session.activeIndex;
    if (same) return { success: true };
    writeBrowserSessionForProfile(appConfig, profileId, session);
    saveAppConfig();
    return { success: true };
  });

  ipcMain.handle('browser:canonicalizeUrl', (_event, input) => canonicalizeBrowserUrl(String(input || '')));

  ipcMain.handle('browser:listBookmarks', () => listBookmarks());

  ipcMain.handle('browser:addBookmark', (_event, payload = {}) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    const parsed = parseExternalHttpUrl(payload.url);
    if (!parsed) return { success: false, error: '북마크할 주소가 올바르지 않습니다.' };
    const url = canonicalizeBrowserUrl(parsed.toString()) || parsed.toString();
    const matches = findMatchingRecords(url);
    if (matches.length > 0) {
      const listed = listBookmarks();
      return {
        success: true,
        bookmark: listed.items.find((item) => item.source === 'record' && item.url === url),
      };
    }

    const existing = db.prepare('SELECT id FROM browser_bookmarks WHERE url = ? AND profileId = ?').get(url, profileId);
    if (existing) {
      return {
        success: true,
        bookmark: listBookmarks().items.find((item) => item.id === existing.id),
      };
    }

    const id = crypto.randomUUID();
    const title = String(payload.title || '').trim() || matches[0]?.label || parsed.hostname;
    const folderId = resolveManualFolderId(payload.folderId, profileId);
    db.prepare(`
      INSERT INTO browser_bookmarks (id, profileId, title, url, record_id, folder_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      profileId,
      title,
      url,
      matches[0]?.id || null,
      folderId,
      nextManualSortOrder('browser_bookmarks', 'folder_id', folderId, profileId),
      nowIso(),
    );
    return { success: true, bookmark: listBookmarks().items.find((item) => item.id === id) };
  });

  ipcMain.handle('browser:removeBookmark', (_event, id) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    db.prepare('DELETE FROM browser_bookmarks WHERE id = ? AND profileId = ?').run(String(id || ''), profileId);
    return { success: true };
  });

  ipcMain.handle('browser:renameBookmark', (_event, payload = {}) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    const id = String(payload.id || '').trim();
    const title = payload.title == null ? '' : String(payload.title);
    if (!id) return { success: false, error: '북마크를 찾을 수 없습니다.' };
    const bookmark = db.prepare('SELECT id FROM browser_bookmarks WHERE id = ? AND profileId = ?').get(id, profileId);
    if (!bookmark) return { success: false, error: '북마크를 찾을 수 없습니다.' };
    db.prepare('UPDATE browser_bookmarks SET title = ? WHERE id = ? AND profileId = ?').run(title, id, profileId);
    return { success: true, ...listBookmarks() };
  });

  ipcMain.handle('browser:addBookmarkFolder', (_event, payload = {}) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    const existingNames = db.prepare('SELECT name FROM browser_bookmark_folders WHERE profileId = ?').all(profileId).map((row) => row.name);
    const name = String(payload.name || '').trim() || nextManualFolderName(existingNames);
    if (!name) return { success: false, error: '폴더 이름을 입력해주세요.' };
    const parentId = String(payload.parentId || '').trim() || null;
    const parent = parentId
      ? db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ? AND profileId = ?').get(parentId, profileId)
      : null;
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const sortOrder = nextManualSortOrder('browser_bookmark_folders', 'parent_id', parent?.id || null, profileId);
    db.prepare(`
      INSERT INTO browser_bookmark_folders (id, profileId, name, parent_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, profileId, name, parent?.id || null, sortOrder, createdAt);
    return {
      success: true,
      folder: { id, name, parentId: parent?.id || null, sortOrder, createdAt },
    };
  });

  ipcMain.handle('browser:removeBookmarkFolder', (_event, id) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    const folderId = String(id || '').trim();
    if (!folderId) return { success: false, error: '폴더를 찾을 수 없습니다.' };
    const folder = db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ? AND profileId = ?').get(folderId, profileId);
    if (!folder) return { success: false, error: '폴더를 찾을 수 없습니다.' };

    const collectIds = db.prepare('SELECT id FROM browser_bookmark_folders WHERE parent_id = ? AND profileId = ?');
    const ids = [];
    const seen = new Set();
    const pending = [folderId];
    while (pending.length > 0) {
      const current = pending.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      ids.push(current);
      collectIds.all(current, profileId).forEach((row) => pending.push(row.id));
    }

    const removeBookmarks = db.prepare('DELETE FROM browser_bookmarks WHERE folder_id = ? AND profileId = ?');
    const removeFolder = db.prepare('DELETE FROM browser_bookmark_folders WHERE id = ? AND profileId = ?');
    const remove = db.transaction((folderIds) => {
      folderIds.forEach((item) => removeBookmarks.run(item, profileId));
      [...folderIds].reverse().forEach((item) => removeFolder.run(item, profileId));
    });
    remove(ids);
    return { success: true };
  });

  ipcMain.handle('browser:renameBookmarkFolder', (_event, payload = {}) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    const id = String(payload.id || '').trim();
    const name = String(payload.name || '').trim();
    if (!id) return { success: false, error: '폴더를 찾을 수 없습니다.' };
    if (!name) return { success: false, error: '폴더 이름을 입력해주세요.' };
    const folder = db.prepare(
      'SELECT id, parent_id AS parentId, sort_order AS sortOrder, created_at AS createdAt FROM browser_bookmark_folders WHERE id = ? AND profileId = ?'
    ).get(id, profileId);
    if (!folder) return { success: false, error: '폴더를 찾을 수 없습니다.' };
    db.prepare('UPDATE browser_bookmark_folders SET name = ? WHERE id = ? AND profileId = ?').run(name, id, profileId);
    return {
      success: true,
      folder: { id, name, parentId: folder.parentId || null, sortOrder: folder.sortOrder, createdAt: folder.createdAt },
    };
  });

  ipcMain.handle('browser:moveManualBookmarkItem', (_event, payload = {}) => {
    const profileId = currentBrowserProfileId();
    if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
    const kind = payload.kind === 'folder' ? 'folder' : 'bookmark';
    const id = String(payload.id || '').trim();
    if (!id) return { success: false, error: '이동할 항목이 없습니다.' };
    const parentId = normalizeManualParentId(payload.parentId);
    const index = Number(payload.index);
    const folders = listManualFolderRows(profileId);
    const bookmarks = listManualBookmarkRows(profileId);
    if (kind === 'bookmark' && !bookmarks.some((item) => item.id === id)) {
      return { success: false, error: '북마크를 찾을 수 없습니다.' };
    }
    if (kind === 'folder' && !folders.some((item) => item.id === id)) {
      return { success: false, error: '폴더를 찾을 수 없습니다.' };
    }

    const moved = moveManualTreeItem({
      folders,
      bookmarks,
      kind,
      id,
      parentId,
      index,
    });
    const updateFolder = db.prepare(
      'UPDATE browser_bookmark_folders SET parent_id = ?, sort_order = ? WHERE id = ? AND profileId = ?'
    );
    const updateBookmark = db.prepare(
      'UPDATE browser_bookmarks SET folder_id = ?, sort_order = ? WHERE id = ? AND profileId = ?'
    );
    db.transaction(() => {
      moved.folders.forEach((folder) => {
        updateFolder.run(folder.parentId || null, Number(folder.sortOrder ?? 0), folder.id, profileId);
      });
      moved.bookmarks.forEach((bookmark) => {
        updateBookmark.run(bookmark.folderId || null, Number(bookmark.sortOrder ?? 0), bookmark.id, profileId);
      });
    })();
    return { success: true, ...listBookmarks() };
  });

  ipcMain.handle('browser:listScripts', () => listScripts());

  ipcMain.handle('browser:saveScript', (_event, payload = {}) => {
    const name = String(payload.name || '').trim();
    const source = String(payload.source || '').trim();
    const matches = Array.isArray(payload.matches)
      ? payload.matches.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (!name) return { success: false, error: '스크립트 이름을 입력해주세요.' };
    if (!source) return { success: false, error: '스크립트 내용을 입력해주세요.' };
    if (matches.length === 0) return { success: false, error: 'URL 매치 패턴을 입력해주세요.' };

    const runAt = payload.runAt === 'document-idle' ? 'document-idle' : 'document-end';
    const enabled = payload.enabled === false ? 0 : 1;
    const id = String(payload.id || '').trim() || crypto.randomUUID();
    const updatedAt = nowIso();
    db.prepare(`
      INSERT INTO browser_scripts (id, name, enabled, matches_json, run_at, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        enabled = excluded.enabled,
        matches_json = excluded.matches_json,
        run_at = excluded.run_at,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).run(id, name, enabled, JSON.stringify(matches), runAt, source, updatedAt);
    return { success: true, script: listScripts().find((item) => item.id === id) };
  });

  ipcMain.handle('browser:deleteScript', (_event, id) => {
    db.prepare('DELETE FROM browser_scripts WHERE id = ?').run(String(id || ''));
    return { success: true };
  });

  ipcMain.handle('browser:findRecordsByUrl', (_event, url) => {
    try {
      return findMatchingRecords(String(url || ''));
    } catch (error) {
      log('레코드 URL 조회 실패:', error);
      return [];
    }
  });

  ipcMain.handle('browser:generateScript', async (_event, payload = {}) => {
    try {
      const includePageContext = payload.includePageContext !== false;
      const generated = await generateBrowserScriptWithOpenAi({
        url: payload.url,
        title: payload.title,
        intent: payload.intent,
        selectedHtml: payload.selectedHtml,
        pageHtml: payload.pageHtml,
        messages: payload.messages,
        includePageContext,
        records: includePageContext ? findMatchingRecords(String(payload.url || '')) : [],
        model: getConfiguredTranslationModel(),
      });
      return { success: true, ...generated };
    } catch (error) {
      log('브라우저 스크립트 생성 실패:', error);
      return {
        success: false,
        error: error.message || '스크립트 생성에 실패했습니다.',
        errorCode: error.code,
        errorType: error.type,
        status: error.status,
      };
    }
  });

  ipcMain.handle('browser:stagePassword', (event, payload) => stageBrowserPassword(event, payload));
  ipcMain.handle('browser:commitPassword', (event, pendingId) => commitBrowserPassword(event, pendingId));
  ipcMain.handle('browser:dismissPassword', (event, pendingId) => dismissBrowserPassword(event, pendingId));
  ipcMain.handle('browser:listPasswords', (event) => listBrowserPasswordSummaries(event));
  ipcMain.handle('browser:listPasswordsForOrigin', (event) => listBrowserPasswordsForOrigin(event));
  ipcMain.handle('browser:unlockPassword', (event, id) => unlockBrowserPassword(event, id));
  ipcMain.handle('browser:deletePassword', (event, id) => deleteBrowserPassword(event, id));
  ipcMain.handle('browser:neverSaveOrigin', (event, origin) => neverSaveBrowserOrigin(event, origin));
  ipcMain.handle('browser:listPageVideos', (_event, payload = {}) => listAndEnrichPageVideos(payload));
  ipcMain.handle('browser:downloadPageVideo', async (event, payload = {}) => (
    downloadRememberedBrowserVideo(payload, browserWindowFromEvent(event))
  ));
  ipcMain.handle('browser:previewPageVideo', (_event, payload = {}) => previewRememberedBrowserVideo(payload));
  ipcMain.handle('browser:listHistory', (_event, limit) => listBrowserHistory(limit));
  ipcMain.handle('browser:deleteHistory', (_event, id) => deleteBrowserHistoryItem(id));
  ipcMain.handle('browser:clearHistory', () => clearBrowserHistory());
  ipcMain.handle('browser:listDownloads', () => listBrowserDownloads());
  ipcMain.handle('browser:openDownload', (_event, id) => openBrowserDownload(id));
  ipcMain.handle('browser:showDownloadInFolder', (_event, id) => showBrowserDownloadInFolder(id));
  ipcMain.handle('browser:deleteDownload', (_event, id) => deleteBrowserDownload(id));
  ipcMain.handle('browser:clearDownloads', () => clearBrowserDownloads());
  ipcMain.handle('browser:downloadFiles', async (event, payload = {}) => (
    downloadBrowserFiles(payload, browserWindowFromEvent(event))
  ));
}
