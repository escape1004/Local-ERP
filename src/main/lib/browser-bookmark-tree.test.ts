import { expect, test } from 'vitest';
import {
  MANUAL_BOOKMARK_FOLDER_ID,
  buildBrowserBookmarkTree,
  nextManualFolderName,
} from './browser-bookmark-tree';

test('picks an unused default folder name', () => {
  expect(nextManualFolderName([])).toBe('새 폴더');
  expect(nextManualFolderName(['새 폴더'])).toBe('새 폴더 2');
  expect(nextManualFolderName(['새 폴더', '새 폴더 2'])).toBe('새 폴더 3');
});

const movies = {
  id: 'movies',
  name: '영화',
  fields: [{ id: 'title', type: 'text' }, { id: 'link', type: 'text' }],
  order: 0,
};
const actors = {
  id: 'actors',
  name: '배우',
  parentId: 'movies',
  fields: [{ id: 'name', type: 'text' }, { id: 'page', type: 'text' }],
  order: 0,
};
const unused = {
  id: 'notes',
  name: '메모',
  fields: [{ id: 'body', type: 'longtext' }],
  order: 1,
};

test('puts record urls into category folders and nests subcategories', () => {
  const result = buildBrowserBookmarkTree({
    categories: [movies, actors, unused],
    records: [
      { id: 'm1', categoryId: 'movies', data: { title: 'Heat', link: 'https://youtu.be/abc123XYZ01' } },
      { id: 'a1', categoryId: 'actors', data: { name: 'Pacino', page: 'https://example.com/pacino' } },
    ],
    manualBookmarks: [
      { id: 'manual-1', title: '검색', url: 'https://www.google.com', createdAt: '2026-01-01' },
    ],
  });

  expect(result.tree.map((folder) => folder.id)).toEqual([MANUAL_BOOKMARK_FOLDER_ID, 'movies']);
  expect(result.tree[0].kind).toBe('manual');
  expect(result.tree[0].bookmarks).toHaveLength(1);
  expect(result.tree[1].bookmarks[0]).toMatchObject({
    source: 'record',
    title: 'Heat',
    subtitle: 'https://youtu.be/abc123XYZ01',
    url: 'https://www.youtube.com/watch?v=abc123XYZ01',
  });
  expect(result.tree[1].children).toHaveLength(1);
  expect(result.tree[1].children[0].name).toBe('배우');
  expect(result.tree[1].children[0].bookmarks[0]).toMatchObject({
    source: 'record',
    title: 'Pacino',
    subtitle: 'https://example.com/pacino',
    url: 'https://example.com/pacino',
  });
  expect(result.items.some((item) => item.source === 'manual')).toBe(true);
  expect(result.items.filter((item) => item.source === 'record')).toHaveLength(2);
});

test('keeps parent folders when only a subcategory has urls', () => {
  const result = buildBrowserBookmarkTree({
    categories: [movies, actors],
    records: [
      { id: 'a1', categoryId: 'actors', data: { name: 'Pacino', page: 'https://example.com/pacino' } },
    ],
  });

  expect(result.tree).toHaveLength(1);
  expect(result.tree[0].id).toBe('movies');
  expect(result.tree[0].bookmarks).toEqual([]);
  expect(result.tree[0].children[0].id).toBe('actors');
});

test('omits categories without urls and skips separators', () => {
  const result = buildBrowserBookmarkTree({
    categories: [
      movies,
      unused,
      { id: 'sep', name: '----', itemType: 'separator', fields: [], order: 2 },
    ],
    records: [
      { id: 'm1', categoryId: 'movies', data: { title: 'Heat', link: 'https://example.com/heat' } },
      { id: 'n1', categoryId: 'notes', data: { body: 'no url here' } },
    ],
  });

  expect(result.tree.map((folder) => folder.id)).toEqual(['movies']);
  expect(result.items).toHaveLength(1);
});

test('labels record bookmarks with the first two field values', () => {
  const clips = {
    id: 'clips',
    name: '클립',
    fields: [
      { id: 'yt', type: 'text', textPrefix: 'https://www.youtube.com/watch?v=' },
      { id: 'title', type: 'text' },
    ],
    order: 0,
  };
  const result = buildBrowserBookmarkTree({
    categories: [clips],
    records: [{ id: 'c1', categoryId: 'clips', data: { yt: 'abc123XYZ01', title: 'Intro' } }],
  });

  expect(result.tree[0].id).toBe('clips');
  expect(result.tree[0].bookmarks[0]).toMatchObject({
    source: 'record',
    title: 'abc123XYZ01',
    subtitle: 'Intro',
    url: 'https://www.youtube.com/watch?v=abc123XYZ01',
  });
});

