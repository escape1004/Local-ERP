import { expect, test } from 'vitest';
import {
  getEmbeddedBrowserHash,
  MAX_BROWSER_SESSION_TABS,
  normalizeBrowserSessionTabs,
  normalizeBrowserSessionUrl,
  normalizePersistedBrowserSession,
  claimLegacyBrowserSessionForProfile,
  deleteBrowserSessionForProfile,
  readBrowserSessionForProfile,
  resolveEmbeddedBrowserOpenUrl,
  resolveEmbeddedBrowserSession,
  writeBrowserSessionForProfile,
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
  expect(normalizeBrowserSessionUrl('about:history')).toBe('about:history');
  expect(normalizeBrowserSessionUrl('about:downloads')).toBe('about:downloads');
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

test('keeps restored browser tabs scoped to the selected profile', () => {
  const config = {
    browserLastTabs: ['https://legacy.example/'],
    browserLastTabIndex: 0,
    browserLastUrl: 'https://legacy.example/',
    browserSessionsByProfile: {
      'profile-a': {
        tabs: ['https://a.example/', 'https://a2.example/'],
        activeIndex: 1,
        lastUrl: 'https://a2.example/',
      },
    },
  };

  expect(readBrowserSessionForProfile(config, 'profile-a')).toEqual({
    urls: ['https://a.example/', 'https://a2.example/'],
    activeIndex: 1,
  });
  expect(readBrowserSessionForProfile(config, 'profile-b')).toEqual({
    urls: [],
    activeIndex: 0,
  });
});

test('claims leftover global tabs for the first profile after upgrade', () => {
  const config = {
    browserLastTabs: ['https://legacy.example/'],
    browserLastTabIndex: 0,
    browserLastUrl: 'https://legacy.example/',
  };

  expect(claimLegacyBrowserSessionForProfile(config, 'profile-a')).toBe(true);
  expect(readBrowserSessionForProfile(config, 'profile-a')).toEqual({
    urls: ['https://legacy.example/'],
    activeIndex: 0,
  });
  expect(readBrowserSessionForProfile(config, 'profile-b')).toEqual({
    urls: [],
    activeIndex: 0,
  });
  expect(claimLegacyBrowserSessionForProfile(config, 'profile-b')).toBe(false);
});

test('writes and deletes browser sessions per profile', () => {
  const config = {
    browserLastTabs: [],
    browserLastTabIndex: 0,
    browserLastUrl: '',
    browserSessionsByProfile: {},
  };

  writeBrowserSessionForProfile(config, 'profile-a', {
    urls: ['https://a.example/'],
    activeIndex: 0,
  });
  writeBrowserSessionForProfile(config, 'profile-b', {
    urls: ['https://b.example/', 'https://b2.example/'],
    activeIndex: 1,
  });

  expect(readBrowserSessionForProfile(config, 'profile-a').urls).toEqual(['https://a.example/']);
  expect(readBrowserSessionForProfile(config, 'profile-b')).toEqual({
    urls: ['https://b.example/', 'https://b2.example/'],
    activeIndex: 1,
  });

  expect(deleteBrowserSessionForProfile(config, 'profile-b')).toBe(true);
  expect(readBrowserSessionForProfile(config, 'profile-b')).toEqual({ urls: [], activeIndex: 0 });
  expect(readBrowserSessionForProfile(config, 'profile-a').urls).toEqual(['https://a.example/']);

  expect(deleteBrowserSessionForProfile(config, 'profile-a')).toBe(true);
  expect(config.browserLastTabs).toEqual([]);
  expect(readBrowserSessionForProfile(config, 'profile-a')).toEqual({ urls: [], activeIndex: 0 });
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
