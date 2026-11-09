import { expect, test } from 'vitest';
import {
  getTranslatedFieldId,
  getTranslatedFieldValue,
  getTranslationMeta,
  getTranslationMetaFieldId,
  isTranslationEnabledField,
  isTranslationSupportedField,
  normalizeTranslationDisplayMode,
} from './translation';

test('builds translation metadata field ids', () => {
  expect(getTranslatedFieldId('title')).toBe('title__translated');
  expect(getTranslationMetaFieldId('title')).toBe('title__translationMeta');
});

test('only text-like fields can enable translation', () => {
  expect(isTranslationSupportedField({ type: 'text' })).toBe(true);
  expect(isTranslationSupportedField({ type: 'longtext' })).toBe(true);
  expect(isTranslationSupportedField({ type: 'number' })).toBe(false);
  expect(isTranslationEnabledField({ type: 'text' })).toBe(false);
  expect(isTranslationEnabledField({ type: 'text', enableTranslation: true })).toBe(true);
  expect(isTranslationEnabledField({ type: 'number', enableTranslation: true })).toBe(false);
});

test('reads translated values and ignores non-string data', () => {
  expect(getTranslatedFieldValue(null, 'title')).toBe('');
  expect(getTranslatedFieldValue(undefined, 'title')).toBe('');
  expect(getTranslatedFieldValue({ title__translated: 12 }, 'title')).toBe('');
  expect(getTranslatedFieldValue({ title__translated: '안녕' }, 'title')).toBe('안녕');
});

test('normalizes translation display modes', () => {
  expect(normalizeTranslationDisplayMode('tooltip')).toBe('tooltip');
  expect(normalizeTranslationDisplayMode('inline-hover')).toBe('inline-hover');
  expect(normalizeTranslationDisplayMode('click-toggle')).toBe('click-toggle');
  expect(normalizeTranslationDisplayMode('other')).toBe('tooltip');
});

test('returns null for missing or corrupt translation metadata', () => {
  expect(getTranslationMeta(null, 'title')).toBeNull();
  expect(getTranslationMeta({ title__translationMeta: 'oops' }, 'title')).toBeNull();
  expect(getTranslationMeta({ title__translationMeta: 1 }, 'title')).toBeNull();

  const meta = {
    provider: 'openai' as const,
    model: 'gpt-4.1-mini',
    autoTranslated: true,
    targetLanguage: 'ko',
    translatedAt: '2024-03-09T00:00:00.000Z',
  };
  expect(getTranslationMeta({ title__translationMeta: meta }, 'title')).toEqual(meta);
});
