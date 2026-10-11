import { expect, test } from 'vitest';
import type { Category, DataRecord, FieldDefinition } from '../types';
import { filterRecords, getNextSortState, matchesSearchValue, sortRecords } from './recordQuery';
import { getTranslatedFieldId } from './translation';

const titleField = { id: 'title', name: '제목', type: 'text' } as FieldDefinition;
const scoreField = { id: 'score', name: '점수', type: 'number' } as FieldDefinition;
const actorField = {
  id: 'actor',
  name: '배우',
  type: 'relation',
  relationCategoryId: 'actors',
  displayFieldId: 'name',
} as FieldDefinition;

const actorCategory = {
  id: 'actors',
  name: '배우',
  fields: [{ id: 'name', name: '이름', type: 'text' }],
} as Category;

const records: DataRecord[] = [
  { id: 'r1', categoryId: 'movies', data: { title: 'Alpha', score: 2, actor: 'a1' } } as DataRecord,
  { id: 'r2', categoryId: 'movies', data: { title: 'Beta', score: 10, actor: 'a2' } } as DataRecord,
];

const searchBase = {
  searchTerm: '',
  normalizedSearchTerm: '',
  normalizedMultiSearchTerms: [] as string[],
  effectiveSearchField: 'all',
  isMultiValueSearchField: false,
  hasActiveSearch: false,
  fileTypeFilter: 'all' as const,
};

test('matches numeric and translated text search without changing relation lookup rules', () => {
  expect(matchesSearchValue({
    ...searchBase,
    field: scoreField,
    value: 10,
    searchTerm: '10',
    normalizedSearchTerm: '10',
  })).toBe(true);
  expect(matchesSearchValue({
    ...searchBase,
    field: scoreField,
    value: 10,
    searchTerm: '1',
    normalizedSearchTerm: '1',
  })).toBe(false);
});

test('searches source and translated text fields independently', () => {
  const translatedTitleField = {
    ...titleField,
    enableTranslation: true,
  } as FieldDefinition;
  const recordData = {
    title: 'Original title',
    [getTranslatedFieldId('title')]: '번역 제목',
  };

  expect(matchesSearchValue({
    ...searchBase,
    field: translatedTitleField,
    value: recordData.title,
    recordData,
    effectiveSearchField: 'title',
    searchTerm: '번역',
    normalizedSearchTerm: '번역',
  })).toBe(false);
  expect(matchesSearchValue({
    ...searchBase,
    field: translatedTitleField,
    value: recordData.title,
    recordData,
    effectiveSearchField: getTranslatedFieldId('title'),
    searchTerm: '번역',
    normalizedSearchTerm: '번역',
  })).toBe(true);
  expect(matchesSearchValue({
    ...searchBase,
    field: translatedTitleField,
    value: recordData.title,
    recordData,
    effectiveSearchField: 'all',
    searchTerm: '번역',
    normalizedSearchTerm: '번역',
  })).toBe(true);
});

test('filters and sorts records in a single pass each', () => {
  const fieldMap = new Map<string, FieldDefinition>([
    [titleField.id, titleField],
    [scoreField.id, scoreField],
    [actorField.id, actorField],
  ]);
  const categoryById = new Map<string, Category>([[actorCategory.id, actorCategory]]);
  const recordsByIdByCategory = new Map([[
    'actors',
    new Map([
      ['a1', { id: 'a1', categoryId: 'actors', data: { name: 'Ada' } } as DataRecord],
      ['a2', { id: 'a2', categoryId: 'actors', data: { name: 'Ben' } } as DataRecord],
    ]),
  ]]);

  const filtered = filterRecords({
    records,
    search: {
      ...searchBase,
      searchTerm: 'Ada',
      normalizedSearchTerm: 'ada',
      hasActiveSearch: true,
    },
    visibleFields: [titleField, actorField],
    fieldMap,
    categoryById,
    recordsByIdByCategory,
    getRecordFieldValue: (record, fieldId) => record.data[fieldId],
  });
  expect(filtered.map((record) => record.id)).toEqual(['r1']);

  const sorted = sortRecords({
    records,
    sort: { sortField: 'score', sortDirection: 'desc' },
    fieldMap,
    categoryById,
    recordsByIdByCategory,
    getRecordFieldValue: (record, fieldId) => record.data[fieldId],
    getRecordReferenceCount: () => 0,
    categoryId: 'movies',
  });
  expect(sorted.map((record) => record.id)).toEqual(['r2', 'r1']);
});

test('cycles sort state on the third click', () => {
  expect(getNextSortState({ sortField: '', sortDirection: 'asc' }, 'title')).toEqual({
    sortField: 'title',
    sortDirection: 'asc',
  });
  expect(getNextSortState({ sortField: 'title', sortDirection: 'asc' }, 'title')).toEqual({
    sortField: 'title',
    sortDirection: 'desc',
  });
  expect(getNextSortState({ sortField: 'title', sortDirection: 'desc' }, 'title')).toEqual({
    sortField: '',
    sortDirection: 'asc',
  });
});
