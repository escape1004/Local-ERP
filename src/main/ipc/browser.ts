import crypto from 'crypto';
import path from 'path';
import { ipcMain } from 'electron';
import { electronDistDir } from '../ffmpeg-paths';
import {
  canonicalizeBrowserUrl,
  urlsReferToSameResource,
} from '../lib/browser-url';
import {
  buildBrowserBookmarkTree,
  collectRecordHttpUrls,
  getBrowserRecordLabel,
  nextManualFolderName,
} from '../lib/browser-bookmark-tree';
import { moveManualTreeItem, normalizeManualParentId } from '../lib/browser-bookmark-move';
import { parseExternalHttpUrl } from '../lib/security';
import {
  db,
  getConfiguredTranslationModel,
  getCurrentProfileIdOrThrow,
  log,
} from '../store';
import {
  closeEmbeddedBrowserWindow,
  isEmbeddedBrowserWindowFocused,
  openEmbeddedBrowserWindow,
} from '../app/browser-window';
import { generateBrowserScriptWithOpenAi } from '../services/browser-ai';
import { BROWSER_PARTITION } from '../services/embedded-browser';

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

function findMatchingRecords(targetUrl) {
  const canonical = canonicalizeBrowserUrl(targetUrl);
  if (!canonical) return [];

  let profileId = '';
  try {
    profileId = getCurrentProfileIdOrThrow();
  } catch {
    return [];
  }

  const categories = db.prepare('SELECT id, name, fields FROM categories WHERE profileId = ?').all(profileId);
  const categoryById = new Map(categories.map((category) => [
    category.id,
    { ...category, fields: parseJson(category.fields, []) },
  ]));
  const records = db.prepare('SELECT id, categoryId, data FROM records WHERE profileId = ?').all(profileId);

  return records.flatMap((record) => {
    const data = parseJson(record.data, {});
    const category = categoryById.get(record.categoryId);
    const urls = collectRecordHttpUrls({ ...record, data }, category)
      .filter((item) => urlsReferToSameResource(item, canonical));
    if (urls.length === 0) return [];
    return [{
      id: record.id,
      categoryId: record.categoryId,
      label: getBrowserRecordLabel({ ...record, data }, category),
      urls,
    }];
  });
}

function listManualBookmarkRows() {
  return db.prepare(`
    SELECT id, title, url, record_id AS recordId, folder_id AS folderId, sort_order AS sortOrder, created_at AS createdAt
    FROM browser_bookmarks
    ORDER BY sort_order ASC, created_at ASC
  `).all();
}

function listManualFolderRows() {
  return db.prepare(`
    SELECT id, name, parent_id AS parentId, sort_order AS sortOrder, created_at AS createdAt
    FROM browser_bookmark_folders
    ORDER BY sort_order ASC, created_at ASC
  `).all();
}

function nextManualSortOrder(table, parentColumn, parentId) {
  const row = parentId
    ? db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE ${parentColumn} = ?`).get(parentId)
    : db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE ${parentColumn} IS NULL`).get();
  return Number(row?.maxOrder ?? -1) + 1;
}

