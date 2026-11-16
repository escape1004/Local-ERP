import crypto from 'crypto';
import { canonicalizeBrowserUrl } from './browser-url';
import {
  BOOKMARK_BAR_FOLDER_ID,
  buildBrowserBookmarkTree,
  collectManualSaveTargets,
  MANUAL_BOOKMARK_FOLDER_ID,
} from './browser-bookmark-tree';
import { matchBookmarkSources } from './browser-extension-match';
import { buildRecordUrlMatchIndex } from './browser-record-match';
import { parseExternalHttpUrl } from './security';
import { db, getCurrentProfileIdOrThrow } from '../store';

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function currentBrowserProfileId() {
  try {
    return getCurrentProfileIdOrThrow();
  } catch {
    return '';
  }
}

function listManualBookmarkRows(profileId: string) {
  return db.prepare(`
    SELECT id, title, url, record_id AS recordId, folder_id AS folderId, sort_order AS sortOrder, created_at AS createdAt
    FROM browser_bookmarks
    WHERE profileId = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(profileId);
}

function listManualFolderRows(profileId: string) {
  return db.prepare(`
    SELECT id, name, parent_id AS parentId, sort_order AS sortOrder, created_at AS createdAt
    FROM browser_bookmark_folders
    WHERE profileId = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(profileId);
}

function nowIso() {
  return new Date().toISOString();
}

function nextManualSortOrder(table: string, parentColumn: string, parentId: string | null, profileId: string) {
  const row = parentId
    ? db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE profileId = ? AND ${parentColumn} = ?`).get(profileId, parentId)
    : db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE profileId = ? AND ${parentColumn} IS NULL`).get(profileId);
  return Number(row?.maxOrder ?? -1) + 1;
}

function resolveManualFolderId(folderId: string | null | undefined, profileId: string) {
  const text = String(folderId || '').trim();
  if (!text || text === MANUAL_BOOKMARK_FOLDER_ID) return null;
  if (text === BOOKMARK_BAR_FOLDER_ID) return BOOKMARK_BAR_FOLDER_ID;
  const folder = db.prepare('SELECT id FROM browser_bookmark_folders WHERE id = ? AND profileId = ?').get(text, profileId);
  return folder?.id || null;
}

export function listBrowserExtensionBookmarks() {
  const profileId = currentBrowserProfileId();
  if (!profileId) {
    return { items: [], tree: [], bar: [], saveTargets: collectManualSaveTargets([]) };
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

  const listed = buildBrowserBookmarkTree({
    categories,
    records,
    manualBookmarks: listManualBookmarkRows(profileId),
    manualFolders: listManualFolderRows(profileId),
  });
  return {
    ...listed,
    saveTargets: collectManualSaveTargets(listed.tree || []),
  };
}

export function addBrowserExtensionBookmark(payload: {
  url?: string;
  title?: string;
  folderId?: string | null;
} = {}) {
  const profileId = currentBrowserProfileId();
  if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
  const parsed = parseExternalHttpUrl(payload.url);
  if (!parsed) return { success: false, error: '북마크할 주소가 올바르지 않습니다.' };
  const url = canonicalizeBrowserUrl(parsed.toString()) || parsed.toString();
  const matches = findBrowserExtensionRecordsByUrl(url);
  const listed = listBrowserExtensionBookmarks();
  if (matches.length > 0) {
    return {
      success: true,
      bookmark: listed.items.find((item) => item.source === 'record' && item.url === url),
    };
  }

  const existing = db.prepare('SELECT id FROM browser_bookmarks WHERE url = ? AND profileId = ?').get(url, profileId) as { id: string } | undefined;
  if (existing) {
    if ('folderId' in payload) {
      const folderId = resolveManualFolderId(payload.folderId, profileId);
      db.prepare('UPDATE browser_bookmarks SET folder_id = ?, sort_order = ? WHERE id = ? AND profileId = ?').run(
        folderId,
        nextManualSortOrder('browser_bookmarks', 'folder_id', folderId, profileId),
        existing.id,
        profileId,
      );
    }
    return {
      success: true,
      bookmark: listBrowserExtensionBookmarks().items.find((item) => item.id === existing.id),
    };
  }

  const id = crypto.randomUUID();
  const title = String(payload.title || '').trim() || parsed.hostname;
  const folderId = resolveManualFolderId(payload.folderId, profileId);
  db.prepare(`
    INSERT INTO browser_bookmarks (id, profileId, title, url, record_id, folder_id, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, profileId, title, url, null, folderId, nextManualSortOrder('browser_bookmarks', 'folder_id', folderId, profileId), nowIso());
  return { success: true, bookmark: listBrowserExtensionBookmarks().items.find((item) => item.id === id) };
}

export function removeBrowserExtensionBookmark(id: string) {
  const profileId = currentBrowserProfileId();
  if (!profileId) return { success: false, error: '프로필을 선택해주세요.' };
  const bookmarkId = String(id || '').trim();
  if (!bookmarkId) return { success: false, error: '북마크를 찾을 수 없습니다.' };
  db.prepare('DELETE FROM browser_bookmarks WHERE id = ? AND profileId = ?').run(bookmarkId, profileId);
  return { success: true };
}

export function listBrowserExtensionScripts() {
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

export function findBrowserExtensionRecordsByUrl(targetUrl: string) {
  const canonical = canonicalizeBrowserUrl(targetUrl);
  if (!canonical) return [];

  const profileId = currentBrowserProfileId();
  if (!profileId) return [];

  const index = buildRecordUrlMatchIndex({
    categories: db.prepare('SELECT id, name, fields FROM categories WHERE profileId = ?').all(profileId),
    records: db.prepare('SELECT id, categoryId, data FROM records WHERE profileId = ?').all(profileId),
  });
  return index.lookup(canonical);
}

export function matchBrowserExtensionBookmarksByUrl(targetUrl: string) {
  return matchBookmarkSources({
    url: targetUrl,
    records: findBrowserExtensionRecordsByUrl(targetUrl),
    items: listBrowserExtensionBookmarks().items || [],
  });
}
