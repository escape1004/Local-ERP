import { expect, test } from 'vitest';
import { matchBookmarkSources } from './browser-extension-match';

test('classifies a record url ahead of a matching manual bookmark', () => {
  const match = matchBookmarkSources({
    url: 'https://youtu.be/abc123XYZ01',
    records: [{ id: 'r1', label: '클립', urls: ['https://www.youtube.com/watch?v=abc123XYZ01'] }],
    items: [
      { id: 'm1', source: 'manual', title: '복사', url: 'https://www.youtube.com/watch?v=abc123XYZ01' },
    ],
  });
  expect(match.record).toBe(true);
  expect(match.manual).toBe(true);
  expect(match.records[0].id).toBe('r1');
});

test('marks a manual bookmark when the url is not in records', () => {
  const match = matchBookmarkSources({
    url: 'https://www.google.com/',
    records: [],
    items: [
      { id: 'm1', source: 'manual', title: '검색', url: 'https://www.google.com' },
      { id: 'r1', source: 'record', title: '다른 주소', url: 'https://example.com' },
    ],
  });
  expect(match).toMatchObject({
    record: false,
    manual: true,
    manuals: [{ id: 'm1', title: '검색', url: 'https://www.google.com' }],
  });
});

test('returns idle when nothing matches', () => {
  expect(matchBookmarkSources({
    url: 'https://example.com/missing',
    records: [],
    items: [{ id: 'm1', source: 'manual', title: '검색', url: 'https://www.google.com' }],
  })).toEqual({
    record: false,
    manual: false,
    records: [],
    manuals: [],
  });
});
