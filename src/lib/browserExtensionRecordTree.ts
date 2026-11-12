type RecordBookmark = {
  id?: string;
  url?: string;
  recordId?: string | null;
};

type RecordFolder = {
  id: string;
  bookmarks?: RecordBookmark[];
  children?: RecordFolder[];
};

type RecordMatch = {
  id?: string;
  urls?: string[];
};

export function countRecordBookmarks(folder: RecordFolder): number {
  const own = Array.isArray(folder.bookmarks) ? folder.bookmarks.length : 0;
  return own + (folder.children || []).reduce((sum, child) => sum + countRecordBookmarks(child), 0);
}

export function recordMatchKeys(matches: RecordMatch[] = []) {
  const recordIds = new Set<string>();
  const urls = new Set<string>();
  matches.forEach((match) => {
    if (match?.id) recordIds.add(String(match.id));
    (match?.urls || []).forEach((url) => {
      if (url) urls.add(String(url));
    });
  });
  return { recordIds, urls };
}

export function isRecordBookmarkActive(
  bookmark: RecordBookmark,
  keys: { recordIds: Set<string>; urls: Set<string> },
) {
  if (bookmark?.recordId && keys.recordIds.has(String(bookmark.recordId))) return true;
  if (bookmark?.url && keys.urls.has(String(bookmark.url))) return true;
  return false;
}

export function folderIdsContainingActiveBookmarks(
  folders: RecordFolder[] = [],
  keys: { recordIds: Set<string>; urls: Set<string> },
) {
  const ids: string[] = [];

  const walk = (folder: RecordFolder, ancestors: string[]) => {
    const chain = [...ancestors, folder.id];
    let hit = (folder.bookmarks || []).some((bookmark) => isRecordBookmarkActive(bookmark, keys));
    (folder.children || []).forEach((child) => {
      if (walk(child, chain)) hit = true;
    });
    if (hit) ids.push(...chain);
    return hit;
  };

  folders.forEach((folder) => walk(folder, []));
  return [...new Set(ids)];
}
