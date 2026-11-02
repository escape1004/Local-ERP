import { expect, test } from 'vitest';
import { faviconUrlFor } from './browserFavicon';

test('builds a favicon url from a page host', () => {
  expect(faviconUrlFor('https://www.youtube.com/watch?v=abc'))
    .toBe('https://www.google.com/s2/favicons?domain=www.youtube.com&sz=32');
});

test('returns null for invalid urls', () => {
  expect(faviconUrlFor('')).toBeNull();
  expect(faviconUrlFor('not-a-url')).toBeNull();
});
