import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'path';
import { electronDistDir } from '../ffmpeg-paths';
import { closeEmbeddedBrowserWindow } from './browser-window';
import {
  attachNavigationGuards,
  attachWebviewGuards,
  bindWindowControl,
  ensureRendererSessionGuards,
  iconPath,
  rendererWebPreferences,
} from './window-guards';
import {
  appConfig,
  applyWindowZoom,
  isolatedRendererUrl,
  log,
  saveAppConfig,
} from '../store';

export { iconPath } from './window-guards';

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

export function createWindow() {
  bindWindowControl();
  const rememberedBounds = appConfig.rememberWindowBounds ? appConfig.windowBounds : null;
  const mainWindow = new BrowserWindow({
    width: rememberedBounds?.width || 1920,
    height: rememberedBounds?.height || 1080,
    x: typeof rememberedBounds?.x === 'number' ? rememberedBounds.x : undefined,
    y: typeof rememberedBounds?.y === 'number' ? rememberedBounds.y : undefined,
    frame: false,
    webPreferences: { ...rendererWebPreferences },
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

  ensureRendererSessionGuards(mainWindow.webContents.session);
  attachNavigationGuards(mainWindow.webContents);
  attachWebviewGuards(mainWindow.webContents);

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
  mainWindow.on('close', () => {
    saveWindowBounds();
    closeEmbeddedBrowserWindow();
  });
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
