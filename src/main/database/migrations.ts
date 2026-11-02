import fs from 'fs';
import path from 'path';
import {
  addColumnIfMissing,
  applyConnectionPragmas,
  ensureSchemaMigrationsTable,
  getSchemaVersion,
  indexExists,
  recordSchemaMigration,
} from './schema';

const YOUTUBE_RECORD_HIGHLIGHT_SCRIPT = `(async function highlightErpYoutubeRecords() {
  const ATTR = 'data-erp-record-match';
  const STYLE_ID = 'erp-record-match-style';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '[' + ATTR + ']{outline:3px solid #5865F2!important;outline-offset:2px;border-radius:12px;}';
    document.documentElement.appendChild(style);
  }
  const scan = async () => {
    if (!window.erp || typeof window.erp.findRecordsByUrl !== 'function') return;
    const anchors = Array.from(document.querySelectorAll('a[href*="/watch"], a[href*="/shorts/"]'));
    for (const anchor of anchors) {
      const target = anchor.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer') || anchor;
      if (target.getAttribute(ATTR)) continue;
      try {
        const matches = await window.erp.findRecordsByUrl(anchor.href);
        if (matches && matches.length) target.setAttribute(ATTR, '1');
      } catch (error) {
        console.error('[ERP userscript]', error);
      }
    }
  };
  await scan();
  if (!window.__erpYoutubeHighlightObserver) {
    window.__erpYoutubeHighlightObserver = new MutationObserver(() => { void scan(); });
    window.__erpYoutubeHighlightObserver.observe(document.documentElement, { childList: true, subtree: true });
    if (typeof window.erp.onUrlChange === 'function') window.erp.onUrlChange(() => { void scan(); });
  }
})();`;

export const SCHEMA_MIGRATIONS = [
  {
    version: 1,
    name: 'initial_core_tables',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE,
          createdAt TEXT,
          updatedAt TEXT
        )
      `);
      database.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE,
          parentId TEXT,
          fields TEXT NOT NULL,
          order_num INTEGER,
          createdAt TEXT,
          updatedAt TEXT,
          FOREIGN KEY (parentId) REFERENCES categories(id)
        )
      `);
      database.exec(`
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          categoryId TEXT NOT NULL,
          data TEXT NOT NULL,
          createdAt TEXT,
          updatedAt TEXT
        )
      `);
    },
  },
  {
    version: 2,
    name: 'record_media_columns',
    up(database) {
      addColumnIfMissing(database, 'records', 'duration', 'INTEGER');
      addColumnIfMissing(database, 'records', 'thumbnailPath', 'TEXT');
      addColumnIfMissing(database, 'records', 'thumbnailTimestamp', 'REAL');
    },
  },
  {
    version: 3,
    name: 'profile_scoping_and_category_meta',
    up(database) {
      addColumnIfMissing(database, 'profiles', 'avatarColor', 'TEXT');
      addColumnIfMissing(database, 'categories', 'profileId', 'TEXT');
      addColumnIfMissing(database, 'records', 'profileId', 'TEXT');
      addColumnIfMissing(database, 'categories', 'itemType', "TEXT DEFAULT 'category'");
      addColumnIfMissing(database, 'categories', 'memo', 'TEXT');
      database.exec("UPDATE categories SET itemType = 'category' WHERE itemType IS NULL OR itemType = ''");
    },
  },
  {
    version: 4,
    name: 'record_view_counts',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS record_view_counts (
          profileId TEXT NOT NULL,
          recordId TEXT NOT NULL,
          categoryId TEXT NOT NULL,
          viewCount INTEGER NOT NULL DEFAULT 0,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (profileId, recordId)
        )
      `);
      if (!indexExists(database, 'idx_record_view_counts_profile_category')) {
        database.exec(
          'CREATE INDEX IF NOT EXISTS idx_record_view_counts_profile_category ON record_view_counts(profileId, categoryId)'
        );
      }
    },
  },
  {
    version: 5,
    name: 'embedded_browser_tables',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS browser_bookmarks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT NOT NULL UNIQUE,
          record_id TEXT,
          created_at TEXT NOT NULL
        )
      `);
      database.exec(`
        CREATE TABLE IF NOT EXISTS browser_scripts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          matches_json TEXT NOT NULL,
          run_at TEXT NOT NULL,
          source TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      database.prepare(`
        INSERT OR IGNORE INTO browser_scripts (id, name, enabled, matches_json, run_at, source, updated_at)
        VALUES (?, ?, 1, ?, 'document-idle', ?, ?)
      `).run(
        'youtube-record-highlight',
        '유튜브 레코드 영상 강조',
        JSON.stringify(['*://www.youtube.com/*', '*://m.youtube.com/*', '*://music.youtube.com/*']),
        YOUTUBE_RECORD_HIGHLIGHT_SCRIPT,
        new Date().toISOString(),
      );
    },
  },
  {
    version: 6,
    name: 'browser_bookmark_folders',
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS browser_bookmark_folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          parent_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (parent_id) REFERENCES browser_bookmark_folders(id)
        )
      `);
      addColumnIfMissing(database, 'browser_bookmarks', 'folder_id', 'TEXT');
    },
  },
  {
    version: 7,
    name: 'browser_bookmark_sort_order',
    up(database) {
      addColumnIfMissing(database, 'browser_bookmarks', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'browser_bookmark_folders', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');

      const updateFolder = database.prepare('UPDATE browser_bookmark_folders SET sort_order = ? WHERE id = ?');
      const foldersByParent = new Map();
      database.prepare(
        'SELECT id, parent_id FROM browser_bookmark_folders ORDER BY created_at ASC, name COLLATE NOCASE'
      ).all().forEach((folder) => {
        const key = folder.parent_id || '';
        const list = foldersByParent.get(key) || [];
        list.push(folder);
        foldersByParent.set(key, list);
      });
      foldersByParent.forEach((list) => {
        list.forEach((folder, index) => updateFolder.run(index, folder.id));
      });

      const updateBookmark = database.prepare('UPDATE browser_bookmarks SET sort_order = ? WHERE id = ?');
      const bookmarksByFolder = new Map();
      database.prepare(
        'SELECT id, folder_id FROM browser_bookmarks ORDER BY created_at ASC'
      ).all().forEach((bookmark) => {
        const key = bookmark.folder_id || '';
        const list = bookmarksByFolder.get(key) || [];
        list.push(bookmark);
        bookmarksByFolder.set(key, list);
      });
      bookmarksByFolder.forEach((list) => {
        list.forEach((bookmark, index) => updateBookmark.run(index, bookmark.id));
      });
    },
  },
];

