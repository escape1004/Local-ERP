import { parseExternalHttpUrl } from '../lib/security';
import { matchUrlPattern } from '../lib/browser-url';
import { db } from '../database/connection';
import { log } from '../app/state';

export const BROWSER_PARTITION = 'persist:erp-browser';

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

function wrapUserscript(source) {
  return `(function(){try{${source}\n}catch(error){console.error('[ERP userscript]', error);}})();`;
}

export function injectMatchingScripts(contents) {
  if (!contents || contents.isDestroyed()) return;
  const currentUrl = contents.getURL();
  if (!isAllowedEmbeddedBrowserUrl(currentUrl) || currentUrl === 'about:blank') return;

  const scripts = listEnabledScripts().filter((script) => (
    parseMatches(script.matches_json).some((pattern) => matchUrlPattern(pattern, currentUrl))
  ));

  scripts.forEach((script) => {
    const delay = script.run_at === 'document-idle' ? 400 : 0;
    setTimeout(() => {
      if (contents.isDestroyed()) return;
      contents.executeJavaScript(wrapUserscript(script.source), true).catch((error) => {
        log('브라우저 스크립트 주입 실패:', { name: script.name, error });
      });
    }, delay);
  });
}

export function attachEmbeddedBrowserGuest(contents) {
  if (!contents || contents.__erpBrowserAttached) return;
  contents.__erpBrowserAttached = true;

  contents.setWindowOpenHandler(({ url }) => {
    const parsed = parseExternalHttpUrl(url);
    if (parsed) {
      void contents.loadURL(parsed.toString());
    }
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedEmbeddedBrowserUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  contents.on('will-redirect', (event, targetUrl) => {
    if (!isAllowedEmbeddedBrowserUrl(targetUrl)) {
      event.preventDefault();
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
}