function listBookmarks() {
  let profileId = '';
  try {
    profileId = getCurrentProfileIdOrThrow();
  } catch {
    return { items: [], tree: [] };
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
    manualBookmarks: listManualBookmarkRows(),
    manualFolders: listManualFolderRows(),
  });

  if (result.overlappingManualIds.length > 0) {
    const remove = db.prepare('DELETE FROM browser_bookmarks WHERE id = ?');
    const removeOverlaps = db.transaction((ids) => {
      ids.forEach((id) => remove.run(id));
    });
    removeOverlaps(result.overlappingManualIds);
  }

  return {
    items: result.items,
    tree: result.tree,
  };
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
  ipcMain.handle('browser:getPreloadPath', () => path.join(electronDistDir, 'browser-preload.js'));
  ipcMain.handle('browser:getPartition', () => BROWSER_PARTITION);
  ipcMain.handle('browser:openWindow', (_event, url) => openEmbeddedBrowserWindow(url));
  ipcMain.handle('browser:closeWindow', () => {
    closeEmbeddedBrowserWindow();
    return { success: true };
  });
  ipcMain.handle('browser:isWindowFocused', () => isEmbeddedBrowserWindowFocused());

  ipcMain.handle('browser:canonicalizeUrl', (_event, input) => canonicalizeBrowserUrl(String(input || '')));

  ipcMain.handle('browser:listBookmarks', () => listBookmarks());

  ipcMain.handle('browser:addBookmark', (_event, payload = {}) => {
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

    const existing = db.prepare('SELECT id FROM browser_bookmarks WHERE url = ?').get(url);
    if (existing) {
      return {
        success: true,
        bookmark: listBookmarks().items.find((item) => item.id === existing.id),
      };
    }

    const id = crypto.randomUUID();
    const title = String(payload.title || '').trim() || matches[0]?.label || parsed.hostname;
    const folderId = String(payload.folderId || '').trim() || null;
    const folder = folderId
      ? db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ?').get(folderId)
      : null;
    db.prepare(`
      INSERT INTO browser_bookmarks (id, title, url, record_id, folder_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title,
      url,
      matches[0]?.id || null,
      folder?.id || null,
      nextManualSortOrder('browser_bookmarks', 'folder_id', folder?.id || null),
      nowIso(),
    );
    return { success: true, bookmark: listBookmarks().items.find((item) => item.id === id) };
  });

  ipcMain.handle('browser:removeBookmark', (_event, id) => {
    db.prepare('DELETE FROM browser_bookmarks WHERE id = ?').run(String(id || ''));
    return { success: true };
  });

  ipcMain.handle('browser:addBookmarkFolder', (_event, payload = {}) => {
    const existingNames = db.prepare('SELECT name FROM browser_bookmark_folders').all().map((row) => row.name);
    const name = String(payload.name || '').trim() || nextManualFolderName(existingNames);
    if (!name) return { success: false, error: '폴더 이름을 입력해주세요.' };
    const parentId = String(payload.parentId || '').trim() || null;
    const parent = parentId
      ? db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ?').get(parentId)
      : null;
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const sortOrder = nextManualSortOrder('browser_bookmark_folders', 'parent_id', parent?.id || null);
    db.prepare(`
      INSERT INTO browser_bookmark_folders (id, name, parent_id, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, parent?.id || null, sortOrder, createdAt);
    return {
      success: true,
      folder: { id, name, parentId: parent?.id || null, sortOrder, createdAt },
    };
  });

  ipcMain.handle('browser:removeBookmarkFolder', (_event, id) => {
    const folderId = String(id || '').trim();
    if (!folderId) return { success: false, error: '폴더를 찾을 수 없습니다.' };
    const folder = db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ?').get(folderId);
    if (!folder) return { success: false, error: '폴더를 찾을 수 없습니다.' };

    const collectIds = db.prepare('SELECT id FROM browser_bookmark_folders WHERE parent_id = ?');
    const ids = [];
    const seen = new Set();
    const pending = [folderId];
    while (pending.length > 0) {
      const current = pending.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      ids.push(current);
      collectIds.all(current).forEach((row) => pending.push(row.id));
    }

    const removeBookmarks = db.prepare('DELETE FROM browser_bookmarks WHERE folder_id = ?');
    const removeFolder = db.prepare('DELETE FROM browser_bookmark_folders WHERE id = ?');
    const remove = db.transaction((folderIds) => {
      folderIds.forEach((item) => removeBookmarks.run(item));
      [...folderIds].reverse().forEach((item) => removeFolder.run(item));
    });
    remove(ids);
    return { success: true };
  });

  ipcMain.handle('browser:renameBookmarkFolder', (_event, payload = {}) => {
    const id = String(payload.id || '').trim();
    const name = String(payload.name || '').trim();
    if (!id) return { success: false, error: '폴더를 찾을 수 없습니다.' };
    if (!name) return { success: false, error: '폴더 이름을 입력해주세요.' };
    const folder = db.prepare(
      'SELECT id, parent_id AS parentId, sort_order AS sortOrder, created_at AS createdAt FROM browser_bookmark_folders WHERE id = ?'
    ).get(id);
    if (!folder) return { success: false, error: '폴더를 찾을 수 없습니다.' };
    db.prepare('UPDATE browser_bookmark_folders SET name = ? WHERE id = ?').run(name, id);
    return {
      success: true,
      folder: { id, name, parentId: folder.parentId || null, sortOrder: folder.sortOrder, createdAt: folder.createdAt },
    };
  });

  ipcMain.handle('browser:moveManualBookmarkItem', (_event, payload = {}) => {
    const kind = payload.kind === 'folder' ? 'folder' : 'bookmark';
    const id = String(payload.id || '').trim();
    if (!id) return { success: false, error: '이동할 항목이 없습니다.' };
    const parentId = normalizeManualParentId(payload.parentId);
    const index = Number(payload.index);
    const folders = listManualFolderRows();
    const bookmarks = listManualBookmarkRows();
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
      'UPDATE browser_bookmark_folders SET parent_id = ?, sort_order = ? WHERE id = ?'
    );
    const updateBookmark = db.prepare(
      'UPDATE browser_bookmarks SET folder_id = ?, sort_order = ? WHERE id = ?'
    );
    db.transaction(() => {
      moved.folders.forEach((folder) => {
        updateFolder.run(folder.parentId || null, Number(folder.sortOrder ?? 0), folder.id);
      });
      moved.bookmarks.forEach((bookmark) => {
        updateBookmark.run(bookmark.folderId || null, Number(bookmark.sortOrder ?? 0), bookmark.id);
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
      const generated = await generateBrowserScriptWithOpenAi({
        url: payload.url,
        intent: payload.intent,
        selectedHtml: payload.selectedHtml,
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
}
