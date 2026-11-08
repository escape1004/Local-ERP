import { expect, test } from 'vitest';
import { popClosedBrowserTab, pushClosedBrowserTab, toClosedBrowserTab } from './browserClosedTabs';

test('ignores blank tabs and restores the most recently closed url', () => {
  expect(toClosedBrowserTab({ url: 'about:blank', title: '새 탭' })).toBeNull();
  const first = pushClosedBrowserTab([], toClosedBrowserTab({ url: 'https://a.example/', title: 'A' }));
  const stacked = pushClosedBrowserTab(first, { url: 'https://b.example/', title: 'B' });
  const popped = popClosedBrowserTab(stacked);
  expect(popped.tab).toEqual({ url: 'https://b.example/', title: 'B' });
  expect(popped.stack).toHaveLength(1);
});
