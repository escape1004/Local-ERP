import { useEffect, type MutableRefObject } from 'react';
import type { Category, DataRecord, FieldDefinition } from '../types';
import { toast } from '../components/ui/use-toast';
import {
  isCommandSearchInput,
  resolveSelectPaste,
  shouldAutoSelectPastedComboboxValue,
} from '../lib/comboboxPaste';
import {
  classifyRelationPasteValues,
  splitRelationPasteValues,
} from '../lib/relationPaste';
import type { MissingRelationCreateRequest } from '../components/records/CreateMissingRelationRecordsDialog';

function isCommandSearchFocused() {
  return isCommandSearchInput(document.activeElement);
}

interface UseRecordModalPasteOptions {
  category: Category;
  formData: Record<string, unknown>;
  openComboboxes: Record<string, boolean>;
  categories: Category[];
  getCategoryRecords: (categoryId: string) => DataRecord[];
  updateFieldValue: (fieldId: string, value: unknown) => void;
  toggleCombobox: (fieldId: string) => void;
  getRelationLabel: (record: DataRecord, field: FieldDefinition) => string;
  findMatchingRelationRecords: (records: DataRecord[], field: FieldDefinition, searchValue: string) => DataRecord[];
  pendingMissingAfterAmbiguousRef: MutableRefObject<MissingRelationCreateRequest | null>;
  setAmbiguousDialogOpen: (open: boolean) => void;
  setAmbiguousOptions: (options: Array<{ value: string; records: DataRecord[] }>) => void;
  setPendingAmbiguousField: (field: FieldDefinition | null) => void;
  setPendingAmbiguousCurrentValues: (values: string[]) => void;
  setMissingCreate: (request: MissingRelationCreateRequest | null) => void;
}

export function useRecordModalPaste({
  category,
  formData,
  openComboboxes,
  categories,
  getCategoryRecords,
  updateFieldValue,
  toggleCombobox,
  getRelationLabel,
  findMatchingRelationRecords,
  pendingMissingAfterAmbiguousRef,
  setAmbiguousDialogOpen,
  setAmbiguousOptions,
  setPendingAmbiguousField,
  setPendingAmbiguousCurrentValues,
  setMissingCreate,
}: UseRecordModalPasteOptions) {
  const applyRelationSelection = (field: FieldDefinition, recordIds: string[], currentValue: unknown) => {
    if (recordIds.length === 0) return;
    if (field.multiple) {
      const currentValues = Array.isArray(currentValue) ? currentValue.filter((item): item is string => typeof item === 'string') : [];
      updateFieldValue(field.id, [...new Set([...currentValues, ...recordIds])]);
      return;
    }
    updateFieldValue(field.id, recordIds[0]);
    toggleCombobox(field.id);
  };

  const handleRelationPaste = (
    field: FieldDefinition,
    pastedText: string,
    relatedRecords: DataRecord[],
    currentValue: unknown,
  ) => {
    const relatedCategory = categories.find((item) => item.id === field.relationCategoryId);
    if (!relatedCategory) return;

    const classified = classifyRelationPasteValues(
      splitRelationPasteValues(pastedText, Boolean(field.multiple)),
      (value) => findMatchingRelationRecords(relatedRecords, field, value),
    );
    const validIds = classified.valid.map((item) => item.id);
    if (validIds.length > 0) {
      applyRelationSelection(field, validIds, currentValue);
      if (!field.multiple && classified.ambiguous.length === 0 && classified.missing.length === 0) {
        toast({
          title: '값이 선택됨',
          description: `"${getRelationLabel(classified.valid[0], field)}"이 선택되었습니다.`,
        });
      }
    }

    const missingRequest = classified.missing.length > 0
      ? {
        field,
        category: relatedCategory,
        values: classified.missing,
      }
      : null;

    if (classified.ambiguous.length > 0) {
      const currentValues = field.multiple
        ? [...new Set([
          ...(Array.isArray(currentValue) ? currentValue.filter((item): item is string => typeof item === 'string') : []),
          ...validIds,
        ])]
        : [];
      pendingMissingAfterAmbiguousRef.current = missingRequest;
      setAmbiguousDialogOpen(true);
      setAmbiguousOptions(classified.ambiguous);
      setPendingAmbiguousField(field);
      setPendingAmbiguousCurrentValues(currentValues);
      return;
    }

    if (missingRequest) setMissingCreate(missingRequest);
  };

  const handleSelectPaste = (field: FieldDefinition, pastedText: string, currentValue: unknown) => {
    const result = resolveSelectPaste(field.options, pastedText, Boolean(field.multiple), currentValue);
    if (field.multiple) {
      if (result.nextValue) {
        updateFieldValue(field.id, result.nextValue);
        if (result.invalid.length > 0) {
          toast({
            title: '일부 값이 무시됨',
            description: `다음 값들이 유효하지 않아 제외되었습니다: ${result.invalid.join(', ')}`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: '값이 추가됨',
            description: `${result.matched.length}개의 값이 추가되었습니다.`,
          });
        }
        return;
      }

      toast({
        title: '유효하지 않은 값',
        description: `붙여넣은 모든 값이 유효하지 않습니다: ${result.invalid.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    if (typeof result.nextValue === 'string') {
      updateFieldValue(field.id, result.nextValue);
      toggleCombobox(field.id);
      toast({
        title: '값이 선택됨',
        description: `"${result.nextValue}"이 선택되었습니다.`,
      });
      return;
    }

    toast({
      title: '유효하지 않은 값',
      description: `"${String(pastedText || '').trim()}"는 유효한 옵션이 아닙니다.`,
      variant: 'destructive',
    });
  };

  useEffect(() => {
    const openFieldId = Object.entries(openComboboxes).find(([, isOpen]) => isOpen)?.[0];
    if (!openFieldId) return;

    const field = category.fields.find((item) => item.id === openFieldId);
    if (!field || (field.type !== 'select' && field.type !== 'relation')) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (!shouldAutoSelectPastedComboboxValue(isCommandSearchFocused())) return;

      const pastedText = event.clipboardData?.getData('text');
      if (!pastedText) return;

      event.preventDefault();
      const currentValue = formData[field.id];
      if (field.type === 'select') {
        handleSelectPaste(field, pastedText, currentValue);
        return;
      }

      const relatedRecords = field.relationCategoryId ? getCategoryRecords(field.relationCategoryId) : [];
      handleRelationPaste(field, pastedText, relatedRecords, currentValue);
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [category.fields, formData, getCategoryRecords, openComboboxes]);

  return { applyRelationSelection };
}
