export const DEFAULT_TRANSLATION_MODEL = 'gpt-6-luna';
export const SUPPORTED_TRANSLATION_MODELS = new Set([
  DEFAULT_TRANSLATION_MODEL,
  'gpt-5.6-luna',
]);

export const DEFAULT_PROFILE_COLOR = '#5865F2';
export const DEFAULT_DATE_PARSE_FORMATS = [
  'yyyy-MM-dd',
  'yyyy.MM.dd',
  'yyyy. MM. dd',
  'yyyy/MM/dd',
  'MM/dd/yyyy',
  'MM-dd-yyyy',
  'MM/dd/yy',
  'MM-dd-yy',
  'yy-MM-dd',
  'yy.MM.dd',
  'yy/MM/dd',
  'yyyy-MM',
  'yyyy.MM',
  'yyyy/MM',
  'yyyyMMdd',
  'yyMMdd'
];

export function normalizeZoomPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(50, Math.round(numericValue)));
}

export function normalizeThumbnailPreviewScale(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(75, Math.round(numericValue)));
}

export function normalizeDefaultGalleryZoom(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return Math.min(200, Math.max(50, Math.round(numericValue / 10) * 10));
}

export function normalizeTranslationTargetLanguage(value) {
  const normalizedValue = String(value || '').trim();
  const supportedLanguages = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW'];
  return supportedLanguages.includes(normalizedValue) ? normalizedValue : 'ko';
}

export function normalizeTranslationModel(value) {
  const normalizedValue = String(value || '').trim();
  return SUPPORTED_TRANSLATION_MODELS.has(normalizedValue)
    ? normalizedValue
    : DEFAULT_TRANSLATION_MODEL;
}

export function normalizeTranslationDisplayMode(value) {
  return value === 'inline-hover' ? 'inline-hover' : 'tooltip';
}

export const BROWSER_STARTUP_NEW_TAB = 'newtab';
export const BROWSER_STARTUP_CONTINUE = 'continue';

export function normalizeBrowserStartupMode(value) {
  return value === BROWSER_STARTUP_CONTINUE ? BROWSER_STARTUP_CONTINUE : BROWSER_STARTUP_NEW_TAB;
}

export function normalizeBackupInterval(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(10080, Math.max(1, Math.floor(numericValue)));
}

export function normalizePasswordLockMaxAttempts(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(20, Math.max(1, Math.floor(numericValue)));
}

export function normalizePasswordLockDurationMinutes(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(1440, Math.max(1, Math.floor(numericValue)));
}

export function normalizeIdleLockMinutes(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const rounded = Math.floor(numericValue);
  if (rounded <= 0) return 0;
  return Math.min(1440, rounded);
}

export function normalizeDateParseFormats(value) {
  if (!Array.isArray(value)) {
    return null;
  }

  const seen = new Set();
  return value
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || item.length > 80 || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 50);
}

export function normalizeDateParseFormat(dateFormat) {
  return String(dateFormat || '')
    .trim()
    .replace(/Y/g, 'y')
    .replace(/D/g, 'd');
}

export function getDateParseFormats(customFormats = []) {
  const seen = new Set();
  const configuredFormats = [
    ...DEFAULT_DATE_PARSE_FORMATS,
    ...customFormats
  ];
  return configuredFormats
    .map(normalizeDateParseFormat)
    .filter((dateFormat) => {
      if (!dateFormat || seen.has(dateFormat)) return false;
      seen.add(dateFormat);
      return true;
    });
}

export function getStoredDateOutputFormat(dateFormat) {
  return /d/.test(normalizeDateParseFormat(dateFormat)) ? 'yyyy-MM-dd' : 'yyyy-MM';
}
