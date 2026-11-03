import { expect, test } from 'vitest';
import { pickRandomBookmarks, uniqueNewTabPages } from './browserNewTab';

test('caps unique pages at the requested limit', () => {
  expect(uniqueNewTabPages([
    { id: '1', url: 'https://one.example', title: 'One' },
    { id: '2', url: 'https://two.example', title: 'Two' },
    { id: '3', url: 'https://three.example', title: 'Three' },
  ], { limit: 2 })).toHaveLength(2);
});

test('picks up to five unique bookmarks in shuffled order', () => {
  const bookmarks = [
    { id: '1', url: 'https://one.example', title: 'One' },
    { id: '2', url: 'https://two.example', title: 'Two' },
    { id: '3', url: 'https://three.example', title: 'Three' },
    { id: '4', url: 'https://four.example', title: 'Four' },
    { id: '5', url: 'https://five.example', title: 'Five' },
    { id: '6', url: 'https://six.example', title: 'Six' },
    { id: 'dup', url: 'https://one.example', title: 'One copy' },
  ];
  const picked = pickRandomBookmarks(bookmarks, { random: () => 0.99 });
  expect(picked).toHaveLength(5);
  expect(picked.map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
  expect(new Set(picked.map((item) => item.url)).size).toBe(5);
});

test('returns every bookmark when fewer than five exist', () => {
  expect(pickRandomBookmarks([
    { id: '1', url: 'https://one.example', title: 'One' },
    { id: '2', url: 'https://two.example', title: 'Two' },
  ], { random: () => 0 })).toEqual([
    { id: '2', url: 'https://two.example', title: 'Two' },
    { id: '1', url: 'https://one.example', title: 'One' },
  ]);
});
