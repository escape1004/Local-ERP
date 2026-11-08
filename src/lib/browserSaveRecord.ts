import type { Category, FieldDefinition } from '../types';
import { extractDateLikeText, parseFlexibleDateValue } from './dateParse';

export type PickedPageElement = {
  tag: string;
  text: string;
  href?: string;
  src?: string;
  alt?: string;
  title?: string;
};

export type SaveRecordCategoryOption = {
  id: string;
  label: string;
  category: Category;
};

const FORM_FIELD_TYPES = new Set<FieldDefinition['type']>([
  'text',
  'longtext',
  'number',
  'date',
  'file',
  'select',
  'checkbox',
]);

const PICKABLE_FIELD_TYPES = new Set<FieldDefinition['type']>([
  'text',
  'longtext',
  'number',
  'date',
  'file',
]);

function fieldHint(field: Pick<FieldDefinition, 'id' | 'name'>) {
  return `${field.name || ''} ${field.id || ''}`.toLowerCase();
}

export function parseCategoryFields(category: Category | null | undefined): FieldDefinition[] {
  if (!category) return [];
  const raw = category.fields as unknown;
  const fields = Array.isArray(raw) ? raw as FieldDefinition[] : [];
  return fields
    .filter((field) => field && !field.hidden)
    .slice()
    .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
}

export function saveRecordFormFields(fields: FieldDefinition[]) {
  return fields.filter((field) => FORM_FIELD_TYPES.has(field.type));
}

export function isPickableSaveRecordField(field: FieldDefinition) {
  return PICKABLE_FIELD_TYPES.has(field.type);
}

export function isUrlLikeField(field: FieldDefinition) {
  if (field.type !== 'text' && field.type !== 'longtext') return false;
  if (/url|link|href|주소|링크|웹/.test(fieldHint(field))) return true;
  return /^https?:\/\//i.test(String(field.textPrefix || ''))
    || /^https?:\/\//i.test(String(field.textSuffix || ''));
}

export function isTitleLikeField(field: FieldDefinition) {
  if (field.type !== 'text' && field.type !== 'longtext') return false;
  return /title|name|제목|이름|타이틀/.test(fieldHint(field));
}

export function isImageLikeField(field: FieldDefinition) {
  if (field.type === 'file') return true;
  if (field.type !== 'text' && field.type !== 'longtext') return false;
  return /image|img|thumb|cover|사진|이미지|썸네일|대표/.test(fieldHint(field));
}

export function emptySaveRecordValue(field: FieldDefinition) {
  return field.type === 'checkbox' ? false : '';
}

export function storedTextForField(field: Pick<FieldDefinition, 'textPrefix' | 'textSuffix'>, raw: string) {
  let value = String(raw || '').trim();
  const prefix = String(field.textPrefix || '');
  const suffix = String(field.textSuffix || '');
  if (prefix && value.startsWith(prefix)) value = value.slice(prefix.length);
  if (suffix && value.endsWith(suffix)) value = value.slice(0, Math.max(0, value.length - suffix.length));
  return value.trim();
}

export function parsePickedNumber(text: string) {
  const match = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : '';
}

export function parsePickedPageElement(raw: unknown): PickedPageElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const text = String(item.text || '').replace(/\s+/g, ' ').trim();
  const href = String(item.href || '').trim();
  const src = String(item.src || '').trim();
  const alt = String(item.alt || '').trim();
  const title = String(item.title || '').trim();
  if (!text && !href && !src && !alt && !title) return null;
  return {
    tag: String(item.tag || '').toUpperCase(),
    text,
    href: href || undefined,
    src: src || undefined,
    alt: alt || undefined,
    title: title || undefined,
  };
}

