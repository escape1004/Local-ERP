import { expect, test } from 'vitest';
import { getEmbeddedBrowserHash, normalizeBrowserSessionUrl, resolveEmbeddedBrowserOpenUrl } from './browser-window-url';

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
