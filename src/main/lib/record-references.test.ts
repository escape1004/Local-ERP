import { expect, test } from 'vitest';
import { applyDatabaseSchema } from '../database/migrations';
import { withTempSqlite } from '../../test/temp-sqlite';
import {
  MAX_RELATED_RECORDS,
  deleteRelatedRecordLinks,
  deleteRelatedRecordLinksForCategories,
  deleteRelatedRecordLinksForProfile,
  escapeLikePattern,
  getRelatedRecordsState,
  listRelatedRecordIds,
  listRelatedRecords,
  normalizeRelatedRecordIds,
  recordLabelFromData,
  recordLabelsFromData,
  replaceRelatedRecordIds,
  saveRelatedRecordIds,
  searchRelatedRecordCandidates,
  setRecordRelatedLabel,
} from './record-references';

const TITLE_FIELDS = JSON.stringify([
  { id: 'title', name: '제목', type: 'text', required: false, unique: false, order: 0 },
]);

function seedReferenceDb(database) {
  applyDatabaseSchema(database);

  database.prepare(
    'INSERT INTO profiles (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
  ).run('p1', 'Studio', '2024-01-01', '2024-01-01');
  database.prepare(
    'INSERT INTO profiles (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
  ).run('p2', 'Other', '2024-01-01', '2024-01-01');

  const insertCategory = database.prepare(`
    INSERT INTO categories (id, profileId, name, parentId, fields, order_num, createdAt, updatedAt, itemType)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCategory.run('c-movies', 'p1', 'Movies', null, TITLE_FIELDS, 0, '2024-01-01', '2024-01-01', 'category');
  insertCategory.run('c-actors', 'p1', 'Actors', null, TITLE_FIELDS, 1, '2024-01-01', '2024-01-01', 'category');
  insertCategory.run('c-roles', 'p1', 'Roles', 'c-actors', TITLE_FIELDS, 2, '2024-01-01', '2024-01-01', 'category');
  insertCategory.run('c-other', 'p2', 'Other Movies', null, TITLE_FIELDS, 0, '2024-01-01', '2024-01-01', 'category');

  const insertRecord = database.prepare(`
    INSERT INTO records (id, profileId, categoryId, data, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertRecord.run('r-inception', 'p1', 'c-movies', JSON.stringify({ title: 'Inception' }), '2024-01-01', '2024-02-01');
  insertRecord.run('r-leo', 'p1', 'c-actors', JSON.stringify({ title: 'DiCaprio' }), '2024-01-01', '2024-02-02');
  insertRecord.run('r-interstellar', 'p1', 'c-movies', JSON.stringify({ title: 'Interstellar' }), '2024-01-01', '2024-02-03');
  insertRecord.run('r-cobb', 'p1', 'c-roles', JSON.stringify({ title: 'Cobb' }), '2024-01-01', '2024-02-05');
  insertRecord.run('r-other', 'p2', 'c-other', JSON.stringify({ title: 'Inception' }), '2024-01-01', '2024-02-04');
}

test('escapeLikePattern escapes LIKE wildcards', () => {
  expect(escapeLikePattern('100%_ready!now')).toBe('100!%!_ready!!now');
});

test('uses the first two visible fields as related-record title and subtitle', () => {
  const fields = [
    { id: 'poster', type: 'file', hidden: false, order: 0 },
    { id: 'title', type: 'text', hidden: false, order: 1 },
    { id: 'year', type: 'text', hidden: false, order: 2, textSuffix: '년' },
    { id: 'note', type: 'text', hidden: true, order: 3 },
  ];
  expect(recordLabelsFromData({ title: 'Heat', year: '1995', note: 'hidden' }, fields)).toEqual({
    label: 'Heat',
    subtitle: '1995년',
  });
  expect(recordLabelFromData({ title: 'Heat' }, fields)).toBe('Heat');
});

test('normalizeRelatedRecordIds rejects invalid selections', () => {
  const existing = new Set(['r-leo', 'r-interstellar']);

  expect(normalizeRelatedRecordIds('r-leo', 'r-inception', existing)).toEqual({
    ok: false,
    error: '관련 레코드 선택값이 올바르지 않습니다.',
  });
  expect(normalizeRelatedRecordIds(['r-inception'], 'r-inception', existing)).toEqual({
    ok: false,
    error: '레코드는 자기 자신과 연결할 수 없습니다.',
  });
  expect(normalizeRelatedRecordIds(['missing'], 'r-inception', existing)).toEqual({
    ok: false,
    error: '관련 레코드 대상을 찾을 수 없습니다.',
  });
  expect(normalizeRelatedRecordIds(Array.from({ length: MAX_RELATED_RECORDS + 1 }, (_, index) => `r-${index}`), 'source', new Set(
    Array.from({ length: MAX_RELATED_RECORDS + 1 }, (_, index) => `r-${index}`)
  ))).toEqual({
    ok: false,
    error: '관련 레코드는 최대 100개까지 지정할 수 있습니다.',
  });
  expect(normalizeRelatedRecordIds(['r-leo', 'r-leo', ' r-interstellar '], 'r-inception', existing)).toEqual({
    ok: true,
    ids: ['r-leo', 'r-interstellar'],
  });
});

test('replaceRelatedRecordIds stores undirected links and uses each record related_label', () => {
  withTempSqlite((temp) => {
    seedReferenceDb(temp.database);
    const existing = new Set(['r-inception', 'r-leo', 'r-interstellar', 'r-other']);

    setRecordRelatedLabel(temp.database, 'r-leo', '주연');
    setRecordRelatedLabel(temp.database, 'r-inception', '작품');
    replaceRelatedRecordIds(temp.database, 'r-inception', ['r-leo', 'r-interstellar'], existing);

    expect(listRelatedRecordIds(temp.database, 'r-inception')).toEqual(['r-leo', 'r-interstellar']);
    expect(listRelatedRecordIds(temp.database, 'r-leo')).toEqual(['r-inception']);
    expect(listRelatedRecords(temp.database, 'r-inception', 'p1').map((row) => ({
      id: row.id,
      relationLabel: row.relationLabel,
    }))).toEqual([
      { id: 'r-leo', relationLabel: '주연' },
      { id: 'r-interstellar', relationLabel: '' },
    ]);
    expect(listRelatedRecords(temp.database, 'r-leo', 'p1').map((row) => ({
      id: row.id,
      categoryName: row.categoryName,
      label: row.label,
      relationLabel: row.relationLabel,
    }))).toEqual([
      { id: 'r-inception', categoryName: 'Movies', label: 'Inception', relationLabel: '작품' },
    ]);

    expect(getRelatedRecordsState(temp.database, 'r-leo', 'p1')).toEqual({
      label: '주연',
      records: expect.arrayContaining([
        expect.objectContaining({ id: 'r-inception', relationLabel: '작품' }),
      ]),
    });

    saveRelatedRecordIds(temp.database, 'r-leo', { ids: ['r-inception'], label: '배우' }, 'p1');
    expect(getRelatedRecordsState(temp.database, 'r-leo', 'p1').label).toBe('배우');
    expect(listRelatedRecords(temp.database, 'r-inception', 'p1').find((row) => row.id === 'r-leo')?.relationLabel).toBe('배우');

    replaceRelatedRecordIds(temp.database, 'r-leo', [], existing);
    expect(listRelatedRecordIds(temp.database, 'r-inception')).toEqual(['r-interstellar']);
    expect(listRelatedRecordIds(temp.database, 'r-leo')).toEqual([]);
  });
});

test('searchRelatedRecordCandidates stays in profile and can exclude self', () => {
  withTempSqlite((temp) => {
    seedReferenceDb(temp.database);

    const actorHits = searchRelatedRecordCandidates(temp.database, {
      profileId: 'p1',
      query: 'Actors',
      excludeId: 'r-inception',
    });
    expect(actorHits.map((row) => row.id)).toEqual(['r-leo']);

    const inceptionHits = searchRelatedRecordCandidates(temp.database, {
      profileId: 'p1',
      query: 'Inception',
      excludeId: 'r-inception',
    });
    expect(inceptionHits.map((row) => row.id)).toEqual([]);

    const otherProfileHits = searchRelatedRecordCandidates(temp.database, {
      profileId: 'p2',
      query: 'Inception',
    });
    expect(otherProfileHits.map((row) => row.id)).toEqual(['r-other']);

    const childHits = searchRelatedRecordCandidates(temp.database, {
      profileId: 'p1',
      query: 'Cobb',
    });
    expect(childHits.map((row) => row.id)).toEqual([]);
  });
});

test('deleteRelatedRecordLinks removes both directions', () => {
  withTempSqlite((temp) => {
    seedReferenceDb(temp.database);
    const existing = new Set(['r-inception', 'r-leo', 'r-interstellar']);
    replaceRelatedRecordIds(temp.database, 'r-inception', ['r-leo'], existing);

    deleteRelatedRecordLinks(temp.database, 'r-inception');
    expect(listRelatedRecordIds(temp.database, 'r-leo')).toEqual([]);
  });
});

test('category and profile cleanup remove dangling references', () => {
  withTempSqlite((temp) => {
    seedReferenceDb(temp.database);
    const existing = new Set(['r-inception', 'r-leo', 'r-interstellar']);
    replaceRelatedRecordIds(temp.database, 'r-inception', ['r-leo'], existing);

    deleteRelatedRecordLinksForCategories(temp.database, 'p1', ['c-actors']);
    expect(listRelatedRecordIds(temp.database, 'r-inception')).toEqual([]);

    replaceRelatedRecordIds(temp.database, 'r-inception', ['r-interstellar'], existing);
    deleteRelatedRecordLinksForProfile(temp.database, 'p1');
    expect(temp.database.prepare('SELECT COUNT(*) AS count FROM record_references').get().count).toBe(0);
  });
});
