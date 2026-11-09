import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { NewCategory, CategoryUpdate, NewRecord, ElectronAPI } from '../types';

const allowedSendChannels = new Set(['window-control']);

const isStandaloneBrowserWindow = () => {
  try {
    return new URLSearchParams(window.location.search).get('role') === 'browser';
  } catch {
    return false;
  }
};

const setupMouseBackButtonPrevention = () => {
  if (isStandaloneBrowserWindow()) return;

  const preventMouseBackButton = (event: MouseEvent) => {
    if (event.button !== 3) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const currentPath = window.location.hash || '#/dashboard';
    window.history.pushState({ preventBack: true }, '', currentPath);
    return false;
  };

  document.addEventListener('auxclick', preventMouseBackButton, true);
  document.addEventListener('mousedown', preventMouseBackButton, true);
  document.addEventListener('mouseup', preventMouseBackButton, true);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMouseBackButtonPrevention);
} else {
  setupMouseBackButtonPrevention();
}

const api: ElectronAPI = {
  getAppUpdateState: () => ipcRenderer.invoke('app-update:get-state'),
  checkForAppUpdates: () => ipcRenderer.invoke('app-update:check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-update:download'),
  installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
  onAppUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => callback(state);
    ipcRenderer.on('app-update:state', listener);
    return () => ipcRenderer.removeListener('app-update:state', listener);
  },
  getTables: () => ipcRenderer.invoke('db:getTables'),
  getTableData: (tableName: string, options?: { page?: number; pageSize?: number }) => ipcRenderer.invoke('db:getTableData', tableName, options),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  openDbFile: () => ipcRenderer.invoke('db:openFile'),
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  getRecords: (categoryId: string) => ipcRenderer.invoke('db:getRecords', categoryId),
  addCategory: (category: NewCategory) => ipcRenderer.invoke('db:addCategory', category),
  updateCategory: (id: string, updates: CategoryUpdate) => ipcRenderer.invoke('db:updateCategory', id, updates),
  deleteCategory: (id: string) => ipcRenderer.invoke('db:deleteCategory', id),
  moveCategoryToProfile: (categoryId: string, targetProfileId: string) => ipcRenderer.invoke('db:moveCategoryToProfile', categoryId, targetProfileId),
  exportCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('category:exportRecords', categoryId, format),
  importCategoryRecords: (categoryId: string, format: 'csv' | 'xlsx') => ipcRenderer.invoke('category:importRecords', categoryId, format),
  addRecord: (record: NewRecord) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (id: string, data: Record<string, any>, relatedRecordIds?: string[]) => ipcRenderer.invoke('db:updateRecord', id, data, relatedRecordIds),
  deleteRecord: (id: string) => ipcRenderer.invoke('db:deleteRecord', id),
  listRelatedRecords: (recordId: string) => ipcRenderer.invoke('db:listRelatedRecords', recordId),
  searchRelatedRecords: (payload) => ipcRenderer.invoke('db:searchRelatedRecords', payload),
  exportCategory: (categoryId: string) => ipcRenderer.invoke('category:export', categoryId),
  importCategories: () => ipcRenderer.invoke('category:import'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openFileDialog: (defaultPath?: string) => ipcRenderer.invoke('openFileDialog', defaultPath),
  openDirectoryDialog: () => ipcRenderer.invoke('openDirectoryDialog'),
  openImageFileDialog: (defaultPath?: string) => ipcRenderer.invoke('openImageFileDialog', defaultPath),
  send: (channel: string, ...args: any[]) => {
    if (!allowedSendChannels.has(channel)) {
      throw new Error(`Unsupported renderer IPC channel: ${channel}`);
    }
    ipcRenderer.send(channel, ...args);
  },
  openFile: (filePath: string) => ipcRenderer.invoke('openFile', filePath),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('checkFileExists', filePath),
  getDashboardWarnings: (previewLimit?: number, categoryIds?: string[]) => ipcRenderer.invoke('dashboard:getWarnings', previewLimit, categoryIds),
  incrementRecordViewCount: (categoryId: string, recordId: string) => ipcRenderer.invoke('record:incrementViewCount', categoryId, recordId),
  getRecordViewCounts: () => ipcRenderer.invoke('dashboard:getRecordViewCounts'),
  generateThumbnail: (filePath: string) => ipcRenderer.invoke('generateThumbnail', filePath),
  getThumbnailDataUrl: (filePath: string) => ipcRenderer.invoke('getThumbnailDataUrl', filePath),
  getFileDataUrl: (filePath: string) => ipcRenderer.invoke('getFileDataUrl', filePath),
  getVideoSubtitles: (filePath: string) => ipcRenderer.invoke('getVideoSubtitles', filePath),
  getVideoBlobUrl: (filePath: string) => ipcRenderer.invoke('getVideoBlobUrl', filePath),
  getVideoStream: (filePath: string) => ipcRenderer.invoke('getVideoStream', filePath),
  getArchiveFiles: (filePath: string) => ipcRenderer.invoke('getArchiveFiles', filePath),
  openArchiveFile: (archivePath: string, fileName: string) => ipcRenderer.invoke('openArchiveFile', archivePath, fileName),
  getArchiveFileDataUrl: (filePath: string, fileName: string) => ipcRenderer.invoke('getArchiveFileDataUrl', filePath, fileName),
  getArchiveFileText: (filePath: string, fileName: string) => ipcRenderer.invoke('getArchiveFileText', filePath, fileName),
  getArchiveFileStreamInfo: (filePath: string, fileName: string) => ipcRenderer.invoke('getArchiveFileStreamInfo', filePath, fileName),
  getConfig: () => ipcRenderer.invoke('getConfig'),
  openBackupLocation: () => ipcRenderer.invoke('openBackupLocation'),
  backupDatabase: () => ipcRenderer.invoke('backupDatabase'),
  resetDatabase: () => ipcRenderer.invoke('resetDatabase'),
  setBackupDir: () => ipcRenderer.invoke('setBackupDir'),
  setBackupInterval: (minutes: number) => ipcRenderer.invoke('setBackupInterval', minutes),
  setBackupEnabled: (enabled: boolean) => ipcRenderer.invoke('setBackupEnabled', enabled),
  setRememberWindowBounds: (enabled: boolean) => ipcRenderer.invoke('setRememberWindowBounds', enabled),
  setCategoryOrderLocked: (locked: boolean) => ipcRenderer.invoke('setCategoryOrderLocked', locked),
  setRememberBrowserWindowBounds: (enabled: boolean) => ipcRenderer.invoke('setRememberBrowserWindowBounds', enabled),
  setBrowserStartupMode: (mode: 'newtab' | 'continue') => ipcRenderer.invoke('setBrowserStartupMode', mode),
  setMuteInactiveBrowserTabs: (enabled: boolean) => ipcRenderer.invoke('setMuteInactiveBrowserTabs', enabled),
  setBrowserTrackerBlocking: (enabled: boolean) => ipcRenderer.invoke('setBrowserTrackerBlocking', enabled),
  setBrowserBlockedDomains: (domains) => ipcRenderer.invoke('setBrowserBlockedDomains', domains),
  setMuteAudioWhenBackgrounded: (enabled: boolean) => ipcRenderer.invoke('setMuteAudioWhenBackgrounded', enabled),
  setPictureInPictureActive: (active: boolean) => ipcRenderer.invoke('setPictureInPictureActive', active),
  setViewerFullscreen: (enabled: boolean) => ipcRenderer.invoke('viewer:setFullscreen', enabled),
  onViewerFullscreenChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen);
    ipcRenderer.on('viewer:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('viewer:fullscreen-changed', listener);
  },
  setZoomPercent: (percent: number) => ipcRenderer.invoke('setZoomPercent', percent),
  setThumbnailPreviewScale: (scale: number) => ipcRenderer.invoke('setThumbnailPreviewScale', scale),
  setDefaultGalleryZoom: (scale: number) => ipcRenderer.invoke('setDefaultGalleryZoom', scale),
  setDateParseFormats: (formats: string[]) => ipcRenderer.invoke('setDateParseFormats', formats),
  setTranslationTargetLanguage: (language: string) => ipcRenderer.invoke('setTranslationTargetLanguage', language),
  setTranslationModel: (model: string) => ipcRenderer.invoke('setTranslationModel', model),
  setTranslationDisplayMode: (mode: 'tooltip' | 'inline-hover' | 'click-toggle') => ipcRenderer.invoke('setTranslationDisplayMode', mode),
  setOpenAiApiKey: (apiKey: string) => ipcRenderer.invoke('setOpenAiApiKey', apiKey),
  clearOpenAiApiKey: () => ipcRenderer.invoke('clearOpenAiApiKey'),
  translateText: (payload: { text: string; targetLanguage: string }) => ipcRenderer.invoke('translateText', payload),
  setAppPassword: (password: string) => ipcRenderer.invoke('setAppPassword', password),
  setPasswordLockSettings: (maxAttempts: number, durationMinutes: number) => ipcRenderer.invoke('setPasswordLockSettings', maxAttempts, durationMinutes),
  setIdleLockMinutes: (minutes: number) => ipcRenderer.invoke('setIdleLockMinutes', minutes),
  clearAppPassword: () => ipcRenderer.invoke('clearAppPassword'),
  verifyAppPassword: (password: string) => ipcRenderer.invoke('verifyAppPassword', password),
  getProfiles: () => ipcRenderer.invoke('profiles:getAll'),
  getCurrentProfile: () => ipcRenderer.invoke('profiles:getCurrent'),
  selectProfile: (profileId: string) => ipcRenderer.invoke('profiles:select', profileId),
  clearCurrentProfile: () => ipcRenderer.invoke('profiles:clearCurrent'),
  createProfile: (payload: { name: string; avatarColor?: string }) => ipcRenderer.invoke('profiles:create', payload),
  updateProfile: (profileId: string, updates: { name?: string; avatarColor?: string }) => ipcRenderer.invoke('profiles:update', profileId, updates),
  deleteProfile: (profileId: string) => ipcRenderer.invoke('profiles:delete', profileId),
  setVideoSeekSeconds: (seconds: number) => ipcRenderer.invoke('setVideoSeekSeconds', seconds),
  setVideoAutoPlay: (enabled: boolean) => ipcRenderer.invoke('setVideoAutoPlay', enabled),
  setListThumbnailFit: (fit: 'cover' | 'contain') => ipcRenderer.invoke('setListThumbnailFit', fit),
  setVideoHoverPreviewEnabled: (enabled: boolean) => ipcRenderer.invoke('setVideoHoverPreviewEnabled', enabled),
  checkDuplicate: (categoryId: string, fieldId: string, value: any, recordId?: string) => ipcRenderer.invoke('db:checkDuplicate', categoryId, fieldId, value, recordId),
  getAppRoot: () => ipcRenderer.invoke('getAppRoot'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getFileType: (filePath: string) => ipcRenderer.invoke('db:getFileType', filePath),
  getFileSize: (filePath: string) => ipcRenderer.invoke('getFileSize', filePath),
  getVideoServerPort: () => ipcRenderer.invoke('getVideoServerPort'),
  deleteThumbnail: (filePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('deleteThumbnail', filePath, context),
  generateThumbnailWithTime: (filePath: string, timestampSec: number, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('generateThumbnailWithTime', filePath, timestampSec, context),
  regenerateThumbnail: (filePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('regenerateThumbnail', filePath, context),
  setCustomThumbnail: (filePath: string, imagePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('setCustomThumbnail', filePath, imagePath, context),
  removeCustomThumbnail: (filePath: string, context?: { recordId?: string; categoryId?: string; profileId?: string }) => ipcRenderer.invoke('removeCustomThumbnail', filePath, context),
  getVideoDuration: (filePath: string) => ipcRenderer.invoke('getVideoDuration', filePath),
  getVideoCodecInfo: (filePath: string) => ipcRenderer.invoke('getVideoCodecInfo', filePath),
  getBookmarks: (categoryId, recordId) => ipcRenderer.invoke('getBookmarks', categoryId, recordId),
  addBookmark: (categoryId, recordId, time) => ipcRenderer.invoke('addBookmark', categoryId, recordId, time),
  removeBookmark: (categoryId, recordId, time) => ipcRenderer.invoke('removeBookmark', categoryId, recordId, time),
  removeAllBookmarks: (categoryId, recordId) => ipcRenderer.invoke('removeAllBookmarks', categoryId, recordId),
  getThumbnailDataUrlHybrid: (record, filePath) => ipcRenderer.invoke('getThumbnailDataUrlHybrid', record, filePath),
  migrateThumbnailPaths: () => ipcRenderer.invoke('migrateThumbnailPaths'),
  checkThumbnailSync: () => ipcRenderer.invoke('checkThumbnailSync'),
  cleanupThumbnailSync: (options) => ipcRenderer.invoke('cleanupThumbnailSync', options),
  cleanupOrphanThumbnails: () => ipcRenderer.invoke('cleanupOrphanThumbnails'),
  onRandomRecordShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('shortcut:random-record', listener);
    return () => ipcRenderer.removeListener('shortcut:random-record', listener);
  },
  getBrowserPreloadPath: () => ipcRenderer.invoke('browser:getPreloadPath'),
  getBrowserPartition: () => ipcRenderer.invoke('browser:getPartition'),
  openBrowserWindow: (url) => ipcRenderer.invoke('browser:openWindow', url),
  closeBrowserWindow: () => ipcRenderer.invoke('browser:closeWindow'),
  getBrowserIdleState: () => ipcRenderer.invoke('browser:getIdleState'),
  saveBrowserLastUrl: (payload) => ipcRenderer.invoke('browser:saveLastUrl', payload),
  onBrowserOpenUrl: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, nextUrl: string, options?: { background?: boolean }) => {
      callback(nextUrl, options);
    };
    ipcRenderer.on('browser:open-url', listener);
    return () => ipcRenderer.removeListener('browser:open-url', listener);
  },
  onBrowserShortcut: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('browser:shortcut', listener);
    return () => ipcRenderer.removeListener('browser:shortcut', listener);
  },
  onMuteInactiveBrowserTabsChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled === true);
    ipcRenderer.on('browser:mute-inactive-tabs', listener);
    return () => ipcRenderer.removeListener('browser:mute-inactive-tabs', listener);
  },
  onBrowserPageCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('browser:page-command', listener);
    return () => ipcRenderer.removeListener('browser:page-command', listener);
  },
  canonicalizeBrowserUrl: (url) => ipcRenderer.invoke('browser:canonicalizeUrl', url),
  listBrowserBookmarks: () => ipcRenderer.invoke('browser:listBookmarks'),
  addBrowserBookmark: (payload) => ipcRenderer.invoke('browser:addBookmark', payload),
  removeBrowserBookmark: (id) => ipcRenderer.invoke('browser:removeBookmark', id),
  renameBrowserBookmark: (payload) => ipcRenderer.invoke('browser:renameBookmark', payload),
  addBrowserBookmarkFolder: (payload) => ipcRenderer.invoke('browser:addBookmarkFolder', payload),
  renameBrowserBookmarkFolder: (payload) => ipcRenderer.invoke('browser:renameBookmarkFolder', payload),
  removeBrowserBookmarkFolder: (id) => ipcRenderer.invoke('browser:removeBookmarkFolder', id),
  moveManualBookmarkItem: (payload) => ipcRenderer.invoke('browser:moveManualBookmarkItem', payload),
  listBrowserScripts: () => ipcRenderer.invoke('browser:listScripts'),
  saveBrowserScript: (payload) => ipcRenderer.invoke('browser:saveScript', payload),
  deleteBrowserScript: (id) => ipcRenderer.invoke('browser:deleteScript', id),
  findBrowserRecordsByUrl: (url) => ipcRenderer.invoke('browser:findRecordsByUrl', url),
  generateBrowserScript: (payload) => ipcRenderer.invoke('browser:generateScript', payload),
  listBrowserPasswords: () => ipcRenderer.invoke('browser:listPasswords'),
  commitBrowserPassword: (pendingId) => ipcRenderer.invoke('browser:commitPassword', pendingId),
  dismissBrowserPassword: (pendingId) => ipcRenderer.invoke('browser:dismissPassword', pendingId),
  deleteBrowserPassword: (id) => ipcRenderer.invoke('browser:deletePassword', id),
  neverSaveBrowserOrigin: (origin) => ipcRenderer.invoke('browser:neverSaveOrigin', origin),
  listBrowserPageVideos: (payload) => ipcRenderer.invoke('browser:listPageVideos', payload),
  downloadBrowserPageVideo: (payload) => ipcRenderer.invoke('browser:downloadPageVideo', payload),
  previewBrowserPageVideo: (payload) => ipcRenderer.invoke('browser:previewPageVideo', payload),
  listBrowserHistory: (limit) => ipcRenderer.invoke('browser:listHistory', limit),
  deleteBrowserHistoryItem: (id) => ipcRenderer.invoke('browser:deleteHistory', id),
  clearBrowserHistory: () => ipcRenderer.invoke('browser:clearHistory'),
  listBrowserDownloads: () => ipcRenderer.invoke('browser:listDownloads'),
  openBrowserDownload: (id) => ipcRenderer.invoke('browser:openDownload', id),
  showBrowserDownloadInFolder: (id) => ipcRenderer.invoke('browser:showDownloadInFolder', id),
  deleteBrowserDownload: (id) => ipcRenderer.invoke('browser:deleteDownload', id),
  clearBrowserDownloads: () => ipcRenderer.invoke('browser:clearDownloads'),
  downloadBrowserFiles: (payload) => ipcRenderer.invoke('browser:downloadFiles', payload),
  onBrowserDownloadsChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, items: Parameters<typeof callback>[0]) => callback(items);
    ipcRenderer.on('browser:downloads-changed', listener);
    return () => ipcRenderer.removeListener('browser:downloads-changed', listener);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api); 