export const CURRENT_SCHEMA_VERSION = SCHEMA_MIGRATIONS[SCHEMA_MIGRATIONS.length - 1].version;

assertMigrationList(SCHEMA_MIGRATIONS);

function assertMigrationList(migrations) {
  const seen = new Set();
  let previousVersion = 0;

  migrations.forEach((migration) => {
    if (!Number.isInteger(migration.version) || migration.version <= previousVersion) {
      throw new Error(`Database migrations must use increasing integer versions: ${migration.version}`);
    }
    if (!migration.name || typeof migration.up !== 'function') {
      throw new Error(`Database migration ${migration.version} is missing a name or up() implementation`);
    }
    if (seen.has(migration.name)) {
      throw new Error(`Duplicate database migration name: ${migration.name}`);
    }
    seen.add(migration.name);
    previousVersion = migration.version;
  });
}

export function createPreMigrationBackup(database, backupDir) {
  const sourcePath = database.name;
  if (!sourcePath || sourcePath === ':memory:') {
    throw new Error('Refusing to migrate a database that is not a local file');
  }

  fs.mkdirSync(backupDir, { recursive: true });
  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const currentVersion = getSchemaVersion(database);
  const backupPath = path.join(backupDir, `pre-migration-v${currentVersion}-${timestamp}.db`);
  fs.copyFileSync(sourcePath, backupPath);
  return backupPath;
}

export function migrateDatabase(database, options) {
  const {
    migrations = SCHEMA_MIGRATIONS,
    skipBackup = false,
    backupDir = null,
  } = options || {};

  applyConnectionPragmas(database);
  ensureSchemaMigrationsTable(database);
  assertMigrationList(migrations);

  const currentVersion = getSchemaVersion(database);
  const pending = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((left, right) => left.version - right.version);

  if (pending.length === 0) {
    return {
      appliedVersions: [],
      version: currentVersion,
      backupPath: null,
    };
  }

  let backupPath = null;
  if (!skipBackup) {
    if (!backupDir) {
      throw new Error('backupDir is required before applying database migrations');
    }
    backupPath = createPreMigrationBackup(database, backupDir);
  }

  const applyPending = database.transaction((pendingMigrations) => {
    pendingMigrations.forEach((migration) => {
      database.transaction(() => {
        migration.up(database);
        recordSchemaMigration(database, migration.version, migration.name);
      })();
    });
  });

  applyPending(pending);

  return {
    appliedVersions: pending.map((migration) => migration.version),
    version: getSchemaVersion(database),
    backupPath,
  };
}

export function applyDatabaseSchema(database, options) {
  return migrateDatabase(database, { skipBackup: true, ...(options || {}) });
}
