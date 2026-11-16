import { expect, test } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CHROMIUM_EXTENSION_ID,
  handleExtensionBridgeRequest,
  isAllowedExtensionOrigin,
  normalizeExtensionBridgeBody,
  readBridgeToken,
  writeExtensionNativeConfig,
} from './browser-extension-bridge';

const data = {
  bookmarks: () => ({ tree: [{ id: 'cat', name: '영상', kind: 'category', children: [], bookmarks: [] }] }),
  listScripts: () => [{ id: 's1', name: '강조', enabled: true, runningHere: true }],
  scriptsForUrl: () => [{ id: 's1', source: 'window.flag=1' }],
  findRecordsByUrl: () => [{ id: 'r1', label: '클립' }],
  matchBookmarksByUrl: () => ({ record: false, manual: true, records: [], manuals: [{ id: 'm1', title: '검색' }] }),
  addBookmark: (payload) => (
    payload.url
      ? { success: true, bookmark: { id: 'n1', url: payload.url, folderId: payload.folderId ?? null } }
      : { success: false, error: '북마크할 주소가 올바르지 않습니다.' }
  ),
  removeBookmark: (id) => (id ? { success: true } : { success: false, error: '북마크를 찾을 수 없습니다.' }),
};

test('allows the packed Chromium id and any Firefox extension origin', () => {
  expect(isAllowedExtensionOrigin(`chrome-extension://${CHROMIUM_EXTENSION_ID}`)).toBe(true);
  expect(isAllowedExtensionOrigin('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
  expect(isAllowedExtensionOrigin('moz-extension://11111111-2222-4333-8444-555555555555')).toBe(true);
  expect(isAllowedExtensionOrigin('https://example.com')).toBe(false);
});

test('serves status without a token and protects record data', () => {
  expect(handleExtensionBridgeRequest({
    method: 'GET',
    pathname: '/status',
    origin: '',
    token: '',
    expectedToken: 'secret',
    data,
  }).json).toEqual({ ok: true, app: 'local-erp' });

  expect(handleExtensionBridgeRequest({
    method: 'GET',
    pathname: '/bookmarks',
    origin: '',
    token: 'secret',
    expectedToken: 'secret',
    data,
  }).status).toBe(200);

  expect(handleExtensionBridgeRequest({
    method: 'GET',
    pathname: '/bookmarks',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'wrong',
    expectedToken: 'secret',
    data,
  }).status).toBe(401);

  expect(handleExtensionBridgeRequest({
    method: 'POST',
    pathname: '/records-by-url',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'secret',
    expectedToken: 'secret',
    body: { url: 'https://example.com' },
    data,
  }).json).toEqual({ records: [{ id: 'r1', label: '클립' }] });

  expect(handleExtensionBridgeRequest({
    method: 'GET',
    pathname: '/scripts',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'secret',
    expectedToken: 'secret',
    query: { url: 'https://www.youtube.com/watch?v=abc' },
    data,
  }).json).toEqual({ scripts: [{ id: 's1', name: '강조', enabled: true, runningHere: true }] });

  expect(handleExtensionBridgeRequest({
    method: 'POST',
    pathname: '/bookmark-match',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'secret',
    expectedToken: 'secret',
    body: { url: 'https://www.google.com' },
    data,
  }).json).toEqual({
    record: false,
    manual: true,
    records: [],
    manuals: [{ id: 'm1', title: '검색' }],
  });

  expect(handleExtensionBridgeRequest({
    method: 'POST',
    pathname: '/bookmarks',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'secret',
    expectedToken: 'secret',
    body: { url: 'https://www.google.com', title: '검색', folderId: null },
    data,
  }).json).toEqual({
    success: true,
    bookmark: { id: 'n1', url: 'https://www.google.com', folderId: null },
  });

  expect(handleExtensionBridgeRequest({
    method: 'POST',
    pathname: '/bookmarks',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'secret',
    expectedToken: 'secret',
    body: { title: '검색' },
    data,
  }).status).toBe(400);

  expect(handleExtensionBridgeRequest({
    method: 'POST',
    pathname: '/bookmarks/remove',
    origin: `chrome-extension://${CHROMIUM_EXTENSION_ID}`,
    token: 'secret',
    expectedToken: 'secret',
    body: { id: 'm1' },
    data,
  }).json).toEqual({ success: true });
});

test('keeps folder id and bookmark id from the request body', () => {
  expect(normalizeExtensionBridgeBody({
    url: 'https://example.com',
    title: '예제',
    folderId: 'shop',
    id: 'm1',
  })).toEqual({
    url: 'https://example.com',
    title: '예제',
    folderId: 'shop',
    id: 'm1',
  });
  expect(normalizeExtensionBridgeBody({
    url: 'https://example.com',
    folderId: null,
  })).toMatchObject({ folderId: null, id: undefined });
});

test('reads the bridge token from either header casing', () => {
  expect(readBridgeToken({ 'X-Lcerp-Token': 'abc' })).toBe('abc');
  expect(readBridgeToken({ 'x-lcerp-token': ['xyz'] })).toBe('xyz');
});

test('ships separate Brave and Firefox extension manifests', () => {
  const root = path.join(process.cwd(), 'extension');
  const chromium = JSON.parse(fs.readFileSync(path.join(root, 'chromium', 'manifest.json'), 'utf8'));
  const firefox = JSON.parse(fs.readFileSync(path.join(root, 'firefox', 'manifest.json'), 'utf8'));
  expect(chromium.side_panel.default_path).toBe('sidepanel.html');
  expect(chromium.key).toBeTruthy();
  expect(chromium.action.default_popup).toBeUndefined();
  expect(chromium.action.default_icon[16]).toBe('icons/star-idle-16.png');
  expect(firefox.sidebar_action.default_panel).toBe('sidepanel.html');
  expect(firefox.browser_specific_settings.gecko.id).toBe('lcerp-browser@local-erp');
  expect(firefox.action.default_popup).toBeUndefined();
  expect(firefox.action.default_icon[16]).toBe('icons/star-idle-16.png');
});

test('writes native-config.json for the unpacked extension folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcerp-ext-'));
  writeExtensionNativeConfig(dir, 'http://127.0.0.1:17361', 'token-1');
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'native-config.json'), 'utf8'));
  expect(written).toEqual({ origin: 'http://127.0.0.1:17361', token: 'token-1' });
  fs.rmSync(dir, { recursive: true, force: true });
});
