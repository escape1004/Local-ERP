import { registerUpdateIpc } from '../services/updater';
import { registerArchiveHandlers } from './archives';
import { registerBackupIpcHandlers } from './backup';
import { registerBookmarkHandlers } from './bookmarks';
import { registerBrowserHandlers } from './browser';
import { registerCategoryHandlers } from './categories';
import { registerFileHandlers } from './files';
import { registerProfileHandlers } from './profiles';
import { registerRecordHandlers } from './records';
import { registerSettingsHandlers } from './settings';
import { registerThumbnailHandlers } from './thumbnails';
import { registerTranslationHandlers } from './translation';
import { registerVideoHandlers } from './video';

export function registerAllIpcHandlers() {
  registerUpdateIpc();
  registerBrowserHandlers();
  registerBookmarkHandlers();
  registerFileHandlers();
  registerCategoryHandlers();
  registerRecordHandlers();
  registerProfileHandlers();
  registerSettingsHandlers();
  registerBackupIpcHandlers();
  registerTranslationHandlers();
  registerThumbnailHandlers();
  registerArchiveHandlers();
  registerVideoHandlers();
}
