import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'path';
import { electronDistDir } from '../ffmpeg-paths';
import { buildContentSecurityPolicy } from './csp';
import {
  appConfig,
  applyWindowZoom,
  isolatedRendererUrl,
  isDev,
  isPreview,
  log,
  saveAppConfig,
} from '../store';

function isAllowedNavigationUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (isolatedRendererUrl) {
      return parsed.origin === new URL(isolatedRendererUrl).origin;
    }
    if (process.env.VITE_DEV_SERVER_URL) {
      return parsed.origin === 'http://localhost:5174' || parsed.origin === 'http://127.0.0.1:5174';
    }
    if (parsed.protocol !== 'file:') return false;

    const distRoot = path.resolve(electronDistDir, '..', 'dist');
    const filePath = decodeURIComponent(parsed.pathname);
    const normalizedPath = process.platform === 'win32' && filePath.startsWith('/')
      ? filePath.slice(1)
      : filePath;
    const relative = path.relative(distRoot, path.resolve(normalizedPath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}

function attachNavigationGuards(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedNavigationUrl(targetUrl)) {
      event.preventDefault();
    }
  });
  contents.on('will-redirect', (event, targetUrl) => {
    if (!isAllowedNavigationUrl(targetUrl)) {
      event.preventDefault();
    }
  });
}

