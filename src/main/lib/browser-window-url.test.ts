import { expect, test } from 'vitest';
import {
  getEmbeddedBrowserHash,
  MAX_BROWSER_SESSION_TABS,
  normalizeBrowserSessionTabs,
  normalizeBrowserSessionUrl,
  normalizePersistedBrowserSession,
  resolveEmbeddedBrowserOpenUrl,
  resolveEmbeddedBrowserSession,
} from './browser-window-url';

test('builds a browser hash without a url', () => {
  expect(getEmbeddedBrowserHash('')).toBe('/browser');
  expect(getEmbeddedBrowserHash()).toBe('/browser');
});

test('puts a safe http url into the browser hash', () => {
  expect(getEmbeddedBrowserHash('https://www.youtube.com/watch?v=abc123XYZ01'))
    .toBe('/browser?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123XYZ01');
});

test('rejects non-http urls in the browser hash', () => {
  expect(getEmbeddedBrowserHash('file:///C:/Windows/notepad.exe')).toBe('/browser');
  expect(getEmbeddedBrowserHash('javascript:alert(1)')).toBe('/browser');
});

test('keeps http session urls and about:blank', () => {
  expect(normalizeBrowserSessionUrl('https://example.com/page')).toBe('https://example.com/page');
  expect(normalizeBrowserSessionUrl('about:blank')).toBe('about:blank');
  expect(normalizeBrowserSessionUrl('javascript:alert(1)')).toBe('');
});

test('restores the last page only when continue is selected and no url was requested', () => {
  expect(resolveEmbeddedBrowserOpenUrl('https://example.com/now', 'https://example.com/last', 'continue'))
    .toBe('https://example.com/now');
  expect(resolveEmbeddedBrowserOpenUrl('', 'https://example.com/last', 'newtab')).toBe('');
  expect(resolveEmbeddedBrowserOpenUrl('', 'https://example.com/last', 'continue')).toBe('https://example.com/last');
  expect(resolveEmbeddedBrowserOpenUrl('', 'about:blank', 'continue')).toBe('');
});

test('keeps http tab urls and blank tabs, dropping unsafe entries', () => {
  expect(normalizeBrowserSessionTabs([
    'https://example.com/one',
    'about:blank',
    'javascript:alert(1)',
    { url: 'https://example.com/two' },
    '',
  ])).toEqual([
    'https://example.com/one',
    'about:blank',
    'https://example.com/two',
  ]);
});

test('caps restored tabs and falls back to the last url', () => {
  const overflow = Array.from({ length: MAX_BROWSER_SESSION_TABS + 4 }, (_, index) => `https://n${index}.example/`);
  expect(normalizeBrowserSessionTabs(overflow)).toHaveLength(MAX_BROWSER_SESSION_TABS);

  expect(normalizePersistedBrowserSession([], 9, 'https://example.com/last')).toEqual({
    urls: ['https://example.com/last'],
    activeIndex: 0,
  });
  expect(normalizePersistedBrowserSession(
    ['https://a.example/', 'https://b.example/', 'https://c.example/'],
    2,
    'https://b.example/',
  )).toEqual({
    urls: ['https://a.example/', 'https://b.example/', 'https://c.example/'],
    activeIndex: 2,
  });
});

test('restores saved tabs only when continue is selected', () => {
  const lastTabs = ['https://a.example/', 'https://b.example/'];
  expect(resolveEmbeddedBrowserSession({
    lastTabs,
    lastTabIndex: 1,
    lastUrl: 'https://b.example/',
    startupMode: 'newtab',
  })).toEqual({ urls: [], activeIndex: 0 });
  expect(resolveEmbeddedBrowserSession({
    lastTabs,
    lastTabIndex: 1,
    lastUrl: 'https://b.example/',
    startupMode: 'continue',
  })).toEqual({ urls: lastTabs, activeIndex: 1 });
  expect(resolveEmbeddedBrowserSession({
    requestedUrl: 'https://now.example/',
    lastTabs,
    lastTabIndex: 1,
    startupMode: 'newtab',
  })).toEqual({ urls: ['https://now.example/'], activeIndex: 0 });
});
