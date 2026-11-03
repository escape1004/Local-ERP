import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  getRegistrableDomain,
  isUserBlockedBrowserHost,
  parseBrowserBlockedDomain,
  shouldBlockBounceNavigation,
  shouldBlockBrowserRequest,
  shouldBlockForcedWindowOpen,
} from './browser-tracker-block.ts';

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
    pageUrl: 'https://example.com/login',
    requestUrl: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/g',
    resourceType: 'script',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/login',
    requestUrl: 'https://newassets.hcaptcha.com/captcha/v1/setup.js',
    resourceType: 'script',
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://example.com/',
    requestUrl: 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
    resourceType: 'script',
  }), false);
});

test('blocks forced third-party window.open but keeps login and user-opened tabs', () => {
  assert.equal(shouldBlockForcedWindowOpen({
    openerUrl: 'https://hitomi.la/galleries/1.html',
    targetUrl: 'https://prize-now.example/win',
    disposition: 'foreground-tab',
  }), true);
  assert.equal(shouldBlockForcedWindowOpen({
    openerUrl: 'https://hitomi.la/galleries/1.html',
    targetUrl: 'https://cdn.taboola.com/click',
    disposition: 'new-window',
  }), true);
  assert.equal(shouldBlockForcedWindowOpen({
    openerUrl: 'https://hitomi.la/galleries/1.html',
    targetUrl: 'https://gold.hitomi.la/out/1',
    disposition: 'foreground-tab',
  }), false);
  assert.equal(shouldBlockForcedWindowOpen({
    openerUrl: 'https://example.com/login',
    targetUrl: 'https://accounts.google.com/o/oauth2',
    disposition: 'new-window',
  }), false);
  assert.equal(shouldBlockForcedWindowOpen({
    openerUrl: 'https://www.google.com/search?q=test',
    targetUrl: 'https://example.com/result',
    disposition: 'background-tab',
  }), false);
});

test('parses and matches user-blocked domains including subdomains', () => {
  assert.equal(parseBrowserBlockedDomain('HTTPS://Ads.Scam.com/click?x=1'), 'ads.scam.com');
  assert.equal(parseBrowserBlockedDomain('*.scam.com'), 'scam.com');
  assert.equal(parseBrowserBlockedDomain('not a domain'), null);
  assert.equal(isUserBlockedBrowserHost('ads.scam.com', ['scam.com']), true);
  assert.equal(isUserBlockedBrowserHost('scam.com', ['ads.scam.com']), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://hitomi.la/galleries/1.html',
    requestUrl: 'https://prize-now.example/landing',
    resourceType: 'mainFrame',
    blockedDomains: ['prize-now.example'],
  }), true);
  assert.equal(shouldBlockForcedWindowOpen({
    openerUrl: 'https://hitomi.la/galleries/1.html',
    targetUrl: 'https://prize-now.example/landing',
    disposition: 'background-tab',
    blockedDomains: ['prize-now.example'],
  }), true);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://hitomi.la/galleries/1.html',
    requestUrl: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    resourceType: 'script',
    trackerBlocking: false,
  }), false);
  assert.equal(shouldBlockBrowserRequest({
    pageUrl: 'https://hitomi.la/galleries/1.html',
    requestUrl: 'https://prize-now.example/landing',
    resourceType: 'mainFrame',
    trackerBlocking: false,
    blockedDomains: ['prize-now.example'],
  }), true);
  assert.equal(shouldBlockBounceNavigation(
    'prize-now.example',
    'https://ads.prize-now.example/next',
    ['prize-now.example'],
  ), true);
});

test('blocks same-site bounce redirects onto untrusted third parties', () => {
  assert.equal(shouldBlockBounceNavigation('hitomi.la', 'https://malicious-prize.example/landing'), true);
  assert.equal(shouldBlockBounceNavigation('hitomi.la', 'https://gold.hitomi.la/next'), false);
  assert.equal(shouldBlockBounceNavigation('example.com', 'https://accounts.google.com/o/oauth2'), false);
});
