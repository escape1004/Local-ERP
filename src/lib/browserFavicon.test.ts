import { expect, test } from 'vitest';
import { faviconUrlFor, shortcutLabelForBookmark } from './browserFavicon';

test('builds a favicon url from a page host', () => {
  expect(faviconUrlFor('https://www.youtube.com/watch?v=abc'))
    .toBe('https://www.google.com/s2/favicons?domain=www.youtube.com&sz=32');
  expect(faviconUrlFor('https://www.youtube.com/watch?v=abc', 64))
    .toBe('https://www.google.com/s2/favicons?domain=www.youtube.com&sz=64');
});

test('returns null for invalid urls', () => {
  expect(faviconUrlFor('')).toBeNull();
  expect(faviconUrlFor('not-a-url')).toBeNull();
});

test('uses the bookmark title or host as a shortcut label', () => {
  expect(shortcutLabelForBookmark({ title: '유튜브', url: 'https://www.youtube.com/watch?v=abc' })).toBe('유튜브');
  expect(shortcutLabelForBookmark({ title: '  ', url: 'https://www.youtube.com/watch?v=abc' })).toBe('youtube.com');
  expect(shortcutLabelForBookmark({ url: 'not-a-url' })).toBe('not-a-url');
});
