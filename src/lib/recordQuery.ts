import type { Category, DataRecord, FieldDefinition } from '../types';
import { resolveFilePath } from './pathResolver';
import {
  getFileTypeFromPath,
  getPercentageMeta,
  isEmptyValue,
  isFieldMultiple,
  type FieldValue,
  type ListFileType,
} from './recordFields';
import { getTranslatedFieldId, getTranslatedFieldValue, isTranslationEnabledField } from './translation';

export interface RecordSearchState {
  searchTerm: string;
  normalizedSearchTerm: string;
  normalizedMultiSearchTerms: string[];
  effectiveSearchField: string;
  isMultiValueSearchField: boolean;
  hasActiveSearch: boolean;
  fileTypeFilter: ListFileType | 'all';
}

export interface RecordSortState {
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

interface SearchMatchOptions extends RecordSearchState {
  field: FieldDefinition;
  value: FieldValue;
  recordData?: Record<string, unknown>;
}

export function matchesSearchValue({
  field,
  value,
  recordData,
  searchTerm,
  normalizedSearchTerm,
  normalizedMultiSearchTerms,
  effectiveSearchField,
  isMultiValueSearchField,
}: SearchMatchOptions) {
  if (!normalizedSearchTerm && normalizedMultiSearchTerms.length === 0) return true;

  if (field.type === 'number') {
    const numericSearch = Number(searchTerm);
    return Number.isFinite(numericSearch) && Number(value) === numericSearch;
  }

  if (field.type === 'date') {
    return String(value || '').trim() === searchTerm.trim();
  }

  if (field.type === 'select') {
    if (isFieldMultiple(field) && Array.isArray(value)) {
      if (
        effectiveSearchField === field.id
        && isMultiValueSearchField
        && normalizedMultiSearchTerms.length > 0
      ) {
        return value.some((item) => normalizedMultiSearchTerms.includes(String(item || '').toLowerCase()));
      }
      return value.some((item) => String(item || '').toLowerCase() === normalizedSearchTerm);
    }
    return String(value || '').toLowerCase() === normalizedSearchTerm;
  }

  if (field.type === 'checkbox') {
    if (searchTerm !== 'true' && searchTerm !== 'false') return false;
    return Boolean(value) === (searchTerm === 'true');
  }

  if (field.type === 'percentage') {
    const percentage = getPercentageMeta(field, value);
    const numericSearch = Number(searchTerm);

    if (Number.isFinite(numericSearch)) {
      return percentage.value === numericSearch
        || percentage.max === numericSearch
        || percentage.percent === numericSearch;
    }

    return `${percentage.value} ${percentage.max} ${percentage.percent}`
      .toLowerCase()
      .includes(normalizedSearchTerm);
  }

  if ((field.type === 'text' || field.type === 'longtext') && isTranslationEnabledField(field)) {
    const translatedText = getTranslatedFieldValue(recordData, field.id);
    if (effectiveSearchField === getTranslatedFieldId(field.id)) {
      return translatedText.toLowerCase().includes(normalizedSearchTerm);
    }
    if (effectiveSearchField === field.id) {
      return String(value || '').toLowerCase().includes(normalizedSearchTerm);
    }
    return [String(value || ''), translatedText]
      .some((item) => item.toLowerCase().includes(normalizedSearchTerm));
  }

  return String(value || '').toLowerCase().includes(normalizedSearchTerm);
}

function getRelationDisplayValue(
  field: FieldDefinition,
  relatedCategory: Category | undefined,
  relatedRecord: DataRecord | undefined,
) {
  if (!relatedCategory || !relatedRecord) return '';
  const displayField = field.displayFieldId
    ? relatedCategory.fields.find((candidate) => candidate.id === field.displayFieldId)
    : relatedCategory.fields[0];
  return String(relatedRecord.data[displayField?.id] || '');
}

function matchesRelationSearch(
  field: FieldDefinition,
  value: FieldValue,
  search: RecordSearchState,
  categoryById: Map<string, Category>,
  recordsByIdByCategory: Map<string, Map<string, DataRecord>>,
) {
  if (!field.relationCategoryId) return false;
  const relatedCategory = categoryById.get(field.relationCategoryId);
  if (!relatedCategory) return false;
  const relatedRecordMap = recordsByIdByCategory.get(field.relationCategoryId);

  const matchesRelatedId = (relatedId: string | number) => {
    const relatedRecord = relatedRecordMap?.get(String(relatedId));
    if (!relatedRecord) return false;
    const displayValue = getRelationDisplayValue(field, relatedCategory, relatedRecord);
    if (
      search.effectiveSearchField === field.id
      && search.isMultiValueSearchField
      && search.normalizedMultiSearchTerms.length > 0
    ) {
      return search.normalizedMultiSearchTerms.includes(displayValue.toLowerCase());
    }
    return displayValue.toLowerCase().includes(search.normalizedSearchTerm);
  };

  if (isFieldMultiple(field) && Array.isArray(value)) {
    return value.some((relatedId) => matchesRelatedId(relatedId));
  }
  return matchesRelatedId(String(value));
}

export function filterRecordsByFileType(
  records: DataRecord[],
  fileField: FieldDefinition | undefined,
  fileTypeFilter: ListFileType | 'all',
) {
  if (!fileField || fileTypeFilter === 'all') return records;
  return records.filter((record) => {
    const filePath = resolveFilePath(record.data[fileField.id], fileField);
    if (!filePath || filePath === '' || filePath === '-') return false;
    return getFileTypeFromPath(filePath) === fileTypeFilter;
  });
}

export function filterRecords(options: {
  records: DataRecord[];
  search: RecordSearchState;
  fileField?: FieldDefinition;
  visibleFields: FieldDefinition[];
  fieldMap: Map<string, FieldDefinition>;
  categoryById: Map<string, Category>;
  recordsByIdByCategory: Map<string, Map<string, DataRecord>>;
  getRecordFieldValue: (record: DataRecord, fieldId: string) => FieldValue;
}) {
  const filteredByFileType = filterRecordsByFileType(
    options.records,
    options.fileField,
    options.search.fileTypeFilter,
  );

  if (!options.search.hasActiveSearch) return filteredByFileType;

  return filteredByFileType.filter((record) => {
    const translatedSourceField = options.visibleFields.find(
      (field) => getTranslatedFieldId(field.id) === options.search.effectiveSearchField
        && isTranslationEnabledField(field)
    );
    const fieldsToSearch = options.search.effectiveSearchField === 'all'
      ? options.visibleFields
      : [translatedSourceField ?? options.fieldMap.get(options.search.effectiveSearchField)]
        .filter(Boolean) as FieldDefinition[];

    if (fieldsToSearch.length === 0) return false;

    return fieldsToSearch.some((field) => {
      const value = options.getRecordFieldValue(record, field.id);
      if (field.type === 'relation' && field.relationCategoryId) {
        return matchesRelationSearch(
          field,
          value,
          options.search,
          options.categoryById,
          options.recordsByIdByCategory,
        );
      }
      return matchesSearchValue({
        ...options.search,
        field,
        value,
        recordData: record.data as Record<string, unknown>,
      });
    });
  });
}

export function sortRecords(options: {
  records: DataRecord[];
  sort: RecordSortState;
  fieldMap: Map<string, FieldDefinition>;
  categoryById: Map<string, Category>;
  recordsByIdByCategory: Map<string, Map<string, DataRecord>>;
  fileField?: FieldDefinition;
  getRecordFieldValue: (record: DataRecord, fieldId: string) => FieldValue;
  getRecordReferenceCount: (recordId: string, categoryId: string) => number;
  categoryId: string;
}) {
  const { sort } = options;
  if (!sort.sortField) return options.records;

  const sortFieldDef = options.fieldMap.get(sort.sortField);
  const relatedCategory = sortFieldDef?.type === 'relation' && sortFieldDef.relationCategoryId
    ? options.categoryById.get(sortFieldDef.relationCategoryId)
    : null;
  const relatedRecordMap = sortFieldDef?.type === 'relation' && sortFieldDef.relationCategoryId
    ? options.recordsByIdByCategory.get(sortFieldDef.relationCategoryId)
    : null;
  const displayField = relatedCategory
    ? sortFieldDef?.displayFieldId
      ? relatedCategory.fields.find((field) => field.id === sortFieldDef.displayFieldId)
      : relatedCategory.fields[0]
    : null;

  return [...options.records].sort((left, right) => {
    if (sort.sortField === '__refCount') {
      const countA = options.getRecordReferenceCount(left.id, options.categoryId);
      const countB = options.getRecordReferenceCount(right.id, options.categoryId);
      return sort.sortDirection === 'asc' ? countA - countB : countB - countA;
    }

    if (sort.sortField === '__thumbnail') {
      if (!options.fileField) return 0;

      const getFileValue = (record: DataRecord): string | null => {
        const value = resolveFilePath(record.data[options.fileField!.id], options.fileField);
        if (!value || value === '' || value === '-') return null;
        return String(value);
      };

      const hasThumbnailA = getFileValue(left) !== null;
      const hasThumbnailB = getFileValue(right) !== null;
      if (hasThumbnailA === hasThumbnailB) return 0;
      if (hasThumbnailA && !hasThumbnailB) return sort.sortDirection === 'asc' ? -1 : 1;
      if (!hasThumbnailA && hasThumbnailB) return sort.sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    let aValue: FieldValue = options.getRecordFieldValue(left, sort.sortField);
    let bValue: FieldValue = options.getRecordFieldValue(right, sort.sortField);

    if (sortFieldDef?.type === 'relation' && relatedCategory) {
      if (sortFieldDef.multiple && Array.isArray(aValue) && Array.isArray(bValue)) {
        const aDisplayValues = aValue
          .map((id: string | number) => {
            const rec = relatedRecordMap?.get(String(id));
            return rec ? String(rec.data[displayField?.id] || '') : '';
          })
          .filter(Boolean)
          .sort();
        const bDisplayValues = bValue
          .map((id: string | number) => {
            const rec = relatedRecordMap?.get(String(id));
            return rec ? String(rec.data[displayField?.id] || '') : '';
          })
          .filter(Boolean)
          .sort();
        aValue = aDisplayValues.join(',');
        bValue = bDisplayValues.join(',');
      } else if (sortFieldDef.multiple) {
        aValue = '';
        bValue = '';
      } else {
        const aRelatedRecord = relatedRecordMap?.get(String(aValue));
        const bRelatedRecord = relatedRecordMap?.get(String(bValue));
        aValue = aRelatedRecord ? String(aRelatedRecord.data[displayField?.id] || '') : '';
        bValue = bRelatedRecord ? String(bRelatedRecord.data[displayField?.id] || '') : '';
      }
    }

    const aIsEmpty = isEmptyValue(aValue);
    const bIsEmpty = isEmptyValue(bValue);
    if (aIsEmpty && bIsEmpty) return 0;
    if (aIsEmpty) return sort.sortDirection === 'asc' ? 1 : -1;
    if (bIsEmpty) return sort.sortDirection === 'asc' ? -1 : 1;

    let comparableA: string | number = typeof aValue === 'string' || typeof aValue === 'number' ? aValue : String(aValue);
    let comparableB: string | number = typeof bValue === 'string' || typeof bValue === 'number' ? bValue : String(bValue);

    if (sortFieldDef?.type === 'number') {
      comparableA = Number(aValue);
      comparableB = Number(bValue);
    }

    if (sortFieldDef?.type === 'percentage') {
      comparableA = getPercentageMeta(sortFieldDef, aValue).percent;
      comparableB = getPercentageMeta(sortFieldDef, bValue).percent;
    }

    if (typeof comparableA === 'string' && typeof comparableB === 'string') {
      comparableA = comparableA.toLowerCase();
      comparableB = comparableB.toLowerCase();
    }

    if (comparableA < comparableB) return sort.sortDirection === 'asc' ? -1 : 1;
    if (comparableA > comparableB) return sort.sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

export function getNextSortState(current: RecordSortState, fieldId: string): RecordSortState {
  if (current.sortField === fieldId) {
    if (current.sortDirection === 'asc') {
      return { sortField: fieldId, sortDirection: 'desc' };
    }
    return { sortField: '', sortDirection: 'asc' };
  }
  return { sortField: fieldId, sortDirection: 'asc' };
}
