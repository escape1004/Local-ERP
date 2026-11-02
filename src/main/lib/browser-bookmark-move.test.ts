import { expect, test } from 'vitest';
import { BOOKMARK_BAR_FOLDER_ID, MANUAL_BOOKMARK_FOLDER_ID } from './browser-bookmark-tree';
import { moveManualTreeItem } from './browser-bookmark-move';

const folders = [
  { id: 'shop', name: '쇼핑', parentId: null, sortOrder: 0 },
  { id: 'news', name: '뉴스', parentId: null, sortOrder: 1 },
  { id: 'inner', name: '세부', parentId: 'news', sortOrder: 0 },
];
const bookmarks = [
  { id: 'a', title: 'A', url: 'https://a.example', folderId: null, sortOrder: 0 },
  { id: 'b', title: 'B', url: 'https://b.example', folderId: null, sortOrder: 1 },
  { id: 'c', title: 'C', url: 'https://c.example', folderId: 'shop', sortOrder: 0 },
];

test('moves a bookmark into a folder and reindexes both lists', () => {
  const result = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'bookmark',
    id: 'a',
    parentId: 'shop',
    index: 0,
  });

  expect(result.bookmarks.find((item) => item.id === 'a')).toMatchObject({ folderId: 'shop', sortOrder: 0 });
  expect(result.bookmarks.find((item) => item.id === 'c')).toMatchObject({ folderId: 'shop', sortOrder: 1 });
  expect(result.bookmarks.find((item) => item.id === 'b')).toMatchObject({ folderId: null, sortOrder: 0 });
});

test('moves a bookmark out of a folder onto the root list', () => {
  const result = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'bookmark',
    id: 'c',
    parentId: MANUAL_BOOKMARK_FOLDER_ID,
    index: 1,
  });

  expect(result.bookmarks.find((item) => item.id === 'c')).toMatchObject({ folderId: null, sortOrder: 1 });
  expect(result.bookmarks.find((item) => item.id === 'a')).toMatchObject({ sortOrder: 0 });
  expect(result.bookmarks.find((item) => item.id === 'b')).toMatchObject({ sortOrder: 2 });
});

test('reorders bookmarks in the same folder', () => {
  const result = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'bookmark',
    id: 'a',
    parentId: null,
    index: 1,
  });

  expect(result.bookmarks.find((item) => item.id === 'b')).toMatchObject({ sortOrder: 0 });
  expect(result.bookmarks.find((item) => item.id === 'a')).toMatchObject({ folderId: null, sortOrder: 1 });
});

test('nests a folder under another folder', () => {
  const result = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'folder',
    id: 'shop',
    parentId: 'news',
    index: 0,
  });

  expect(result.folders.find((item) => item.id === 'shop')).toMatchObject({ parentId: 'news', sortOrder: 0 });
  expect(result.folders.find((item) => item.id === 'inner')).toMatchObject({ parentId: 'news', sortOrder: 1 });
  expect(result.folders.find((item) => item.id === 'news')).toMatchObject({ parentId: null, sortOrder: 0 });
});

test('moves a bookmark from the bookmark bar back to the list', () => {
  const withBar = [
    ...bookmarks,
    { id: 'bar', title: 'Bar', url: 'https://bar.example', folderId: BOOKMARK_BAR_FOLDER_ID, sortOrder: 0 },
  ];
  const result = moveManualTreeItem({
    folders,
    bookmarks: withBar,
    kind: 'bookmark',
    id: 'bar',
    parentId: null,
    index: 0,
  });

  expect(result.bookmarks.find((item) => item.id === 'bar')).toMatchObject({ folderId: null, sortOrder: 0 });
  expect(result.bookmarks.find((item) => item.id === 'a')).toMatchObject({ folderId: null, sortOrder: 1 });
});

test('moves a bookmark onto the bookmark bar', () => {
  const result = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'bookmark',
    id: 'a',
    parentId: BOOKMARK_BAR_FOLDER_ID,
    index: 0,
  });

  expect(result.bookmarks.find((item) => item.id === 'a')).toMatchObject({
    folderId: BOOKMARK_BAR_FOLDER_ID,
    sortOrder: 0,
  });
  expect(result.bookmarks.find((item) => item.id === 'b')).toMatchObject({ folderId: null, sortOrder: 0 });
});

test('rejects moving a folder onto the bookmark bar', () => {
  const result = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'folder',
    id: 'shop',
    parentId: BOOKMARK_BAR_FOLDER_ID,
    index: 0,
  });

  expect(result.folders).toEqual(folders);
});

test('rejects moving a folder into itself or a descendant', () => {
  const intoSelf = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'folder',
    id: 'news',
    parentId: 'news',
    index: 0,
  });
  const intoChild = moveManualTreeItem({
    folders,
    bookmarks,
    kind: 'folder',
    id: 'news',
    parentId: 'inner',
    index: 0,
  });

  expect(intoSelf.folders).toEqual(folders);
  expect(intoChild.folders).toEqual(folders);
});
