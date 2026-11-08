import { BrowserWindow, Menu, clipboard, session, webContents } from 'electron';
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
  applyChromeLikeClientHints,
  chromeLikeUserAgent,
  isBackgroundBrowserTabDisposition,
  isBotChallengeUrl,
  popupBoundsFromFeatures,
  shouldOpenEmbeddedBrowserPopup,
} from '../lib/embedded-browser-policy';
import { attachEmbeddedBrowserShortcutGuard, toggleEmbeddedBrowserDevTools } from '../lib/browser-shortcuts';
import { wrapUserscriptForRunAt } from '../lib/browser-userscript';
import { db } from '../database/connection';
import { getConfiguredBrowserBlockedDomains, getConfiguredBrowserTrackerBlocking, log } from '../app/state';
import { attachBrowserVideoSniffer, saveGuestMediaUrl } from './browser-video-download';
import { attachBrowserSessionDownloads } from '../lib/browser-download-manager';
import { recordBrowserHistoryVisit } from '../lib/browser-history-store';
import { hasOpenAiApiKey } from './openai-secret';

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

const BOUNCE_GUARD_MS = 12000;
const AD_COSMETIC_STYLE = `
iframe[src*="googlesyndication"],
iframe[src*="doubleclick.net"],
iframe[src*="googletagservices"],
iframe[id^="google_ads_iframe"],
ins.adsbygoogle,
div[id^="google_ads_"],
div[id^="div-gpt-ad"],
iframe[src*="exoclick"],
iframe[src*="exosrv"],
iframe[src*="exdynsrv"],
iframe[src*="juicyads"],
iframe[src*="tsyndicate"],
iframe[src*="adtng.com"],
iframe[src*="popads.net"],
iframe[src*="propellerads"] {
  display: none !important;
}
`;
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

function attachGuestContextMenu(contents) {
  if (!contents || contents.__erpBrowserContextMenu) return;
  contents.__erpBrowserContextMenu = true;
  contents.on('context-menu', (_event, params) => {
    if (!contents || contents.isDestroyed()) return;
    const template = [];
    try {
      if (contents.navigationHistory?.canGoBack?.() || contents.canGoBack?.()) {
        template.push({ label: '뒤로', click: () => contents.goBack() });
      }
      if (contents.navigationHistory?.canGoForward?.() || contents.canGoForward?.()) {
        template.push({ label: '앞으로', click: () => contents.goForward() });
      }
    } catch {
      // navigation APIs can throw before the guest is ready
    }
    template.push({ label: '새로고침', click: () => contents.reload() });
    template.push({ type: 'separator' });
    if (params?.isEditable) {
      template.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
    } else if (params?.selectionText) {
      template.push({ role: 'copy' });
    }
    if (params?.linkURL) {
      template.push({
        label: '링크 주소 복사',
        click: () => clipboard.writeText(String(params.linkURL)),
      });
    }
    const mediaUrl = String(params?.srcURL || '');
    if (params?.mediaType === 'video' && /^https?:\/\//i.test(mediaUrl)) {
      template.push({
        label: '영상 저장',
        click: () => {
          const host = contents.hostWebContents || contents;
          const win = BrowserWindow.fromWebContents(host);
          void saveGuestMediaUrl(contents, mediaUrl, win && !win.isDestroyed() ? win : null);
        },
      });
    }
    if (template.length > 0 && template[template.length - 1].type !== 'separator') {
      template.push({ type: 'separator' });
    }
    const host = contents.hostWebContents || contents;
    template.push({
      label: '페이지 이미지 저장',
      click: () => {
        if (host && !host.isDestroyed()) host.send('browser:page-command', 'save-images');
      },
    });
    template.push({
      label: '페이지 영상 저장',
      click: () => {
        if (host && !host.isDestroyed()) host.send('browser:page-command', 'save-videos');
      },
    });
    if (hasOpenAiApiKey()) {
      template.push({
        label: '페이지 번역',
        click: () => {
          if (host && !host.isDestroyed()) host.send('browser:page-command', 'translate-page');
        },
      });
    }
    template.push({
      label: '방문 기록',
      click: () => {
        if (host && !host.isDestroyed()) host.send('browser:page-command', 'open-history');
      },
    });
    template.push({ type: 'separator' });
    template.push({
      label: '요소 검사',
      click: () => contents.inspectElement(Number(params?.x) || 0, Number(params?.y) || 0),
    });
    template.push({
      label: '개발자 도구',
      accelerator: 'F12',
      click: () => toggleEmbeddedBrowserDevTools(contents),
    });
    const menu = Menu.buildFromTemplate(template);
    const win = BrowserWindow.fromWebContents(host);
    menu.popup({ window: win && !win.isDestroyed() ? win : undefined });
  });
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
  ses.setUserAgent(chromeLikeUserAgent(ses.getUserAgent(), process.versions.chrome));
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(GUEST_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_contents, permission) => GUEST_PERMISSIONS.has(permission));
  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    callback({
      requestHeaders: applyChromeLikeClientHints(
        details.requestHeaders,
        process.versions.chrome,
        process.platform,
      ),
    });
  });
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
  attachBrowserVideoSniffer(ses);
  attachBrowserSessionDownloads(ses);
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

function injectAdCosmeticHiding(contents) {
  if (!contents || contents.isDestroyed()) return;
  if (!getConfiguredBrowserTrackerBlocking()) return;
  const currentUrl = contents.getURL();
  if (!isAllowedEmbeddedBrowserUrl(currentUrl) || currentUrl === 'about:blank') return;
  if (isBotChallengeUrl(currentUrl)) return;
  contents.insertCSS(AD_COSMETIC_STYLE, { cssOrigin: 'user' }).catch(() => {});
}

export function injectMatchingScripts(contents) {
  if (!contents || contents.isDestroyed()) return;
  const currentUrl = contents.getURL();
  if (!isAllowedEmbeddedBrowserUrl(currentUrl) || currentUrl === 'about:blank') return;
  if (isBotChallengeUrl(currentUrl)) return;
  injectAdCosmeticHiding(contents);

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
    if (!getConfiguredBrowserTrackerBlocking()) return;
    if (!contents.__erpBounceGuard) {
      const matched = takeForcedOpenBounceGuard(targetUrl);
      if (matched) contents.__erpBounceGuard = matched;
    }
    const guard = contents.__erpBounceGuard;
    if (
      guard
      && Date.now() <= guard.expiresAt
      && shouldBlockBounceNavigation(guard.site, targetUrl, blockedDomains)
    ) {
      event.preventDefault();
      closeOwnedPopupWindow(contents);
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
    try {
      recordBrowserHistoryVisit({ url: contents.getURL(), title: contents.getTitle() });
    } catch {
      // Guest URL/title can throw before the page is ready.
    }
  });

  contents.on('did-navigate-in-page', (_event, url) => {
    if (!contents.isDestroyed()) {
      contents.send('browser:url-changed', url);
    }
    try {
      recordBrowserHistoryVisit({ url, title: contents.getTitle() });
    } catch {
      // Guest title can throw during in-page navigations.
    }
  });

  contents.on('did-navigate', (_event, url) => {
    if (!contents.isDestroyed()) {
      contents.send('browser:url-changed', url);
    }
  });

  attachGuestContextMenu(contents);
  attachEmbeddedBrowserShortcutGuard(contents);
}
