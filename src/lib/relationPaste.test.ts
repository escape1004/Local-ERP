import { expect, test } from 'vitest';
import {
  classifyRelationPasteValues,
  getDefaultRelationCreateFieldId,
  partitionRelationCreateValues,
  splitRelationPasteValues,
} from './relationPaste';

const nameField = {
  id: 'name',
  name: '이름',
  type: 'text' as const,
  required: false,
  unique: true,
  order: 0,
};

const memoField = {
  id: 'memo',
  name: '메모',
  type: 'longtext' as const,
  required: false,
  unique: false,
  order: 1,
};

const category = {
  id: 'actors',
  name: '배우',
  fields: [nameField, memoField],
};

test('splits comma-separated relation paste values only for multiple fields', () => {
  expect(splitRelationPasteValues('A, B, C', true)).toEqual(['A', 'B', 'C']);
  expect(splitRelationPasteValues('A, B', false)).toEqual(['A, B']);
});

test('classifies exact matches, ambiguous names, and missing values', () => {
  const records = [
    { id: '1', data: { name: 'Alice' } },
    { id: '2', data: { name: 'Bob' } },
    { id: '3', data: { name: 'Bob' } },
  ];
  const classified = classifyRelationPasteValues(
    ['Alice', 'Bob', 'Carol', 'Carol'],
    (value) => records.filter((record) => record.data.name === value) as any,
  );
  expect(classified.valid.map((record) => record.id)).toEqual(['1']);
  expect(classified.ambiguous.map((item) => item.value)).toEqual(['Bob']);
  expect(classified.missing).toEqual(['Carol']);
});

test('prefers the relation display field when it can be used to create records', () => {
  expect(getDefaultRelationCreateFieldId(category as any, 'memo')).toBe('memo');
  expect(getDefaultRelationCreateFieldId(category as any, 'missing')).toBe('name');
});

test('skips unique-field duplicates and keeps creatable missing values', () => {
  expect(partitionRelationCreateValues({
    values: ['Alice', 'Carol', 'Carol'],
    field: nameField as any,
    existingRecords: [{ data: { name: 'Alice' } }],
  })).toEqual({
    creatable: ['Carol'],
    skippedDuplicates: ['Alice'],
  });
  expect(partitionRelationCreateValues({
    values: ['Alice', 'Alice'],
    field: memoField as any,
    existingRecords: [{ data: { memo: 'Alice' } }],
  })).toEqual({
    creatable: ['Alice'],
    skippedDuplicates: [],
  });
});
