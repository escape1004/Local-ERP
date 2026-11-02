import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { electronDistDir } from '../ffmpeg-paths';
import { buildContentSecurityPolicy } from './csp';
import { attachEmbeddedBrowserGuest, BROWSER_PARTITION } from '../services/embedded-browser';
import {
  isolatedRendererUrl,
  isDev,
  isPreview,
} from '../store';

export const iconPath = (isDev || isPreview)
  ? path.join(electronDistDir, '..', 'resources', 'icon.ico')
  : path.join(process.resourcesPath, 'resources', 'icon.ico');

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

export function attachNavigationGuards(contents) {
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

let rendererSessionGuarded = false;
export function ensureRendererSessionGuards(session) {
  if (rendererSessionGuarded || !session) return;
  if (session.partition === BROWSER_PARTITION) return;
  rendererSessionGuarded = true;
  const contentSecurityPolicy = buildContentSecurityPolicy();
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    });
  });
  session.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'clipboard-read');
  });
}

export function attachWebviewGuards(contents) {
  contents.on('did-attach-webview', (_event, guestContents) => {
    attachEmbeddedBrowserGuest(guestContents);
  });
}

let windowControlBound = false;
export function bindWindowControl() {
  if (windowControlBound) return;
  windowControlBound = true;
  ipcMain.on('window-control', (event, command) => {
    if (command !== 'minimize' && command !== 'maximize' && command !== 'restore' && command !== 'close') {
      return;
    }
    const target = BrowserWindow.fromWebContents(event.sender);
    if (!target || target.isDestroyed()) return;
    switch (command) {
      case 'minimize':
        target.minimize();
        break;
      case 'maximize':
        target.maximize();
        break;
      case 'restore':
        target.restore();
        break;
      case 'close':
        target.close();
        break;
    }
  });
}

export const rendererWebPreferences = {
  preload: path.join(electronDistDir, 'preload.js'),
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webviewTag: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  navigateOnDragDrop: false,
};
