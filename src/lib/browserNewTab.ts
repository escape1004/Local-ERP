import { shortcutLabelForBookmark } from './browserFavicon';

export const MAX_NEW_TAB_RANDOM = 5;

export function hostLabelForUrl(url) {
  try {
    return new URL(String(url || '')).hostname.replace(/^www\./, '') || String(url || '');
  } catch {
    return String(url || '');
  }
}

export function uniqueNewTabPages(pages, options = {}) {
  const excludeUrls = new Set((options.excludeUrls || []).map((item) => String(item || '')).filter(Boolean));
  const limit = Number.isFinite(options.limit) ? Math.max(0, Number(options.limit)) : (Array.isArray(pages) ? pages.length : 0);
  const result = [];
  (Array.isArray(pages) ? pages : []).forEach((page) => {
    if (result.length >= limit) return;
    const url = String(page?.url || '');
    if (!url || url === 'about:blank' || excludeUrls.has(url)) return;
    excludeUrls.add(url);
    result.push({
      id: String(page.id || url),
      url,
      title: shortcutLabelForBookmark(page),
    });
  });
  return result;
}

export function pickRandomBookmarks(bookmarks, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(0, Number(options.limit)) : MAX_NEW_TAB_RANDOM;
  const random = typeof options.random === 'function' ? options.random : Math.random;
  const pool = uniqueNewTabPages(bookmarks);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    const current = pool[index];
    pool[index] = pool[swapWith];
    pool[swapWith] = current;
  }
  return pool.slice(0, limit);
}
