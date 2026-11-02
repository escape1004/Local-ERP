import { expect, test } from 'vitest';
import { matchUrlPattern, scriptMatchesUrl } from './browser-url';

test('matches Tampermonkey-style youtube patterns against a watch url', () => {
  expect(matchUrlPattern('*://*.youtube.com/*', 'https://www.youtube.com/watch?v=abc123')).toBe(true);
  expect(matchUrlPattern('https://www.youtube.com/*', 'https://www.youtube.com/watch?v=abc123')).toBe(true);
});

test('treats extra query params and youtu.be as the same target', () => {
  expect(scriptMatchesUrl(
    ['https://www.youtube.com/watch?v=abc123'],
    'https://www.youtube.com/watch?v=abc123&t=12s&si=zz',
  )).toBe(true);
  expect(scriptMatchesUrl(
    ['https://www.youtube.com/*'],
    'https://youtu.be/abc123',
  )).toBe(true);
});

test('treats a hostname-only pattern as matching that site', () => {
  expect(scriptMatchesUrl(['youtube.com'], 'https://www.youtube.com/watch?v=abc123')).toBe(true);
  expect(scriptMatchesUrl(['www.youtube.com'], 'https://www.youtube.com/watch?v=abc123')).toBe(true);
});

test('does not match a blank tab', () => {
  expect(scriptMatchesUrl(['*'], 'about:blank')).toBe(false);
  expect(scriptMatchesUrl(['youtube.com'], '')).toBe(false);
});
