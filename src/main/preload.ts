import { contextBridge, ipcRenderer } from 'electron';
import { NewCategory, CategoryUpdate, NewRecord, ElectronAPI } from '../types';

const allowedSendChannels = new Set(['window-control']);

const setupMouseBackButtonPrevention = () => {
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
  updateRecord: (id: string, data: Record<string, any>) => ipcRenderer.invoke('db:updateRecord', id, data),
  deleteRecord: (id: string) => ipcRenderer.invoke('db:deleteRecord', id),
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
  getDashboardWarnings: (previewLimit?: number) => ipcRenderer.invoke('dashboard:getWarnings', previewLimit),
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
  setTranslationDisplayMode: (mode: 'tooltip' | 'inline-hover') => ipcRenderer.invoke('setTranslationDisplayMode', mode),
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
};

contextBridge.exposeInMainWorld('electronAPI', api); 
