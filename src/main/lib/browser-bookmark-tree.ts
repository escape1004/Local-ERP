import {
  canonicalizeBrowserUrl,
  collectHttpUrls,
  isHttpUrlString,
} from './browser-url';

export const MANUAL_BOOKMARK_FOLDER_ID = '__manual__';

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === 'null' || text === 'undefined') return null;
  return text;
}

function categoryFields(category) {
  return Array.isArray(category?.fields) ? category.fields : parseJson(category?.fields, []);
}

function recordData(record) {
  return record?.data && typeof record.data === 'object' ? record.data : parseJson(record?.data, {});
}

export function formatBrowserFieldValue(field, value) {
  if (value === null || value === undefined || value === '') return '';
  const rawText = String(value);
  if (field?.type !== 'text') return rawText;
  return `${field.textPrefix ?? ''}${rawText}${field.textSuffix ?? ''}`;
}

function fieldHasUrlAffix(field) {
  if (!field || (field.type !== 'text' && field.type !== 'longtext')) return false;
  const prefix = String(field.textPrefix || '');
  const suffix = String(field.textSuffix || '');
  return /^https?:\/\//i.test(prefix) || /^https?:\/\//i.test(suffix);
}

function pushCanonicalUrl(bucket: Set<string>, value) {
  if (!isHttpUrlString(value)) return;
  const canonical = canonicalizeBrowserUrl(value.trim()) || value.trim();
  if (canonical) bucket.add(canonical);
}

export function collectRecordHttpUrls(record, category): string[] {
  const data = recordData(record);
  const fields = categoryFields(category);
  const urls = new Set<string>();

  fields.forEach((field) => {
    const value = data[field.id];
    const items = Array.isArray(value) ? value : [value];
    items.forEach((item) => {
      pushCanonicalUrl(urls, formatBrowserFieldValue(field, item));
      pushCanonicalUrl(urls, item);
    });
  });

  collectHttpUrls(data).forEach((item) => pushCanonicalUrl(urls, item));
  return [...urls];
}

function fieldValueIsUrl(field, data) {
  const value = data[field.id];
  const items = Array.isArray(value) ? value : [value];
  return items.some((item) => (
    isHttpUrlString(formatBrowserFieldValue(field, item)) || isHttpUrlString(item)
  ));
}

export function getBrowserRecordLabel(record, category) {
  const fields = categoryFields(category);
  const data = recordData(record);
  const preferred = fields.find((field) => field.type === 'text' && !field.hidden && !fieldValueIsUrl(field, data))
    ?? fields.find((field) => field.type !== 'file' && !field.hidden && !fieldValueIsUrl(field, data))
    ?? fields.find((field) => field.type === 'text' && !field.hidden)
    ?? fields.find((field) => field.type !== 'file' && !field.hidden)
    ?? fields[0];
  if (!preferred) return record.id;
  const formatted = formatBrowserFieldValue(preferred, data[preferred.id]).trim();
  if (!formatted) return record.id;
  if (isHttpUrlString(formatted)) {
    try {
      return new URL(formatted).hostname.replace(/^www\./, '') || record.id;
    } catch {
      return record.id;
    }
  }
  return formatted;
}

export function buildBrowserBookmarkTree({
  categories = [],
  records = [],
  manualBookmarks = [],
} = {}) {
  const parsedCategories = categories
    .filter((category) => category?.itemType !== 'separator')
    .map((category) => ({
      id: normalizeId(category.id),
      name: category.name || category.id,
      parentId: normalizeId(category.parentId),
      order: Number(category.order ?? category.order_num ?? 0),
      fields: categoryFields(category),
    }))
    .filter((category) => category.id);
  const categoryById = new Map(parsedCategories.map((category) => [category.id, category]));

  const autoBookmarksByCategory = new Map();
  records.forEach((record) => {
    const categoryId = normalizeId(record.categoryId);
    const category = categoryById.get(categoryId);
    if (!category) return;
    const urls = collectRecordHttpUrls(record, category);
    if (urls.length === 0) return;

    const title = getBrowserRecordLabel(record, category);
    const list = autoBookmarksByCategory.get(category.id) || [];
    urls.forEach((url) => {
      list.push({
        id: `record:${record.id}:${url}`,
        title,
        url,
        source: 'record',
        recordId: record.id,
        categoryId: category.id,
        createdAt: record.createdAt || '',
      });
    });
    autoBookmarksByCategory.set(category.id, list);
  });

  const included = new Set();
  parsedCategories.forEach((category) => {
    const hasAffix = category.fields.some(fieldHasUrlAffix);
    const hasBookmarks = (autoBookmarksByCategory.get(category.id) || []).length > 0;
    if (!hasAffix && !hasBookmarks) return;
    let currentId = category.id;
    while (currentId && !included.has(currentId)) {
      included.add(currentId);
      currentId = categoryById.get(currentId)?.parentId || null;
    }
  });

  const buildFolder = (category) => {
    if (!included.has(category.id)) return null;
    const children = parsedCategories
      .filter((item) => item.parentId === category.id)
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'ko'))
      .map(buildFolder)
      .filter(Boolean);
    const bookmarks = [...(autoBookmarksByCategory.get(category.id) || [])]
      .sort((left, right) => left.title.localeCompare(right.title, 'ko') || left.url.localeCompare(right.url));
    const hasUrlField = category.fields.some(fieldHasUrlAffix);
    if (children.length === 0 && bookmarks.length === 0 && !hasUrlField) return null;
    return {
      id: category.id,
      name: category.name,
      kind: 'category',
      children,
      bookmarks,
    };
  };

  const categoryRoots = parsedCategories
    .filter((category) => !category.parentId || !categoryById.has(category.parentId))
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'ko'))
    .map(buildFolder)
    .filter(Boolean);

  const recordUrls = new Set([...autoBookmarksByCategory.values()].flat().map((item) => item.url));
  const overlappingManualIds: string[] = [];
  const normalizedManual = [];
  manualBookmarks.forEach((bookmark) => {
    const url = canonicalizeBrowserUrl(bookmark.url) || bookmark.url;
    if (recordUrls.has(url)) {
      if (bookmark.id) overlappingManualIds.push(bookmark.id);
      return;
    }
    normalizedManual.push({
      ...bookmark,
      url,
      source: 'manual',
      recordId: bookmark.recordId || null,
      categoryId: bookmark.categoryId || null,
    });
  });

  const tree = [];
  if (normalizedManual.length > 0) {
    tree.push({
      id: MANUAL_BOOKMARK_FOLDER_ID,
      name: '직접 추가',
      kind: 'manual',
      children: [],
      bookmarks: normalizedManual,
    });
  }
  tree.push(...categoryRoots);

  return {
    tree,
    items: [
      ...normalizedManual,
      ...[...autoBookmarksByCategory.values()].flat(),
    ],
    overlappingManualIds,
  };
}
