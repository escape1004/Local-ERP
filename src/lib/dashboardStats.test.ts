import { expect, test } from 'vitest';
import type { Category, DataRecord } from '../types';
import {
  buildDashboardCategoryStats,
  collectCategoryTreeIds,
  getChildCategoryRecordChartData,
  getDashboardTotalStats,
  getFileTypeChartData,
  getFileTypeCounts,
  getRecordViewCountKey,
  getRootCategoryRecordChartData,
  getVisibleDashboardCategories,
  groupChildrenByParentId,
  mapRecordViewCounts,
  summarizeWarningCounts,
} from './dashboardStats';

const fileField = { id: 'file', name: '파일', type: 'file' as const, required: false, unique: false, order: 0 };

function category(partial: Partial<Category> & Pick<Category, 'id' | 'name'>): Category {
  return {
    fields: [],
    order: 0,
    ...partial,
  } as Category;
}

function record(fileName: string): DataRecord {
  return {
    id: fileName,
    categoryId: 'c1',
    data: { file: fileName },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

test('maps view counts and builds per-category stats without waiting on warnings', () => {
  const cat = category({ id: 'c1', name: '미디어', fields: [fileField] });
  const newer = { ...record('b.MP4'), id: 'newer', createdAt: '2024-02-01T00:00:00.000Z' };
  const older = { ...record('a.jpg'), id: 'older', createdAt: '2024-01-01T00:00:00.000Z' };

  expect(mapRecordViewCounts([
    { categoryId: 'c1', recordId: 'newer', viewCount: 4 },
  ])).toEqual({ [getRecordViewCountKey('c1', 'newer')]: 4 });

  expect(buildDashboardCategoryStats([cat], () => [newer, older])).toEqual([{
    category: cat,
    recordCount: 2,
    imageCount: 1,
    videoCount: 1,
    archiveCount: 0,
    recentRecords: [newer, older],
  }]);
});

test('counts image, video, and archive files from a file field', () => {
  const cat = category({ id: 'c1', name: '미디어', fields: [fileField] });
  expect(getFileTypeCounts(cat, [
    record('a.jpg'),
    record('b.MP4'),
    record('c.zip'),
    record('d.txt'),
  ])).toEqual({ imageCount: 1, videoCount: 1, archiveCount: 1 });
});

test('walks a selected root category tree and ignores separators', () => {
  const visible = getVisibleDashboardCategories([
    category({ id: 'root', name: '루트' }),
    category({ id: 'child', name: '자식', parentId: 'root' }),
    category({ id: 'sep', name: '---', itemType: 'separator' }),
  ]);
  const children = groupChildrenByParentId(visible);
  expect(visible.map((item) => item.id)).toEqual(['root', 'child']);
  expect(collectCategoryTreeIds(visible[0], visible, children)).toEqual(new Set(['root', 'child']));
  expect(collectCategoryTreeIds(null, visible, children)).toEqual(new Set(['root', 'child']));
});

test('collectCategoryTreeIds keeps a selected dashboard scoped to that root and its descendants', () => {
  const movies = category({ id: 'movies', name: '영화' });
  const series = category({ id: 'series', name: '시리즈', parentId: 'movies' });
  const extras = category({ id: 'extras', name: '부가영상', parentId: 'series' });
  const games = category({ id: 'games', name: '게임' });
  const visible = [movies, series, extras, games];
  const childrenByParentId = groupChildrenByParentId(visible);

  expect([...collectCategoryTreeIds(movies, visible, childrenByParentId)].sort()).toEqual([
    'extras',
    'movies',
    'series',
  ]);
  expect([...collectCategoryTreeIds(null, visible, childrenByParentId)].sort()).toEqual([
    'extras',
    'games',
    'movies',
    'series',
  ]);
});

test('summarizes warning counts and file-type chart slices without empty values', () => {
  expect(summarizeWarningCounts([
    { type: 'missing-file' },
    { type: 'missing-file' },
    { type: 'broken-relation' },
  ])).toEqual({ missingFiles: 2, brokenRelations: 1 });

  const stats = [{
    category: category({ id: 'root', name: '루트' }),
    recordCount: 3,
    imageCount: 2,
    videoCount: 0,
    archiveCount: 1,
    recentRecords: [],
  }];
  expect(getFileTypeChartData(stats, null)).toEqual([
    { name: '이미지', value: 2, color: '#A855F7' },
    { name: '압축파일', value: 1, color: '#EAB308' },
  ]);
});

test('builds record charts and totals from scoped category stats', () => {
  const root = category({ id: 'root', name: '루트' });
  const child = category({ id: 'child', name: '자식', parentId: 'root' });
  const stats = [
    { category: root, recordCount: 4, imageCount: 1, videoCount: 1, archiveCount: 0, recentRecords: [] },
    { category: child, recordCount: 2, imageCount: 0, videoCount: 0, archiveCount: 1, recentRecords: [] },
  ];

  expect(getRootCategoryRecordChartData([root], stats)).toEqual([
    { name: '루트', fullName: '루트', records: 4, categoryId: 'root' },
  ]);
  expect(getChildCategoryRecordChartData([stats[1]])).toEqual([
    { name: '자식', fullName: '자식', records: 2, categoryId: 'child' },
  ]);
  expect(getDashboardTotalStats({
    selectedRootCategory: null,
    scopedCategoryStats: stats,
    descendantCount: 1,
    rootCategoryCount: 1,
  })).toEqual({
    totalCategories: 1,
    totalRecords: 4,
    totalImages: 1,
    totalVideos: 1,
    totalArchives: 0,
    totalChildCategories: 1,
  });
});
