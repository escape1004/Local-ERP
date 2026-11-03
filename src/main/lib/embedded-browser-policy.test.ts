import { expect, test } from 'vitest';
import {
  applyChromeLikeClientHints,
  chromeLikeUserAgent,
  isBackgroundBrowserTabDisposition,
  isBotChallengeUrl,
  isBrowserTabDisposition,
  popupBoundsFromFeatures,
  shouldOpenEmbeddedBrowserPopup,
} from './embedded-browser-policy';

test('keeps sized or named window.open calls as popups for login flows', () => {
  expect(shouldOpenEmbeddedBrowserPopup({ url: 'about:blank' })).toBe(true);
  expect(shouldOpenEmbeddedBrowserPopup({ url: '', features: '' })).toBe(true);
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'https://accounts.google.com/o/oauth2',
    features: 'width=500,height=600',
  })).toBe(true);
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'https://nid.naver.com/oauth2.0/authorize',
    frameName: 'naverlogin',
  })).toBe(true);
});

test('keeps plain target=_blank navigations out of login popups so they can open as tabs', () => {
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'https://www.youtube.com/watch?v=abc',
    frameName: '_blank',
  })).toBe(false);
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'https://example.com/next',
  })).toBe(false);
  expect(isBackgroundBrowserTabDisposition('background-tab')).toBe(true);
  expect(isBackgroundBrowserTabDisposition('foreground-tab')).toBe(false);
  expect(isBrowserTabDisposition('foreground-tab')).toBe(true);
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'about:blank',
    disposition: 'background-tab',
  })).toBe(false);
});

test('reads popup size from window features', () => {
  expect(popupBoundsFromFeatures('width=520,height=640')).toMatchObject({ width: 520, height: 640 });
  expect(popupBoundsFromFeatures('')).toMatchObject({ width: 480, height: 720 });
});

test('strips Electron from the guest user agent', () => {
  expect(chromeLikeUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Local ERP/1.1.23 Chrome/136.0.0.0 Electron/36.4.0 Safari/537.36',
  )).toBe(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  );
  expect(chromeLikeUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.92 Electron/36.4.0 Safari/537.36',
    '136.0.7103.92',
  )).toBe(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  );
});

test('rewrites client hints so they match a Chrome user agent', () => {
  const headers = applyChromeLikeClientHints({
    'User-Agent': 'Mozilla/5.0 Chrome/136.0.7103.92 Electron/36.4.0 Safari/537.36',
    'Sec-CH-UA': '"Chromium";v="136", "Electron";v="36", "Not.A/Brand";v="99"',
    'sec-ch-ua-full-version-list': '"Chromium";v="136.0.7103.92", "Electron";v="36.4.0"',
  }, '136.0.7103.92', 'win32');
  expect(headers['User-Agent']).toContain('Chrome/136.0.0.0');
  expect(headers['User-Agent']).not.toContain('Electron');
  expect(headers['sec-ch-ua']).toBe('"Google Chrome";v="136", "Chromium";v="136", "Not.A/Brand";v="99"');
  expect(headers['Sec-CH-UA']).toBeUndefined();
  expect(headers['sec-ch-ua-full-version-list']).not.toContain('Electron');
  expect(headers['sec-ch-ua-platform']).toBe('"Windows"');
});

test('detects Cloudflare and other bot-challenge URLs', () => {
  expect(isBotChallengeUrl('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile')).toBe(true);
  expect(isBotChallengeUrl('https://example.com/cdn-cgi/challenge-platform/scripts/jsd')).toBe(true);
  expect(isBotChallengeUrl('https://newassets.hcaptcha.com/captcha/v1/setup')).toBe(true);
  expect(isBotChallengeUrl('https://example.com/login')).toBe(false);
});