export function registerProtocol() {
  protocol.registerFileProtocol('app', (request, callback) => {
    try {
      const relative = decodeURIComponent(request.url.replace(/^app:\/*/i, ''));
      const distRoot = path.resolve(electronDistDir, '..', 'dist');
      const target = path.resolve(distRoot, relative);
      const relativeToRoot = path.relative(distRoot, target);
      if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
        callback({ error: -10 });
        return;
      }
      callback(target);
    } catch (error) {
      console.error(error);
      callback({ error: -2 });
    }
  });
}

export const iconPath = (isDev || isPreview)
  ? path.join(electronDistDir, '..', 'resources', 'icon.ico')
  : path.join(process.resourcesPath, 'resources', 'icon.ico');

export function createWindow() {
  const rememberedBounds = appConfig.rememberWindowBounds ? appConfig.windowBounds : null;
  const mainWindow = new BrowserWindow({
    width: rememberedBounds?.width || 1920,
    height: rememberedBounds?.height || 1080,
    x: typeof rememberedBounds?.x === 'number' ? rememberedBounds.x : undefined,
    y: typeof rememberedBounds?.y === 'number' ? rememberedBounds.y : undefined,
    frame: false,
    webPreferences: {
      preload: path.join(electronDistDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false
    },
    icon: iconPath
  });

  let saveBoundsTimer = null;
  let isPictureInPictureActive = false;
  let audioMuteSyncGeneration = 0;
  const syncWindowAudioMute = async () => {
    if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;

    const generation = ++audioMuteSyncGeneration;
    try {
      isPictureInPictureActive = await mainWindow.webContents.executeJavaScript(
        'Boolean(document.pictureInPictureElement)',
        true
      );
    } catch (error) {
      if (!mainWindow.webContents.isLoading()) {
        log('PIP 상태 확인 실패:', error);
      }
    }

    if (
      generation !== audioMuteSyncGeneration
      || mainWindow.isDestroyed()
      || mainWindow.webContents.isDestroyed()
    ) {
      return;
    }

    const shouldMute = Boolean(appConfig.muteAudioWhenBackgrounded)
      && !mainWindow.isFocused()
      && !isPictureInPictureActive;
    mainWindow.webContents.setAudioMuted(shouldMute);
  };
  const saveWindowBounds = () => {
    if (!appConfig.rememberWindowBounds) return;
    if (mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
    appConfig.windowBounds = mainWindow.getBounds();
    saveAppConfig();
  };

  const queueSaveWindowBounds = () => {
    if (saveBoundsTimer) {
      clearTimeout(saveBoundsTimer);
    }
    saveBoundsTimer = setTimeout(() => {
      saveWindowBounds();
      saveBoundsTimer = null;
    }, 150);
  };

  const contentSecurityPolicy = buildContentSecurityPolicy();
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy]
      }
    });
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'clipboard-read');
  });
  attachNavigationGuards(mainWindow.webContents);
  mainWindow.webContents.on('did-attach-webview', (_event, guestContents) => {
    attachNavigationGuards(guestContents);
  });

  // 개발 모드에서는 Vite 개발 서버 URL을 사용
  if (isolatedRendererUrl) {
    mainWindow.loadURL(isolatedRendererUrl);
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // 프로덕션 모드에서는 빌드된 파일을 로드
    mainWindow.loadFile(path.join(electronDistDir, '..', 'dist', 'index.html')).catch(e => {
      console.error('Failed to load index.html:', e);
      app.quit();
    });
  }

  applyWindowZoom(mainWindow);
  mainWindow.webContents.on('did-finish-load', () => applyWindowZoom(mainWindow));
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isZoomShortcut =
      input.control &&
      !input.alt &&
      !input.meta &&
      ['+', '=', '-', '_', '0'].includes(input.key);

    const isNumpadZoomShortcut =
      input.control &&
      !input.alt &&
      !input.meta &&
      ['numadd', 'numsub', 'num0'].includes((input.code || '').toLowerCase());

    if (isZoomShortcut || isNumpadZoomShortcut) {
      event.preventDefault();
      return;
    }

    const isReloadShortcut =
      input.type === 'keyDown' &&
      !input.isAutoRepeat &&
      input.control &&
      !input.alt &&
      !input.meta &&
      (input.key === 'r' || input.key === 'R');

    if (isReloadShortcut) {
      event.preventDefault();
      if (!input.shift) {
        mainWindow.webContents.send('shortcut:random-record');
      }
    }
  });

  // 창 상태 변경 이벤트 처리
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state-change', { maximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state-change', { maximized: false });
    queueSaveWindowBounds();
  });

  mainWindow.on('move', queueSaveWindowBounds);
  mainWindow.on('resize', queueSaveWindowBounds);
  mainWindow.on('close', saveWindowBounds);
  mainWindow.on('blur', syncWindowAudioMute);
  mainWindow.on('focus', syncWindowAudioMute);
  mainWindow.on('show', syncWindowAudioMute);
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('viewer:fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('viewer:fullscreen-changed', false);
  });
  syncWindowAudioMute();

  // 창 제어 이벤트 처리
  ipcMain.on('window-control', (_, command) => {
    if (command !== 'minimize' && command !== 'maximize' && command !== 'restore' && command !== 'close') {
      return;
    }
    switch (command) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        mainWindow.maximize();
        break;
      case 'restore':
        mainWindow.restore();
        break;
      case 'close':
        mainWindow.close();
        break;
    }
  });

  ipcMain.removeHandler?.('setRememberWindowBounds');
  ipcMain.handle('setRememberWindowBounds', (_event, enabled) => {
    appConfig.rememberWindowBounds = !!enabled;
    if (appConfig.rememberWindowBounds) {
      saveWindowBounds();
    } else {
      saveAppConfig();
    }
    return { success: true };
  });

  ipcMain.removeHandler?.('setMuteAudioWhenBackgrounded');
  ipcMain.handle('setMuteAudioWhenBackgrounded', (_event, enabled) => {
    appConfig.muteAudioWhenBackgrounded = enabled === true;
    saveAppConfig();
    syncWindowAudioMute();
    return { success: true };
  });

  ipcMain.removeHandler?.('setPictureInPictureActive');
  ipcMain.handle('setPictureInPictureActive', (_event, active) => {
    isPictureInPictureActive = active === true;
    syncWindowAudioMute();
    return { success: true };
  });

  ipcMain.removeHandler?.('viewer:setFullscreen');
  ipcMain.handle('viewer:setFullscreen', (_event, enabled) => {
    try {
      const nextFullscreen = enabled === true;
      mainWindow.setFullScreen(nextFullscreen);
      return { success: true, isFullscreen: nextFullscreen };
    } catch (error) {
      log('Viewer fullscreen transition failed:', error);
      return {
        success: false,
        isFullscreen: mainWindow.isFullScreen(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
