import { expect, test } from 'vitest';
import {
  canonicalizeBrowserUrl,
  collectHttpUrls,
  matchUrlPattern,
  urlsReferToSameResource,
} from './browser-url';

test('canonicalizes youtube watch, short, and share links to a video id', () => {
  expect(canonicalizeBrowserUrl('https://youtu.be/abc123XYZ01?si=track'))
    .toBe('https://www.youtube.com/watch?v=abc123XYZ01');
  expect(canonicalizeBrowserUrl('https://www.youtube.com/shorts/abc123XYZ01'))
    .toBe('https://www.youtube.com/watch?v=abc123XYZ01');
  expect(canonicalizeBrowserUrl('https://m.youtube.com/watch?v=abc123XYZ01&feature=share'))
    .toBe('https://www.youtube.com/watch?v=abc123XYZ01');
});

test('strips tracking params and trailing slashes from generic urls', () => {
  expect(canonicalizeBrowserUrl('https://Example.com/path/?utm_source=x&q=1'))
    .toBe('https://example.com/path?q=1');
  expect(canonicalizeBrowserUrl('https://example.com/path/')).toBe('https://example.com/path');
});

test('matches tampermonkey-style url patterns', () => {
  expect(matchUrlPattern('https://www.youtube.com/*', 'https://www.youtube.com/feed/subscriptions')).toBe(true);
  expect(matchUrlPattern('*://www.youtube.com/*', 'https://www.youtube.com/watch?v=1')).toBe(true);
  expect(matchUrlPattern('https://example.com/*', 'https://other.com/')).toBe(false);
});

test('compares record urls after canonicalization and collects http strings', () => {
  expect(urlsReferToSameResource(
    'https://youtu.be/abc123XYZ01',
    'https://www.youtube.com/watch?v=abc123XYZ01&t=12',
  )).toBe(true);
  expect(collectHttpUrls({
    title: 'Clip',
    link: 'https://youtu.be/abc123XYZ01',
    extra: ['https://example.com/a', 'not-a-url'],
  })).toEqual(['https://youtu.be/abc123XYZ01', 'https://example.com/a']);
});
