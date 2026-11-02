import {
  canonicalizeBrowserUrl,
  collectHttpUrls,
  isHttpUrlString,
} from './browser-url';

export const MANUAL_BOOKMARK_FOLDER_ID = '__manual__';
export const BOOKMARK_BAR_FOLDER_ID = '__bar__';

export function nextManualFolderName(existingNames = []) {
  const names = new Set(
    existingNames.map((name) => String(name || '').trim()).filter(Boolean),
  );
  const base = '새 폴더';
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

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

function visibleLabelFields(category) {
  return categoryFields(category)
    .filter((field) => field && field.type !== 'file' && !field.hidden)
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
}

function fieldStoredValue(field, data) {
  const value = data[field.id];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (item === null || item === undefined || item === '') return '';
      return String(item).trim();
    })
    .filter(Boolean)
    .join(', ');
}

export function getBrowserRecordLabels(record, category) {
  const fields = visibleLabelFields(category);
  const data = recordData(record);
  const title = (fields[0] ? fieldStoredValue(fields[0], data) : '').trim();
  const subtitle = (fields[1] ? fieldStoredValue(fields[1], data) : '').trim();
  return {
    title: title || record.id,
    subtitle,
  };
}

export function getBrowserRecordLabel(record, category) {
  return getBrowserRecordLabels(record, category).title;
}

export function buildBrowserBookmarkTree({
  categories = [],
  records = [],
  manualBookmarks = [],
  manualFolders = [],
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

    const labels = getBrowserRecordLabels(record, category);
    const list = autoBookmarksByCategory.get(category.id) || [];
    urls.forEach((url) => {
      list.push({
        id: `record:${record.id}:${url}`,
        title: labels.title,
        subtitle: labels.subtitle,
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
      folderId: normalizeId(bookmark.folderId ?? bookmark.folder_id),
      sortOrder: Number(bookmark.sortOrder ?? bookmark.sort_order ?? 0),
      recordId: bookmark.recordId || null,
      categoryId: bookmark.categoryId || null,
    });
  });

  const parsedFolders = [];
  const folderIds = new Set();
  manualFolders.forEach((folder) => {
    const id = normalizeId(folder?.id);
    const name = String(folder?.name || '').trim();
    if (!id || !name || folderIds.has(id) || id === MANUAL_BOOKMARK_FOLDER_ID || id === BOOKMARK_BAR_FOLDER_ID) return;
    folderIds.add(id);
    parsedFolders.push({
      id,
      name,
      parentId: normalizeId(folder.parentId ?? folder.parent_id),
      sortOrder: Number(folder.sortOrder ?? folder.sort_order ?? 0),
      createdAt: folder.createdAt || folder.created_at || '',
    });
  });
  parsedFolders.forEach((folder) => {
    if (folder.parentId && !folderIds.has(folder.parentId)) folder.parentId = null;
  });

  const bookmarksByFolder = new Map();
  const unfiledManual = [];
  const barManual = [];
  normalizedManual.forEach((bookmark) => {
    if (bookmark.folderId === BOOKMARK_BAR_FOLDER_ID) {
      barManual.push({ ...bookmark, folderId: BOOKMARK_BAR_FOLDER_ID });
      return;
    }
    if (bookmark.folderId && folderIds.has(bookmark.folderId)) {
      const list = bookmarksByFolder.get(bookmark.folderId) || [];
      list.push(bookmark);
      bookmarksByFolder.set(bookmark.folderId, list);
      return;
    }
    unfiledManual.push({ ...bookmark, folderId: null });
  });

  const buildManualFolder = (folder) => ({
    id: folder.id,
    name: folder.name,
    kind: 'manual',
    children: parsedFolders
      .filter((item) => item.parentId === folder.id)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'ko') || left.id.localeCompare(right.id))
      .map(buildManualFolder),
    bookmarks: [...(bookmarksByFolder.get(folder.id) || [])]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ko') || left.url.localeCompare(right.url)),
  });

  const manualChildren = parsedFolders
    .filter((folder) => !folder.parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'ko') || left.id.localeCompare(right.id))
    .map(buildManualFolder);

  const tree = [];
  if (manualChildren.length > 0 || unfiledManual.length > 0 || barManual.length > 0) {
    tree.push({
      id: MANUAL_BOOKMARK_FOLDER_ID,
      name: '직접 추가',
      kind: 'manual',
      children: manualChildren,
      bookmarks: unfiledManual.sort((left, right) => (
        left.sortOrder - right.sortOrder
        || left.title.localeCompare(right.title, 'ko')
        || left.url.localeCompare(right.url)
      )),
    });
  }
  tree.push(...categoryRoots);

  const bar = barManual.sort((left, right) => (
    left.sortOrder - right.sortOrder
    || left.title.localeCompare(right.title, 'ko')
    || left.url.localeCompare(right.url)
  ));

  return {
    tree,
    items: [
      ...normalizedManual,
      ...[...autoBookmarksByCategory.values()].flat(),
    ],
    bar,
    overlappingManualIds,
  };
}
