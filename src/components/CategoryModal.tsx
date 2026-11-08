import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, GripVertical, Plus, Trash2, ChevronDown, ChevronUp, Check, ChevronsUpDown } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useERPStore } from '../hooks/useERPStore';
import { Category, Config, FieldDefinition, NewCategory } from '../types';
import { isSeparatorCategory } from '../lib/category';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { Checkbox } from './ui/checkbox';
import { toast } from './ui/use-toast';
import { Switch } from './ui/switch';
import { TagInput } from './ui/tag-input';
import { AnimatedModal } from './ui/animated-modal';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { extractFilenameTokens } from '../lib/filenamePattern';
import { getTranslatedFieldId, isTranslationEnabledField } from '../lib/translation';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category | null;
}

const normalizeCategoryField = (field: FieldDefinition): FieldDefinition => {
  if (field.type !== 'percentage') return field;
  return { ...field, required: false, unique: false };
};

const stripTextAffixes = (value: unknown, prefix?: string, suffix?: string) => {
  if (typeof value !== 'string') return value;

  let nextValue = value;
  if (prefix && nextValue.startsWith(prefix)) {
    nextValue = nextValue.slice(prefix.length);
  }
  if (suffix && nextValue.endsWith(suffix)) {
    nextValue = nextValue.slice(0, -suffix.length);
  }
  return nextValue;
};

const FIELD_TYPE_LABELS: Record<FieldDefinition['type'], string> = {
  text: '텍스트',
  longtext: '긴 텍스트',
  number: '숫자',
  percentage: '퍼센트',
  date: '날짜',
  select: '선택',
  relation: '관계형',
  file: '파일',
  checkbox: '체크박스',
};

const getFilenameTargetFieldLabel = (field: FieldDefinition, categoryList: Category[]) => {
  const typeLabel = FIELD_TYPE_LABELS[field.type];
  const name = field.name || '이름 없는 필드';
  if (field.type !== 'relation') {
    return `${name} (${typeLabel})`;
  }

  const relatedName = categoryList.find((category) => category.id === field.relationCategoryId)?.name;
  return relatedName ? `${name} (${typeLabel} · ${relatedName})` : `${name} (${typeLabel})`;
};

