import fs from 'fs';
import http from 'http';
import path from 'path';
import { appDataDir, log } from '../store';
import { scriptMatchesUrl } from '../lib/browser-url';
import {
  EXTENSION_HTTP_HOST,
  EXTENSION_HTTP_PORT_MAX,
  EXTENSION_HTTP_PORT_MIN,
  handleExtensionBridgeRequest,
  readBridgeToken,
} from '../lib/browser-extension-bridge';
import {
  createExtensionBridgeToken,
  getBrowserExtensionInstallInfo,
  prepareBrowserExtensionFiles,
} from '../lib/browser-extension-install';
import {
  findBrowserExtensionRecordsByUrl,
  listBrowserExtensionBookmarks,
  listBrowserExtensionScripts,
} from '../lib/browser-extension-data';

export let extensionBridgePort = EXTENSION_HTTP_PORT_MIN;
let extensionBridgeToken = '';
let extensionBridgeOrigin = `http://${EXTENSION_HTTP_HOST}:${EXTENSION_HTTP_PORT_MIN}`;
let started = false;

function tokenPath() {
  return path.join(appDataDir, 'browser-extension', 'bridge-token.txt');
}

function loadOrCreateToken() {
  const file = tokenPath();
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  const token = createExtensionBridgeToken();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${token}\n`, 'utf8');
  return token;
}

function readJsonBody(req: http.IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      if (chunks.reduce((sum, item) => sum + item.length, 0) > 1_000_000) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Lcerp-Token',
    'Access-Control-Max-Age': '600',
  };
}

function extensionBridgeData() {
  return {
    bookmarks: () => {
      const listed = listBrowserExtensionBookmarks();
      return { tree: listed.tree || [] };
    },
    listScripts: (url: string) => (
      listBrowserExtensionScripts().map((script) => ({
        id: script.id,
        name: script.name,
        enabled: script.enabled,
        matches: script.matches,
        runningHere: Boolean(script.enabled && url && scriptMatchesUrl(script.matches, url)),
      }))
    ),
    scriptsForUrl: (url: string) => (
      listBrowserExtensionScripts()
        .filter((script) => script.enabled && scriptMatchesUrl(script.matches, url))
        .map((script) => ({
          id: script.id,
          runAt: script.runAt,
          source: script.source,
        }))
    ),
    findRecordsByUrl: (url: string) => findBrowserExtensionRecordsByUrl(url),
  };
}

function listenOnPort(server: http.Server, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, EXTENSION_HTTP_HOST);
  });
}

export async function startBrowserExtensionBridge() {
  if (started) return getBrowserExtensionBridgeState();
  extensionBridgeToken = loadOrCreateToken();

  const server = http.createServer(async (req, res) => {
    const origin = String(req.headers.origin || '');
    const headers = corsHeaders(origin);
    try {
      const urlObj = new URL(req.url || '/', extensionBridgeOrigin);
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const result = handleExtensionBridgeRequest({
        method: req.method,
        pathname: urlObj.pathname,
        origin,
        token: readBridgeToken(req.headers as Record<string, string | string[] | undefined>),
        expectedToken: extensionBridgeToken,
        body: { url: typeof body.url === 'string' ? body.url : '' },
        query: { url: urlObj.searchParams.get('url') || '' },
        data: extensionBridgeData(),
      });
      res.writeHead(result.status, {
        ...headers,
        ...(result.json ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      });
      res.end(result.json ? JSON.stringify(result.json) : undefined);
    } catch (error) {
      log('확장 브리지 요청 실패:', error);
      res.writeHead(500, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'internal' }));
    }
  });

  let port = EXTENSION_HTTP_PORT_MIN;
  while (port <= EXTENSION_HTTP_PORT_MAX) {
    try {
      await listenOnPort(server, port);
      extensionBridgePort = port;
      extensionBridgeOrigin = `http://${EXTENSION_HTTP_HOST}:${port}`;
      started = true;
      prepareBrowserExtensionFiles(extensionBridgeOrigin, extensionBridgeToken);
      log('확장 브리지 시작:', extensionBridgeOrigin);
      return getBrowserExtensionBridgeState();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        port += 1;
        continue;
      }
      throw error;
    }
  }
  throw new Error('확장 브리지 포트를 찾지 못했습니다.');
}

export function getBrowserExtensionBridgeState() {
  return {
    origin: extensionBridgeOrigin,
    port: extensionBridgePort,
    ready: started,
    ...getBrowserExtensionInstallInfo(extensionBridgeOrigin),
  };
}

export function ensureBrowserExtensionPrepared() {
  if (!started || !extensionBridgeToken) {
    throw new Error('확장 브리지가 아직 시작되지 않았습니다.');
  }
  prepareBrowserExtensionFiles(extensionBridgeOrigin, extensionBridgeToken);
  return getBrowserExtensionBridgeState();
}
