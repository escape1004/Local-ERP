import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Category, FieldDefinition, NewCategory } from '../types';
import { isSeparatorCategory } from '../lib/category';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import { AlertDialog } from './ui/alert-dialog';
import { MODAL_DIM_CLASS } from '../lib/modalOverlay';

interface FieldEditorProps {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
  onDelete: () => void;
  categories: Category[];
  onShowAlert?: (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success') => void;
}

interface EditCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category;
}

const normalizeCategoryField = (field: FieldDefinition): FieldDefinition => {
  if (field.type !== 'percentage') return field;
  return { ...field, required: false, unique: false };
};

const FieldEditor: React.FC<FieldEditorProps> = ({ field, onChange, onDelete, categories, onShowAlert }) => {
  const handleRequiredChange = (checked: boolean) => {
    onChange({ ...field, required: checked });
  };

  const handleUniqueChange = (checked: boolean) => {
    onChange({ ...field, unique: checked });
  };

  return (
    <div className="border border-gray-600 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="필드 이름"
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          className="flex-1"
        />
        <Select
          value={field.type}
          onValueChange={(value) => {
            if (value === 'file' && categories.some(cat => cat.fields.some(f => f.type === 'file' && f.id !== field.id))) {
              onShowAlert?.('제한', '파일 필드는 한 개만 추가할 수 있습니다.', 'warning');
              return;
            }
            const newField = { ...field, type: value as FieldDefinition['type'] };
            if (value === 'checkbox' || value === 'percentage') {
              newField.unique = false;
            }
            if (value === 'percentage') {
              newField.required = false;
            }
            onChange(newField);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="필드 타입" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">텍스트</SelectItem>
            <SelectItem value="number">숫자</SelectItem>
            <SelectItem value="percentage">백분율</SelectItem>
            <SelectItem value="date">날짜</SelectItem>
            <SelectItem value="select">선택</SelectItem>
            <SelectItem value="checkbox">체크박스</SelectItem>
            <SelectItem value="relation">관계</SelectItem>
            <SelectItem value="longtext">긴 텍스트</SelectItem>
            <SelectItem value="file" disabled={categories.some(cat => cat.fields.some(f => f.type === 'file' && f.id !== field.id))}>파일</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="destructive"
          size="icon"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 필드 옵션 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {/* 기존 체크박스들 */}
          {field.type !== 'percentage' && (
            <>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`required-${field.id}`}
                  checked={field.required}
                  onCheckedChange={(checked) => onChange({ ...field, required: checked === true })}
                />
                <label
                  htmlFor={`required-${field.id}`}
                  className="text-sm font-medium leading-none text-discord-text cursor-pointer"
                >
                  필수값
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`unique-${field.id}`}
                  checked={field.unique}
                  onCheckedChange={(checked) => onChange({ ...field, unique: checked === true })}
                  disabled={field.type === 'checkbox'}
                />
                <label
                  htmlFor={`unique-${field.id}`}
                  className={`text-sm font-medium leading-none cursor-pointer ${
                    field.type === 'checkbox' ? 'text-gray-500' : 'text-discord-text'
                  }`}
                >
                  중복 불가
                </label>
              </div>
            </>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id={`hidden-${field.id}`}
              checked={field.hidden}
              onCheckedChange={(checked) => onChange({ ...field, hidden: checked === true })}
            />
            <label
              htmlFor={`hidden-${field.id}`}
              className="text-sm font-medium leading-none text-discord-text cursor-pointer"
            >
              미노출(리스트 숨김)
            </label>
          </div>
        </div>
      </div>

      {/* 다중 선택 체크박스 (select 타입일 때만) */}
      {field.type === 'select' && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`multiple-${field.id}`}
            checked={field.multiple}
            onCheckedChange={(checked) => onChange({ ...field, multiple: checked === true })}
          />
          <label
            htmlFor={`multiple-${field.id}`}
            className="text-sm font-medium leading-none text-discord-text cursor-pointer"
          >
            다중 선택
          </label>
        </div>
      )}

      {/* 선택 옵션 (select 타입일 때만) */}
      {field.type === 'select' && (
        <div className="space-y-2 mt-4">
          <label className="text-sm text-discord-text">옵션</label>
          <div className="flex flex-wrap gap-2">
            {field.options?.map((option, index) => (
              <div key={index} className="flex items-center gap-1">
                <Input
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...(field.options || [])];
                    newOptions[index] = e.target.value;
                    onChange({ ...field, options: newOptions });
                  }}
                  className="w-32"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newOptions = [...(field.options || [])];
                    newOptions.splice(index, 1);
                    onChange({ ...field, options: newOptions });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newOptions = [...(field.options || []), ''];
                onChange({ ...field, options: newOptions });
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              옵션 추가
            </Button>
          </div>
        </div>
      )}

      {/* 관련 카테고리 선택 (relation 타입일 때만) */}
      {field.type === 'relation' && (
        <div className="space-y-2 mt-4">
          <label className="text-sm text-discord-text">관련 카테고리</label>
          <Select
            value={field.relationCategoryId}
            onValueChange={(value) => onChange({ ...field, relationCategoryId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              {categories.filter((category) => !isSeparatorCategory(category)).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* 라벨 필드 선택 */}
          {field.relationCategoryId && (
            <div className="space-y-1">
              <label className="text-sm text-discord-text">라벨 필드(선택 목록에 표시될 필드)</label>
              <Select
                value={field.displayFieldId || ''}
                onValueChange={(value) => onChange({ ...field, displayFieldId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="필드 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(categories.find(cat => cat.id === field.relationCategoryId)?.fields || []).map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { categories, addCategory, updateCategory } = useERPStore();
  const { showLoading, hideLoading } = useLoadingStore();
  const [name, setName] = useState(category?.name || '');
  const [fields, setFields] = useState<FieldDefinition[]>(
    category ? JSON.parse(JSON.stringify(category.fields.map(normalizeCategoryField))) : []
  );
  const [initialName, setInitialName] = useState(category?.name || '');
  const [initialFields, setInitialFields] = useState<FieldDefinition[]>(
    category ? JSON.parse(JSON.stringify(category.fields.map(normalizeCategoryField))) : []
  );
  const [error, setError] = useState('');
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

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      setName(category?.name || '');
      setFields(category ? JSON.parse(JSON.stringify(category.fields.map(normalizeCategoryField))) : []);
      setInitialName(category?.name || '');
      setInitialFields(
        category ? JSON.parse(JSON.stringify(category.fields.map(normalizeCategoryField))) : []
      );
      setError('');
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isDirty = name !== initialName || JSON.stringify(fields) !== JSON.stringify(initialFields);

    if (!isDirty) {
      onClose();
      return;
    }

    setError('');

    try {
      if (!name.trim()) {
        setError('카테고리 이름을 입력해주세요.');
        return;
      }

      if (fields.length === 0) {
        setError('최소 하나의 필드가 필요합니다.');
        return;
      }

      // 필드 이름 중복 체크
      const fieldNames = new Set();
      for (const field of fields) {
        if (!field.name.trim()) {
          setError('모든 필드에 이름이 필요합니다.');
          return;
        }
        if (fieldNames.has(field.name)) {
          setError(`중복된 필드 이름이 있습니다: ${field.name}`);
          return;
        }
        fieldNames.add(field.name);
      }

      if (category) {
        // 수정
        const normalizedFields = fields.map(normalizeCategoryField);
        showLoading('카테고리 썸네일 경로를 정리하는 중...');
        await updateCategory(category.id, {
          name,
          fields: normalizedFields.map((field, index) => ({ ...field, order: index })),
        });
      } else {
        // 생성
        const now = new Date().toISOString();
        const normalizedFields = fields.map(normalizeCategoryField);
        const newCategory: NewCategory = {
          name,
          fields: normalizedFields.map((field, index) => ({ ...field, order: index })),
          order: categories.length,
          createdAt: now,
          updatedAt: now,
        };
        await addCategory(newCategory);
      }

      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    } finally {
      hideLoading();
    }
  };

  const handleAddField = () => {
    const newField: FieldDefinition = {
      id: nanoid(),
      name: '',
      type: 'text',
      required: false,
      unique: false,
      order: fields.length,
      options: []
    };
    setFields([...fields, newField]);
  };

  const handleFieldChange = (index: number, field: FieldDefinition) => {
    const updatedFields = [...fields];
    updatedFields[index] = field;
    setFields(updatedFields);
  };

  const deleteField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`fixed inset-0 ${MODAL_DIM_CLASS} flex items-center justify-center z-50`}>
        <div className="bg-discord-bg rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-bold text-discord-text">
              {category ? '카테고리 수정' : '새 카테고리 추가'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-discord-text">
                카테고리 이름
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="카테고리 이름을 입력하세요"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-discord-text">필드</h3>
                <Button
                  type="button"
                  onClick={handleAddField}
                  className="bg-discord-accent hover:bg-discord-accent/80"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  필드 추가
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    onChange={(updatedField) => handleFieldChange(index, updatedField)}
                    onDelete={() => deleteField(index)}
                    categories={categories.filter(cat => cat.id !== category?.id && !isSeparatorCategory(cat))}
                    onShowAlert={showAlert}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="text-red-500 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
              >
                취소
              </Button>
              <Button 
                type="submit"
                disabled={
                  !name.trim() || 
                  fields.length === 0 ||
                  fields.some(f => !f.name.trim())
                }
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {category ? '저장' : '추가'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* 커스텀 알럿 다이얼로그 */}
      <AlertDialog
        isOpen={isAlertDialogOpen}
        onClose={() => setIsAlertDialogOpen(false)}
        title={alertDialogProps.title}
        message={alertDialogProps.message}
        variant={alertDialogProps.variant}
      />
    </>
  );
};

export default EditCategoryModal; 