const getRelationSubLabelOptions = (relatedCategory: Category, displayFieldId?: string) => (
  relatedCategory.fields
    .filter((field) => field.type !== 'file')
    .flatMap((field) => {
      const options: { value: string; label: string }[] = [];

      if (field.id !== displayFieldId) {
        options.push({ value: field.id, label: field.name });
      }

      if (isTranslationEnabledField(field)) {
        options.push({
          value: getTranslatedFieldId(field.id),
          label: `${field.name} 번역`,
        });
      }

      return options;
    })
);

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { categories, addCategory, updateCategory, getCategoryRecords, loadRecords } = useERPStore();
  const { showLoading, hideLoading } = useLoadingStore();
  const [formData, setFormData] = useState({
    name: '',
    parentId: undefined as string | undefined,
    memo: '',
    fields: [] as FieldDefinition[],
  });
  const [initialFormData, setInitialFormData] = useState(formData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isMigratingAffixes, setIsMigratingAffixes] = useState(false);
  const [migratedAffixCount, setMigratedAffixCount] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedTextDecorations, setExpandedTextDecorations] = useState<Record<string, boolean>>({});
  const [expandedFilenameParse, setExpandedFilenameParse] = useState<Record<string, boolean>>({});
  const [openRelationCategoryId, setOpenRelationCategoryId] = useState<string | null>(null);
  const [openFilenameTokenFieldId, setOpenFilenameTokenFieldId] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  
  // 카테고리 이름 입력 필드 ref
  const categoryNameRef = useRef<HTMLInputElement>(null);

  // ESC 키로 모달 닫기
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

  // 모달이 열릴 때 첫 번째 필드에 포커스
  useEffect(() => {
    if (isOpen && categoryNameRef.current) {
      // 약간의 지연을 두어 모달이 완전히 렌더링된 후 포커스
      setTimeout(() => {
        categoryNameRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

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
        console.error('Failed to load config in CategoryModal:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // 카테고리가 변경될 때마다 레코드 로드
  useEffect(() => {
    if (category) {
      loadRecords(category.id);
    }
  }, [category, loadRecords]);

  useEffect(() => {
    if (category) {
      const categoryData = {
        name: category.name,
        parentId: category.parentId,
        memo: category.memo || '',
        fields: category.fields.map(normalizeCategoryField),
      };
      setFormData(JSON.parse(JSON.stringify(categoryData)));
      setInitialFormData(JSON.parse(JSON.stringify(categoryData)));
    } else {
      const initialData = {
        name: '',
        parentId: undefined,
        memo: '',
        fields: [],
      };
      setFormData(initialData);
      setInitialFormData(initialData);
    }
    setErrors({});
    setDuplicateErrors({});
    setIsDirty(false);
    setIsMigratingAffixes(false);
    setMigratedAffixCount(0);
    setExpandedTextDecorations({});
    setExpandedFilenameParse({});
    setOpenRelationCategoryId(null);
    setOpenFilenameTokenFieldId(null);
  }, [category, isOpen]);

  // formData가 변경될 때마다 isDirty 상태 업데이트
  useEffect(() => {
    if (isOpen) {
      const dirty = JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsDirty(dirty);
    }
  }, [formData, initialFormData, isOpen]);

  const checkDuplicateValues = useCallback(async () => {
    if (!category) return true;

    try {
      const records = getCategoryRecords(category.id);
      const newDuplicateErrors: Record<string, string> = {};

      formData.fields.forEach(field => {
        if (field.unique && field.type !== 'percentage') {
          const values = records.map(record => record.data[field.id]);
          const duplicates = values.filter((value, index) => 
            values.indexOf(value) !== index && value !== undefined && value !== null && value !== ''
          );

          if (duplicates.length > 0) {
            newDuplicateErrors[field.id] = `중복된 값이 존재합니다: ${duplicates.join(', ')}`;
          }
        }
      });

      setDuplicateErrors(newDuplicateErrors);
      return Object.keys(newDuplicateErrors).length === 0;
    } catch (error) {
      toast({
        title: '중복 값 확인에 실패했습니다.',
        variant: 'destructive',
      });
      return false;
    }
  }, [category, formData.fields, getCategoryRecords]);

  // unique 속성이 변경될 때마다 중복 체크 실행
  useEffect(() => {
    if (category && formData.fields.some(field => field.unique)) {
      void checkDuplicateValues();
    }
  }, [category, checkDuplicateValues, formData.fields]);

  const validateForm = async () => {
    const newErrors: Record<string, string> = {};

    // 카테고리 이름 검사
    if (!formData.name.trim()) {
      newErrors.name = '카테고리 이름을 입력하세요.';
    }

    // 필드 개수 검사
    if (formData.fields.length === 0) {
      newErrors.fields = '최소 1개의 필드가 필요합니다.';
    }

    // 필드 이름 및 관계형 필드 검사
    formData.fields.forEach((field, index) => {
      if (!field.name.trim()) {
        newErrors[`field_${index}_name`] = '필드명을 입력하세요.';
      }
      if (field.type === 'relation' && !field.relationCategoryId) {
        newErrors[`field_${index}_relation`] = '관계 카테고리를 선택해야 합니다.';
      }
      if (field.type === 'relation' && field.relationCategoryId && !field.displayFieldId) {
        newErrors[`field_${index}_displayField`] = '라벨 필드를 선택해야 합니다.';
      }
    });

    setErrors(newErrors);

    // 중복 체크
    const duplicatesValid = await checkDuplicateValues();
    
    const finalValidationResult = Object.keys(newErrors).length === 0 && duplicatesValid;
    return finalValidationResult;
  };

  const migrateTextAffixValues = async (nextFields: FieldDefinition[]) => {
    if (!category) return 0;

    const previousFieldsById = new Map(initialFormData.fields.map((field) => [field.id, field]));
    const fieldsToMigrate = nextFields.filter((field) => {
      if (field.type !== 'text') return false;
      const previousField = previousFieldsById.get(field.id);
      if (!previousField) return false;

      const prefixChanged = (field.textPrefix || '') !== (previousField.textPrefix || '');
      const suffixChanged = (field.textSuffix || '') !== (previousField.textSuffix || '');
      return (prefixChanged || suffixChanged) && Boolean(field.textPrefix || field.textSuffix);
    });

    if (fieldsToMigrate.length === 0) return 0;

    const records = getCategoryRecords(category.id);
    let migratedCount = 0;

    for (const record of records) {
      const nextData = { ...record.data };
      let didChange = false;

      fieldsToMigrate.forEach((field) => {
        const currentValue = nextData[field.id];
        const nextValue = stripTextAffixes(currentValue, field.textPrefix, field.textSuffix);
        if (nextValue !== currentValue) {
          nextData[field.id] = nextValue;
          didChange = true;
        }
      });

      if (didChange) {
        migratedCount += 1;
        setMigratedAffixCount(migratedCount);
        await window.electronAPI.updateRecord(record.id, nextData);
      }
    }

    if (migratedCount > 0) {
      await loadRecords(category.id);
    }

    return migratedCount;
  };

  const handleSubmit = async () => {
    if (!isDirty) {
      onClose();
      return;
    }
    
    if (isValidating || isMigratingAffixes) return;
    
    const isValid = await validateForm();
    if (!isValid) return;

    try {
      setIsMigratingAffixes(true);
      setMigratedAffixCount(0);
      const normalizedFields = formData.fields.map(normalizeCategoryField);
      if (category) {
        await migrateTextAffixValues(normalizedFields);
        showLoading('카테고리 썸네일 경로를 정리하는 중...');
        await updateCategory(category.id, {
          name: formData.name,
          parentId: formData.parentId,
          memo: formData.memo.trim(),
          fields: normalizedFields,
        });
      } else {
        const now = new Date().toISOString();
        const newCategory: NewCategory = {
          name: formData.name,
          itemType: 'category',
          memo: formData.memo.trim(),
          parentId: formData.parentId,
          fields: normalizedFields,
          order: categories.length,
          createdAt: now,
          updatedAt: now,
        };
        await addCategory(newCategory);
      }

      onClose();
    } catch (error) {
      toast({
        title: '카테고리 저장 중 오류가 발생했습니다.',
        description: error instanceof Error ? error.message : '카테고리 정보를 확인한 뒤 다시 시도해 주세요.',
        variant: 'destructive',
      });
    } finally {
      hideLoading();
      setIsMigratingAffixes(false);
    }
  };

  const addField = () => {
    const newField: FieldDefinition = {
      id: Math.random().toString(36).substring(2),
      name: '',
      type: 'text', // 기본값으로 text 타입 설정
      required: false,
      unique: false,
      order: formData.fields.length,
      enableTranslation: false,
      textPrefix: '',
      textSuffix: '',
      pathMode: 'direct',
      basePath: '',
      thumbnailOnly: false,
    };
    setFormData(prev => {
      const updated = { ...prev, fields: [...prev.fields, newField] };
      setTimeout(() => { validateForm(); }, 0);
      return updated;
    });
  };

  const removeField = (index: number) => {
    const newFields = formData.fields.filter((_, i) => i !== index);
    setFormData(prev => {
      const updated = { ...prev, fields: newFields };
      setTimeout(() => { validateForm(); }, 0);
      return updated;
    });
  };

  const updateField = (index: number, updates: Partial<FieldDefinition>) => {
    if (updates.type === 'file' && formData.fields.some((f, i) => f.type === 'file' && i !== index)) {
      toast({ title: '파일 필드는 한 개만 추가할 수 있습니다.', variant: 'destructive' });
      return;
    }
    const newFields = [...formData.fields];
    newFields[index] = { ...newFields[index], ...updates };
    if (updates.type === 'percentage') {
      newFields[index] = { ...newFields[index], required: false, unique: false };
    }
    if (updates.type && updates.type !== 'text' && updates.type !== 'longtext') {
      newFields[index] = { ...newFields[index], enableTranslation: false };
    }
    if (updates.type === 'file' && !newFields[index].pathMode) {
      newFields[index] = { ...newFields[index], pathMode: 'direct', basePath: '', thumbnailOnly: false };
    }
    if (updates.type && updates.type !== 'file') {
      newFields[index] = { ...newFields[index], filenamePattern: '', filenameTokenFields: {} };
    }
    if (updates.thumbnailOnly === true) {
      newFields[index] = { ...newFields[index], thumbnailOnly: true, pathMode: 'direct', basePath: '' };
    }
    setFormData(prev => ({ ...prev, fields: newFields }));
    
    // Clear field name error when user starts typing
    if (updates.name && errors[`field_${index}_name`]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`field_${index}_name`];
        return newErrors;
      });
    }
  };

  const moveField = (dragIndex: number, hoverIndex: number) => {
    const newFields = [...formData.fields];
    const draggedField = newFields[dragIndex];
    newFields.splice(dragIndex, 1);
    newFields.splice(hoverIndex, 0, draggedField);

    // Update order
    const reorderedFields = newFields.map((field, index) => ({
      ...field,
      order: index,
    }));

    setFormData(prev => ({ ...prev, fields: reorderedFields }));
  };

  const handleFieldDragEnd = (result: any) => {
    if (!result.destination) return;
    moveField(result.source.index, result.destination.index);
  };

  const toggleTextDecorationSection = (fieldId: string) => {
    setExpandedTextDecorations(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  };

  const toggleFilenameParseSection = (fieldId: string) => {
    setExpandedFilenameParse(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
  };

  const updateFilenamePattern = (index: number, pattern: string) => {
    const tokens = extractFilenameTokens(pattern);
    const currentMappings = formData.fields[index].filenameTokenFields || {};
    const nextMappings = Object.fromEntries(
      tokens
        .filter((token) => currentMappings[token])
        .map((token) => [token, currentMappings[token]])
    );
    updateField(index, { filenamePattern: pattern, filenameTokenFields: nextMappings });
  };

  // 카테고리 경로 구하는 함수
  const getCategoryPath = (cat: Category): string[] => {
    const path: string[] = [cat.name];
    let parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null;
    while (parent) {
      path.unshift(parent.name);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    return path;
  };

  return (
    <AnimatedModal isOpen={isOpen} contentClassName="bg-discord-bg rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">
            {category ? '카테고리 수정' : '새 카테고리 생성'}
          </h2>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
          <div className="space-y-6">
            {/* Category Name */}
            <div>
              <Label className="text-discord-text font-medium">
                카테고리 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="카테고리 이름 (필수)"
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                  if (errors.name) {
                    setErrors(prev => {
                      const newErrors = { ...prev };
                      delete newErrors.name;
                      return newErrors;
                    });
                  }
                }}
                className={`mt-2 bg-discord-sidebar border-gray-600 text-discord-text ${
                  errors.name ? 'border-red-500' : ''
                }`}
                ref={categoryNameRef}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            {/* Parent Category */}
            <div>
              <Label className="text-discord-text font-medium">상위 카테고리</Label>
              <Select
                value={formData.parentId || 'none'}
                onValueChange={(value) => {
                  setFormData(prev => ({ 
                    ...prev, 
                    parentId: value === 'none' ? undefined : value 
                  }));
                }}
              >
                <SelectTrigger className="mt-2 bg-discord-sidebar border-gray-600 text-gray-200">
                  <SelectValue placeholder="상위 카테고리 선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value="none">없음 (최상위 카테고리)</SelectItem>
                  {categories
                    .filter(cat => !cat.parentId && cat.id !== category?.id && !isSeparatorCategory(cat))
                    .map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-discord-text font-medium">메모</Label>
              <Textarea
                value={formData.memo}
                onChange={(e) => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                className="mt-2 min-h-[88px] bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
                placeholder="카테고리 메모를 입력하세요 (선택사항)"
              />
            </div>

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-discord-text font-medium">필드 설정</Label>
                <Button
                  type="button"
                  onClick={addField}
                  size="sm"
                  className="bg-discord-accent hover:bg-blue-600"
                >
                  <Plus size={16} className="mr-1" />
                  필드 추가
                </Button>
              </div>

              {errors.fields && (
                <p className="text-red-500 text-sm mb-4">{errors.fields}</p>
              )}

              <DragDropContext onDragEnd={handleFieldDragEnd}>
                <Droppable droppableId="fields">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {formData.fields.length === 0 ? (
                        <div className="text-center py-8 text-discord-muted border-2 border-dashed border-gray-600 rounded-lg">
                          <p className="text-sm">필드를 추가해주세요</p>
                          <p className="text-xs mt-1">최소 1개의 필드가 필요합니다</p>
                        </div>
                      ) : (
                        formData.fields.map((field, index) => (
                          <Draggable key={field.id} draggableId={field.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className="bg-discord-sidebar border border-gray-600 rounded-lg p-4"
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="flex items-center gap-3">
                                    <div {...provided.dragHandleProps} className="cursor-grab">
                                      <GripVertical size={20} className="text-gray-500" />
                                    </div>
                                    <div className="flex-1 relative">
                                      <Input
                                        value={field.name}
                                        onChange={(e) => updateField(index, { name: e.target.value })}
                                        className="w-full bg-[#2b2d31] border-gray-600 text-gray-200"
                                        placeholder="필드명을 입력하세요"
                                      />
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeField(index)}
                                      className="h-9 w-9 text-red-400 hover:bg-red-500/10"
                                    >
                                      <Trash2 size={16} />
                                    </Button>
                                  </div>

                                  <div className="space-y-4">
                                    <div>
                                      <Label className="text-sm text-gray-400 mb-2 block">필드 타입</Label>
                                      <div className="flex items-center gap-3">
                                        <Select
                                          value={field.type}
                                          onValueChange={(value) => updateField(index, { type: value as FieldDefinition['type'] })}
                                        >
                                          <SelectTrigger className="w-[200px] bg-[#2b2d31] border-gray-600 text-gray-200">
                                            <SelectValue placeholder="필드 타입" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-[#2b2d31] border-gray-600">
                                            <SelectItem value="text">텍스트</SelectItem>
                                            <SelectItem value="longtext">긴 텍스트</SelectItem>
                                            <SelectItem value="number">숫자</SelectItem>
                                            <SelectItem value="percentage">백분율</SelectItem>
                                            <SelectItem value="date">날짜</SelectItem>
                                            <SelectItem value="select">선택 목록</SelectItem>
                                            <SelectItem value="checkbox">체크박스</SelectItem>
                                            <SelectItem value="relation">관계형</SelectItem>
                                            <SelectItem value="file" disabled={formData.fields.some((f, i) => f.type === 'file' && i !== index)}>파일</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <div className="flex items-center gap-4 ml-auto">
                                          {field.type !== 'percentage' && (
                                            <>
                                              <div className="flex items-center gap-2">
                                                <Checkbox
                                                  id={`required-${field.id}`}
                                                  checked={field.required}
                                                  onCheckedChange={(checked) => updateField(index, { required: checked as boolean })}
                                                />
                                                <label htmlFor={`required-${field.id}`} className="text-sm text-gray-300">
                                                  필수값
                                                </label>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Checkbox
                                                  id={`unique-${field.id}`}
                                                  checked={field.unique}
                                                  onCheckedChange={(checked) => updateField(index, { unique: checked as boolean })}
                                                />
                                                <label htmlFor={`unique-${field.id}`} className="text-sm text-gray-300">
                                                  중복 불가
                                                </label>
                                              </div>
                                            </>
                                          )}
                                          <div className="flex items-center gap-2">
                                            <Checkbox
                                              id={`hidden-${field.id}`}
                                              checked={field.hidden}
                                              onCheckedChange={(checked) => updateField(index, { hidden: checked as boolean })}
                                            />
                                            <label htmlFor={`hidden-${field.id}`} className="text-sm text-gray-300">
                                              미노출(리스트 숨김)
                                            </label>
                                          </div>
                                          {field.type === 'file' && (
                                            <div className="flex items-center gap-2">
                                              <Checkbox
                                                id={`thumbnail-only-${field.id}`}
                                                checked={field.thumbnailOnly}
                                                onCheckedChange={(checked) => updateField(index, { thumbnailOnly: checked as boolean })}
                                              />
                                              <label htmlFor={`thumbnail-only-${field.id}`} className="text-sm text-gray-300">
                                                썸네일 전용
                                              </label>
                                            </div>
                                          )}
                                          {(field.type === 'select' || field.type === 'relation') && (
                                            <div className="flex items-center gap-2">
                                              <Checkbox
                                                id={`multiple-${field.id}`}
                                                checked={field.multiple}
                                                onCheckedChange={(checked) => updateField(index, { multiple: checked as boolean })}
                                              />
                                              <label htmlFor={`multiple-${field.id}`} className="text-sm text-gray-300">
                                                다중 선택
                                              </label>
                                            </div>
                                          )}
                                          {(field.type === 'text' || field.type === 'longtext') && (
                                            <div className="flex items-center gap-2">
                                              <Checkbox
                                                id={`translation-${field.id}`}
                                                checked={field.enableTranslation}
                                                onCheckedChange={(checked) => updateField(index, { enableTranslation: checked as boolean })}
                                              />
                                              <label htmlFor={`translation-${field.id}`} className="text-sm text-gray-300">
                                                번역
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {field.type === 'file' && !field.thumbnailOnly && (
                                      <div>
                                        <Label className="text-sm text-gray-400 mb-2 block">첨부파일 경로 설정</Label>
                                        <div className="flex items-center gap-3">
                                          <Select
                                            value={field.pathMode ?? 'direct'}
                                            onValueChange={(value) => updateField(index, { pathMode: value as 'direct' | 'base' })}
                                          >
                                            <SelectTrigger className="w-[200px] bg-[#2b2d31] border-gray-600 text-gray-200">
                                              <SelectValue placeholder="경로 방식 선택" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#2b2d31] border-gray-600">
                                              <SelectItem value="direct">직접 경로</SelectItem>
                                              <SelectItem value="base">상대 경로</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        {field.pathMode === 'base' && (
                                          <div className="mt-2 flex items-center gap-2">
                                            <Input
                                              value={field.basePath || ''}
                                              onChange={(e) => updateField(index, { basePath: e.target.value })}
                                              placeholder="베이스 경로"
                                              className="h-10 px-3 w-full bg-[#2b2d31] border-gray-600 text-gray-200"
                                            />
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="border-gray-600 text-gray-200 hover:bg-[#3a3d44]"
                                              onClick={async () => {
                                                try {
                                                  const result = await window.electronAPI.openDirectoryDialog();
                                                  if (!result.canceled && result.filePaths.length > 0) {
                                                    updateField(index, { basePath: result.filePaths[0], pathMode: 'base' });
                                                  }
                                                } catch (e) {
                                                  toast({ title: '폴더 선택 실패', description: String(e), variant: 'destructive' });
                                                }
                                              }}
                                            >
                                              폴더 선택
                                            </Button>
                                          </div>
                                        )}
                                        <p className="text-xs text-gray-500 mt-2">
                                          상대 경로를 선택하면 DB에 저장된 파일명만 사용해 베이스 경로와 결합합니다.
                                        </p>
                                      </div>
                                    )}

                                    {field.type === 'file' && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <button
                                            type="button"
                                            onClick={() => toggleFilenameParseSection(field.id)}
                                            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                                          >
                                            파일명 자동 채우기
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleFilenameParseSection(field.id)}
                                            className="text-gray-400 hover:text-gray-200 transition-colors"
                                            aria-label={expandedFilenameParse[field.id] ? '파일명 자동 채우기 접기' : '파일명 자동 채우기 펼치기'}
                                          >
                                            {expandedFilenameParse[field.id] ? (
                                              <ChevronUp size={16} />
                                            ) : (
                                              <ChevronDown size={16} />
                                            )}
                                          </button>
                                          {field.filenamePattern && (
                                            <p className="text-xs text-gray-500 truncate">
                                              {field.filenamePattern}
                                            </p>
                                          )}
                                        </div>
                                        <div
                                          className={`grid transition-all duration-200 ease-out ${
                                            expandedFilenameParse[field.id]
                                              ? 'grid-rows-[1fr] opacity-100'
                                              : 'grid-rows-[0fr] opacity-0'
                                          }`}
                                        >
                                          <div className="overflow-hidden">
                                            <div>
                                              <Label className="text-xs text-gray-500 mb-1 block">파일명 규칙</Label>
                                              <Input
                                                value={field.filenamePattern || ''}
                                                onChange={(e) => updateFilenamePattern(index, e.target.value)}
                                                placeholder="예: [%A] %B (%C)"
                                                className="bg-[#2b2d31] border-gray-600 text-gray-200"
                                              />
                                              <p className="text-xs text-gray-500 mt-2">
                                                `%A`부터 `%Z`까지 토큰으로 쓰고, 대괄호나 공백 같은 고정 문자는 그대로 입력합니다. 관계형 필드는 연결된 레코드 이름과 정확히 하나 일치할 때만 채웁니다.
                                              </p>
                                            </div>
                                            {extractFilenameTokens(field.filenamePattern || '').map((token) => {
                                              const assignableFields = formData.fields.filter((candidate) => candidate.type !== 'file' && candidate.id);
                                              const selectedField = assignableFields.find((candidate) => candidate.id === field.filenameTokenFields?.[token]);
                                              const tokenFieldKey = `${field.id}:${token}`;
                                              return (
                                                <div key={token} className="mt-3">
                                                  <Label className="text-xs text-gray-500 mb-1 block">%{token} 대입 필드</Label>
                                                  <Popover
                                                    open={openFilenameTokenFieldId === tokenFieldKey}
                                                    onOpenChange={(open) => setOpenFilenameTokenFieldId(open ? tokenFieldKey : null)}
                                                  >
                                                    <PopoverTrigger asChild>
                                                      <Button
                                                        type="button"
                                                        variant="outline"
                                                        role="combobox"
                                                        className="h-10 w-full justify-between bg-[#2b2d31] border-gray-600 text-gray-200 hover:bg-[#2b2d31] hover:text-gray-200"
                                                      >
                                                        <span className="truncate">
                                                          {selectedField ? getFilenameTargetFieldLabel(selectedField, categories) : '필드 선택'}
                                                        </span>
                                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                      </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-[#2b2d31] border-gray-600">
                                                      <Command className="bg-[#2b2d31] border-none">
                                                        <CommandInput
                                                          placeholder="필드 검색..."
                                                          className="h-9 bg-[#2b2d31] text-gray-200 border-b border-gray-600"
                                                        />
                                                        <CommandList className="max-h-[200px] overflow-y-auto text-gray-200">
                                                          <CommandEmpty className="py-2 pl-3 text-sm text-gray-500">필드를 찾을 수 없습니다.</CommandEmpty>
                                                          <CommandGroup>
                                                            <CommandItem
                                                              value="연결 안 함 none"
                                                              onSelect={() => {
                                                                const nextMappings = { ...(field.filenameTokenFields || {}) };
                                                                delete nextMappings[token];
                                                                updateField(index, { filenameTokenFields: nextMappings });
                                                                setOpenFilenameTokenFieldId(null);
                                                              }}
                                                              className="text-gray-200 hover:bg-discord-hover"
                                                            >
                                                              연결 안 함
                                                            </CommandItem>
                                                            {assignableFields.map((candidate) => (
                                                              <CommandItem
                                                                key={candidate.id}
                                                                value={`${candidate.name} ${candidate.type} ${candidate.id} ${categories.find((category) => category.id === candidate.relationCategoryId)?.name || ''}`}
                                                                onSelect={() => {
                                                                  updateField(index, {
                                                                    filenameTokenFields: {
                                                                      ...(field.filenameTokenFields || {}),
                                                                      [token]: candidate.id,
                                                                    },
                                                                  });
                                                                  setOpenFilenameTokenFieldId(null);
                                                                }}
                                                                className="text-gray-200 hover:bg-discord-hover"
                                                              >
                                                                <Check
                                                                  className={cn(
                                                                    'mr-2 h-4 w-4',
                                                                    field.filenameTokenFields?.[token] === candidate.id ? 'opacity-100' : 'opacity-0'
                                                                  )}
                                                                />
                                                                {getFilenameTargetFieldLabel(candidate, categories)}
                                                              </CommandItem>
                                                            ))}
                                                          </CommandGroup>
                                                        </CommandList>
                                                      </Command>
                                                    </PopoverContent>
                                                  </Popover>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {field.type === 'text' && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <button
                                            type="button"
                                            onClick={() => toggleTextDecorationSection(field.id)}
                                            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
                                          >
                                            텍스트 꾸밈
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => toggleTextDecorationSection(field.id)}
                                            className="text-gray-400 hover:text-gray-200 transition-colors"
                                            aria-label={expandedTextDecorations[field.id] ? '텍스트 꾸밈 접기' : '텍스트 꾸밈 펼치기'}
                                          >
                                            {expandedTextDecorations[field.id] ? (
                                              <ChevronUp size={16} />
                                            ) : (
                                              <ChevronDown size={16} />
                                            )}
                                          </button>
                                          {(field.textPrefix || field.textSuffix) && (
                                            <p className="text-xs text-gray-500 truncate">
                                              {`${field.textPrefix || ''}예시값${field.textSuffix || ''}`}
                                            </p>
                                          )}
                                        </div>
                                        <div
                                          className={`grid transition-all duration-200 ease-out ${
                                            expandedTextDecorations[field.id]
                                              ? 'grid-rows-[1fr] opacity-100'
                                              : 'grid-rows-[0fr] opacity-0'
                                          }`}
                                        >
                                          <div className="overflow-hidden">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                              <div>
                                                <Label className="text-xs text-gray-500 mb-1 block">접두사</Label>
                                                <Input
                                                  value={field.textPrefix || ''}
                                                  onChange={(e) => updateField(index, { textPrefix: e.target.value })}
                                                  placeholder="예: @, No., ["
                                                  className="bg-[#2b2d31] border-gray-600 text-gray-200"
                                                />
                                              </div>
                                              <div>
                                                <Label className="text-xs text-gray-500 mb-1 block">접미사</Label>
                                                <Input
                                                  value={field.textSuffix || ''}
                                                  onChange={(e) => updateField(index, { textSuffix: e.target.value })}
                                                  placeholder="예: 님, 호, ]"
                                                  className="bg-[#2b2d31] border-gray-600 text-gray-200"
                                                />
                                              </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                              저장 시 기존 값에 접두사/접미사가 이미 붙어 있으면 원본 값에서 제거합니다.
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {field.type === 'select' && (
                                      <div>
                                        <Label className="text-sm text-gray-400 mb-2 block">옵션 목록</Label>
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap gap-2">
                                            {field.options?.map((option, optionIndex) => (
                                              <div key={optionIndex} className="flex items-center bg-[#2b2d31] rounded">
                                                <Input
                                                  value={option}
                                                  onChange={(e) => {
                                                    const newOptions = [...(field.options || [])];
                                                    newOptions[optionIndex] = e.target.value;
                                                    updateField(index, { options: newOptions });
                                                  }}
                                                  className="h-10 px-3 w-full bg-[#2b2d31] border-gray-600 text-gray-200"
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => {
                                                    const newOptions = field.options?.filter((_, i) => i !== optionIndex);
                                                    updateField(index, { options: newOptions });
                                                  }}
                                                  className="h-10 w-10 bg-discord-sidebar text-gray-400 hover:text-gray-200 hover:bg-discord-sidebar"
                                                >
                                                  <X size={14} />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              onClick={() => updateField(index, { 
                                                options: [...(field.options || []), ''] 
                                              })}
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 px-2 text-gray-400 hover:text-gray-200"
                                            >
                                              + 옵션 추가
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {field.type === 'relation' && (
                                      <div className="space-y-2">
                                        <Label className="text-sm text-gray-400">관련 카테고리</Label>
                                        {(() => {
                                          const selectableCategories = categories.filter(c => c.id !== category?.id && !isSeparatorCategory(c));
                                          const selectedCategory = selectableCategories.find(c => c.id === field.relationCategoryId);
                                          const selectedLabel = selectedCategory
                                            ? getCategoryPath(selectedCategory).join(' > ')
                                            : '';

                                          return (
                                            <Popover
                                              open={openRelationCategoryId === field.id}
                                              onOpenChange={(open) => setOpenRelationCategoryId(open ? field.id : null)}
                                            >
                                              <PopoverTrigger asChild>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  role="combobox"
                                                  aria-expanded={openRelationCategoryId === field.id}
                                                  className="h-10 w-full justify-between bg-[#2b2d31] border-gray-600 text-gray-200 hover:bg-[#2b2d31] hover:text-gray-200"
                                                >
                                                  <span className="truncate">
                                                    {selectedLabel || '관계 카테고리 선택'}
                                                  </span>
                                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-[#2b2d31] border-gray-600">
                                                <Command className="bg-[#2b2d31] border-none">
                                                  <CommandInput
                                                    placeholder="관련 카테고리 검색..."
                                                    className="h-9 bg-[#2b2d31] text-gray-200 border-b border-gray-600"
                                                  />
                                                  <CommandList className="max-h-[200px] overflow-y-auto text-gray-200">
                                                    <CommandEmpty className="py-2 pl-3 text-sm text-gray-500">
                                                      {selectableCategories.length === 0
                                                        ? '선택할 카테고리가 없습니다.'
                                                        : '카테고리를 찾을 수 없습니다.'}
                                                    </CommandEmpty>
                                                    <CommandGroup>
                                                      {selectableCategories.map((cat) => {
                                                        const label = getCategoryPath(cat).join(' > ');
                                                        return (
                                                          <CommandItem
                                                            key={cat.id}
                                                            value={`${label} ${cat.id}`}
                                                            onSelect={() => {
                                                              updateField(index, { relationCategoryId: cat.id });
                                                              setOpenRelationCategoryId(null);
                                                              if (errors[`field_${index}_relation`]) {
                                                                setErrors(prev => {
                                                                  const newErrors = { ...prev };
                                                                  delete newErrors[`field_${index}_relation`];
                                                                  return newErrors;
                                                                });
                                                              }
                                                            }}
                                                            className="text-gray-200 hover:bg-discord-hover"
                                                          >
                                                            <Check
                                                              className={cn(
                                                                'mr-2 h-4 w-4',
                                                                field.relationCategoryId === cat.id ? 'opacity-100' : 'opacity-0'
                                                              )}
                                                            />
                                                            {label}
                                                          </CommandItem>
                                                        );
                                                      })}
                                                    </CommandGroup>
                                                  </CommandList>
                                                </Command>
                                              </PopoverContent>
                                            </Popover>
                                          );
                                        })()}
                                        {errors[`field_${index}_relation`] && (
                                          <p className="text-red-500 text-sm mt-1">
                                            {errors[`field_${index}_relation`]}
                                          </p>
                                        )}
                                        {field.relationCategoryId && (
                                          <div className="space-y-1">
                                            <Label className="text-sm text-gray-400">라벨 필드(선택 목록에 표시될 필드)</Label>
                                            <Select
                                              value={field.displayFieldId || ''}
                                              onValueChange={(value) => {
                                                updateField(index, { displayFieldId: value });
                                                if (errors[`field_${index}_displayField`]) {
                                                  setErrors(prev => {
                                                    const newErrors = { ...prev };
                                                    delete newErrors[`field_${index}_displayField`];
                                                    return newErrors;
                                                  });
                                                }
                                              }}
                                            >
                                              <SelectTrigger className="w-full bg-[#2b2d31] border-gray-600 text-gray-200">
                                                <SelectValue placeholder="라벨 필드 선택" />
                                              </SelectTrigger>
                                              <SelectContent className="bg-[#2b2d31] border-gray-600">
                                                {(() => {
                                                  const relCat = categories.find(c => c.id === field.relationCategoryId);
                                                  if (!relCat) return null;
                                                  return relCat.fields
                                                    .filter(f => f.type !== 'file' && f.type !== 'relation')
                                                    .map(f => (
                                                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                                    ));
                                                })()}
                                              </SelectContent>
                                            </Select>
                                            {errors[`field_${index}_displayField`] && (
                                              <p className="text-red-500 text-sm mt-1">
                                                {errors[`field_${index}_displayField`]}
                                              </p>
                                            )}
                                            {field.displayFieldId && (
                                              <div className="mt-2">
                                                <Label className="text-sm text-gray-400">보조 라벨 필드(선택사항, 라벨 옆에 괄호로 표시)</Label>
                                                <Select
                                                  value={field.subDisplayFieldId || 'none'}
                                                  onValueChange={(value) => updateField(index, { subDisplayFieldId: value === 'none' ? undefined : value })}
                                                >
                                                  <SelectTrigger className="w-full bg-[#2b2d31] border-gray-600 text-gray-200">
                                                    <SelectValue placeholder="보조 라벨 필드 선택 (선택사항)" />
                                                  </SelectTrigger>
                                                  <SelectContent className="bg-[#2b2d31] border-gray-600">
                                                    <SelectItem value="none">(없음)</SelectItem>
                                                    {(() => {
                                                      const relCat = categories.find(c => c.id === field.relationCategoryId);
                                                      if (!relCat) return null;
                                                      return getRelationSubLabelOptions(relCat, field.displayFieldId)
                                                        .map((option) => (
                                                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                                        ));
                                                    })()}
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {duplicateErrors[field.id] && (
                                      <p className="text-red-500 text-sm mt-2">
                                        {duplicateErrors[field.id]}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-end gap-3 p-6 border-t border-gray-700">
          {isMigratingAffixes && (
            <div className="mr-auto flex items-center gap-2 text-sm text-discord-muted">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-discord-accent border-t-transparent" />
              <span>
                기존 데이터 마이그레이션 중... {migratedAffixCount > 0 ? `${migratedAffixCount}개 처리` : ''}
              </span>
            </div>
          )}
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-discord-text hover:bg-discord-hover"
            disabled={isMigratingAffixes}
          >
            취소
          </Button>
          <Button 
            onClick={handleSubmit}
            className="bg-discord-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              isValidating || 
              isMigratingAffixes ||
              !isDirty ||
              !formData.name.trim() || 
              formData.fields.length === 0 ||
              formData.fields.some(f => !f.name.trim()) ||
              formData.fields.some(f => f.type === 'relation' && !f.relationCategoryId) ||
              formData.fields.some(f => f.type === 'relation' && f.relationCategoryId && !f.displayFieldId)
            }
          >
            {isMigratingAffixes ? '마이그레이션 중...' : isValidating ? '검증 중...' : category ? '수정' : '생성'}
          </Button>
        </div>
    </AnimatedModal>
  );
};