test('nests a url subcategory under its parent folder', () => {
  const series = { id: 'series', name: '시리즈', fields: [{ id: 'name', type: 'text' }], order: 0 };
  const result = buildBrowserBookmarkTree({
    categories: [series, { ...actors, parentId: 'series' }],
    records: [
      { id: 'a1', categoryId: 'actors', data: { name: 'Pacino', page: 'https://example.com/pacino' } },
    ],
  });

  expect(result.tree).toHaveLength(1);
  expect(result.tree[0]).toMatchObject({ id: 'series', bookmarks: [] });
  expect(result.tree[0].children[0]).toMatchObject({
    id: 'actors',
    name: '배우',
  });
  expect(result.tree[0].children[0].bookmarks[0].title).toBe('Pacino');
});

test('keeps a category folder when it has a url prefix field even without records', () => {
  const clips = {
    id: 'clips',
    name: '클립',
    fields: [{ id: 'yt', type: 'text', textPrefix: 'https://www.youtube.com/watch?v=' }],
    order: 0,
  };
  const result = buildBrowserBookmarkTree({ categories: [clips], records: [] });
  expect(result.tree).toEqual([
    expect.objectContaining({ id: 'clips', name: '클립', bookmarks: [], children: [] }),
  ]);
});

test('places user folders under the direct-add root and keeps unfiled bookmarks', () => {
  const result = buildBrowserBookmarkTree({
    categories: [],
    records: [],
    manualBookmarks: [
      { id: 'in-folder', title: '검색', url: 'https://www.google.com', folderId: 'shop', createdAt: '' },
      { id: 'loose', title: '뉴스', url: 'https://example.com/news', createdAt: '' },
    ],
    manualFolders: [{ id: 'shop', name: '쇼핑', createdAt: '2026-01-01' }],
  });

  expect(result.tree).toHaveLength(1);
  expect(result.tree[0]).toMatchObject({
    id: MANUAL_BOOKMARK_FOLDER_ID,
    bookmarks: [expect.objectContaining({ id: 'loose', folderId: null })],
  });
  expect(result.tree[0].children).toEqual([
    expect.objectContaining({
      id: 'shop',
      name: '쇼핑',
      kind: 'manual',
      bookmarks: [expect.objectContaining({ id: 'in-folder', folderId: 'shop' })],
    }),
  ]);
});

test('orders manual folders and bookmarks by sortOrder', () => {
  const result = buildBrowserBookmarkTree({
    categories: [],
    records: [],
    manualFolders: [
      { id: 'b', name: 'B', sortOrder: 1 },
      { id: 'a', name: 'A', sortOrder: 0 },
    ],
    manualBookmarks: [
      { id: 'second', title: 'Ann', url: 'https://a.example', sortOrder: 1, createdAt: '' },
      { id: 'first', title: 'Zed', url: 'https://z.example', sortOrder: 0, createdAt: '' },
    ],
  });

  expect(result.tree[0].children.map((folder) => folder.id)).toEqual(['a', 'b']);
  expect(result.tree[0].bookmarks.map((bookmark) => bookmark.id)).toEqual(['first', 'second']);
});

test('keeps an empty manual folder in the tree', () => {
  const result = buildBrowserBookmarkTree({
    categories: [],
    records: [],
    manualFolders: [{ id: 'empty', name: '새 폴더' }],
  });

  expect(result.tree[0].children[0]).toMatchObject({
    id: 'empty',
    name: '새 폴더',
    bookmarks: [],
    children: [],
  });
});

test('drops manual bookmarks that duplicate record urls', () => {
  const result = buildBrowserBookmarkTree({
    categories: [movies],
    records: [{ id: 'm1', categoryId: 'movies', data: { title: 'Heat', link: 'https://example.com/heat' } }],
    manualBookmarks: [{ id: 'man', title: 'Heat copy', url: 'https://example.com/heat', createdAt: '' }],
  });

  expect(result.tree.map((folder) => folder.kind)).toEqual(['category']);
  expect(result.items.every((item) => item.source === 'record')).toBe(true);
  expect(result.overlappingManualIds).toEqual(['man']);
});
