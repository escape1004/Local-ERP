import { expect, test } from 'vitest';
import {
  BROWSER_PAGE_HTML_LIMIT,
  getCaptureBrowserPageContextScript,
  simplifyBrowserPageHtml,
} from './browserPageContext';

test('strips scripts and styles from page html', () => {
  expect(simplifyBrowserPageHtml(
    '<html><head><style>body{color:red}</style></head><body><script>alert(1)</script><h1>Hello</h1></body></html>',
  )).toBe('<html><head></head><body><h1>Hello</h1></body></html>');
});

test('truncates long html snapshots', () => {
  const html = `<p>${'a'.repeat(200)}</p>`;
  const truncated = simplifyBrowserPageHtml(html, 40);
  expect(truncated.startsWith('<p>')).toBe(true);
  expect(truncated.includes('<!-- truncated -->')).toBe(true);
  expect(truncated.length).toBeLessThan(html.length);
});

test('builds a guest capture script with the html limit', () => {
  const script = getCaptureBrowserPageContextScript();
  expect(script).toContain(String(BROWSER_PAGE_HTML_LIMIT));
  expect(script).toContain('document.documentElement');
  expect(script).toContain('document.title');
});
