import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DEFAULT_TRANSLATION_MODEL,
  getStoredDateOutputFormat,
  normalizeBackupInterval,
  normalizeDateParseFormats,
  normalizeDefaultGalleryZoom,
  normalizeIdleLockMinutes,
  normalizePasswordLockDurationMinutes,
  normalizePasswordLockMaxAttempts,
  normalizeThumbnailPreviewScale,
  normalizeBrowserStartupMode,
  normalizeTranslationDisplayMode,
  normalizeTranslationModel,
  normalizeTranslationTargetLanguage,
  normalizeZoomPercent
} from './config-normalize.ts';

test('normalizeZoomPercent clamps to 50-200', () => {
  assert.equal(normalizeZoomPercent('80.4'), 80);
  assert.equal(normalizeZoomPercent(10), 50);
  assert.equal(normalizeZoomPercent(500), 200);
  assert.equal(normalizeZoomPercent('nope'), null);
});

test('normalizeThumbnailPreviewScale clamps to 75-200', () => {
  assert.equal(normalizeThumbnailPreviewScale(50), 75);
  assert.equal(normalizeThumbnailPreviewScale(150), 150);
  assert.equal(normalizeThumbnailPreviewScale(Number.NaN), null);
});

test('normalizeDefaultGalleryZoom snaps to tens', () => {
  assert.equal(normalizeDefaultGalleryZoom(96), 100);
  assert.equal(normalizeDefaultGalleryZoom(12), 50);
});

test('normalizeTranslation helpers keep supported values', () => {
  assert.equal(normalizeTranslationTargetLanguage('ja'), 'ja');
  assert.equal(normalizeTranslationTargetLanguage('fr'), 'ko');
  assert.equal(normalizeTranslationModel('gpt-6-luna'), 'gpt-6-luna');
  assert.equal(normalizeTranslationModel('gpt-5.6-luna'), 'gpt-5.6-luna');
  assert.equal(normalizeTranslationModel('gpt-5-mini'), DEFAULT_TRANSLATION_MODEL);
  assert.equal(normalizeTranslationModel('unknown'), DEFAULT_TRANSLATION_MODEL);
  assert.equal(normalizeTranslationDisplayMode('inline-hover'), 'inline-hover');
  assert.equal(normalizeTranslationDisplayMode('tooltip'), 'tooltip');
  assert.equal(normalizeTranslationDisplayMode('unknown'), 'tooltip');
});

test('lock and backup helpers reject invalid numbers', () => {
  assert.equal(normalizeBackupInterval(0), 1);
  assert.equal(normalizeBackupInterval(20000), 10080);
  assert.equal(normalizePasswordLockMaxAttempts(0), 1);
  assert.equal(normalizePasswordLockDurationMinutes(3.9), 3);
  assert.equal(normalizeIdleLockMinutes(-8), 0);
  assert.equal(normalizeIdleLockMinutes(12.8), 12);
});

test('normalizeBrowserStartupMode keeps continue and defaults to a new tab', () => {
  assert.equal(normalizeBrowserStartupMode('continue'), 'continue');
  assert.equal(normalizeBrowserStartupMode('newtab'), 'newtab');
  assert.equal(normalizeBrowserStartupMode('unknown'), 'newtab');
  assert.equal(normalizeBrowserStartupMode(undefined), 'newtab');
});

test('normalizeDateParseFormats de-duplicates and caps length', () => {
  assert.equal(normalizeDateParseFormats('yyyy-MM-dd'), null);
  assert.deepEqual(
    normalizeDateParseFormats(['yyyy-MM-dd', ' yyyy-MM-dd ', '', 'MM/dd/yyyy']),
    ['yyyy-MM-dd', 'MM/dd/yyyy']
  );
  assert.equal(getStoredDateOutputFormat('yyyy.MM'), 'yyyy-MM');
  assert.equal(getStoredDateOutputFormat('yyyy-MM-dd'), 'yyyy-MM-dd');
});
