import { expect, test } from 'vitest';
import { commaAwareCommandFilter, splitCommaSearchTerms } from './commaSearchFilter';

test('splits comma-separated search terms and ignores empty pieces', () => {
  expect(splitCommaSearchTerms('apple, banana, cherry')).toEqual(['apple', 'banana', 'cherry']);
  expect(splitCommaSearchTerms('  apple, , banana ,')).toEqual(['apple', 'banana']);
  expect(splitCommaSearchTerms('apple')).toEqual(['apple']);
  expect(splitCommaSearchTerms('')).toEqual([]);
});

test('matches an item when any comma-separated term matches', () => {
  expect(commaAwareCommandFilter('사과', '사과, 바나나')).toBeGreaterThan(0);
  expect(commaAwareCommandFilter('바나나', '사과, 바나나')).toBeGreaterThan(0);
  expect(commaAwareCommandFilter('포도', '사과, 바나나')).toBe(0);
});

test('keeps single-term search working', () => {
  expect(commaAwareCommandFilter('바나나우유', '바나나')).toBeGreaterThan(0);
  expect(commaAwareCommandFilter('사과', '바나나')).toBe(0);
});
