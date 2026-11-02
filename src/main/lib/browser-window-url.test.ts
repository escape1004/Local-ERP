import { expect, test } from 'vitest';
import { getEmbeddedBrowserHash } from './browser-window-url';

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
