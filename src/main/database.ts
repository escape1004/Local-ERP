import { db } from './database/connection';
import { ensureDefaultProfile } from './database/scope';
import { migrateDatabase } from './database/migrations';
import { getConfiguredBackupDir, log } from './app/state';

export function initializeDatabase() {
  try {
    migrateDatabase(db, { backupDir: getConfiguredBackupDir() });
    const defaultProfile = ensureDefaultProfile();
    db.prepare('UPDATE categories SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
    db.prepare('UPDATE records SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
    db.prepare('UPDATE browser_bookmarks SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
    db.prepare('UPDATE browser_bookmark_folders SET profileId = ? WHERE profileId IS NULL OR profileId = ?').run(defaultProfile.id, '');
  } catch (error) {
    log('Error initializing database:', error);
    throw error;
  }
}

export {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_MIGRATIONS,
  applyDatabaseSchema,
  migrateDatabase,
} from './database/migrations';
