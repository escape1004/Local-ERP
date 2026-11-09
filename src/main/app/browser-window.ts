import { BrowserWindow, webContents } from 'electron';
import path from 'path';
import { electronDistDir } from '../ffmpeg-paths';
import { parseExternalHttpUrl } from '../lib/security';
import { getEmbeddedBrowserHash } from '../lib/browser-window-url';
import { attachEmbeddedBrowserShortcutGuard } from '../lib/browser-shortcuts';
import {
  createBrowserIdleTracker,
  PLAYING_MEDIA_SCRIPT,
  raceWithTimeout,
} from '../lib/browser-idle';
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
const browserIdleTracker = createBrowserIdleTracker();
const BROWSER_MEDIA_PROBE_TIMEOUT_MS = 400;

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

function attachIdleInputTracking(contents) {
  if (!contents || contents.isDestroyed()) return;
  const onInput = (_event, inputEvent) => {
    browserIdleTracker.handleInputEvent(inputEvent?.type);
  };
  contents.on('input-event', onInput);
  contents.on('before-input-event', onInput);
}

function attachBrowserIdleTracking(win) {
  attachIdleInputTracking(win.webContents);
  win.webContents.on('did-attach-webview', (_event, guestContents) => {
    attachIdleInputTracking(guestContents);
  });
}

function isBrowserOwnedWebContents(contents, host) {
  if (contents === host) return true;
  try {
    if (contents.getType() !== 'webview') return false;
    if (contents.hostWebContents === host) return true;
    return BrowserWindow.fromWebContents(contents) === browserWindow;
  } catch {
    return false;
  }
}

function getBrowserIdleWebContents() {
  if (!browserWindow || browserWindow.isDestroyed() || browserWindow.webContents.isDestroyed()) {
    return [];
  }

  const host = browserWindow.webContents;
  return webContents.getAllWebContents().filter((contents) => (
    !contents.isDestroyed() && isBrowserOwnedWebContents(contents, host)
  ));
}

async function contentsHasPlayingMedia(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    return await raceWithTimeout(
      contents.executeJavaScript(PLAYING_MEDIA_SCRIPT, true),
      BROWSER_MEDIA_PROBE_TIMEOUT_MS,
      false,
    ) === true;
  } catch {
    return false;
  }
}

async function detectBrowserPlayingMedia() {
  const results = await Promise.all(getBrowserIdleWebContents().map(contentsHasPlayingMedia));
  return results.some(Boolean);
}

export async function getEmbeddedBrowserIdleState() {
  const focused = isEmbeddedBrowserWindowFocused();
  return {
    focused,
    lastActivityAt: browserIdleTracker.getLastActivityAt(),
    hasPlayingMedia: focused ? await detectBrowserPlayingMedia() : false,
  };
}

export function sendEmbeddedBrowserMessage(channel, ...args) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  browserWindow.webContents.send(channel, ...args);
}

export function closeEmbeddedBrowserWindow() {
  if (saveBoundsTimer) {
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = null;
  }
  browserIdleTracker.reset();
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
  attachBrowserIdleTracking(browserWindow);
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
    browserIdleTracker.reset();
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
