import { canonicalizeBrowserUrl } from './browser-url';
import { collectRecordHttpUrls, getBrowserRecordLabel } from './browser-bookmark-tree';

function parseJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function buildRecordUrlMatchIndex({ categories = [], records = [] } = {}) {
  const categoryById = new Map(categories.map((category) => [
    category.id,
    { ...category, fields: parseJson(category.fields, []) },
  ]));
  const byUrl = new Map();

  records.forEach((record) => {
    const data = parseJson(record.data, {});
    const category = categoryById.get(record.categoryId);
    const urls = collectRecordHttpUrls({ ...record, data }, category);
    if (urls.length === 0) return;

    const match = {
      id: record.id,
      categoryId: record.categoryId,
      label: getBrowserRecordLabel({ ...record, data }, category),
      urls,
    };
    urls.forEach((url) => {
      const canonical = canonicalizeBrowserUrl(url) || url;
      const list = byUrl.get(canonical) || [];
      list.push(match);
      byUrl.set(canonical, list);
    });
  });

  return {
    lookup(targetUrl) {
      const canonical = canonicalizeBrowserUrl(String(targetUrl || ''));
      if (!canonical) return [];
      return (byUrl.get(canonical) || []).map((match) => ({
        ...match,
        urls: match.urls.filter((item) => (canonicalizeBrowserUrl(item) || item) === canonical),
      }));
    },
  };
}
