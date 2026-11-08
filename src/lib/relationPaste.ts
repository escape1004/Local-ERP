import type { Category, DataRecord, FieldDefinition } from '../types';
import { getBulkCreatableFields, normalizeBulkFieldValue } from './bulkAddFields';

export type RelationPasteAmbiguousMatch = {
  value: string;
  records: DataRecord[];
};

export function splitRelationPasteValues(text: string, multiple: boolean) {
  const source = String(text || '');
  const values = multiple
    ? source.split(',').map((value) => value.trim()).filter(Boolean)
    : [source.trim()].filter(Boolean);
  return values;
}

export function classifyRelationPasteValues(
  values: string[],
  matchRecords: (value: string) => DataRecord[],
) {
  const valid: DataRecord[] = [];
  const ambiguous: RelationPasteAmbiguousMatch[] = [];
  const missing: string[] = [];
  const seenMissing = new Set<string>();

  values.forEach((value) => {
    const matches = matchRecords(value);
    if (matches.length === 1) {
      valid.push(matches[0]);
      return;
    }
    if (matches.length > 1) {
      ambiguous.push({ value, records: matches });
      return;
    }
    if (!seenMissing.has(value)) {
      seenMissing.add(value);
      missing.push(value);
    }
  });

  return { valid, ambiguous, missing };
}

export function getDefaultRelationCreateFieldId(
  category: Category | null | undefined,
  preferredFieldId?: string,
) {
  const fields = getBulkCreatableFields(category);
  if (preferredFieldId && fields.some((field) => field.id === preferredFieldId)) {
    return preferredFieldId;
  }
  return fields[0]?.id || '';
}

export function partitionRelationCreateValues({
  values,
  field,
  existingRecords,
}: {
  values: string[];
  field: FieldDefinition;
  existingRecords: Array<{ data?: Record<string, unknown> }>;
}) {
  const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!field.unique) {
    return { creatable: uniqueValues, skippedDuplicates: [] as string[] };
  }

  const existing = new Set(
    existingRecords.map((record) => normalizeBulkFieldValue(field, record.data?.[field.id])),
  );
  const seen = new Set<string>();
  const creatable: string[] = [];
  const skippedDuplicates: string[] = [];

  uniqueValues.forEach((value) => {
    const normalized = normalizeBulkFieldValue(field, value);
    if (!normalized || existing.has(normalized) || seen.has(normalized)) {
      skippedDuplicates.push(value);
      return;
    }
    seen.add(normalized);
    creatable.push(value);
  });

  return { creatable, skippedDuplicates };
}
