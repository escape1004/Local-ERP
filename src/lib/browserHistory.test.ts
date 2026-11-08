import { expect, test } from 'vitest';
import { filterBrowserHistory, shouldMergeBrowserHistoryVisit, shouldRecordBrowserHistoryUrl } from './browserHistory';

test('skips blank pages and merges rapid revisits', () => {
  expect(shouldRecordBrowserHistoryUrl('about:blank')).toBe(false);
  expect(shouldRecordBrowserHistoryUrl('https://example.com/')).toBe(true);
  expect(shouldMergeBrowserHistoryVisit({ url: 'https://example.com/', at: 1000 }, 'https://example.com/', 1500)).toBe(true);
  expect(shouldMergeBrowserHistoryVisit({ url: 'https://example.com/', at: 1000 }, 'https://example.com/', 4000)).toBe(false);
});

test('filters history by title or url', () => {
  const items = [
    { id: '1', url: 'https://a.example/', title: 'Alpha', visitedAt: '1' },
    { id: '2', url: 'https://b.example/docs', title: 'Guide', visitedAt: '2' },
  ];
  expect(filterBrowserHistory(items, 'docs')).toHaveLength(1);
  expect(filterBrowserHistory(items, 'alpha')[0].id).toBe('1');
});
