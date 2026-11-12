function countRecordBookmarks(folder) {
  const own = Array.isArray(folder.bookmarks) ? folder.bookmarks.length : 0;
  return own + (folder.children || []).reduce((sum, child) => sum + countRecordBookmarks(child), 0);
}

function recordMatchKeys(matches) {
  const recordIds = new Set();
  const urls = new Set();
  (matches || []).forEach((match) => {
    if (match?.id) recordIds.add(String(match.id));
    (match?.urls || []).forEach((url) => {
      if (url) urls.add(String(url));
    });
  });
  return { recordIds, urls };
}

function isRecordBookmarkActive(bookmark, keys) {
  if (bookmark?.recordId && keys.recordIds.has(String(bookmark.recordId))) return true;
  if (bookmark?.url && keys.urls.has(String(bookmark.url))) return true;
  return false;
}

function folderIdsContainingActiveBookmarks(folders, keys) {
  const ids = [];
  const walk = (folder, ancestors) => {
    const chain = ancestors.concat(folder.id);
    let hit = (folder.bookmarks || []).some((bookmark) => isRecordBookmarkActive(bookmark, keys));
    (folder.children || []).forEach((child) => {
      if (walk(child, chain)) hit = true;
    });
    if (hit) ids.push(...chain);
    return hit;
  };
  (folders || []).forEach((folder) => walk(folder, []));
  return [...new Set(ids)];
}
