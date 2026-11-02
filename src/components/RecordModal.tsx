import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Check, ChevronsUpDown, ChevronRight, CheckCircle2, XCircle, Languages } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import type { Category, DataRecord, FieldDefinition, NewRecord } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { toast } from './ui/use-toast';
import { AlertDialog } from './ui/alert-dialog';
import { DatePicker } from './ui/date-picker';
import { AnimatedModal } from './ui/animated-modal';
import { formatFieldDisplayValue, hasTextAffixes } from '../lib/fieldFormat';
import { isStoredDateValue } from '../lib/dateParse';
import { applyFilenamePatternToFields } from '../lib/filenamePattern';
import {
  clampPercentageValue,
  getEditablePercentageValue,
  getPercentageTextClassName,
  normalizePercentageValue,
  parseNonNegativeNumberInput,
  toDateInputValue,
  toDisplayText,
  toScalarInputValue,
} from '../lib/recordFields';
import { getRelationDisplayLabel, getRelationPrimaryLabel, getRelationSecondaryLabel } from '../utils/relationDisplay';
import { TextCaseContextMenu } from './records/TextCaseContextMenu';
import { RelatedRecordsEditor } from './records/RelatedRecordsEditor';
import type { Config } from '../types';
import { OPENAI_TRANSLATION_MODEL, getTranslatedFieldId, getTranslationMetaFieldId, isTranslationEnabledField } from '../lib/translation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

