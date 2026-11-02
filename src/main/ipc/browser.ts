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
} from '../lib/browser-bookmark-tree';
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
    SELECT id, title, url, record_id AS recordId, created_at AS createdAt
    FROM browser_bookmarks
    ORDER BY created_at DESC
  `).all();
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
    db.prepare(`
      INSERT INTO browser_bookmarks (id, title, url, record_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title, url, matches[0]?.id || null, nowIso());
    return { success: true, bookmark: listBookmarks().items.find((item) => item.id === id) };
  });

  ipcMain.handle('browser:removeBookmark', (_event, id) => {
    db.prepare('DELETE FROM browser_bookmarks WHERE id = ?').run(String(id || ''));
    return { success: true };
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
