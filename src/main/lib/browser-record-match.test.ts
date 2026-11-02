import { expect, test } from 'vitest';
import { buildRecordUrlMatchIndex } from './browser-record-match';

const categories = [
  {
    id: 'videos',
    name: '영상',
    fields: [{ id: 'title', type: 'text' }, { id: 'link', type: 'text' }],
  },
];

const records = [
  {
    id: 'heat',
    categoryId: 'videos',
    data: { title: 'Heat', link: 'https://youtu.be/abc123XYZ01' },
  },
  {
    id: 'other',
    categoryId: 'videos',
    data: { title: 'Other', link: 'https://example.com/clip' },
  },
];

test('looks up matching records by canonical url without scanning again', () => {
  const index = buildRecordUrlMatchIndex({ categories, records });

  expect(index.lookup('https://www.youtube.com/watch?v=abc123XYZ01&t=12')).toEqual([
    {
      id: 'heat',
      categoryId: 'videos',
      label: 'Heat',
      urls: ['https://www.youtube.com/watch?v=abc123XYZ01'],
    },
  ]);
  expect(index.lookup('https://example.com/missing')).toEqual([]);
});
