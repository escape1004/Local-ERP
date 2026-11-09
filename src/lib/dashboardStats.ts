import type { Category, DashboardWarningItem, DataRecord } from '../types';
import { isSeparatorCategory } from './category';

export const ALL_ROOT_CATEGORIES_VALUE = '__all__';
export const SUPPORTED_THUMBNAIL_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.avi', '.mkv', '.mov', '.zip', '.7z'];

export interface CategoryStats {
  category: Category;
  recordCount: number;
  imageCount: number;
  videoCount: number;
  archiveCount: number;
  recentRecords: DataRecord[];
}

export function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

export function getRecordViewCountKey(categoryId: string, recordId: string) {
  return `${categoryId}:${recordId}`;
}

export function mapRecordViewCounts(
  viewCounts: Array<{ categoryId: string; recordId: string; viewCount: number }>,
): Record<string, number> {
  return Object.fromEntries(
    viewCounts.map((item) => [getRecordViewCountKey(item.categoryId, item.recordId), item.viewCount])
  );
}

export function buildDashboardCategoryStats(
  categories: Category[],
  getRecords: (categoryId: string) => DataRecord[],
): CategoryStats[] {
  return categories.map((category) => {
    const records = getRecords(category.id) || [];
    const { imageCount, videoCount, archiveCount } = getFileTypeCounts(category, records);
    const recentRecords = [...records]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      category,
      recordCount: records.length,
      imageCount,
      videoCount,
      archiveCount,
      recentRecords,
    };
  });
}

export function getTrackableFileField(category: Category) {
  return category.fields.find((field) => field.type === 'file' && !field.thumbnailOnly);
}

export function getFileTypeCounts(category: Category, records: DataRecord[]) {
  const fileField = category.fields.find((field) => field.type === 'file');
  let imageCount = 0;
  let videoCount = 0;
  let archiveCount = 0;

  records.forEach((record) => {
    if (!fileField || !record.data[fileField.id]) {
      return;
    }

    const filePath = String(record.data[fileField.id] || '');
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(ext)) {
      imageCount += 1;
    } else if (/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(ext)) {
      videoCount += 1;
    } else if (/\.(zip|7z|rar)$/i.test(ext)) {
      archiveCount += 1;
    }
  });

  return { imageCount, videoCount, archiveCount };
}

export function getCategoryDisplayField(category: Category) {
  return category.fields.find((field) => field.type === 'text') || category.fields[0];
}

export function getRecordDisplayValue(category: Category, record: DataRecord) {
  const displayField = getCategoryDisplayField(category);
  return displayField && record.data[displayField.id]
    ? String(record.data[displayField.id])
    : new Date(record.createdAt).toLocaleDateString('ko-KR');
}

export function getVisibleDashboardCategories(categories: Category[]) {
  return categories.filter((cat) => !isSeparatorCategory(cat)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getRootDashboardCategories(visibleCategories: Category[]) {
  return visibleCategories.filter((cat) => !cat.parentId);
}

export function groupChildrenByParentId(visibleCategories: Category[]) {
  const map = new Map<string, Category[]>();
  visibleCategories.forEach((category) => {
    if (!category.parentId) {
      return;
    }

    const siblings = map.get(category.parentId) || [];
    siblings.push(category);
    map.set(category.parentId, siblings);
  });

  map.forEach((items) => items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  return map;
}

export function collectCategoryTreeIds(
  selectedRootCategory: Category | null,
  visibleCategories: Category[],
  childrenByParentId: Map<string, Category[]>,
) {
  if (!selectedRootCategory) {
    return new Set(visibleCategories.map((category) => category.id));
  }

  const ids = new Set<string>();
  const stack = [selectedRootCategory.id];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || ids.has(currentId)) {
      continue;
    }

    ids.add(currentId);
    const children = childrenByParentId.get(currentId) || [];
    children.forEach((child) => stack.push(child.id));
  }

  return ids;
}

export function summarizeWarningCounts(warnings: Array<{ type: DashboardWarningItem['type'] }>) {
  return warnings.reduce(
    (acc, item) => {
      if (item.type === 'missing-file') {
        acc.missingFiles += 1;
      } else if (item.type === 'broken-relation') {
        acc.brokenRelations += 1;
      }
      return acc;
    },
    { missingFiles: 0, brokenRelations: 0 },
  );
}

export function getDashboardTotalStats({
  selectedRootCategory,
  scopedCategoryStats,
  descendantCount,
  rootCategoryCount,
}: {
  selectedRootCategory: Category | null;
  scopedCategoryStats: CategoryStats[];
  descendantCount: number;
  rootCategoryCount: number;
}) {
  const statsForTotals = selectedRootCategory
    ? scopedCategoryStats
    : scopedCategoryStats.filter((stat) => !stat.category.parentId);

  return {
    totalCategories: rootCategoryCount,
    totalRecords: statsForTotals.reduce((sum, stat) => sum + stat.recordCount, 0),
    totalImages: statsForTotals.reduce((sum, stat) => sum + stat.imageCount, 0),
    totalVideos: statsForTotals.reduce((sum, stat) => sum + stat.videoCount, 0),
    totalArchives: statsForTotals.reduce((sum, stat) => sum + stat.archiveCount, 0),
    totalChildCategories: descendantCount,
  };
}

export function getFileTypeChartData(scopedCategoryStats: CategoryStats[], selectedRootCategory: Category | null) {
  const sourceStats = selectedRootCategory
    ? scopedCategoryStats
    : scopedCategoryStats.filter((stat) => !stat.category.parentId);
  const totals = sourceStats.reduce(
    (acc, stat) => ({
      images: acc.images + stat.imageCount,
      videos: acc.videos + stat.videoCount,
      archives: acc.archives + stat.archiveCount,
    }),
    { images: 0, videos: 0, archives: 0 },
  );

  return [
    { name: '이미지', value: totals.images, color: '#A855F7' },
    { name: '동영상', value: totals.videos, color: '#EF4444' },
    { name: '압축파일', value: totals.archives, color: '#EAB308' },
  ].filter((item) => item.value > 0);
}

export function getRootCategoryRecordChartData(
  rootCategories: Category[],
  categoryStats: CategoryStats[],
) {
  const statsByCategoryId = new Map(
    categoryStats.map((stat) => [stat.category.id, stat]),
  );

  return rootCategories
    .map((rootCategory) => ({
      name: rootCategory.name,
      fullName: rootCategory.name,
      records: statsByCategoryId.get(rootCategory.id)?.recordCount ?? 0,
      categoryId: rootCategory.id,
    }))
    .filter((item) => item.records > 0)
    .sort((a, b) => b.records - a.records)
    .slice(0, 10);
}

export function getChildCategoryRecordChartData(descendantCategoryStats: CategoryStats[]) {
  return descendantCategoryStats
    .filter((stat) => stat.recordCount > 0)
    .sort((a, b) => b.recordCount - a.recordCount)
    .slice(0, 10)
    .map((stat) => ({
      name: stat.category.name,
      fullName: stat.category.name,
      records: stat.recordCount,
      categoryId: stat.category.id,
    }));
}
