import { canonicalizeBrowserUrl } from './browser-url';
import { buildBrowserBookmarkTree } from './browser-bookmark-tree';
import { buildRecordUrlMatchIndex } from './browser-record-match';
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

export function listBrowserExtensionBookmarks() {
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

  return buildBrowserBookmarkTree({
    categories,
    records,
    manualBookmarks: listManualBookmarkRows(profileId),
    manualFolders: listManualFolderRows(profileId),
  });
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
