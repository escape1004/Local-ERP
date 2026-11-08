import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_MIGRATIONS,
  migrateDatabase,
} from './migrations';
import { getSchemaVersion, getTableColumns, tableExists } from './schema';
import { isInsideDir, withTempSqlite } from '../../test/temp-sqlite';

function withMigrationDb(run) {
  return withTempSqlite((temp) => {
    expect(temp.file).toContain('local-erp-test-');
    expect(path.basename(temp.file)).not.toBe('erp.db');
    expect(temp.file.includes(`${path.sep}Local ERP${path.sep}`)).toBe(false);
    expect(isInsideDir(temp.dir, temp.file)).toBe(true);
    return run({
      ...temp,
      backupDir: path.join(temp.dir, 'backups'),
    });
  });
}

function migrate(database, backupDir, extra = {}) {
  return migrateDatabase(database, { backupDir, ...extra });
}

function seedLegacySchema(database) {
  database.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      fields TEXT NOT NULL,
      order_num INTEGER,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      categoryId TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    );
  `);
  database.prepare(
    'INSERT INTO profiles (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
  ).run('profile-1', 'Studio', '2024-01-01', '2024-01-02');
  database.prepare(
    'INSERT INTO categories (id, name, parentId, fields, order_num, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('cat-1', 'Movies', null, '[]', 0, '2024-01-01', '2024-01-01');
  database.prepare(
    'INSERT INTO records (id, categoryId, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  ).run('rec-1', 'cat-1', '{"title":"kept"}', '2024-01-03', '2024-01-04');
}

function seedCurrentUnversionedSchema(database) {
  database.exec(`
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE,
      avatarColor TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      profileId TEXT,
      name TEXT NOT NULL COLLATE NOCASE,
      parentId TEXT,
      fields TEXT NOT NULL,
      order_num INTEGER,
      itemType TEXT DEFAULT 'category',
      memo TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      FOREIGN KEY (parentId) REFERENCES categories(id)
    );
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      profileId TEXT,
      categoryId TEXT NOT NULL,
      data TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT,
      duration INTEGER,
      thumbnailPath TEXT,
      thumbnailTimestamp REAL
    );
    CREATE TABLE record_view_counts (
      profileId TEXT NOT NULL,
      recordId TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      viewCount INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL,
      PRIMARY KEY (profileId, recordId)
    );
    CREATE INDEX idx_record_view_counts_profile_category
      ON record_view_counts(profileId, categoryId);
  `);
  database.prepare(
    'INSERT INTO profiles (id, name, avatarColor, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  ).run('profile-1', 'Studio', '#111111', '2024-01-01', '2024-01-02');
  database.prepare(
    'INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt, duration) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('rec-1', 'profile-1', 'cat-1', '{"title":"v1.1.19"}', '2024-01-03', '2024-01-04', 12);
}

function expectLatestSchema(database) {
  expect(getSchemaVersion(database)).toBe(CURRENT_SCHEMA_VERSION);
  expect(tableExists(database, 'profiles')).toBe(true);
  expect(tableExists(database, 'categories')).toBe(true);
  expect(tableExists(database, 'records')).toBe(true);
  expect(tableExists(database, 'record_view_counts')).toBe(true);
  expect(tableExists(database, 'browser_bookmarks')).toBe(true);
  expect(tableExists(database, 'browser_bookmark_folders')).toBe(true);
  expect(tableExists(database, 'browser_scripts')).toBe(true);
  expect(tableExists(database, 'record_references')).toBe(true);
  expect(tableExists(database, 'browser_history')).toBe(true);
  expect(tableExists(database, 'browser_downloads')).toBe(true);
  expect(getTableColumns(database, 'profiles')).toEqual(expect.arrayContaining([
    'id', 'name', 'avatarColor', 'createdAt', 'updatedAt',
  ]));
  expect(getTableColumns(database, 'categories')).toEqual(expect.arrayContaining([
    'id', 'profileId', 'name', 'parentId', 'fields', 'order_num', 'itemType', 'memo', 'createdAt', 'updatedAt',
  ]));
  expect(getTableColumns(database, 'records')).toEqual(expect.arrayContaining([
    'id', 'profileId', 'categoryId', 'data', 'createdAt', 'updatedAt', 'duration', 'thumbnailPath', 'thumbnailTimestamp',
  ]));
  expect(getTableColumns(database, 'record_view_counts')).toEqual(expect.arrayContaining([
    'profileId', 'recordId', 'categoryId', 'viewCount', 'updatedAt',
  ]));
  expect(getTableColumns(database, 'browser_bookmarks')).toEqual(expect.arrayContaining([
    'id', 'title', 'url', 'record_id', 'folder_id', 'sort_order', 'created_at',
  ]));
  expect(getTableColumns(database, 'browser_bookmark_folders')).toEqual(expect.arrayContaining([
    'id', 'name', 'parent_id', 'sort_order', 'created_at',
  ]));
  expect(getTableColumns(database, 'browser_scripts')).toEqual(expect.arrayContaining([
    'id', 'name', 'enabled', 'matches_json', 'run_at', 'source', 'updated_at',
  ]));
  expect(getTableColumns(database, 'record_references')).toEqual(expect.arrayContaining([
    'source_record_id', 'target_record_id', 'sort_order', 'created_at',
  ]));
  expect(database.prepare('SELECT id FROM browser_scripts WHERE id = ?').get('youtube-record-highlight'))
    .toBeUndefined();
  expect(database.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
  expect(String(database.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase()).toBe('wal');
}

test('creates the latest schema version on an empty database', () => {
  withMigrationDb((temp) => {
    const result = migrate(temp.database, temp.backupDir);

    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.appliedVersions).toEqual(SCHEMA_MIGRATIONS.map((migration) => migration.version));
    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(isInsideDir(temp.backupDir, result.backupPath)).toBe(true);
    expect(path.basename(result.backupPath)).toMatch(/^pre-migration-v0-.+\.db$/);
    expect(path.basename(result.backupPath)).not.toBe('erp.db');
    expect(result.backupPath.includes(`${path.sep}Local ERP${path.sep}`)).toBe(false);
    expectLatestSchema(temp.database);
  });
});

test('migrates a legacy schema to the latest version and preserves rows', () => {
  withMigrationDb((temp) => {
    seedLegacySchema(temp.database);

    const result = migrate(temp.database, temp.backupDir);

    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expectLatestSchema(temp.database);
    expect(temp.database.prepare('SELECT * FROM profiles WHERE id = ?').get('profile-1')).toMatchObject({
      id: 'profile-1',
      name: 'Studio',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    });
    expect(temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-1').data).toBe('{"title":"kept"}');
  });
});

test('stamps an existing v1.1.19 database without rewriting user data', () => {
  withMigrationDb((temp) => {
    seedCurrentUnversionedSchema(temp.database);

    const result = migrate(temp.database, temp.backupDir);

    expect(result.version).toBe(CURRENT_SCHEMA_VERSION);
    expectLatestSchema(temp.database);
    expect(temp.database.prepare('SELECT * FROM records WHERE id = ?').get('rec-1')).toMatchObject({
      id: 'rec-1',
      profileId: 'profile-1',
      data: '{"title":"v1.1.19"}',
      duration: 12,
    });
    const indexCount = temp.database.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_record_view_counts_profile_category'"
    ).get();
    expect(indexCount.count).toBe(1);
  });
});

test('removes the bundled youtube highlight script from an existing browser database', () => {
  withMigrationDb((temp) => {
    migrate(temp.database, temp.backupDir, {
      migrations: SCHEMA_MIGRATIONS.filter((migration) => migration.version <= 7),
    });
    temp.database.prepare(`
      INSERT INTO browser_scripts (id, name, enabled, matches_json, run_at, source, updated_at)
      VALUES (?, ?, 1, ?, 'document-idle', ?, ?)
    `).run(
      'youtube-record-highlight',
      '유튜브 레코드 영상 강조',
      '["*://www.youtube.com/*"]',
      'old()',
      '2026-01-01',
    );

    const result = migrate(temp.database, temp.backupDir);

    expect(result.appliedVersions).toEqual([8, 9, 10]);
    expect(temp.database.prepare('SELECT id FROM browser_scripts WHERE id = ?').get('youtube-record-highlight'))
      .toBeUndefined();
    expect(tableExists(temp.database, 'record_references')).toBe(true);
  });
});

test('adds record_references when upgrading from version 8', () => {
  withMigrationDb((temp) => {
    migrate(temp.database, temp.backupDir, {
      migrations: SCHEMA_MIGRATIONS.filter((migration) => migration.version <= 8),
    });
    expect(tableExists(temp.database, 'record_references')).toBe(false);

    const result = migrate(temp.database, temp.backupDir);

    expect(result.appliedVersions).toEqual([9, 10]);
    expect(tableExists(temp.database, 'record_references')).toBe(true);
    expect(getTableColumns(temp.database, 'record_references')).toEqual(expect.arrayContaining([
      'source_record_id', 'target_record_id', 'sort_order', 'created_at',
    ]));
  });
});

test('adds browser history and downloads when upgrading from version 9', () => {
  withMigrationDb((temp) => {
    migrate(temp.database, temp.backupDir, {
      migrations: SCHEMA_MIGRATIONS.filter((migration) => migration.version <= 9),
    });
    expect(tableExists(temp.database, 'browser_history')).toBe(false);
    expect(tableExists(temp.database, 'browser_downloads')).toBe(false);

    const result = migrate(temp.database, temp.backupDir);

    expect(result.appliedVersions).toEqual([10]);
    expect(tableExists(temp.database, 'browser_history')).toBe(true);
    expect(tableExists(temp.database, 'browser_downloads')).toBe(true);
    expect(getTableColumns(temp.database, 'browser_history')).toEqual(expect.arrayContaining([
      'id', 'url', 'title', 'visited_at',
    ]));
    expect(getTableColumns(temp.database, 'browser_downloads')).toEqual(expect.arrayContaining([
      'id', 'filename', 'url', 'file_path', 'kind', 'state',
    ]));
  });
});

test('re-running migrations on the latest database is a no-op', () => {
  withMigrationDb((temp) => {
    migrate(temp.database, temp.backupDir);
    const before = fs.readdirSync(temp.backupDir);

    const result = migrate(temp.database, temp.backupDir);

    expect(result).toEqual({
      appliedVersions: [],
      version: CURRENT_SCHEMA_VERSION,
      backupPath: null,
    });
    expect(fs.readdirSync(temp.backupDir)).toEqual(before);
    expectLatestSchema(temp.database);
  });
});

test('rolls back the whole run when a later migration fails', () => {
  withMigrationDb((temp) => {
    seedLegacySchema(temp.database);

    const failingMigrations = [
      ...SCHEMA_MIGRATIONS,
      {
        version: CURRENT_SCHEMA_VERSION + 1,
        name: 'intentional_failure',
        up() {
          throw new Error('migration boom');
        },
      },
    ];

    expect(() => migrate(temp.database, temp.backupDir, { migrations: failingMigrations }))
      .toThrow(/migration boom/);

    expect(getSchemaVersion(temp.database)).toBe(0);
    expect(getTableColumns(temp.database, 'records')).toEqual([
      'id', 'categoryId', 'data', 'createdAt', 'updatedAt',
    ]);
    expect(tableExists(temp.database, 'record_view_counts')).toBe(false);
    expect(temp.database.prepare('SELECT data FROM records WHERE id = ?').get('rec-1').data).toBe('{"title":"kept"}');
    expect(temp.database.prepare('SELECT name FROM profiles WHERE id = ?').get('profile-1').name).toBe('Studio');
  });
});

test('preserves existing profile and record data through a successful upgrade', () => {
  withMigrationDb((temp) => {
    seedLegacySchema(temp.database);

    migrate(temp.database, temp.backupDir);

    const profile = temp.database.prepare('SELECT * FROM profiles WHERE id = ?').get('profile-1');
    const record = temp.database.prepare('SELECT * FROM records WHERE id = ?').get('rec-1');
    expect(profile).toMatchObject({
      id: 'profile-1',
      name: 'Studio',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    });
    expect(record).toMatchObject({
      id: 'rec-1',
      categoryId: 'cat-1',
      data: '{"title":"kept"}',
      createdAt: '2024-01-03',
      updatedAt: '2024-01-04',
    });
  });
});

test('copies the pre-migration database into the temp backup directory', () => {
  withMigrationDb((temp) => {
    seedLegacySchema(temp.database);

    const result = migrate(temp.database, temp.backupDir);
    expect(isInsideDir(temp.backupDir, result.backupPath)).toBe(true);

    const backup = new Database(result.backupPath, { readonly: true, fileMustExist: true });
    try {
      expect(getTableColumns(backup, 'records')).toEqual([
        'id', 'categoryId', 'data', 'createdAt', 'updatedAt',
      ]);
      expect(tableExists(backup, 'record_view_counts')).toBe(false);
      expect(backup.prepare('SELECT data FROM records WHERE id = ?').get('rec-1').data).toBe('{"title":"kept"}');
      expect(backup.prepare('SELECT name FROM profiles WHERE id = ?').get('profile-1').name).toBe('Studio');
    } finally {
      backup.close();
    }

    expectLatestSchema(temp.database);
  });
});
