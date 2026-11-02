import { getSqlPlaceholders } from './sql';

export const MAX_RELATED_RECORDS = 100;
export const RELATED_RECORD_SEARCH_LIMIT = 50;

export function escapeLikePattern(value) {
  return String(value).replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function parseJsonObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseCategoryFields(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordLabelFromData(data, fields) {
  const fieldList = Array.isArray(fields) ? fields : [];
  const preferred = fieldList.find((field) => field?.type === 'text' && !field.hidden)
    || fieldList.find((field) => field?.type && field.type !== 'file' && !field.hidden)
    || fieldList[0];
  if (!preferred) return '';

  const value = data?.[preferred.id];
  if (value == null || value === '') return '';
  if (typeof value === 'object') {
    if (preferred.type === 'percentage') {
      return `${value.value ?? 0}/${value.max ?? 0}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function normalizeRelatedRecordIds(raw, sourceRecordId, existingIds) {
  if (!Array.isArray(raw)) {
    return { ok: false, error: '관련 항목 선택값이 올바르지 않습니다.' };
  }

  const ids = [...new Set(
    raw
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )];

  if (ids.length > MAX_RELATED_RECORDS) {
    return { ok: false, error: '관련 항목은 최대 100개까지 지정할 수 있습니다.' };
  }

  for (const id of ids) {
    if (id === sourceRecordId) {
      return { ok: false, error: '항목은 자기 자신과 연결할 수 없습니다.' };
    }
    if (!existingIds.has(id)) {
      return { ok: false, error: '관련 항목 대상을 찾을 수 없습니다.' };
    }
  }

  return { ok: true, ids };
}

export function listProfileRecordIds(database, profileId) {
  return new Set(
    database.prepare('SELECT id FROM records WHERE profileId = ?').all(profileId).map((row) => row.id)
  );
}

export function listRelatedRecordIds(database, recordId) {
  const outgoing = database.prepare(`
    SELECT target_record_id AS id
    FROM record_references
    WHERE source_record_id = ?
    ORDER BY sort_order ASC, created_at ASC
  `).all(recordId).map((row) => row.id);

  const incoming = database.prepare(`
    SELECT source_record_id AS id
    FROM record_references
    WHERE target_record_id = ?
    ORDER BY created_at ASC
  `).all(recordId).map((row) => row.id);

  const ids = [...outgoing];
  incoming.forEach((id) => {
    if (!ids.includes(id)) ids.push(id);
  });
  return ids;
}

function mapRelatedRecordRow(row) {
  const data = parseJsonObject(row.data);
  const fields = parseCategoryFields(row.categoryFields);
  const label = recordLabelFromData(data, fields) || row.id;
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.categoryName || '',
    label,
    thumbnailPath: row.thumbnailPath || null,
    record: {
      id: row.id,
      profileId: row.profileId,
      categoryId: row.categoryId,
      data,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      duration: row.duration ?? undefined,
      thumbnailPath: row.thumbnailPath ?? undefined,
      thumbnailTimestamp: row.thumbnailTimestamp ?? undefined,
    },
  };
}

const RELATED_RECORD_SELECT = `
  SELECT r.id, r.profileId, r.categoryId, r.data, r.createdAt, r.updatedAt,
         r.duration, r.thumbnailPath, r.thumbnailTimestamp,
         c.name AS categoryName, c.fields AS categoryFields
  FROM records r
  JOIN categories c ON c.id = r.categoryId
`;

export function listRelatedRecords(database, recordId, profileId) {
  const ids = listRelatedRecordIds(database, recordId);
  if (ids.length === 0) return [];

  const rows = database.prepare(`
    ${RELATED_RECORD_SELECT}
    WHERE r.profileId = ?
      AND r.id IN (${getSqlPlaceholders(ids.length)})
  `).all(profileId, ...ids);

  const byId = new Map(rows.map((row) => [row.id, mapRelatedRecordRow(row)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function searchRelatedRecordCandidates(database, options) {
  const profileId = options?.profileId;
  const excludeId = String(options?.excludeId || '').trim();
  const query = String(options?.query || '').trim();
  const requestedLimit = Number(options?.limit);
  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? requestedLimit : RELATED_RECORD_SEARCH_LIMIT, 1),
    RELATED_RECORD_SEARCH_LIMIT
  );

  const params = [profileId];
  let sql = `
    ${RELATED_RECORD_SELECT}
    WHERE r.profileId = ?
      AND (c.itemType IS NULL OR c.itemType != 'separator')
      AND (c.parentId IS NULL OR c.parentId = '')
  `;

  if (excludeId) {
    sql += ' AND r.id != ?';
    params.push(excludeId);
  }

  if (query) {
    const like = `%${escapeLikePattern(query)}%`;
    sql += ` AND (c.name LIKE ? ESCAPE '!' COLLATE NOCASE OR r.data LIKE ? ESCAPE '!' COLLATE NOCASE)`;
    params.push(like, like);
  }

  sql += query
    ? ' ORDER BY c.name COLLATE NOCASE ASC, r.updatedAt DESC'
    : ' ORDER BY r.updatedAt DESC';
  sql += ' LIMIT ?';
  params.push(limit);

  return database.prepare(sql).all(...params).map(mapRelatedRecordRow);
}

export function replaceRelatedRecordIds(database, sourceId, ids, existingIds) {
  const source = database.prepare('SELECT 1 AS found FROM records WHERE id = ?').get(sourceId);
  if (!source) {
    throw new Error('항목을 찾을 수 없습니다.');
  }

  const normalized = normalizeRelatedRecordIds(ids, sourceId, existingIds);
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }

  const keep = new Set(normalized.ids);
  const now = new Date().toISOString();

  const apply = database.transaction(() => {
    const existing = database.prepare(`
      SELECT source_record_id, target_record_id
      FROM record_references
      WHERE source_record_id = ? OR target_record_id = ?
    `).all(sourceId, sourceId);

    const deleteStmt = database.prepare(`
      DELETE FROM record_references
      WHERE source_record_id = ? AND target_record_id = ?
    `);

    existing.forEach((row) => {
      const other = row.source_record_id === sourceId ? row.target_record_id : row.source_record_id;
      if (!keep.has(other)) {
        deleteStmt.run(row.source_record_id, row.target_record_id);
      }
    });

    const hasLink = database.prepare(`
      SELECT 1 AS found FROM record_references
      WHERE (source_record_id = ? AND target_record_id = ?)
         OR (source_record_id = ? AND target_record_id = ?)
    `);
    const insertStmt = database.prepare(`
      INSERT INTO record_references (source_record_id, target_record_id, sort_order, created_at)
      VALUES (?, ?, ?, ?)
    `);

    normalized.ids.forEach((targetId, index) => {
      if (!hasLink.get(sourceId, targetId, targetId, sourceId)) {
        insertStmt.run(sourceId, targetId, index, now);
      }
    });
  });

  apply();
  return { ok: true };
}

export function saveRelatedRecordIds(database, sourceId, relatedRecordIds, profileId) {
  if (relatedRecordIds === undefined) return;
  if (!Array.isArray(relatedRecordIds)) {
    throw new Error('관련 항목 선택값이 올바르지 않습니다.');
  }
  replaceRelatedRecordIds(database, sourceId, relatedRecordIds, listProfileRecordIds(database, profileId));
}

export function deleteRelatedRecordLinks(database, recordId) {
  database.prepare(
    'DELETE FROM record_references WHERE source_record_id = ? OR target_record_id = ?'
  ).run(recordId, recordId);
}

export function deleteRelatedRecordLinksForCategories(database, profileId, categoryIds) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) return;
  const placeholders = getSqlPlaceholders(categoryIds.length);
  database.prepare(`
    DELETE FROM record_references
    WHERE source_record_id IN (
      SELECT id FROM records WHERE profileId = ? AND categoryId IN (${placeholders})
    )
       OR target_record_id IN (
      SELECT id FROM records WHERE profileId = ? AND categoryId IN (${placeholders})
    )
  `).run(profileId, ...categoryIds, profileId, ...categoryIds);
}

export function deleteRelatedRecordLinksForProfile(database, profileId) {
  database.prepare(`
    DELETE FROM record_references
    WHERE source_record_id IN (SELECT id FROM records WHERE profileId = ?)
       OR target_record_id IN (SELECT id FROM records WHERE profileId = ?)
  `).run(profileId, profileId);
}
