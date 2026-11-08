import { expect, test } from 'vitest';
import type { Category, FieldDefinition } from '../types';
import {
  flattenSaveRecordCategories,
  isImageLikeField,
  isTitleLikeField,
  isUrlLikeField,
  nextEmptyPickableFieldId,
  parsePickedPageElement,
  normalizeSaveRecordDateFields,
  prefillSaveRecordValues,
  saveRecordValueFromPicked,
  storedTextForField,
  validateSaveRecordValues,
} from './browserSaveRecord';

const text = (id: string, name: string, extra: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id,
  name,
  type: 'text',
  required: false,
  unique: false,
  order: 0,
  ...extra,
});

test('detects url, title, and image fields', () => {
  expect(isUrlLikeField(text('u', '주소'))).toBe(true);
  expect(isUrlLikeField(text('yt', '영상', { textPrefix: 'https://www.youtube.com/watch?v=' }))).toBe(true);
  expect(isTitleLikeField(text('t', '제목'))).toBe(true);
  expect(isImageLikeField(text('cover', '대표 이미지'))).toBe(true);
  expect(isImageLikeField({ ...text('file', '파일'), type: 'file' })).toBe(true);
});

test('strips field prefix and suffix before storing', () => {
  expect(storedTextForField(
    { textPrefix: 'https://www.youtube.com/watch?v=' },
    'https://www.youtube.com/watch?v=abc123',
  )).toBe('abc123');
});

test('prefills page url but leaves the title empty', () => {
  const fields = [
    text('url', 'URL'),
    text('title', '제목'),
    text('memo', '메모', { type: 'longtext' }),
  ];
  expect(prefillSaveRecordValues(fields, {
    url: 'https://example.com/post',
    title: '예제 글',
  })).toEqual({
    url: 'https://example.com/post',
    title: '',
    memo: '',
  });
});

test('maps a picked element onto the matching field type', () => {
  const picked = parsePickedPageElement({
    tag: 'a',
    text: '표지 보기',
    href: 'https://cdn.example.com/cover.jpg',
    src: '',
    alt: 'cover',
  });
  expect(picked).toBeTruthy();
  expect(saveRecordValueFromPicked(text('title', '제목'), picked!)).toBe('표지 보기');
  expect(saveRecordValueFromPicked(text('url', '링크'), picked!)).toBe('https://cdn.example.com/cover.jpg');
  expect(saveRecordValueFromPicked({ ...text('file', '파일'), type: 'file' }, {
    tag: 'IMG',
    text: '',
    src: 'https://cdn.example.com/a.png',
  })).toBe('https://cdn.example.com/a.png');
  expect(saveRecordValueFromPicked({ ...text('n', '수량'), type: 'number' }, {
    tag: 'SPAN',
    text: '총 1,250개',
  })).toBe('1250');
  expect(saveRecordValueFromPicked({ ...text('d', '날짜'), type: 'date' }, {
    tag: 'TIME',
    text: '2024년 3월 9일 오후 3시 30분',
  })).toBe('2024-03-09');
});

test('normalizes typed date fields and rejects unreadable dates', () => {
  const fields = [{ ...text('d', '날짜'), type: 'date' as const }];
  expect(normalizeSaveRecordDateFields(fields, { d: '2024.03.09 15:30' }).values.d).toBe('2024-03-09');
  expect(normalizeSaveRecordDateFields(fields, { d: '날짜 없음' }).errors.d).toMatch(/날짜/);
});

test('advances to the next empty pickable field', () => {
  const fields = [
    text('url', 'URL'),
    text('title', '제목'),
    { ...text('file', '파일'), type: 'file' as const },
  ];
  expect(nextEmptyPickableFieldId(fields, { url: 'https://a.com', title: '글', file: '' }, 'title')).toBe('file');
  expect(nextEmptyPickableFieldId(fields, { url: 'https://a.com', title: '글', file: 'C:\\a.jpg' }, 'file')).toBeNull();
});

test('flattens categories with parent paths and skips separators', () => {
  const categories = [
    { id: 'root', name: '영상', order: 0, fields: [], createdAt: '', updatedAt: '' },
    { id: 'child', name: '유튜브', parentId: 'root', order: 0, fields: [], createdAt: '', updatedAt: '' },
    { id: 'sep', name: '---', itemType: 'separator', order: 1, fields: [], createdAt: '', updatedAt: '' },
  ] as Category[];
  expect(flattenSaveRecordCategories(categories).map((item) => item.label)).toEqual([
    '영상',
    '영상 / 유튜브',
  ]);
});

test('validates required fields', () => {
  const fields = [text('title', '제목', { required: true })];
  expect(validateSaveRecordValues(fields, { title: '' }).title).toMatch(/필수/);
  expect(validateSaveRecordValues(fields, { title: '있음' })).toEqual({});
});
