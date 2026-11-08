import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useERPStore } from '../../hooks/useERPStore';
import {
  buildBulkRecords,
  getBulkCreatableFields,
} from '../../lib/bulkAddFields';
import { partitionRelationCreateValues } from '../../lib/relationPaste';
import type { Category, FieldDefinition } from '../../types';
import { AnimatedModal } from '../ui/animated-modal';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { toast } from '../ui/use-toast';

type CreateMissingRelationRecordsDialogProps = {
  isOpen: boolean;
  category: Category | null;
  values: string[];
  preferredFieldId?: string;
  onClose: () => void;
  onCreated: (recordIds: string[]) => void;
};

export function CreateMissingRelationRecordsDialog({
  isOpen,
  category,
  values,
  preferredFieldId,
  onClose,
  onCreated,
}: CreateMissingRelationRecordsDialogProps) {
  const { addRecord, checkDuplicate, getCategoryRecords, loadRecords } = useERPStore();
  const availableFields = useMemo(() => getBulkCreatableFields(category), [category]);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const preferred = preferredFieldId && availableFields.some((field) => field.id === preferredFieldId)
      ? preferredFieldId
      : '';
    setSelectedFieldId(preferred);
    setValuesText(values.join(', '));
    setIsSubmitting(false);
    if (category?.id) void loadRecords(category.id);
  }, [availableFields, category, isOpen, loadRecords, preferredFieldId, values]);

  const selectedField = availableFields.find((field) => field.id === selectedFieldId) || null;
  const isInputEnabled = Boolean(selectedFieldId);

  const handleSubmit = async () => {
    if (!category || !selectedField || !valuesText.trim()) {
      toast({
        title: '입력 오류',
        description: '필드를 선택하고 값을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const inputValues = valuesText
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (inputValues.length === 0) {
      toast({
        title: '입력 오류',
        description: '유효한 값을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const partition = partitionRelationCreateValues({
      values: inputValues,
      field: selectedField,
      existingRecords: getCategoryRecords(category.id),
    });
    const duplicateInputValues = inputValues.length - new Set(inputValues).size;

    if (duplicateInputValues > 0) {
      toast({
        title: '중복 값 제거',
        description: `입력값 중 ${duplicateInputValues}개의 중복된 값이 제거되었습니다.`,
      });
    }

    if (partition.skippedDuplicates.length > 0) {
      toast({
        title: '중복 불가 값 건너뜀',
        description: `${partition.skippedDuplicates.join(', ')} 값은 중복 불가 필드에 이미 있어 제외되었습니다.`,
      });
    }

    if (partition.creatable.length === 0) {
      toast({
        title: '추가할 레코드 없음',
        description: selectedField.unique
          ? '선택한 필드는 중복 불가입니다. 이미 있는 값은 추가하지 않습니다.'
          : '추가할 레코드가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    const createdIds: string[] = [];
    const failedValues: string[] = [];
    try {
      const records = buildBulkRecords(category, selectedField, partition.creatable);
      for (let index = 0; index < records.length; index += 1) {
        const value = partition.creatable[index];
        try {
          if (selectedField.unique) {
            const isDuplicate = await checkDuplicate(
              category.id,
              selectedField.id,
              records[index].data[selectedField.id],
            );
            if (isDuplicate) {
              failedValues.push(value);
              continue;
            }
          }
          const id = await addRecord(records[index]);
          createdIds.push(id);
        } catch {
          failedValues.push(value);
        }
      }

      if (createdIds.length === 0) {
        toast({
          title: '레코드를 추가하지 못했습니다.',
          description: failedValues.length > 0
            ? `"${failedValues.join(', ')}" 값을 추가하지 못했습니다.`
            : '추가할 레코드가 없습니다.',
          variant: 'destructive',
        });
        return;
      }

      onCreated(createdIds);
      toast({
        title: '추가 완료',
        description: [
          `${createdIds.length}개의 레코드가 추가되었습니다.`,
          partition.skippedDuplicates.length > 0 ? `(${partition.skippedDuplicates.length}개 건너뜀)` : '',
          failedValues.length > 0 ? `${failedValues.length}개는 추가하지 못했습니다.` : '',
        ].filter(Boolean).join(' '),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!category) return null;

  return (
    <AnimatedModal
      isOpen={isOpen}
      className="z-[60]"
      contentClassName="bg-discord-bg rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]"
    >
      <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
        <div>
          <h2 className="text-xl font-bold text-discord-text">
            없는 레코드 추가
          </h2>
          <p className="text-discord-muted text-sm mt-1">
            붙여넣은 값 중 {category.name}에 없는 레코드가 있습니다. 해당 카테고리에 추가할까요?
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-discord-muted hover:text-discord-text"
        >
          <X size={24} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-discord-text">
              필드 선택
            </Label>
            <Select value={selectedFieldId} onValueChange={setSelectedFieldId}>
              <SelectTrigger className="w-full bg-discord-sidebar border-gray-600 text-discord-text">
                <SelectValue placeholder="필드를 선택하세요" />
              </SelectTrigger>
              <SelectContent className="z-[70] bg-discord-sidebar border-gray-600">
                {availableFields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.name}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-discord-text">
              값 입력 (콤마로 구분)
            </Label>
            <Textarea
              placeholder={isInputEnabled ? '값1, 값2, 값3, ...' : '먼저 필드를 선택해주세요'}
              value={valuesText}
              onChange={(event) => setValuesText(event.target.value)}
              disabled={!isInputEnabled}
              className={`min-h-[150px] bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500 ${
                !isInputEnabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
            {isInputEnabled && (
              <p className="text-xs text-discord-muted">
                콤마(,)로 구분하여 여러 값을 입력하세요. 예: 값1, 값2, 값3
              </p>
            )}
          </div>

          <div className="mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded">
            <p className="text-sm text-red-400">
              ⚠️ 주의: 이 카테고리에는 필수값이 여러 개일 수 있습니다.
              선택한 필드에만 값이 입력되며, 다른 필수 필드는 비어있을 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center justify-end gap-3 p-6 border-t border-gray-700">
        <Button
          variant="ghost"
          onClick={onClose}
          className="text-discord-text hover:bg-discord-hover"
          disabled={isSubmitting}
        >
          취소
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          className="bg-discord-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isInputEnabled || !valuesText.trim() || isSubmitting}
        >
          {isSubmitting ? '추가 중...' : '추가'}
        </Button>
      </div>
    </AnimatedModal>
  );
}

export type MissingRelationCreateRequest = {
  field: FieldDefinition;
  category: Category;
  values: string[];
};
