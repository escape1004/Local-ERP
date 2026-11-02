import { expect, test } from 'vitest';
import { NEW_TAB_URL } from './browserTabs';
import {
  BACKGROUND_TAB_LOAD_STAGGER_MS,
  resolveWebviewStartNavigation,
  shouldLoadPendingWebviewUrl,
  upsertBrowserScriptList,
} from './browserWebviewLoad';

test('loads the active tab immediately and defers background tabs', () => {
  expect(resolveWebviewStartNavigation({
    startUrl: 'https://a.example/',
    isActive: true,
  })).toEqual({ src: 'https://a.example/', deferUrl: null, deferMs: 0 });

  expect(resolveWebviewStartNavigation({
    startUrl: 'https://b.example/',
    isActive: false,
    tabIndex: 2,
  })).toEqual({
    src: NEW_TAB_URL,
    deferUrl: 'https://b.example/',
    deferMs: BACKGROUND_TAB_LOAD_STAGGER_MS * 3,
  });
});

test('does not reload a webview that is already on the pending url', () => {
  expect(shouldLoadPendingWebviewUrl('https://a.example/', 'https://a.example/')).toBe(false);
  expect(shouldLoadPendingWebviewUrl('about:blank', 'https://a.example/')).toBe(true);
  expect(shouldLoadPendingWebviewUrl('', 'about:blank')).toBe(false);
});

test('upserts a saved script without refetching the whole list', () => {
  const current = [
    { id: 'a', name: 'Alpha' },
    { id: 'c', name: 'Charlie' },
  ];
  expect(upsertBrowserScriptList(current, { id: 'b', name: 'Bravo' }).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  expect(upsertBrowserScriptList(current, { id: 'a', name: 'Alpha 2' })[0]).toEqual({ id: 'a', name: 'Alpha 2' });
});