export function saveRecordValueFromPicked(
  field: FieldDefinition,
  picked: PickedPageElement,
  options?: { dateFormats?: string[] },
) {
  if (field.type === 'file') return picked.src || picked.href || '';
  if (field.type === 'number') {
    return parsePickedNumber(picked.text || picked.alt || picked.title || picked.href || picked.src || '');
  }
  if (field.type === 'date') {
    const raw = picked.text || picked.alt || picked.title || '';
    const parsed = parseFlexibleDateValue(extractDateLikeText(raw), options?.dateFormats || []);
    return parsed || '';
  }
  if (isUrlLikeField(field) || isImageLikeField(field)) {
    return storedTextForField(field, picked.href || picked.src || picked.text || '');
  }
  return storedTextForField(
    field,
    picked.text || picked.alt || picked.title || picked.href || picked.src || '',
  );
}

export function prefillSaveRecordValues(
  fields: FieldDefinition[],
  page: { url?: string; title?: string } = {},
) {
  const values: Record<string, unknown> = {};
  fields.forEach((field) => {
    values[field.id] = emptySaveRecordValue(field);
  });
  const urlField = fields.find(isUrlLikeField);
  if (urlField && page.url) values[urlField.id] = storedTextForField(urlField, page.url);
  return values;
}

export function isEmptySaveRecordValue(value: unknown) {
  if (value === false || value === 0) return false;
  if (value == null) return true;
  return String(value).trim() === '';
}

export function nextEmptyPickableFieldId(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  afterId?: string | null,
) {
  const pickable = fields.filter(isPickableSaveRecordField);
  if (pickable.length === 0) return null;
  const start = afterId ? pickable.findIndex((field) => field.id === afterId) + 1 : 0;
  const ordered = start > 0
    ? [...pickable.slice(start), ...pickable.slice(0, start)]
    : pickable;
  const empty = ordered.find((field) => isEmptySaveRecordValue(values[field.id]));
  return empty?.id || null;
}

export function flattenSaveRecordCategories(categories: Category[]): SaveRecordCategoryOption[] {
  const list = categories.filter((category) => category?.itemType !== 'separator' && category?.id);
  const children = new Map<string | null, Category[]>();
  list.forEach((category) => {
    const parentId = category.parentId || null;
    const bucket = children.get(parentId) || [];
    bucket.push(category);
    children.set(parentId, bucket);
  });
  children.forEach((bucket) => {
    bucket.sort((left, right) => (
      Number(left.order ?? 0) - Number(right.order ?? 0)
      || String(left.name || '').localeCompare(String(right.name || ''), 'ko')
    ));
  });

  const result: SaveRecordCategoryOption[] = [];
  const walk = (parentId: string | null, prefix: string) => {
    (children.get(parentId) || []).forEach((category) => {
      const label = prefix ? `${prefix} / ${category.name}` : String(category.name || category.id);
      result.push({ id: category.id, label, category });
      walk(category.id, label);
    });
  };
  walk(null, '');

  const listed = new Set(result.map((item) => item.id));
  list.forEach((category) => {
    if (listed.has(category.id)) return;
    result.push({
      id: category.id,
      label: String(category.name || category.id),
      category,
    });
  });
  return result;
}

export function normalizeSaveRecordDateFields(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  dateFormats: string[] = [],
) {
  const next = { ...values };
  const errors: Record<string, string> = {};
  fields.forEach((field) => {
    if (field.type !== 'date') return;
    const raw = String(next[field.id] ?? '').trim();
    if (!raw) return;
    const parsed = parseFlexibleDateValue(extractDateLikeText(raw), dateFormats);
    if (parsed) {
      next[field.id] = parsed;
      return;
    }
    errors[field.id] = `${field.name}은(는) 날짜 형식을 인식하지 못했습니다.`;
  });
  return { values: next, errors };
}

export function validateSaveRecordValues(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
) {
  const errors: Record<string, string> = {};
  fields.forEach((field) => {
    if (!field.required || field.type === 'percentage' || field.type === 'relation') return;
    if (isEmptySaveRecordValue(values[field.id])) {
      errors[field.id] = `${field.name}은(는) 필수 입력 항목입니다.`;
    }
  });
  return errors;
}