declare global {
  interface WindowEventMap {
    'thumbnail:regenerated': CustomEvent<{ filePath: string; customThumbnail?: boolean }>;
  }
}

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category;
  record?: DataRecord | null;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  category,
  record,
}) => {
  const { addRecord, updateRecord, categories, getCategoryRecords, checkDuplicate, selectCategory, loadRecords } = useERPStore();
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);
  const [pendingDuplicateChecks, setPendingDuplicateChecks] = useState<Set<string>>(new Set());
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [alertDialogProps, setAlertDialogProps] = useState<{
    title: string;
    message: string;
    variant: 'error' | 'warning' | 'info' | 'success';
  }>({
    title: '',
    message: '',
    variant: 'info'
  });
  const [ambiguousDialogOpen, setAmbiguousDialogOpen] = useState(false);
  const [ambiguousOptions, setAmbiguousOptions] = useState<{ value: string, records: DataRecord[] }[]>([]);
  const [pendingAmbiguousField, setPendingAmbiguousField] = useState<FieldDefinition | null>(null);
  const [pendingAmbiguousCurrentValues, setPendingAmbiguousCurrentValues] = useState<string[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [translatingFieldIds, setTranslatingFieldIds] = useState<Set<string>>(new Set());
  const [relatedRecordIds, setRelatedRecordIds] = useState<string[]>([]);
  const [relatedRecordsLoaded, setRelatedRecordsLoaded] = useState(false);
  const canEditRelatedRecords = Boolean(category && !category.parentId);

  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && record && category) {
      setFormData({ ...record.data });
    } else if (isOpen && category) {
      const initialData: Record<string, unknown> = {};
      category.fields.forEach(field => {
        initialData[field.id] = field.type === 'checkbox'
          ? false
          : field.type === 'percentage'
            ? { value: 0, max: 0 }
            : '';
      });
      setFormData(initialData);
    }
    setErrors({});
    setDuplicateErrors({});
    setOpenComboboxes({});
  }, [isOpen, record, category]);

  useEffect(() => {
    if (!isOpen) {
      setRelatedRecordIds([]);
      setRelatedRecordsLoaded(false);
      return undefined;
    }

    if (!canEditRelatedRecords || !record?.id) {
      setRelatedRecordIds([]);
      setRelatedRecordsLoaded(true);
      return undefined;
    }

    let cancelled = false;
    setRelatedRecordsLoaded(false);
    window.electronAPI.listRelatedRecords(record.id)
      .then((rows) => {
        if (!cancelled) {
          setRelatedRecordIds(rows.map((row) => row.id));
          setRelatedRecordsLoaded(true);
        }
      })
      .catch((error) => {
        console.error('Failed to load related records:', error);
        if (!cancelled) {
          setRelatedRecordIds([]);
          setRelatedRecordsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canEditRelatedRecords, isOpen, record?.id]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    window.electronAPI.getConfig()
      .then((nextConfig) => {
        if (!cancelled) {
          setConfig(nextConfig);
        }
      })
      .catch((error) => {
        console.error('Failed to load translation config:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !category?.fields?.length) return;

    const timeoutId = window.setTimeout(() => {
      firstFieldRef.current?.focus();
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [isOpen, category]);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    (category?.fields ?? []).forEach(field => {
      const value = formData[field.id];

      if (field.required && field.type !== 'percentage') {
        if (!value && value !== 0 && value !== false) {
          newErrors[field.id] = `${field.name}은(는) 필수 입력 항목입니다.`;
          return;
        }
      }

      if (field.type === 'date' && typeof value === 'string' && value && !isStoredDateValue(value)) {
        newErrors[field.id] = `${field.name}은(는) yyyy-MM 또는 yyyy-MM-dd 형식의 유효한 날짜여야 합니다.`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, category?.fields]);

  const checkFieldDuplicate = useCallback(async (fieldId: string, value: unknown) => {
    if (!category) return;
    try {
      setIsDuplicateChecking(true);
      setPendingDuplicateChecks(prev => new Set([...prev, fieldId]));
      const isDuplicate = await checkDuplicate(category.id, fieldId, value, record?.id);
      if (isDuplicate) {
        setDuplicateErrors(prev => ({
          ...prev,
          [fieldId]: '이미 사용 중인 값입니다.'
        }));
      } else {
        setDuplicateErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
      }
      setPendingDuplicateChecks(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldId);
        return newSet;
      });
    } catch (error) {
      console.error('중복 체크 중 오류 발생:', error);
      setPendingDuplicateChecks(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldId);
        return newSet;
      });
    } finally {
      if (pendingDuplicateChecks.size <= 1) {
        setIsDuplicateChecking(false);
      }
    }
  }, [category, record?.id, checkDuplicate, pendingDuplicateChecks]);

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!category) {
      showAlert('오류', '카테고리를 먼저 선택하세요.', 'error');
      return;
    }
    if (translatingFieldIds.size > 0) {
      showAlert('자동 번역 진행 중', '자동 번역이 완료된 뒤 저장할 수 있습니다.', 'warning');
      return;
    }
    if (canEditRelatedRecords && !relatedRecordsLoaded) {
      return;
    }
    const isValid = validateForm();
    if (!isValid) {
      showAlert('오류', '필수 입력 항목을 모두 입력해주세요.', 'error');
      return;
    }
    try {
      setIsValidating(true);
      const normalizedFormData = { ...formData };
      category.fields.forEach((field) => {
        if (field.type === 'percentage') {
          normalizedFormData[field.id] = normalizePercentageValue(normalizedFormData[field.id]);
        }
      });
      if (record) {
        await updateRecord(record.id, normalizedFormData, canEditRelatedRecords ? relatedRecordIds : undefined);
        
        // 파일 필드가 변경되었는지 확인하고 썸네일 재생성 이벤트 발생
        const fileField = category.fields.find(f => f.type === 'file');
        if (fileField) {
          const prevFilePath = record.data[fileField.id];
          const newFilePath = normalizedFormData[fileField.id];
          if (newFilePath !== prevFilePath && newFilePath) {
            // 파일이 변경되었으므로 기존 북마크 삭제 (에러 처리 추가)
            try {
              if (window.electronAPI.removeAllBookmarks) {
                const result = await window.electronAPI.removeAllBookmarks(category.id, record.id);
                if (result.error) {
                  console.error('북마크 삭제 실패:', result.error);
                }
              }
            } catch (error) {
              console.error('북마크 삭제 중 오류 발생:', error);
              // 북마크 삭제 실패해도 레코드 저장은 계속 진행
            }
            
            // 전역 이벤트 발생 - 레코드 리스트의 썸네일도 업데이트
            window.dispatchEvent(new CustomEvent('thumbnail:regenerated', {
              detail: { filePath: newFilePath }
            }));
          }
        }
      } else {
        const now = new Date().toISOString();
        const newRecord: NewRecord = {
          categoryId: category.id,
          data: normalizedFormData,
          createdAt: now,
          updatedAt: now,
          ...(canEditRelatedRecords ? { relatedRecordIds } : {}),
        };
        await addRecord(newRecord);
      }
      toast({
        title: record ? '레코드가 저장되었습니다.' : '레코드가 등록되었습니다.',
      });
      onClose();
    } catch (error) {
      console.error('레코드 저장 중 오류 발생:', error);
      showAlert('오류', '항목을 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    } finally {
      setIsValidating(false);
    }
  };

  const updateFieldValue = (fieldId: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value,
    }));
    
    // 필드가 unique인 경우 중복 체크 실행
    const field = (category?.fields ?? []).find(f => f.id === fieldId);
    if (field?.unique && field.type !== 'percentage') {
      if (value !== undefined && value !== null && value !== '') {
        checkFieldDuplicate(fieldId, value);
      } else {
        // 값이 비어있는 경우 중복 에러 제거
        setDuplicateErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
        setPendingDuplicateChecks(prev => {
          const newSet = new Set(prev);
          newSet.delete(fieldId);
          return newSet;
        });
      }
    }
    
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const normalizeTextFieldInput = (field: FieldDefinition, inputValue: string) => {
    if (field.type !== 'text') {
      return inputValue;
    }

    let normalizedValue = inputValue;
    const prefix = field.textPrefix ?? '';
    const suffix = field.textSuffix ?? '';

    if (prefix && normalizedValue.startsWith(prefix)) {
      normalizedValue = normalizedValue.slice(prefix.length);
    }

    if (suffix && normalizedValue.endsWith(suffix)) {
      normalizedValue = normalizedValue.slice(0, normalizedValue.length - suffix.length);
    }

    return normalizedValue;
  };

  const updateTranslationValue = (
    fieldId: string,
    value: string,
    autoTranslated: boolean,
    model = config?.translationModel || OPENAI_TRANSLATION_MODEL
  ) => {
    setFormData((prev) => ({
      ...prev,
      [getTranslatedFieldId(fieldId)]: value,
      [getTranslationMetaFieldId(fieldId)]: value.trim()
        ? {
            provider: 'openai',
            model,
            autoTranslated,
            targetLanguage: config?.translationTargetLanguage || 'ko',
            translatedAt: new Date().toISOString(),
          }
        : null,
    }));
  };

  const handleAutoTranslate = async (field: FieldDefinition) => {
    const rawValue = formData[field.id];
    const sourceText = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (!sourceText) {
      showAlert('번역 불가', '원문을 먼저 입력해주세요.', 'warning');
      return;
    }

    if (!config?.hasOpenAiApiKey) {
      showAlert('OpenAI API 키 필요', '환경설정 > 번역에서 OpenAI API 키를 먼저 저장해주세요.', 'warning');
      return;
    }

    setTranslatingFieldIds((prev) => new Set(prev).add(field.id));
    try {
      const result = await window.electronAPI.translateText({
        text: sourceText,
        targetLanguage: config.translationTargetLanguage || 'ko',
      });

      if (!result.success || !result.translatedText) {
        const isInsufficientQuota = [
          'credit_balance_exhausted',
          'organization_spend_limit_exceeded',
          'project_spend_limit_exceeded',
          'organization_usage_limit_exceeded',
        ].includes(result.errorCode || '')
          || result.errorType === 'insufficient_quota'
          || (result.status === 429 && /quota|credit|billing/i.test(result.error || ''));
        if (isInsufficientQuota) {
          showAlert('OpenAI 크레딧 부족', 'OpenAI API 크레딧 또는 결제 한도를 확인한 뒤 다시 시도해주세요.', 'warning');
          return;
        }
        showAlert('자동 번역 실패', result.error || '자동 번역에 실패했습니다.', 'error');
        return;
      }

      updateTranslationValue(field.id, result.translatedText, true, result.model);
      toast({
        title: '자동 번역 완료',
        description: `${field.name} 번역문을 입력했습니다.`,
      });
    } catch (error) {
      console.error('Auto translation failed:', error);
      showAlert('자동 번역 실패', '자동 번역 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setTranslatingFieldIds((prev) => {
        const next = new Set(prev);
        next.delete(field.id);
        return next;
      });
    }
  };

  const renderTranslationInput = (field: FieldDefinition) => {
    if (!isTranslationEnabledField(field)) {
      return null;
    }

    const translationFieldId = getTranslatedFieldId(field.id);
    const translationValue = typeof formData[translationFieldId] === 'string'
      ? String(formData[translationFieldId])
      : '';
    const isTranslating = translatingFieldIds.has(field.id);
    const isAutoTranslateAvailable = Boolean(config?.hasOpenAiApiKey);
    const autoTranslateTooltip = !isAutoTranslateAvailable
      ? '환경 설정 > 번역에서 OpenAI API 키를 등록하면 자동 번역을 사용할 수 있습니다.'
      : null;

    return (
      <div className="space-y-2 pt-3">
        <div className="flex items-center gap-2 text-sm font-medium text-discord-text">
          {field.name} 번역
          <Languages size={15} className="text-blue-300" />
        </div>

        {field.type === 'longtext' ? (
          <div className="relative">
            <TextCaseContextMenu
              value={translationValue}
              onValueChange={(next) => updateTranslationValue(field.id, next, false)}
              disabled={isTranslating}
            >
              <Textarea
                value={translationValue}
                onChange={(e) => updateTranslationValue(field.id, e.target.value, false)}
                placeholder="번역문을 입력하세요"
                disabled={isTranslating}
                className="min-h-[100px] bg-discord-sidebar border-gray-600 pr-28 text-discord-text placeholder:text-gray-500"
              />
            </TextCaseContextMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="absolute right-2 top-2 inline-flex">
                    <Button
                      type="button"
                      onClick={() => void handleAutoTranslate(field)}
                      disabled={!isAutoTranslateAvailable || isTranslating}
                      className="h-8 rounded-md bg-[#5865f2] px-3 text-xs font-medium text-white hover:bg-[#4752c4] disabled:bg-[#4e5d94] disabled:text-white/70"
                    >
                      {isTranslating ? '번역 중...' : '자동 번역'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {autoTranslateTooltip && (
                  <TooltipContent side="top" align="end">
                    {autoTranslateTooltip}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <TextCaseContextMenu
              value={translationValue}
              onValueChange={(next) => updateTranslationValue(field.id, next, false)}
              disabled={isTranslating}
              className="flex-1"
            >
              <Input
                type="text"
                value={translationValue}
                onChange={(e) => updateTranslationValue(field.id, e.target.value, false)}
                placeholder="번역문을 입력하세요"
                disabled={isTranslating}
                className="bg-discord-sidebar border-gray-600 text-discord-text"
              />
            </TextCaseContextMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0">
                    <Button
                      type="button"
                      onClick={() => void handleAutoTranslate(field)}
                      disabled={!isAutoTranslateAvailable || isTranslating}
                      className="bg-[#5865f2] text-white hover:bg-[#4752c4] disabled:bg-[#4e5d94] disabled:text-white/70"
                    >
                      {isTranslating ? '번역 중...' : '자동 번역'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {autoTranslateTooltip && (
                  <TooltipContent side="top">
                    {autoTranslateTooltip}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {!isAutoTranslateAvailable && (
          <p className="text-xs text-amber-300">
            자동 번역을 사용하려면 환경설정 &gt; 번역에서 OpenAI API 키를 먼저 저장해주세요.
          </p>
        )}
      </div>
    );
  };

  const toggleCombobox = (fieldId: string) => {
    setOpenComboboxes(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  const getRelationLabel = (record: DataRecord, field: FieldDefinition): string => {
    return getRelationDisplayLabel(record, field, categories, getCategoryRecords);
  };

  const getMainLabel = (record: DataRecord, field: FieldDefinition): string => {
    return getRelationPrimaryLabel(record, field, categories);
  };

  const getSecondaryLabel = (record: DataRecord, field: FieldDefinition): string => {
    return getRelationSecondaryLabel(record, field, categories, getCategoryRecords);
  };

  const findMatchingRelationRecords = (records: DataRecord[], field: FieldDefinition, searchValue: string) => {
    const normalizedSearchValue = searchValue.trim().toLowerCase();
    if (!normalizedSearchValue) {
      return [];
    }

    return records.filter((record) => {
      const primaryLabel = getMainLabel(record, field).trim().toLowerCase();
      const secondaryLabel = getSecondaryLabel(record, field).trim().toLowerCase();
      const displayLabel = getRelationLabel(record, field).trim().toLowerCase();
      return (
        primaryLabel === normalizedSearchValue
        || secondaryLabel === normalizedSearchValue
        || displayLabel === normalizedSearchValue
      );
    });
  };

  const applyFilenameAutofill = async (
    filePath: string,
    fileField: FieldDefinition,
    currentValues: Record<string, unknown>
  ) => {
    if (!fileField.filenamePattern?.trim()) return;

    const mappedFields = Object.values(fileField.filenameTokenFields || {})
      .map((fieldId) => category.fields.find((candidate) => candidate.id === fieldId))
      .filter((candidate): candidate is FieldDefinition => Boolean(candidate));
    const relationCategoryIds = new Set<string>();
    mappedFields.forEach((mappedField) => {
      if (mappedField.type !== 'relation' || !mappedField.relationCategoryId) return;
      relationCategoryIds.add(mappedField.relationCategoryId);

      const relatedCategory = categories.find((candidate) => candidate.id === mappedField.relationCategoryId);
      const subField = relatedCategory?.fields.find((candidate) => (
        candidate.id === mappedField.subDisplayFieldId
        || getTranslatedFieldId(candidate.id) === mappedField.subDisplayFieldId
      ));
      if (subField?.type === 'relation' && subField.relationCategoryId) {
        relationCategoryIds.add(subField.relationCategoryId);
      }
    });
    await Promise.all([...relationCategoryIds].map((categoryId) => loadRecords(categoryId)));

    const filledValues = applyFilenamePatternToFields({
      filePath,
      fileField,
      fields: category.fields,
      currentValues,
      dateFormats: config?.dateParseFormats,
      findRelationMatches: (targetField, tokenValue) => {
        if (!targetField.relationCategoryId) return [];
        return findMatchingRelationRecords(
          useERPStore.getState().getCategoryRecords(targetField.relationCategoryId),
          targetField,
          tokenValue
        );
      },
    });

    Object.entries(filledValues).forEach(([fieldId, value]) => {
      updateFieldValue(fieldId, value);
    });

    if (Object.keys(filledValues).length > 0) {
      toast({
        title: '파일명에서 필드 값을 채웠습니다.',
        description: `${Object.keys(filledValues).length}개 필드에 값을 넣었습니다.`,
      });
    }
  };

  const renderField = (field: FieldDefinition, isFirstField: boolean = false) => {
    const value =
      field.type === 'select' && field.multiple
        ? formData[field.id] ?? []
      : field.type === 'checkbox'
          ? formData[field.id] ?? false
      : field.type === 'percentage'
          ? getEditablePercentageValue(formData[field.id])
          : formData[field.id] ?? '';
    const hasError = !!errors[field.id];
    const hasDuplicateError = !!duplicateErrors[field.id];
    const isTranslating = translatingFieldIds.has(field.id);
    const inputClassName = cn(
      "bg-discord-sidebar border-gray-600 text-discord-text",
      (hasError || hasDuplicateError) && "border-red-500"
    );

    const renderError = () => {
      if (hasError) {
        return <p className="text-red-500 text-sm mt-1">{errors[field.id]}</p>;
      }
      if (hasDuplicateError) {
        return <p className="text-red-500 text-sm mt-1">{duplicateErrors[field.id]}</p>;
      }
      return null;
    };

    switch (field.type) {
      case 'text':
        if (!field.textPrefix && !field.textSuffix) {
          return (
            <div className="space-y-1">
              <TextCaseContextMenu
                value={toDisplayText(value)}
                onValueChange={(next) => updateFieldValue(field.id, normalizeTextFieldInput(field, next))}
                disabled={isTranslating}
              >
                <Input
                  type="text"
                  placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
                  value={toScalarInputValue(value)}
                  onChange={(e) => updateFieldValue(field.id, normalizeTextFieldInput(field, e.target.value))}
                  disabled={isTranslating}
                  className={inputClassName}
                  ref={isFirstField ? firstFieldRef as React.Ref<HTMLInputElement> : undefined}
                />
              </TextCaseContextMenu>
              {renderTranslationInput(field)}
              {renderError()}
            </div>
          );
        }

        return (
          <div className="space-y-1">
            <div className="flex items-stretch overflow-hidden rounded-md border border-gray-600 bg-discord-sidebar">
              {field.textPrefix && (
                <div className="flex items-center px-2 text-discord-muted text-sm whitespace-nowrap leading-none">
                  {field.textPrefix}
                </div>
              )}
              <TextCaseContextMenu
                value={toDisplayText(value)}
                onValueChange={(next) => updateFieldValue(field.id, normalizeTextFieldInput(field, next))}
                disabled={isTranslating}
                className="flex-1"
              >
                <Input
                  type="text"
                  placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
                  value={toScalarInputValue(value)}
                  onChange={(e) => updateFieldValue(field.id, normalizeTextFieldInput(field, e.target.value))}
                  disabled={isTranslating}
                  className={cn(
                    inputClassName,
                    'h-10 border-0 shadow-none rounded-none bg-transparent px-0',
                    'focus-visible:ring-0 focus-visible:ring-offset-0'
                  )}
                  ref={isFirstField ? firstFieldRef as React.Ref<HTMLInputElement> : undefined}
                />
              </TextCaseContextMenu>
              {field.textSuffix && (
                <div className="flex items-center px-2 text-discord-muted text-sm whitespace-nowrap leading-none">
                  {field.textSuffix}
                </div>
              )}
            </div>
            {renderTranslationInput(field)}
            {renderError()}
          </div>
        );

      case 'longtext':
        return (
          <div className="space-y-1">
            <TextCaseContextMenu
              value={toDisplayText(value)}
              onValueChange={(next) => updateFieldValue(field.id, next)}
              disabled={isTranslating}
            >
              <textarea
                placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
                value={toScalarInputValue(value)}
                onChange={(e) => updateFieldValue(field.id, e.target.value)}
                disabled={isTranslating}
                className={cn(
                  "flex w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors",
                  "placeholder:text-gray-500",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "min-h-[100px] resize-y",
                  inputClassName
                )}
                ref={isFirstField ? firstFieldRef as React.Ref<HTMLTextAreaElement> : undefined}
              />
            </TextCaseContextMenu>
            {renderTranslationInput(field)}
            {renderError()}
          </div>
        );

      case 'number':
        return (
          <div className="space-y-1">
            <Input
              type="number"
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
              value={toScalarInputValue(value)}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName}
              ref={isFirstField ? firstFieldRef as React.Ref<HTMLInputElement> : undefined}
            />
            {renderError()}
          </div>
        );

      case 'percentage':
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {(() => {
                const percentage = getEditablePercentageValue(formData[field.id]);
                const currentValue = percentage.value;
                const maxValue = percentage.max;
                const safeCurrent = Math.max(0, Number(currentValue || 0));
                const safeMax = Math.max(0, Number(maxValue || 0));
                const clampedCurrent = clampPercentageValue(safeCurrent, safeMax);
                const percent = safeMax > 0 ? Math.round((clampedCurrent / safeMax) * 100) : 0;

                return (
                  <>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="현재값"
                      value={currentValue}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        const nextCurrent = parseNonNegativeNumberInput(nextValue);
                        const numericMax = Math.max(0, Number(maxValue || 0));
                        updateFieldValue(field.id, {
                          value: numericMax > 0 ? clampPercentageValue(nextCurrent, numericMax) : nextCurrent,
                          max: numericMax
                        });
                      }}
                      onBlur={() => {
                        const numericCurrent = Math.max(0, Number(currentValue || 0));
                        const numericMax = Math.max(0, Number(maxValue || 0));
                        if (numericMax === 0 && numericCurrent > 0) {
                          updateFieldValue(field.id, {
                            value: numericCurrent,
                            max: numericCurrent
                          });
                        }
                      }}
                      className={inputClassName}
                      ref={isFirstField ? firstFieldRef as React.Ref<HTMLInputElement> : undefined}
                    />
                    <span className="text-discord-muted">/</span>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="최대값"
                      value={maxValue}
                      onChange={(e) => {
                        const nextMax = e.target.value;
                        const numericMax = parseNonNegativeNumberInput(nextMax);
                        const numericCurrent = Math.max(0, Number(currentValue || 0));
                        updateFieldValue(field.id, {
                          value: clampPercentageValue(numericCurrent, numericMax),
                          max: numericMax
                        });
                      }}
                      className={inputClassName}
                    />
                    <div className={`min-w-[64px] text-right text-sm ${getPercentageTextClassName(percent)}`}>
                      {`${percent}%`}
                    </div>
                  </>
                );
              })()}
            </div>
            {renderError()}
          </div>
        );

      case 'date':
        return (
          <div className="space-y-1">
            <DatePicker
              value={toDateInputValue(value)}
              onChange={(dateValue) => updateFieldValue(field.id, dateValue)}
              className={inputClassName}
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
            />
            {renderError()}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-1">
            <Button
              variant="outline"
              onClick={() => updateFieldValue(field.id, !value)}
              className={cn(
                "w-full h-10 flex items-center justify-center",
                value 
                  ? "bg-discord-accent hover:bg-blue-600 border-0 text-white" 
                  : "bg-discord-danger hover:bg-red-900 border-0 text-white"
              )}
              ref={isFirstField ? firstFieldRef as React.Ref<HTMLButtonElement> : undefined}
            >
              {value ? (
                <Check className="w-6 h-6" />
              ) : (
                <X className="w-6 h-6" />
              )}
            </Button>
            {renderError()}
          </div>
        );

      case 'select':
        if (field.multiple) {
          return (
            <div className="space-y-2 w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    <span className="truncate flex-1 text-left">
                      {Array.isArray(value) && value.length > 0
                        ? `${value.length}개 선택됨`
                        : `${field.name} 선택...`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValues = pastedText.split(',').map(v => v.trim()).filter(v => v);
                        
                        // 기존 옵션에 있는 값들 찾기
                        const validOptions = field.options?.filter(opt => 
                          pastedValues.some(v => opt.toLowerCase() === v.toLowerCase())
                        ) || [];
                        
                        if (validOptions.length > 0) {
                          const currentValues = Array.isArray(value) ? value : [];
                          const newValues = [...new Set([...currentValues, ...validOptions])];
                          updateFieldValue(field.id, newValues);
                          
                          // 유효하지 않은 값이 있었다면 상세한 알림
                          const invalidValues = pastedValues.filter(v => 
                            !field.options?.some(opt => opt.toLowerCase() === v.toLowerCase())
                          );
                          if (invalidValues.length > 0) {
                            toast({
                              title: "일부 값이 무시됨",
                              description: `다음 값들이 유효하지 않아 제외되었습니다: ${invalidValues.join(', ')}`,
                              variant: "destructive",
                            });
                          } else {
                            toast({
                              title: "값이 추가됨",
                              description: `${validOptions.length}개의 값이 추가되었습니다.`,
                            });
                          }
                        } else {
                          toast({
                            title: "유효하지 않은 값",
                            description: `붙여넣은 모든 값이 유효하지 않습니다: ${pastedValues.join(', ')}`,
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateFieldValue(field.id, '');
                            toggleCombobox(field.id);
                          }}
                          className="text-discord-text hover:bg-discord-hover"
                        >
                          선택 해제
                        </CommandItem>
                        {field.options?.map((option) => (
                          <CommandItem
                            key={option}
                            value={option}
                            onSelect={() => {
                              const currentValues = Array.isArray(value) ? value : [];
                              if (currentValues.includes(option)) {
                                updateFieldValue(field.id, currentValues.filter(v => v !== option));
                              } else {
                                updateFieldValue(field.id, [...currentValues, option]);
                              }
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                Array.isArray(value) && value.includes(option) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {option}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {Array.isArray(value) && value.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {value.map((item) => (
                    <div
                      key={item}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded hover:bg-blue-600/30"
                    >
                      <span className="max-w-[150px] truncate">{item}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = value.filter((v) => v !== item);
                          updateFieldValue(field.id, newValue);
                        }}
                        className="text-blue-400 hover:text-blue-300 shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        } else {
          return (
            <div className="w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    {toDisplayText(value) || `${field.name} 선택`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValue = pastedText.trim();
                        
                        // 기존 옵션에 있는 값인지 확인
                        const matchingOption = field.options?.find(opt => 
                          opt.toLowerCase() === pastedValue.toLowerCase()
                        );
                        
                        if (matchingOption) {
                          updateFieldValue(field.id, matchingOption);
                          toggleCombobox(field.id);
                          toast({
                            title: "값이 선택됨",
                            description: `"${matchingOption}"이 선택되었습니다.`,
                          });
                        } else {
                          toast({
                            title: "유효하지 않은 값",
                            description: `"${pastedValue}"는 유효한 옵션이 아닙니다.`,
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                    <CommandList className="text-discord-text">
                      <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateFieldValue(field.id, '');
                            toggleCombobox(field.id);
                          }}
                          className="text-discord-text hover:bg-discord-hover"
                        >
                          선택 해제
                        </CommandItem>
                        {field.options?.map((option) => (
                          <CommandItem
                            key={option}
                            value={option}
                            onSelect={() => {
                              updateFieldValue(field.id, option);
                              toggleCombobox(field.id);
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value === option ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {option}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          );
        }

      case 'relation': {
        if (!field.relationCategoryId) return null;
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return null;
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = field.displayFieldId
          ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
          : relatedCategory.fields[0];
        const subDisplayField = field.subDisplayFieldId
          ? relatedCategory.fields.find(f => f.id === field.subDisplayFieldId)
          : undefined;

        if (field.multiple) {
          return (
            <div className="space-y-2 w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    <span className="truncate flex-1 text-left">
                      {Array.isArray(value) && value.length > 0
                        ? `${value.length}개 선택됨`
                        : `${field.name} 선택...`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValues = pastedText.split(',').map(v => v.trim()).filter(v => v);
                        
                        // 붙여넣기(다중)
                        const ambiguousMatches: { value: string, records: DataRecord[] }[] = [];
                        const validRecords: DataRecord[] = [];
                        const invalidValues: string[] = [];
                        
                        pastedValues.forEach(v => {
                          const matches = findMatchingRelationRecords(relatedRecords, field, v);
                          if (matches.length === 1) {
                            validRecords.push(matches[0]);
                          } else if (matches.length > 1) {
                            ambiguousMatches.push({ value: v, records: matches });
                          } else {
                            // 일치하는 항목이 없는 경우
                            invalidValues.push(v);
                          }
                        });
                        
                        // 유효하지 않은 값이 있는 경우 토스트 메시지 표시
                        if (invalidValues.length > 0) {
                          toast({
                            title: "유효하지 않은 값",
                            description: `"${invalidValues.join(', ')}"는 유효한 항목이 아닙니다.`,
                            variant: "destructive",
                          });
                        }
                        
                        if (ambiguousMatches.length > 0) {
                          setAmbiguousDialogOpen(true);
                          setAmbiguousOptions(ambiguousMatches);
                          setPendingAmbiguousField(field);
                          // 현재 값과 이미 처리된 validRecords를 모두 포함
                          const currentValues = Array.isArray(value) ? value : [];
                          setPendingAmbiguousCurrentValues([...currentValues, ...validRecords.map(r => r.id)]);
                        } else if (validRecords.length > 0) {
                          updateFieldValue(field.id, [...new Set([...Array.isArray(value) ? value : [], ...validRecords.map(r => r.id)])]);
                        }
                      }}
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {relatedRecords.map((record) => (
                          <CommandItem
                            key={record.id}
                            value={getRelationLabel(record, field)}
                            onSelect={() => {
                              const currentValues = Array.isArray(value) ? value : [];
                              if (currentValues.includes(record.id)) {
                                updateFieldValue(field.id, currentValues.filter(v => v !== record.id));
                              } else {
                                updateFieldValue(field.id, [...currentValues, record.id]);
                              }
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                Array.isArray(value) && value.includes(record.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {getRelationLabel(record, field)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {Array.isArray(value) && value.length > 0 && (
                <TooltipProvider>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {value.map((recordId) => {
                      const record = relatedRecords.find(r => r.id === recordId);
                      if (!record) return null;
                      return (
                        <Tooltip key={recordId}>
                          <TooltipTrigger asChild>
                            <div
                              className="inline-flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-500 text-xs rounded hover:bg-green-600/30"
                            >
                              <span className="max-w-[150px] truncate cursor-pointer">{getRelationLabel(record, field)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newValue = value.filter((v) => v !== recordId);
                                  updateFieldValue(field.id, newValue);
                                }}
                                className="text-green-500 hover:text-green-400 shrink-0"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            align="center"
                            className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5"
                          >
                            {getRelationLabel(record, field)}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              )}
            </div>
          );
        } else {
          return (
            <div className="w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    {value ? (() => {
                      const selectedId = toDisplayText(value);
                      const selectedRecord = relatedRecords.find(r => r.id === selectedId);
                      return selectedRecord ? getRelationLabel(selectedRecord, field) : selectedId;
                    })() : `${field.name} 선택`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValue = pastedText.trim();
                        
                        // 기존 레코드에서 일치하는 값 찾기
                        const matchingRecords = findMatchingRelationRecords(relatedRecords, field, pastedValue);
                        
                        if (matchingRecords.length === 1) {
                          // 단일 일치: 바로 선택
                          updateFieldValue(field.id, matchingRecords[0].id);
                          toggleCombobox(field.id);
                          toast({
                            title: "값이 선택됨",
                            description: `"${getRelationLabel(matchingRecords[0], field)}"이 선택되었습니다.`,
                          });
                        } else if (matchingRecords.length > 1) {
                          // 다중 일치: 선택 모달 띄우기
                          setAmbiguousDialogOpen(true);
                          setAmbiguousOptions([{ value: pastedValue, records: matchingRecords }]);
                          setPendingAmbiguousField(field);
                          setPendingAmbiguousCurrentValues([]);
                        } else {
                          // 일치하는 항목 없음
                          toast({
                            title: "유효하지 않은 값",
                            description: `"${pastedValue}"는 유효한 항목이 아닙니다.`,
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                    <CommandList className="text-discord-text">
                      <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateFieldValue(field.id, '');
                            toggleCombobox(field.id);
                          }}
                          className="text-discord-text hover:bg-discord-hover"
                        >
                          선택 해제
                        </CommandItem>
                        {relatedRecords.map((record) => (
                          <CommandItem
                            key={record.id}
                            value={getRelationLabel(record, field)}
                            onSelect={() => {
                              updateFieldValue(field.id, record.id);
                              toggleCombobox(field.id);
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value === record.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {getRelationLabel(record, field)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          );
        }
        break;
      }

      case 'file': {
        const getFileDialogDefaultPath = () => {
          if (field.thumbnailOnly) {
            return typeof value === 'string' && value.trim() ? value : undefined;
          }

          if (field.pathMode === 'base') {
            return field.basePath?.trim() || undefined;
          }

          return typeof value === 'string' && value.trim() ? value : undefined;
        };

        return (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="파일 경로를 입력하거나 파일 선택 버튼을 클릭하세요"
              value={toScalarInputValue(value)}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName + ' flex-1'}
              readOnly
            />
            <Button
              type="button"
              onClick={async () => {
                try {
                  const defaultPath = getFileDialogDefaultPath();
                  const result = field.thumbnailOnly
                    ? await window.electronAPI.openImageFileDialog(defaultPath)
                    : await window.electronAPI.openFileDialog(defaultPath);
                  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                    return;
                  }
                  
                  const selectedPath = result.filePaths[0];
                  
                  // 절대 경로를 상대 경로로 변환
                  // 앱 루트 디렉토리를 기준으로 상대 경로 계산
                  const appRoot = await window.electronAPI.getAppRoot();
                  let relativePath = selectedPath;
                  
                  // 앱 루트 디렉토리 내부의 파일인 경우 상대 경로로 변환
                  if (selectedPath.startsWith(appRoot)) {
                    relativePath = selectedPath.substring(appRoot.length + 1); // +1 for path separator
                  }
                  
                  updateFieldValue(field.id, relativePath);
                  void applyFilenameAutofill(relativePath, field, { ...formData, [field.id]: relativePath });
                } catch (error) {
                  console.error('파일 선택 중 오류:', error);
                  showAlert('오류', '파일 선택 중 오류가 발생했습니다.', 'error');
                }
              }}
              className="bg-discord-accent hover:bg-blue-600"
            >
              파일 선택
            </Button>
            {renderError()}
          </div>
        );
      }

      default:
        return null;
    }
  };

  const isSubmitDisabled = Object.keys(errors).length > 0 || 
                          Object.keys(duplicateErrors).length > 0 || 
                          isValidating ||
                          isDuplicateChecking ||
                          pendingDuplicateChecks.size > 0 ||
                          translatingFieldIds.size > 0 ||
                          (canEditRelatedRecords && !relatedRecordsLoaded);

  // 카테고리 경로 구하기 (ViewRecordModal 참고)
  const getParentPath = useCallback((currentCategory: Category): Category[] => {
    const path: Category[] = [];
    let parent = currentCategory.parentId ? categories.find(c => c.id === currentCategory.parentId) : null;
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    return path;
  }, [categories]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    selectCategory(categoryId);
    onClose();
  }, [selectCategory, onClose]);

  // formData가 준비되지 않았으면 렌더링하지 않기
  if (isOpen && (!formData || Object.keys(formData).length === 0)) return null;

  return (
    <>
      <AnimatedModal isOpen={isOpen} contentClassName="bg-discord-bg rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-end">
            <h2 className="text-xl font-bold text-discord-text">
              {record ? '항목 수정' : '새 항목 등록'}
            </h2>
            <span className="ml-2 text-sm text-discord-muted flex items-center">
              (
              {(() => {
                const parentPath = getParentPath(category);
                return (
                  <>
                    {parentPath.map((cat, idx) => (
                      <React.Fragment key={cat.id}>
                        <button
                          onClick={() => handleCategoryClick(cat.id)}
                          className="hover:text-discord-text hover:underline"
                        >
                          {cat.name}
                        </button>
                        <ChevronRight size={14} className="mx-1 text-discord-muted" />
                      </React.Fragment>
                    ))}
                    <span className="text-discord-muted font-semibold">{category.name}</span>
                  </>
                );
              })()}
              )
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {(category?.fields ?? []).sort((a, b) => a.order - b.order).map((field, index) => (
              <div key={field.id} className="space-y-2">
                <Label className="text-sm font-medium text-discord-text">
                  {field.name}
                  {hasTextAffixes(field) && (
                    <span className="text-gray-400 ml-2 text-xs">
                      {formatFieldDisplayValue(field, '예시값')}
                    </span>
                  )}
                  {field.type !== 'percentage' && field.required && <span className="text-red-500 ml-1">*</span>}
                  {field.type !== 'percentage' && field.unique && <span className="text-gray-400 ml-1 text-xs">(중복 불가)</span>}
                </Label>
                {renderField(field, index === 0)}
              </div>
            ))}
            {(!category || (category?.fields?.length === 0)) && (
              <div className="text-discord-muted text-center py-8">
                카테고리를 먼저 선택하거나, 필드가 정의된 카테고리를 선택하세요.
              </div>
            )}
            {canEditRelatedRecords && (
              <RelatedRecordsEditor
                key={isOpen ? (record?.id ?? 'new') : 'closed'}
                sourceRecordId={record?.id}
                value={relatedRecordIds}
                onChange={setRelatedRecordIds}
              />
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-discord-text hover:bg-discord-hover"
          >
            취소
          </Button>
          <Button 
            onClick={handleSubmit}
            className="bg-discord-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitDisabled}
          >
            {isValidating ? '검증 중...' : 
             isDuplicateChecking ? '중복 체크 중...' : 
             record ? '수정' : '추가'}
          </Button>
        </div>
      </AnimatedModal>
      
      {/* 커스텀 알럿 다이얼로그 */}
      <AlertDialog
        isOpen={isAlertDialogOpen}
        onClose={() => setIsAlertDialogOpen(false)}
        title={alertDialogProps.title}
        message={alertDialogProps.message}
        variant={alertDialogProps.variant}
      />

      {/* 중복 항목 선택 모달 */}
      {ambiguousDialogOpen && (
        <AnimatedModal isOpen={ambiguousDialogOpen} contentClassName="bg-discord-bg rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-discord-text">
                  중복된 항목 선택
                </h2>
                <p className="text-discord-muted text-sm mt-1">
                  붙여넣은 값 중 동일한 이름을 가진 항목이 여러 개 있습니다. 원하는 항목을 선택해 주세요.
                </p>
              </div>
              <button
                onClick={() => {
                  setAmbiguousDialogOpen(false);
                  setAmbiguousOptions([]);
                  setPendingAmbiguousField(null);
                  setPendingAmbiguousCurrentValues([]);
                }}
                className="text-discord-muted hover:text-discord-text"
              >
                <X size={24} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {ambiguousOptions.map((option, idx) => (
                  <div key={option.value} className="space-y-3">
                    <div className="font-semibold text-discord-text text-lg border-b border-gray-700 pb-2">
                      {option.value}:
                    </div>
                    <div className="grid gap-2">
                      {option.records.map(record => (
                        <Button
                          key={record.id}
                          variant="outline"
                          onClick={() => {
                            if (pendingAmbiguousField?.multiple) {
                              // 선택한 값을 누적만 함
                              const newValues = [...new Set([...pendingAmbiguousCurrentValues, record.id])];
                              setPendingAmbiguousCurrentValues(newValues);
                              // 다음 ambiguous로 넘어가거나, 모두 끝나면 한 번만 updateFieldValue 호출
                              const nextOptions = ambiguousOptions.filter((_, i) => i !== idx);
                              if (nextOptions.length > 0) {
                                setAmbiguousOptions(nextOptions);
                              } else {
                                updateFieldValue(pendingAmbiguousField.id, newValues);
                                setAmbiguousDialogOpen(false);
                                setAmbiguousOptions([]);
                                setPendingAmbiguousField(null);
                                setPendingAmbiguousCurrentValues([]);
                              }
                            } else {
                              // 단일: id만 저장
                              updateFieldValue(
                                pendingAmbiguousField.id,
                                record.id
                              );
                              setAmbiguousDialogOpen(false);
                              setAmbiguousOptions([]);
                              setPendingAmbiguousField(null);
                              setPendingAmbiguousCurrentValues([]);
                            }
                          }}
                          className="justify-start text-left h-auto p-4 bg-discord-dark hover:bg-discord-hover border-gray-600 text-discord-text"
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{getRelationLabel(record, pendingAmbiguousField!)}</span>
                            <span className="text-sm text-discord-muted mt-1">
                              ID: {record.id}
                            </span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center justify-end gap-3 p-6 border-t border-gray-700">
              <Button 
                variant="ghost" 
                onClick={() => {
                  setAmbiguousDialogOpen(false);
                  setAmbiguousOptions([]);
                  setPendingAmbiguousField(null);
                  setPendingAmbiguousCurrentValues([]);
                }}
                className="text-discord-text hover:bg-discord-hover"
              >
                취소
              </Button>
            </div>
          </AnimatedModal>
      )}
    </>
  );
};
