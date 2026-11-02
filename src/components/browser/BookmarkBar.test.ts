import { expect, test } from 'vitest';
import { BOOKMARK_BAR_FOLDER_ID, MANUAL_BOOKMARK_FOLDER_ID } from '../../types';
import { collectManualSaveTargets } from './BookmarkBar';

test('lists the bookmark bar first, then nested manual folders', () => {
  expect(collectManualSaveTargets([
    {
      id: MANUAL_BOOKMARK_FOLDER_ID,
      name: '직접 추가',
      kind: 'manual',
      children: [
        {
          id: 'shop',
          name: '쇼핑',
          kind: 'manual',
          children: [
            { id: 'inner', name: '세부', kind: 'manual', children: [], bookmarks: [] },
          ],
          bookmarks: [],
        },
      ],
      bookmarks: [],
    },
    { id: 'movies', name: '영화', kind: 'category', children: [], bookmarks: [] },
  ])).toEqual([
    { id: BOOKMARK_BAR_FOLDER_ID, name: '북마크 바', depth: 0 },
    { id: null, name: '직접 추가', depth: 0 },
    { id: 'shop', name: '쇼핑', depth: 1 },
    { id: 'inner', name: '세부', depth: 2 },
  ]);
});
