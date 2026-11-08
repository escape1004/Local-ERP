import { expect, test } from 'vitest';
import {
  getApplyPageTranslationsScript,
  packPageTranslateChunks,
  parseTranslatedStringList,
} from './browserPageTranslate';

test('packs page texts into json-sized chunks', () => {
  const chunks = packPageTranslateChunks(['alpha', 'beta', 'gamma'], 20);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.flat()).toEqual(['alpha', 'beta', 'gamma']);
});

test('parses a translated json array and markdown fences', () => {
  expect(parseTranslatedStringList('["안녕","세계"]', 2)).toEqual(['안녕', '세계']);
  expect(parseTranslatedStringList('```json\n["하나"]\n```', 1)).toEqual(['하나']);
  expect(parseTranslatedStringList('not json', 2)).toBeNull();
  expect(parseTranslatedStringList('just one', 1)).toEqual(['just one']);
});

test('embeds translations as a javascript array literal', () => {
  const script = getApplyPageTranslationsScript(['안녕', '세계']);
  expect(script).toContain('["안녕","세계"]');
  expect(script).toContain('window.__erpTranslateNodes');
});
