import { expect, test } from 'vitest';
import {
  countRecordBookmarks,
  folderIdsContainingActiveBookmarks,
  isRecordBookmarkActive,
  recordMatchKeys,
} from './browserExtensionRecordTree';

const tree = [
  {
    id: 'games',
    bookmarks: [],
    children: [
      {
        id: 'clips',
        bookmarks: [
          { id: 'b1', recordId: 'r1', url: 'https://www.youtube.com/watch?v=abc' },
          { id: 'b2', recordId: 'r2', url: 'https://example.com/other' },
        ],
        children: [],
      },
    ],
  },
];

test('counts nested record bookmarks for folder headers', () => {
  expect(countRecordBookmarks(tree[0])).toBe(2);
  expect(countRecordBookmarks(tree[0].children[0])).toBe(2);
});

test('marks the current url when the record id or stored url matches', () => {
  const keys = recordMatchKeys([
    { id: 'r1', urls: ['https://www.youtube.com/watch?v=abc'] },
  ]);
  expect(isRecordBookmarkActive(tree[0].children[0].bookmarks[0], keys)).toBe(true);
  expect(isRecordBookmarkActive(tree[0].children[0].bookmarks[1], keys)).toBe(false);
});

test('opens ancestor folders that contain the current record url', () => {
  const keys = recordMatchKeys([
    { id: 'r1', urls: ['https://www.youtube.com/watch?v=abc'] },
  ]);
  expect(folderIdsContainingActiveBookmarks(tree, keys)).toEqual(['games', 'clips']);
});
