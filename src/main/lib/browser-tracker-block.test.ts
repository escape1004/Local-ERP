import assert from 'node:assert/strict';
import { test } from 'vitest';
import { getRegistrableDomain, shouldBlockBrowserRequest } from './browser-tracker-block.ts';

test('getRegistrableDomain handles ordinary and multi-part TLDs', () => {
  assert.equal(getRegistrableDomain('ads.example.com'), 'example.com');
  assert.equal(getRegistrableDomain('ad.naver.com'), 'naver.com');
  assert.equal(getRegistrableDomain('track.news.co.kr'), 'news.co.kr');
});

test('blocks well-known third-party ad hosts', () => {
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/article',
    requestUrl: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    resourceType: 'script',
  }), true);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/',
    requestUrl: 'https://cm.g.doubleclick.net/pixel',
    resourceType: 'image',
  }), true);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://blog.example.com/',
    requestUrl: 'https://cdn.taboola.com/libtrc/unit.js',
    resourceType: 'script',
  }), true);
});

test('does not block first-party requests or document navigations', () => {
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://www.doubleclick.net/',
    requestUrl: 'https://stats.doubleclick.net/pixel',
    resourceType: 'image',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/',
    requestUrl: 'https://pagead2.googlesyndication.com/pagead/ads',
    resourceType: 'mainFrame',
  }), false);
});

test('never blocks login, google, or youtube hosts', () => {
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/',
    requestUrl: 'https://accounts.google.com/gsi/client',
    resourceType: 'script',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://www.youtube.com/watch?v=abc',
    requestUrl: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    resourceType: 'image',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://www.youtube.com/watch?v=abc',
    requestUrl: 'https://rr1---sn-example.googlevideo.com/videoplayback',
    resourceType: 'media',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/login',
    requestUrl: 'https://connect.facebook.net/en_US/sdk.js',
    resourceType: 'script',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/',
    requestUrl: 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
    resourceType: 'script',
  }), false);
});
