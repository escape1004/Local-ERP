import { BrowserWindow } from 'electron';
import path from 'path';
import { electronDistDir } from '../ffmpeg-paths';
import { parseExternalHttpUrl } from '../lib/security';
import { getEmbeddedBrowserHash } from '../lib/browser-window-url';
import {
  applyWindowZoom,
  isolatedRendererUrl,
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
  if (!browserWindow || browserWindow.isDestroyed()) {
    browserWindow = null;
    return;
  }
  browserWindow.destroy();
  browserWindow = null;
}

export async function openEmbeddedBrowserWindow(url) {
  const parsed = url ? parseExternalHttpUrl(String(url)) : null;
  const targetUrl = parsed ? parsed.toString() : '';

  if (browserWindow && !browserWindow.isDestroyed()) {
    if (targetUrl) {
      browserWindow.webContents.send('browser:open-url', targetUrl);
    }
    if (browserWindow.isMinimized()) browserWindow.restore();
    browserWindow.show();
    browserWindow.focus();
    return { success: true };
  }

  bindWindowControl();
  browserWindow = new BrowserWindow({
    width: 1280,
    height: 860,
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
  browserWindow.on('closed', () => {
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
