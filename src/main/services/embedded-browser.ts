import { BrowserWindow, session, webContents } from 'electron';
import { parseExternalHttpUrl } from '../lib/security';
import {
  isUserBlockedBrowserUrl,
  shouldBlockBounceNavigation,
  shouldBlockBrowserRequest,
  shouldBlockForcedWindowOpen,
  siteKeyFromBrowserUrl,
} from '../lib/browser-tracker-block';
import { scriptMatchesUrl } from '../lib/browser-url';
import {
  chromeLikeUserAgent,
  isBackgroundBrowserTabDisposition,
  popupBoundsFromFeatures,
  shouldOpenEmbeddedBrowserPopup,
} from '../lib/embedded-browser-policy';
import { attachEmbeddedBrowserShortcutGuard } from '../lib/browser-shortcuts';
import { wrapUserscriptForRunAt } from '../lib/browser-userscript';
import { db } from '../database/connection';
import { getConfiguredBrowserBlockedDomains, getConfiguredBrowserTrackerBlocking, log } from '../app/state';

export const BROWSER_PARTITION = 'persist:erp-browser';

const GUEST_PERMISSIONS = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
  'media',
  'notifications',
  'openExternal',
  'pointerLock',
  'storage-access',
  'top-level-storage-access',
  'window-management',
]);

const BOUNCE_GUARD_MS = 5000;
const bounceGuards = [];

function queueForcedOpenBounceGuard(url) {
  const site = siteKeyFromBrowserUrl(url);
  if (!site) return;
  const now = Date.now();
  for (let index = bounceGuards.length - 1; index >= 0; index -= 1) {
    if (bounceGuards[index].expiresAt <= now) bounceGuards.splice(index, 1);
  }
  bounceGuards.push({ site, expiresAt: now + BOUNCE_GUARD_MS });
}

function takeForcedOpenBounceGuard(url) {
  const site = siteKeyFromBrowserUrl(url);
  if (!site) return null;
  const now = Date.now();
  for (let index = bounceGuards.length - 1; index >= 0; index -= 1) {
    const guard = bounceGuards[index];
    if (guard.expiresAt <= now) {
      bounceGuards.splice(index, 1);
      continue;
    }
    if (guard.site === site) {
      bounceGuards.splice(index, 1);
      return { site, expiresAt: now + BOUNCE_GUARD_MS };
    }
  }
  return null;
}

function attachPopupDestinationGuard(contents, openerUrl) {
  const site = siteKeyFromBrowserUrl(openerUrl);
  if (!site || !contents) return;
  contents.__erpBounceGuard = { site, expiresAt: Date.now() + 15000 };
}

function closeOwnedPopupWindow(contents) {
  const win = BrowserWindow.fromWebContents(contents);
  if (!win || win.isDestroyed() || win.webContents !== contents) return;
  win.close();
}

let browserSessionConfigured = false;

export function configureEmbeddedBrowserSession() {
  if (browserSessionConfigured) return;
  browserSessionConfigured = true;
  const ses = session.fromPartition(BROWSER_PARTITION);
  ses.setUserAgent(chromeLikeUserAgent(ses.getUserAgent()));
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(GUEST_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_contents, permission) => GUEST_PERMISSIONS.has(permission));
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const blockedDomains = getConfiguredBrowserBlockedDomains();
    const trackerBlocking = getConfiguredBrowserTrackerBlocking();
    if (!trackerBlocking && blockedDomains.length === 0) {
      callback({});
      return;
    }

    let pageUrl = details.referrer || '';
    try {
      const contents = details.webContentsId != null ? webContents.fromId(details.webContentsId) : null;
      if (contents && !contents.isDestroyed()) {
        pageUrl = contents.getURL() || pageUrl;
      }
    } catch {
      // Keep the referrer when the guest contents are already gone.
    }

    callback({
      cancel: shouldBlockBrowserRequest({
        pageUrl,
        requestUrl: details.url,
        resourceType: details.resourceType,
        blockedDomains,
        trackerBlocking,
      }),
    });
  });
}

export function isEmbeddedBrowserGuest(contents) {
  try {
    if (contents?.session?.partition === BROWSER_PARTITION) return true;
    const preload = contents.getWebPreferences?.()?.preload || '';
    return String(preload).replace(/\\/g, '/').includes('browser-preload');
  } catch {
    return false;
  }
}

export function isAllowedEmbeddedBrowserUrl(targetUrl) {
  if (!targetUrl || targetUrl === 'about:blank') return true;
  return Boolean(parseExternalHttpUrl(targetUrl));
}

function listEnabledScripts() {
  try {
    return db.prepare(`
      SELECT id, name, enabled, matches_json, run_at, source, updated_at
      FROM browser_scripts
      WHERE enabled = 1
    `).all();
  } catch (error) {
    log('브라우저 스크립트 조회 실패:', error);
    return [];
  }
}

