import fs from 'fs';
import path from 'path';

export const CHROMIUM_EXTENSION_ID = 'hnipbindimmdannekflhgehlghphgape';
export const FIREFOX_EXTENSION_ID = 'lcerp-browser@local-erp';
export const EXTENSION_HTTP_HOST = '127.0.0.1';
export const EXTENSION_HTTP_PORT_MIN = 17361;
export const EXTENSION_HTTP_PORT_MAX = 17370;

export function isAllowedExtensionOrigin(origin: string, chromiumId = CHROMIUM_EXTENSION_ID) {
  const value = String(origin || '').trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'chrome-extension:' && parsed.hostname === chromiumId) return true;
    return parsed.protocol === 'moz-extension:';
  } catch {
    return false;
  }
}

export function readBridgeToken(headers: Record<string, string | string[] | undefined> = {}) {
  const raw = headers['x-lcerp-token'] ?? headers['X-Lcerp-Token'] ?? '';
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value || '').trim();
}

type BridgeData = {
  bookmarks: () => unknown;
  listScripts: (url: string) => unknown;
  scriptsForUrl: (url: string) => unknown;
  findRecordsByUrl: (url: string) => unknown;
};

type BridgeRequest = {
  method?: string;
  pathname?: string;
  origin?: string;
  token?: string;
  expectedToken?: string;
  body?: { url?: string };
  query?: { url?: string };
  data: BridgeData;
};

export function handleExtensionBridgeRequest({
  method = 'GET',
  pathname = '/',
  origin = '',
  token = '',
  expectedToken = '',
  body = {},
  query = {},
  data,
}: BridgeRequest) {
  const verb = String(method || 'GET').toUpperCase();
  const route = String(pathname || '/');

  if (verb === 'OPTIONS') {
    return { status: 204, json: null as null };
  }
  if (verb === 'GET' && route === '/status') {
    return { status: 200, json: { ok: true, app: 'local-erp' } };
  }
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return { status: 403, json: { error: 'forbidden' } };
  }
  if (!expectedToken || token !== expectedToken) {
    return { status: 401, json: { error: 'unauthorized' } };
  }

  const url = String(body?.url || query?.url || '');

  if (verb === 'GET' && route === '/bookmarks') {
    return { status: 200, json: data.bookmarks() };
  }
  if (verb === 'GET' && route === '/scripts') {
    return { status: 200, json: { scripts: data.listScripts(url) } };
  }
  if (verb === 'POST' && route === '/records-by-url') {
    return { status: 200, json: { records: data.findRecordsByUrl(url) } };
  }
  if (verb === 'POST' && route === '/scripts-for-url') {
    return { status: 200, json: { scripts: data.scriptsForUrl(url) } };
  }

  return { status: 404, json: { error: 'not-found' } };
}

export function writeExtensionNativeConfig(dir: string, origin: string, token: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'native-config.json'), `${JSON.stringify({ origin, token }, null, 2)}\n`, 'utf8');
}
