import { expect, test } from 'vitest';
import { extractDateLikeText, parseFlexibleDateValue, isStoredDateValue, stripTimeFromDateText } from './dateParse';

test('empty or whitespace input becomes an empty string', () => {
  expect(parseFlexibleDateValue('')).toBe('');
  expect(parseFlexibleDateValue('   ')).toBe('');
});

test('parses common calendar date formats', () => {
  expect(parseFlexibleDateValue('2024-03-09')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('2024.03.09')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('2024/03/09')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('03/09/2024')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('24-03-09')).toBe('2024-03-09');
});

test('parses year-month values without inventing a day', () => {
  expect(parseFlexibleDateValue('2024-03')).toBe('2024-03');
  expect(parseFlexibleDateValue('2024.3')).toBe('2024-03');
  expect(parseFlexibleDateValue('2024년 3월')).toBe('2024-03');
});

test('parses Korean and compact numeric dates', () => {
  expect(parseFlexibleDateValue('2024년 3월 9일')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('24년 3월 9일')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('20240309')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('240309')).toBe('2024-03-09');
});

test('rejects invalid dates instead of coercing them', () => {
  expect(parseFlexibleDateValue('not-a-date')).toBeNull();
  expect(parseFlexibleDateValue('2024-13')).toBeNull();
  expect(parseFlexibleDateValue('1899-01')).toBeNull();
  expect(parseFlexibleDateValue('abcdefgh')).toBeNull();
});

test('uses custom date-fns formats when provided', () => {
  expect(parseFlexibleDateValue('09-03-2024', ['dd-MM-yyyy'])).toBe('2024-03-09');
  expect(parseFlexibleDateValue('2024-03-09', ['dd/MM/yyyy'])).toBeNull();
});

test('drops clock time and keeps only the date', () => {
  expect(stripTimeFromDateText('2024-03-09 15:30:00')).toBe('2024-03-09');
  expect(stripTimeFromDateText('2024-03-09T15:30:00Z')).toBe('2024-03-09');
  expect(stripTimeFromDateText('2024년 3월 9일 오후 3시 30분')).toBe('2024년 3월 9일');
  expect(parseFlexibleDateValue('2024-03-09 15:30:00')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('2024.03.09 오후 3:30')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('2024년 3월 9일 15:30')).toBe('2024-03-09');
  expect(parseFlexibleDateValue('03/09/2024 3:45 PM')).toBe('2024-03-09');
  expect(extractDateLikeText('Posted: 2024-03-09 15:30:00')).toBe('2024-03-09');
});

test('accepts stored yyyy-MM-dd and yyyy-MM values', () => {
  expect(isStoredDateValue('2024-03-09')).toBe(true);
  expect(isStoredDateValue('2024-03')).toBe(true);
  expect(isStoredDateValue('2024-3-9')).toBe(false);
});