function parseMatches(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function injectMatchingScripts(contents) {
  if (!contents || contents.isDestroyed()) return;
  const currentUrl = contents.getURL();
  if (!isAllowedEmbeddedBrowserUrl(currentUrl) || currentUrl === 'about:blank') return;

  const scripts = listEnabledScripts().filter((script) => (
    scriptMatchesUrl(parseMatches(script.matches_json), currentUrl)
  ));

  scripts.forEach((script) => {
    contents.executeJavaScript(wrapUserscriptForRunAt(script.source, script.run_at), true).catch((error) => {
      log('브라우저 스크립트 주입 실패:', { name: script.name, error });
    });
  });
}

function loadHttpUrlInGuest(contents, url) {
  const parsed = parseExternalHttpUrl(url);
  if (!parsed || !contents || contents.isDestroyed()) return false;
  void contents.loadURL(parsed.toString());
  return true;
}

function guestWindowPreferences() {
  return {
    partition: BROWSER_PARTITION,
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  };
}

export function attachEmbeddedBrowserGuest(contents) {
  if (!contents || contents.__erpBrowserAttached) return;
  contents.__erpBrowserAttached = true;

  contents.setWindowOpenHandler((details) => {
    const openerUrl = contents.getURL();
    const parsed = details.url && details.url !== 'about:blank'
      ? parseExternalHttpUrl(details.url)
      : null;

    if (
      parsed
      && shouldBlockForcedWindowOpen({
        openerUrl,
        targetUrl: parsed.toString(),
        disposition: details.disposition,
        blockedDomains: getConfiguredBrowserBlockedDomains(),
        trackerBlocking: getConfiguredBrowserTrackerBlocking(),
      })
    ) {
      return { action: 'deny' };
    }

    if (shouldOpenEmbeddedBrowserPopup(details)) {
      if (details.url && details.url !== 'about:blank' && !parsed) {
        return { action: 'deny' };
      }

      const hostContents = contents.hostWebContents || contents;
      const parent = BrowserWindow.fromWebContents(hostContents);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...popupBoundsFromFeatures(details.features),
          parent: parent && !parent.isDestroyed() ? parent : undefined,
          autoHideMenuBar: true,
          webPreferences: guestWindowPreferences(),
        },
      };
    }

    if (parsed) {
      const nextUrl = parsed.toString();
      if (getConfiguredBrowserTrackerBlocking()) {
        queueForcedOpenBounceGuard(nextUrl);
      }
      const host = contents.hostWebContents;
      if (host && !host.isDestroyed()) {
        host.send('browser:open-url', nextUrl, {
          background: isBackgroundBrowserTabDisposition(details.disposition),
        });
      } else {
        setImmediate(() => {
          loadHttpUrlInGuest(contents, nextUrl);
        });
      }
    }
    return { action: 'deny' };
  });

  contents.on('did-create-window', (childWindow) => {
    if (!childWindow || childWindow.isDestroyed()) return;
    attachEmbeddedBrowserGuest(childWindow.webContents);
    if (getConfiguredBrowserTrackerBlocking()) {
      attachPopupDestinationGuard(childWindow.webContents, contents.getURL());
    }
    childWindow.setMenuBarVisibility(false);
    childWindow.show();
  });

  contents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedEmbeddedBrowserUrl(targetUrl)) {
      event.preventDefault();
      return;
    }
    const blockedDomains = getConfiguredBrowserBlockedDomains();
    if (isUserBlockedBrowserUrl(targetUrl, blockedDomains)) {
      event.preventDefault();
      closeOwnedPopupWindow(contents);
      return;
    }
    if (!contents.__erpBounceGuard && getConfiguredBrowserTrackerBlocking()) {
      const matched = takeForcedOpenBounceGuard(targetUrl);
      if (matched) contents.__erpBounceGuard = matched;
    }
  });

  contents.on('will-redirect', (event, targetUrl) => {
    if (!isAllowedEmbeddedBrowserUrl(targetUrl)) {
      event.preventDefault();
      return;
    }
    const blockedDomains = getConfiguredBrowserBlockedDomains();
    if (isUserBlockedBrowserUrl(targetUrl, blockedDomains)) {
      event.preventDefault();
      closeOwnedPopupWindow(contents);
      return;
    }
    const guard = contents.__erpBounceGuard;
    if (
      getConfiguredBrowserTrackerBlocking()
      && guard
      && Date.now() <= guard.expiresAt
      && shouldBlockBounceNavigation(guard.site, targetUrl, blockedDomains)
    ) {
      event.preventDefault();
      closeOwnedPopupWindow(contents);
    }
  });

  contents.on('did-finish-load', () => {
    injectMatchingScripts(contents);
  });

  contents.on('did-navigate-in-page', (_event, url) => {
    if (!contents.isDestroyed()) {
      contents.send('browser:url-changed', url);
    }
  });

  contents.on('did-navigate', (_event, url) => {
    if (!contents.isDestroyed()) {
      contents.send('browser:url-changed', url);
    }
  });

  attachEmbeddedBrowserShortcutGuard(contents);
}
