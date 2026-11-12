import { expect, test } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  CHROMIUM_EXTENSION_ID,
  handleExtensionBridgeRequest,
  isAllowedExtensionOrigin,
  readBridgeToken,
  writeExtensionNativeConfig,
} from './browser-extension-bridge';

const data = {
  bookmarks: () => ({ tree: [{ id: 'cat', name: '영상', kind: 'category', children: [], bookmarks: [] }] }),
  listScripts: () => [{ id: 's1', name: '강조', enabled: true, runningHere: true }],
  scriptsForUrl: () => [{ id: 's1', source: 'window.flag=1' }],
  findRecordsByUrl: () => [{ id: 'r1', label: '클립' }],
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
  expect(firefox.sidebar_action.default_panel).toBe('sidepanel.html');
  expect(firefox.browser_specific_settings.gecko.id).toBe('lcerp-browser@local-erp');
});

test('writes native-config.json for the unpacked extension folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcerp-ext-'));
  writeExtensionNativeConfig(dir, 'http://127.0.0.1:17361', 'token-1');
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'native-config.json'), 'utf8'));
  expect(written).toEqual({ origin: 'http://127.0.0.1:17361', token: 'token-1' });
  fs.rmSync(dir, { recursive: true, force: true });
});
