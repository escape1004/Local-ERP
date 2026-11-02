import { BrowserWindow } from 'electron';
import path from 'path';
import { electronDistDir } from '../ffmpeg-paths';
import { parseExternalHttpUrl } from '../lib/security';
import { getEmbeddedBrowserHash } from '../lib/browser-window-url';
import { attachEmbeddedBrowserShortcutGuard } from '../lib/browser-shortcuts';
import {
  appConfig,
  applyWindowZoom,
  isolatedRendererUrl,
  saveAppConfig,
} from '../store';
import {
  attachNavigationGuards,
  attachWebviewGuards,
  bindWindowControl,
  ensureRendererSessionGuards,
  iconPath,
  rendererWebPreferences,
} from './window-guards';

let browserWindow = null;
let saveBoundsTimer = null;

function saveEmbeddedBrowserWindowBounds() {
  if (!appConfig.rememberBrowserWindowBounds) return;
  if (!browserWindow || browserWindow.isDestroyed()) return;
  if (browserWindow.isMinimized() || browserWindow.isMaximized() || browserWindow.isFullScreen()) return;
  appConfig.browserWindowBounds = browserWindow.getBounds();
  saveAppConfig();
}

function queueSaveEmbeddedBrowserWindowBounds() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveEmbeddedBrowserWindowBounds();
    saveBoundsTimer = null;
  }, 150);
}

export function setRememberEmbeddedBrowserWindowBounds(enabled) {
  appConfig.rememberBrowserWindowBounds = enabled === true;
  if (appConfig.rememberBrowserWindowBounds) {
    saveEmbeddedBrowserWindowBounds();
  } else {
    saveAppConfig();
  }
  return { success: true, rememberBrowserWindowBounds: appConfig.rememberBrowserWindowBounds };
}

export function isEmbeddedBrowserAppWindow(win) {
  return Boolean(win && browserWindow && !win.isDestroyed() && win.id === browserWindow.id);
}

function loadBrowserWindow(win, url) {
  const hash = getEmbeddedBrowserHash(url);
  if (isolatedRendererUrl) {
    const base = String(isolatedRendererUrl).replace(/\/$/, '');
    return win.loadURL(`${base}/?role=browser#${hash}`);
  }
  return win.loadFile(path.join(electronDistDir, '..', 'dist', 'index.html'), {
    query: { role: 'browser' },
    hash,
  });
}

export function isEmbeddedBrowserWindowFocused() {
  return Boolean(browserWindow && !browserWindow.isDestroyed() && browserWindow.isFocused());
}

export function closeEmbeddedBrowserWindow() {
  if (saveBoundsTimer) {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = null;
  }
  if (!browserWindow || browserWindow.isDestroyed()) {
    browserWindow = null;
    return;
  }
  saveEmbeddedBrowserWindowBounds();
  browserWindow.destroy();
  browserWindow = null;
}

export async function openEmbeddedBrowserWindow(url) {
  const parsed = url ? parseExternalHttpUrl(String(url)) : null;
  const targetUrl = parsed ? parsed.toString() : '';

  if (browserWindow && !browserWindow.isDestroyed()) {
    if (targetUrl && parsed) {
      browserWindow.webContents.send('browser:open-url', targetUrl);
    }
    if (browserWindow.isMinimized()) browserWindow.restore();
    browserWindow.show();
    browserWindow.focus();
    return { success: true };
  }

  bindWindowControl();
  const rememberedBounds = appConfig.rememberBrowserWindowBounds ? appConfig.browserWindowBounds : null;
  browserWindow = new BrowserWindow({
    width: rememberedBounds?.width || 1280,
    height: rememberedBounds?.height || 860,
    x: typeof rememberedBounds?.x === 'number' ? rememberedBounds.x : undefined,
    y: typeof rememberedBounds?.y === 'number' ? rememberedBounds.y : undefined,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    webPreferences: { ...rendererWebPreferences },
    icon: iconPath,
  });
  ensureRendererSessionGuards(browserWindow.webContents.session);
  attachNavigationGuards(browserWindow.webContents);
  attachWebviewGuards(browserWindow.webContents);
  applyWindowZoom(browserWindow);
  browserWindow.webContents.on('did-finish-load', () => applyWindowZoom(browserWindow));
  browserWindow.webContents.setVisualZoomLevelLimits(1, 1);
  attachEmbeddedBrowserShortcutGuard(browserWindow.webContents, {
    handleWheelZoom: false,
    resolveTarget: (hostContents, action) => {
      hostContents.send('browser:shortcut', action);
      return null;
    },
  });
  browserWindow.on('move', queueSaveEmbeddedBrowserWindowBounds);
  browserWindow.on('resize', queueSaveEmbeddedBrowserWindowBounds);
  browserWindow.on('unmaximize', queueSaveEmbeddedBrowserWindowBounds);
  browserWindow.on('close', saveEmbeddedBrowserWindowBounds);
  browserWindow.on('closed', () => {
    if (saveBoundsTimer) {
      clearTimeout(saveBoundsTimer);
      saveBoundsTimer = null;
    }
    browserWindow = null;
  });

  try {
    await loadBrowserWindow(browserWindow, targetUrl);
    return { success: true };
  } catch (error) {
    closeEmbeddedBrowserWindow();
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
