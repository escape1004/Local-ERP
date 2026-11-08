import { format, isValid } from 'date-fns';
import type { FieldDefinition } from '../types';
import { extractDateLikeText, parseFlexibleDateValue } from './dateParse';

export type PercentageValue = {
  value: number;
  max: number;
};

export type FieldValue = string | number | boolean | null | undefined | PercentageValue | Array<string | number>;
export type ListFileType = 'image' | 'video' | 'archive' | 'other';

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
export const VIDEO_FILTER_EXTENSIONS = ['.mp4', '.avi', '.mkv', '.mov'];
export const ARCHIVE_EXTENSIONS = ['.zip', '.7z'];
export const VIDEO_HOVER_PREVIEW_PATTERN = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i;
export const SUPPORTED_THUMBNAIL_EXTS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_FILTER_EXTENSIONS,
  ...ARCHIVE_EXTENSIONS,
];
export const CUSTOM_THUMBNAIL_FLAG = '__customThumbnail';

export const isCustomThumbnailRecord = (
  record?: { data?: Record<string, unknown> } | null,
) => record?.data?.[CUSTOM_THUMBNAIL_FLAG] === true;

export const shouldShowCustomThumbnailBadge = ({
  flagged,
  hasEmbeddedCover,
  override = null,
}: {
  flagged: boolean;
  hasEmbeddedCover: boolean;
  override?: boolean | null;
}) => (override ?? flagged) || hasEmbeddedCover;

export const isPercentageValue = (value: unknown): value is PercentageValue => (
  typeof value === 'object'
  && value !== null
  && 'value' in value
  && 'max' in value
);

export const getFileTypeFromPath = (filePath: string): ListFileType => {
  if (!filePath || typeof filePath !== 'string') return 'other';
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (VIDEO_FILTER_EXTENSIONS.includes(extension)) return 'video';
  if (ARCHIVE_EXTENSIONS.includes(extension)) return 'archive';
  return 'other';
};

export const isVideoHoverPreviewFile = (filePath?: string | null) => (
  Boolean(filePath && VIDEO_HOVER_PREVIEW_PATTERN.test(filePath))
);

export const isSupportedThumbnailExt = (extension: string) => (
  SUPPORTED_THUMBNAIL_EXTS.includes(extension.toLowerCase())
);

export const isEmptyValue = (value: unknown) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return typeof value === 'object' && Object.keys(value).length === 0;
};

export const isBlankDisplayValue = (value: unknown) => (
  value === null || value === undefined || value === '' || value === '-'
  || (Array.isArray(value) && value.length === 0)
);

export const parseHashtags = (text: string): { hashtags: string[]; plainText: string } => {
  const hashtagRegex = /#(\S+)/g;
  const hashtags: string[] = [];
  let match;

  while ((match = hashtagRegex.exec(text)) !== null) {
    hashtags.push(match[1]);
  }

  return {
    hashtags,
    plainText: text.replace(hashtagRegex, '').trim(),
  };
};

export const getPercentageMeta = (_field: FieldDefinition, value: unknown) => {
  const currentValue = isPercentageValue(value) ? value.value : value;
  const maxValue = isPercentageValue(value) ? value.max : 0;
  const numericValue = Number(currentValue || 0);
  const numericMax = Number(maxValue || 0);
  const safeMax = Number.isFinite(numericMax) ? Math.max(0, numericMax) : 0;
  const safeValue = Number.isFinite(numericValue) ? Math.min(Math.max(0, numericValue), safeMax) : 0;
  const percentValue = safeMax > 0 ? Math.round((safeValue / safeMax) * 100) : 0;

  return {
    value: safeValue,
    max: safeMax,
    percent: percentValue,
  };
};

export const parseNonNegativeNumberInput = (value: string): number => {
  if (value === '') return 0;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
};

export const clampPercentageValue = (value: number, max: number): number => (
  Math.min(value, Math.max(0, max))
);

export const getEditablePercentageValue = (value: unknown) => {
  const numericMax = Number(isPercentageValue(value) ? value.max : 0);
  const max = Number.isFinite(numericMax) ? Math.max(0, numericMax) : 0;
  const numericValue = Number(isPercentageValue(value) ? value.value : 0);
  const current = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
  return {
    value: max > 0 ? clampPercentageValue(current, max) : current,
    max,
  };
};

export const normalizePercentageValue = (value: unknown) => {
  const numericMax = Number(isPercentageValue(value) ? value.max : 0);
  const max = Number.isFinite(numericMax) ? Math.max(0, numericMax) : 0;
  const numericValue = Number(isPercentageValue(value) ? value.value : 0);
  const current = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
  return {
    value: clampPercentageValue(current, max),
    max,
  };
};

export const getPercentageTextClassName = (percent: number) => (
  percent >= 100 ? 'text-discord-accent font-semibold' : 'text-discord-text font-semibold'
);

export const getFieldOptions = (field: FieldDefinition): string[] => {
  const legacyField = field as FieldDefinition & { selectOptions?: string[] };
  return legacyField.options ?? legacyField.selectOptions ?? [];
};

export const isFieldMultiple = (field: FieldDefinition): boolean => {
  const legacyField = field as FieldDefinition & { multiSelect?: boolean };
  return Boolean(legacyField.multiple ?? legacyField.multiSelect);
};

export const isUrlString = (value: string, ignoreCase = false) => (
  ignoreCase ? /^https?:\/\/.+/i.test(value) : /^https?:\/\/.+/.test(value)
);

export const formatStoredDate = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}$/.test(raw) || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const normalized = parseFlexibleDateValue(extractDateLikeText(raw));
  if (normalized) return normalized;
  const parsed = new Date(raw);
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : raw;
};

export const toScalarInputValue = (value: unknown): string | number => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return '';
};

export const toDateInputValue = (value: unknown): string => (
  typeof value === 'string' ? value : ''
);

export const toDisplayText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};
