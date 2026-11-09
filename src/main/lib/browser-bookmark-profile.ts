export function getOldestProfileId(database) {
  return database.prepare(
    'SELECT id FROM profiles ORDER BY createdAt ASC, name COLLATE NOCASE LIMIT 1'
  ).get()?.id || '';
}

export function getPrimaryProfileId(database) {
  const row = database.prepare(`
    SELECT p.id AS id
    FROM profiles p
    LEFT JOIN records r ON r.profileId = p.id
    GROUP BY p.id
    ORDER BY COUNT(r.id) DESC, p.updatedAt DESC, p.createdAt DESC, p.name COLLATE NOCASE
    LIMIT 1
  `).get();
  return row?.id || '';
}

export function rehomeBrowserBookmarksToPrimaryProfile(database) {
  const fromId = getOldestProfileId(database);
  const toId = getPrimaryProfileId(database);
  if (!fromId || !toId || fromId === toId) {
    return { moved: false, fromId, toId };
  }

  const fromRecords = Number(database.prepare(
    'SELECT COUNT(*) AS count FROM records WHERE profileId = ?'
  ).get(fromId)?.count || 0);
  const toRecords = Number(database.prepare(
    'SELECT COUNT(*) AS count FROM records WHERE profileId = ?'
  ).get(toId)?.count || 0);
  if (toRecords <= fromRecords) {
    return { moved: false, fromId, toId };
  }

  const sourceBookmarkCount = Number(database.prepare(
    'SELECT COUNT(*) AS count FROM browser_bookmarks WHERE profileId = ?'
  ).get(fromId)?.count || 0);
  const sourceFolderCount = Number(database.prepare(
    'SELECT COUNT(*) AS count FROM browser_bookmark_folders WHERE profileId = ?'
  ).get(fromId)?.count || 0);
  if (sourceBookmarkCount === 0 && sourceFolderCount === 0) {
    return { moved: false, fromId, toId };
  }

  database.prepare('UPDATE browser_bookmark_folders SET profileId = ? WHERE profileId = ?').run(toId, fromId);

  const destUrls = new Set(
    database.prepare('SELECT url FROM browser_bookmarks WHERE profileId = ?').all(toId).map((row) => row.url)
  );
  const sourceBookmarks = database.prepare(
    'SELECT id, url FROM browser_bookmarks WHERE profileId = ?'
  ).all(fromId);
  const update = database.prepare('UPDATE browser_bookmarks SET profileId = ? WHERE id = ?');
  const remove = database.prepare('DELETE FROM browser_bookmarks WHERE id = ?');

  sourceBookmarks.forEach((bookmark) => {
    if (destUrls.has(bookmark.url)) {
      remove.run(bookmark.id);
      return;
    }
    update.run(toId, bookmark.id);
    destUrls.add(bookmark.url);
  });

  return { moved: true, fromId, toId };
}
