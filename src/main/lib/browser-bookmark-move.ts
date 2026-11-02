import { BOOKMARK_BAR_FOLDER_ID, MANUAL_BOOKMARK_FOLDER_ID } from './browser-bookmark-tree';

type ManualFolderRow = {
  id: string;
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
};

type ManualBookmarkRow = {
  id: string;
  title?: string;
  url?: string;
  folderId?: string | null;
  sortOrder?: number;
};

type MoveManualTreeItemInput = {
  folders?: ManualFolderRow[];
  bookmarks?: ManualBookmarkRow[];
  kind?: 'bookmark' | 'folder';
  id?: string;
  parentId?: string | null;
  index?: number;
};

export function normalizeManualParentId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === 'null' || text === 'undefined' || text === MANUAL_BOOKMARK_FOLDER_ID) return null;
  return text;
}

function compareOrder(left, right, nameKey) {
  const order = Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0);
  if (order !== 0) return order;
  return String(left[nameKey] || '').localeCompare(String(right[nameKey] || ''), 'ko')
    || String(left.id || '').localeCompare(String(right.id || ''));
}

export function siblingManualFolders(folders, parentId) {
  const pid = normalizeManualParentId(parentId);
  return folders
    .filter((folder) => normalizeManualParentId(folder.parentId) === pid)
    .sort((left, right) => compareOrder(left, right, 'name'));
}

export function siblingManualBookmarks(bookmarks, folderId) {
  const pid = normalizeManualParentId(folderId);
  return bookmarks
    .filter((bookmark) => normalizeManualParentId(bookmark.folderId) === pid)
    .sort((left, right) => compareOrder(left, right, 'title'));
}

function reindex(items) {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

export function isManualFolderDescendant(folders: ManualFolderRow[], ancestorId, maybeChildId) {
  const byId = new Map<string, ManualFolderRow>(folders.map((folder) => [folder.id, folder]));
  const seen = new Set();
  let current: ManualFolderRow | undefined = byId.get(maybeChildId);
  while (current) {
    if (current.id === ancestorId) return true;
    const parentId = normalizeManualParentId(current.parentId);
    if (!parentId || seen.has(parentId)) return false;
    seen.add(parentId);
    current = byId.get(parentId);
  }
  return false;
}

export function moveManualTreeItem({
  folders = [],
  bookmarks = [],
  kind,
  id,
  parentId,
  index = 0,
}: MoveManualTreeItemInput = {}) {
  const destParent = normalizeManualParentId(parentId);
  const destIndex = Math.max(0, Number.isFinite(Number(index)) ? Number(index) : 0);

  if (kind === 'bookmark') {
    const current = bookmarks.find((bookmark) => bookmark.id === id);
    if (!current) return { folders, bookmarks };
    if (destParent && destParent !== BOOKMARK_BAR_FOLDER_ID && !folders.some((folder) => folder.id === destParent)) {
      return { folders, bookmarks };
    }

    const sourceParent = normalizeManualParentId(current.folderId);
    const destSiblings = siblingManualBookmarks(bookmarks, destParent).filter((bookmark) => bookmark.id !== id);
    destSiblings.splice(Math.min(destIndex, destSiblings.length), 0, { ...current, folderId: destParent });

    const orderById = new Map(reindex(destSiblings).map((item) => [item.id, item.sortOrder]));
    if (sourceParent !== destParent) {
      reindex(siblingManualBookmarks(bookmarks, sourceParent).filter((bookmark) => bookmark.id !== id))
        .forEach((item) => orderById.set(item.id, item.sortOrder));
    }

    return {
      folders,
      bookmarks: bookmarks.map((bookmark) => {
        if (!orderById.has(bookmark.id)) return bookmark;
        return {
          ...bookmark,
          folderId: bookmark.id === id ? destParent : bookmark.folderId,
          sortOrder: orderById.get(bookmark.id),
        };
      }),
    };
  }

  if (kind === 'folder') {
    const current = folders.find((folder) => folder.id === id);
    if (!current) return { folders, bookmarks };
    if (destParent === id || destParent === BOOKMARK_BAR_FOLDER_ID || (destParent && isManualFolderDescendant(folders, id, destParent))) {
      return { folders, bookmarks };
    }
    if (destParent && !folders.some((folder) => folder.id === destParent)) return { folders, bookmarks };

    const sourceParent = normalizeManualParentId(current.parentId);
    const destSiblings = siblingManualFolders(folders, destParent).filter((folder) => folder.id !== id);
    destSiblings.splice(Math.min(destIndex, destSiblings.length), 0, { ...current, parentId: destParent });

    const orderById = new Map(reindex(destSiblings).map((item) => [item.id, item.sortOrder]));
    if (sourceParent !== destParent) {
      reindex(siblingManualFolders(folders, sourceParent).filter((folder) => folder.id !== id))
        .forEach((item) => orderById.set(item.id, item.sortOrder));
    }

    return {
      folders: folders.map((folder) => {
        if (!orderById.has(folder.id)) return folder;
        return {
          ...folder,
          parentId: folder.id === id ? destParent : folder.parentId,
          sortOrder: orderById.get(folder.id),
        };
      }),
      bookmarks,
    };
  }

  return { folders, bookmarks };
}
