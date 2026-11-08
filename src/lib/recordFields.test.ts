import { expect, test } from 'vitest';
import type { FieldDefinition } from '../types';
import {
  formatStoredDate,
  getEditablePercentageValue,
  getFieldOptions,
  getFileTypeFromPath,
  getPercentageMeta,
  isBlankDisplayValue,
  isEmptyValue,
  isFieldMultiple,
  isUrlString,
  isCustomThumbnailRecord,
  shouldShowCustomThumbnailBadge,
  isVideoHoverPreviewFile,
  normalizePercentageValue,
  parseHashtags,
  parseNonNegativeNumberInput,
  toDateInputValue,
  toDisplayText,
  toScalarInputValue,
} from './recordFields';
import { isStoredDateValue as isStoredDateValueFromDateParse } from './dateParse';

const textField = { id: 'title', name: '제목', type: 'text' } as FieldDefinition;
const percentField = { id: 'progress', name: '진행', type: 'percentage' } as FieldDefinition;

test('detects persisted custom thumbnail records', () => {
  expect(isCustomThumbnailRecord(undefined)).toBe(false);
  expect(isCustomThumbnailRecord({ data: {} })).toBe(false);
  expect(isCustomThumbnailRecord({ data: { __customThumbnail: false } })).toBe(false);
  expect(isCustomThumbnailRecord({ data: { __customThumbnail: true } })).toBe(true);
});

test('shows the custom thumbnail badge from the record flag, embedded cover, or pending override', () => {
  expect(shouldShowCustomThumbnailBadge({ flagged: false, hasEmbeddedCover: false })).toBe(false);
  expect(shouldShowCustomThumbnailBadge({ flagged: true, hasEmbeddedCover: false })).toBe(true);
  expect(shouldShowCustomThumbnailBadge({ flagged: false, hasEmbeddedCover: true })).toBe(true);
  expect(shouldShowCustomThumbnailBadge({ flagged: false, hasEmbeddedCover: false, override: true })).toBe(true);
  expect(shouldShowCustomThumbnailBadge({ flagged: true, hasEmbeddedCover: false, override: false })).toBe(false);
  expect(shouldShowCustomThumbnailBadge({ flagged: false, hasEmbeddedCover: true, override: false })).toBe(true);
});

test('classifies list file types without treating hover-only videos as filter videos', () => {
  expect(getFileTypeFromPath('cover.PNG')).toBe('image');
  expect(getFileTypeFromPath('clip.mkv')).toBe('video');
  expect(getFileTypeFromPath('pack.zip')).toBe('archive');
  expect(getFileTypeFromPath('clip.webm')).toBe('other');
  expect(isVideoHoverPreviewFile('clip.webm')).toBe(true);
  expect(getFileTypeFromPath('')).toBe('other');
});

test('detects empty values, hashtags, and urls', () => {
  expect(isEmptyValue(null)).toBe(true);
  expect(isEmptyValue('  ')).toBe(true);
  expect(isEmptyValue([])).toBe(true);
  expect(isEmptyValue({ value: 1, max: 2 })).toBe(false);
  expect(isBlankDisplayValue('-')).toBe(true);
  expect(parseHashtags('hello #one more #two')).toEqual({
    hashtags: ['one', 'two'],
    plainText: 'hello  more',
  });
  expect(isUrlString('https://example.com')).toBe(true);
  expect(isUrlString('HTTPS://example.com')).toBe(false);
  expect(isUrlString('HTTPS://example.com', true)).toBe(true);
});

test('normalizes percentage and select field helpers', () => {
  expect(getPercentageMeta(percentField, { value: 3, max: 4 })).toEqual({
    value: 3,
    max: 4,
    percent: 75,
  });
  expect(getPercentageMeta(percentField, { value: 9, max: 4 })).toEqual({
    value: 4,
    max: 4,
    percent: 100,
  });
  expect(getEditablePercentageValue({ value: 8, max: 5 })).toEqual({ value: 5, max: 5 });
  expect(normalizePercentageValue({ value: -1, max: 10 })).toEqual({ value: 0, max: 10 });
  expect(parseNonNegativeNumberInput('')).toBe(0);
  expect(parseNonNegativeNumberInput('-3')).toBe(0);
  expect(getFieldOptions({
    ...textField,
    type: 'select',
    selectOptions: ['A'],
  } as FieldDefinition)).toEqual(['A']);
  expect(isFieldMultiple({ ...textField, multiSelect: true } as FieldDefinition)).toBe(true);
});

test('formats stored dates the same way as the record detail modal', () => {
  expect(formatStoredDate('2024-03')).toBe('2024-03');
  expect(formatStoredDate('2024-03-09')).toBe('2024-03-09');
  expect(formatStoredDate('2024년 3월 9일 15:30')).toBe('2024-03-09');
  expect(isStoredDateValueFromDateParse('2024-03-09')).toBe(true);
  expect(isStoredDateValueFromDateParse('2024-03')).toBe(true);
  expect(isStoredDateValueFromDateParse('2024-3-9')).toBe(false);
});

test('normalizes unknown field values for inputs and display', () => {
  expect(toScalarInputValue('title')).toBe('title');
  expect(toScalarInputValue(12)).toBe(12);
  expect(toScalarInputValue(null)).toBe('');
  expect(toScalarInputValue({ value: 1, max: 2 })).toBe('');
  expect(toDateInputValue('2024-03-09')).toBe('2024-03-09');
  expect(toDateInputValue(new Date('2024-03-09'))).toBe('');
  expect(toDisplayText('option-a')).toBe('option-a');
  expect(toDisplayText(3)).toBe('3');
  expect(toDisplayText(['a', 'b'])).toBe('');
});
