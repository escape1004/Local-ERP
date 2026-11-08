import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category, FieldDefinition, NewRecord } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { toast } from './ui/use-toast';
import { AnimatedModal } from './ui/animated-modal';

interface BulkAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category | null;
}

const parseNonNegativeNumberInput = (value: string): number => {
  const trimmedValue = value.trim();
  if (trimmedValue === '') return 0;
  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
};

const parsePercentageBulkValue = (value: string) => {
  const [currentPart = '', maxPart = ''] = value.split('/', 2);
  const max = parseNonNegativeNumberInput(maxPart);
  return {
    value: Math.min(parseNonNegativeNumberInput(currentPart), max),
    max
  };
};

const normalizeBulkFieldValue = (field: FieldDefinition, value: any) => {
  if (field.type === 'number') {
    return String(Number(value) || 0);
  }

  if (field.type === 'percentage') {
    const percentageValue = typeof value === 'string' ? parsePercentageBulkValue(value) : value;
    return `${percentageValue?.value ?? ''}/${percentageValue?.max ?? ''}`;
  }

  return String(value || '');
};

export const BulkAddModal: React.FC<BulkAddModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { addRecord, loadRecords, checkDuplicate, getCategoryRecords } = useERPStore();
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [valuesText, setValuesText] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 모달이 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setSelectedFieldId('');
      setValuesText('');
    }
  }, [isOpen]);

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

  if (!category) return null;

  const selectedField = category.fields.find(f => f.id === selectedFieldId);
  const isInputEnabled = !!selectedFieldId;

  // 필드 목록 (일부 타입 제외)
  const availableFields = category.fields.filter(f => 
    !f.hidden && 
    f.type !== 'file' && 
    f.type !== 'relation' &&
    f.type !== 'checkbox'
  );

  const handleSubmit = async () => {
    if (!selectedFieldId || !valuesText.trim()) {
      toast({
        title: '입력 오류',
        description: '필드를 선택하고 값을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedField) {
      return;
    }

    setIsSubmitting(true);

    try {
      // 콤마로 분리하고 공백 제거
      const inputValues = valuesText
        .split(',')
        .map(v => v.trim())
        .filter(v => v.length > 0);

      if (inputValues.length === 0) {
        toast({
          title: '입력 오류',
          description: '유효한 값을 입력해주세요.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      // 1. 입력값 내 중복 제거
      const uniqueInputValues = Array.from(new Set(inputValues));
      const duplicateInputValues = inputValues.length - uniqueInputValues.length;
      
      if (duplicateInputValues > 0) {
        toast({
          title: '중복 값 제거',
          description: `입력값 중 ${duplicateInputValues}개의 중복된 값이 제거되었습니다.`,
          variant: 'default',
        });
      }

      // 2. 기존 카테고리 레코드와 중복 체크
      const existingRecords = getCategoryRecords(category.id);
      const existingValues = new Set(
        existingRecords.map(record => {
          const value = record.data[selectedFieldId];
          return normalizeBulkFieldValue(selectedField, value);
        })
      );

      // 중복되지 않은 값만 필터링
      const newValues = uniqueInputValues.filter(value => {
        const normalizedValue = normalizeBulkFieldValue(selectedField, value);
        return !existingValues.has(normalizedValue);
      });

      const skippedCount = uniqueInputValues.length - newValues.length;

      if (newValues.length === 0) {
        toast({
          title: '추가할 레코드 없음',
          description: skippedCount > 0 
            ? `모든 값이 이미 카테고리에 존재합니다. (${skippedCount}개 건너뜀)`
            : '추가할 레코드가 없습니다.',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      if (skippedCount > 0) {
        toast({
          title: '중복 값 건너뜀',
          description: `${skippedCount}개의 값이 이미 카테고리에 존재하여 제외되었습니다.`,
          variant: 'default',
        });
      }

      // 각 값에 대해 레코드 생성
      const now = new Date().toISOString();
      const recordsToAdd: NewRecord[] = newValues.map(value => {
        const recordData: Record<string, any> = {};
        
        // 모든 필드 초기화
        category.fields.forEach(field => {
          if (field.type === 'checkbox') {
            recordData[field.id] = false;
          } else if (field.type === 'percentage') {
            recordData[field.id] = { value: 0, max: 0 };
          } else {
            recordData[field.id] = '';
          }
        });

        // 선택한 필드에 값 설정
        if (selectedField.type === 'number') {
          recordData[selectedFieldId] = Number(value) || 0;
        } else if (selectedField.type === 'percentage') {
          recordData[selectedFieldId] = parsePercentageBulkValue(value);
        } else {
          recordData[selectedFieldId] = value;
        }

        return {
          categoryId: category.id,
          data: recordData,
          createdAt: now,
          updatedAt: now,
        };
      });

      // 레코드 추가
      for (const record of recordsToAdd) {
        await addRecord(record);
      }

      // 레코드 목록 새로고침
      await loadRecords(category.id);

      toast({
        title: '추가 완료',
        description: `${newValues.length}개의 레코드가 추가되었습니다.${skippedCount > 0 ? ` (${skippedCount}개 건너뜀)` : ''}`,
      });

      onClose();
    } catch (error) {
      console.error('레코드 다중 추가 중 오류 발생:', error);
      toast({
        title: '오류',
        description: '레코드 추가 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatedModal isOpen={isOpen} contentClassName="bg-discord-bg rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">
            레코드 다중 추가
          </h2>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* 필드 선택 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-discord-text">
                필드 선택
              </Label>
              <Select value={selectedFieldId} onValueChange={setSelectedFieldId}>
                <SelectTrigger className="w-full bg-discord-sidebar border-gray-600 text-discord-text">
                  <SelectValue placeholder="필드를 선택하세요" />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  {availableFields.map(field => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 값 입력 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-discord-text">
                값 입력 (콤마로 구분)
              </Label>
              <Textarea
                placeholder={isInputEnabled ? "값1, 값2, 값3, ..." : "먼저 필드를 선택해주세요"}
                value={valuesText}
                onChange={(e) => setValuesText(e.target.value)}
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

            {/* 안내문 */}
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
            onClick={handleSubmit}
            className="bg-discord-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isInputEnabled || !valuesText.trim() || isSubmitting}
          >
            {isSubmitting ? '추가 중...' : '추가'}
          </Button>
        </div>
      </AnimatedModal>
  );
};
