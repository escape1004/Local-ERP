import { expect, test } from 'vitest';
import {
  isCommandSearchInput,
  resolveSelectPaste,
  shouldAutoSelectPastedComboboxValue,
} from './comboboxPaste';

test('treats cmdk search inputs as focused search, not a paste-to-select target', () => {
  expect(isCommandSearchInput(null)).toBe(false);
  expect(isCommandSearchInput({
    closest: (selector: string) => (selector === '[cmdk-input-wrapper]' ? {} : null),
  })).toBe(true);
  expect(isCommandSearchInput({
    closest: () => null,
    hasAttribute: (name: string) => name === 'cmdk-input',
  })).toBe(true);
  expect(isCommandSearchInput({
    closest: () => null,
    hasAttribute: () => false,
  })).toBe(false);
});

test('auto-selects a paste only when the combobox search is not focused', () => {
  expect(shouldAutoSelectPastedComboboxValue(true)).toBe(false);
  expect(shouldAutoSelectPastedComboboxValue(false)).toBe(true);
});

test('matches pasted select options without replacing existing multiple values', () => {
  expect(resolveSelectPaste(['Apple', 'Banana'], 'banana', false, '')).toEqual({
    matched: ['Banana'],
    invalid: [],
    nextValue: 'Banana',
  });
  expect(resolveSelectPaste(['Apple', 'Banana'], 'Cherry', false, '')).toEqual({
    matched: [],
    invalid: ['Cherry'],
    nextValue: null,
  });
  expect(resolveSelectPaste(['Apple', 'Banana'], 'Banana, Cherry', true, ['Apple'])).toEqual({
    matched: ['Banana'],
    invalid: ['Cherry'],
    nextValue: ['Apple', 'Banana'],
  });
});
