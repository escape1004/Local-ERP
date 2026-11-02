import { expect, test } from 'vitest';
import { MANUAL_BOOKMARK_FOLDER_ID, buildBrowserBookmarkTree } from './browser-bookmark-tree';

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
    url: 'https://www.youtube.com/watch?v=abc123XYZ01',
  });
  expect(result.tree[1].children).toHaveLength(1);
  expect(result.tree[1].children[0].name).toBe('배우');
  expect(result.tree[1].children[0].bookmarks[0]).toMatchObject({
    source: 'record',
    title: 'Pacino',
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

test('uses text prefix fields as urls and labels with a non-url text field', () => {
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
    title: 'Intro',
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
