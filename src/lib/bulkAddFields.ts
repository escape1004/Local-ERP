import type { Category, FieldDefinition, NewRecord } from '../types';
import { parseNonNegativeNumberInput } from './recordFields';

export const parsePercentageBulkValue = (value: string) => {
  const [currentPart = '', maxPart = ''] = value.split('/', 2);
  const max = parseNonNegativeNumberInput(maxPart);
  return {
    value: Math.min(parseNonNegativeNumberInput(currentPart), max),
    max,
  };
};

export function getBulkCreatableFields(category: Category | null | undefined) {
  return (category?.fields || []).filter((field) => (
    !field.hidden
    && field.type !== 'file'
    && field.type !== 'relation'
    && field.type !== 'checkbox'
  ));
}

export function normalizeBulkFieldValue(field: FieldDefinition, value: unknown) {
  if (field.type === 'number') {
    return String(Number(value) || 0);
  }

  if (field.type === 'percentage') {
    const percentageValue = typeof value === 'string' ? parsePercentageBulkValue(value) : value;
    const record = percentageValue && typeof percentageValue === 'object'
      ? percentageValue as { value?: unknown; max?: unknown }
      : { value: 0, max: 0 };
    return `${record.value ?? ''}/${record.max ?? ''}`;
  }

  return String(value ?? '').trim();
}

export function buildBulkRecordData(category: Category, field: FieldDefinition, value: string) {
  const recordData: Record<string, unknown> = {};
  category.fields.forEach((item) => {
    if (item.type === 'checkbox') {
      recordData[item.id] = false;
    } else if (item.type === 'percentage') {
      recordData[item.id] = { value: 0, max: 0 };
    } else {
      recordData[item.id] = '';
    }
  });

  if (field.type === 'number') {
    recordData[field.id] = Number(value) || 0;
  } else if (field.type === 'percentage') {
    recordData[field.id] = parsePercentageBulkValue(value);
  } else {
    recordData[field.id] = value;
  }

  return recordData;
}

export function buildBulkRecords(category: Category, field: FieldDefinition, values: string[]): NewRecord[] {
  const now = new Date().toISOString();
  return values.map((value) => ({
    categoryId: category.id,
    data: buildBulkRecordData(category, field, value),
    createdAt: now,
    updatedAt: now,
  }));
}
