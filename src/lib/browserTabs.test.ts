import { expect, test } from 'vitest';
import {
  closeBrowserTab,
  createBrowserTab,
  cycleBrowserTab,
  isBlankBrowserTab,
  MAX_BROWSER_TABS,
  openBrowserTab,
  restoreBrowserSession,
  selectBrowserTabByNumber,
  titleForBrowserTab,
} from './browserTabs';

test('labels blank tabs and hostnames', () => {
  expect(titleForBrowserTab('about:blank')).toBe('새 탭');
  expect(titleForBrowserTab('https://example.com/path')).toBe('example.com');
  expect(titleForBrowserTab('https://example.com', 'Example')).toBe('Example');
  expect(isBlankBrowserTab({ url: 'about:blank' })).toBe(true);
});

test('reuses an empty active tab instead of creating another', () => {
  const empty = createBrowserTab();
  const result = openBrowserTab([empty], empty.id, 'https://example.com/');
  expect(result.tabs).toHaveLength(1);
  expect(result.reusedId).toBe(empty.id);
  expect(result.tabs[0].url).toBe('https://example.com/');
});

test('opens a background tab without changing the active tab', () => {
  const current = createBrowserTab('https://example.com/');
  const result = openBrowserTab([current], current.id, 'https://other.example/', { background: true });
  expect(result.tabs).toHaveLength(2);
  expect(result.activeId).toBe(current.id);
  expect(result.created).toBe(true);
});

test('keeps one empty tab when the last tab closes', () => {
  const tab = createBrowserTab('https://example.com/');
  const result = closeBrowserTab([tab], tab.id, tab.id);
  expect(result.tabs).toHaveLength(1);
  expect(result.tabs[0].id).not.toBe(tab.id);
  expect(isBlankBrowserTab(result.tabs[0])).toBe(true);
});

test('cycles tabs and stops at the max count', () => {
  const first = createBrowserTab('https://a.example/');
  const second = createBrowserTab('https://b.example/');
  expect(cycleBrowserTab([first, second], first.id, 1)).toBe(second.id);
  expect(cycleBrowserTab([first, second], second.id, 1)).toBe(first.id);

  let tabs = [first];
  let activeId = first.id;
  for (let index = 0; index < MAX_BROWSER_TABS + 2; index += 1) {
    const result = openBrowserTab(tabs, activeId, `https://n${index}.example/`, { background: true, reuseEmpty: false });
    tabs = result.tabs;
    activeId = result.activeId;
  }
  expect(tabs).toHaveLength(MAX_BROWSER_TABS);
});

test('selects the Nth tab with Ctrl+number, and 9 as the last tab', () => {
  const first = createBrowserTab('https://a.example/');
  const second = createBrowserTab('https://b.example/');
  const third = createBrowserTab('https://c.example/');
  const tabs = [first, second, third];
  expect(selectBrowserTabByNumber(tabs, 1)).toBe(first.id);
  expect(selectBrowserTabByNumber(tabs, 3)).toBe(third.id);
  expect(selectBrowserTabByNumber(tabs, 9)).toBe(third.id);
  expect(selectBrowserTabByNumber(tabs, 4)).toBeNull();
});

test('restores saved tabs and the active index', () => {
  const restored = restoreBrowserSession(['https://a.example/', 'about:blank', 'https://c.example/'], 2);
  expect(restored.tabs.map((tab) => tab.url)).toEqual(['https://a.example/', 'about:blank', 'https://c.example/']);
  expect(restored.activeId).toBe(restored.tabs[2].id);
});

test('opens a requested url as another tab without dropping the saved session', () => {
  const restored = restoreBrowserSession(['https://a.example/', 'https://b.example/'], 0, 'https://now.example/');
  expect(restored.tabs.map((tab) => tab.url)).toEqual([
    'https://a.example/',
    'https://b.example/',
    'https://now.example/',
  ]);
  expect(restored.activeId).toBe(restored.tabs[2].id);
});

test('reuses a saved tab when the requested url is already open', () => {
  const restored = restoreBrowserSession(['https://a.example/', 'https://b.example/'], 0, 'https://b.example/');
  expect(restored.tabs).toHaveLength(2);
  expect(restored.activeId).toBe(restored.tabs[1].id);
});
