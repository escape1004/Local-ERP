import { expect, test } from 'vitest';
import {
  chromeLikeUserAgent,
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

test('folds plain target=_blank navigations into the current webview', () => {
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'https://www.youtube.com/watch?v=abc',
    frameName: '_blank',
  })).toBe(false);
  expect(shouldOpenEmbeddedBrowserPopup({
    url: 'https://example.com/next',
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
});
