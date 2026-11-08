import React from 'react';
import { Crosshair, X } from 'lucide-react';
import type { Category, FieldDefinition } from '../../types';
import {
  flattenSaveRecordCategories,
  isPickableSaveRecordField,
  nextEmptyPickableFieldId,
  normalizeSaveRecordDateFields,
  parseCategoryFields,
  prefillSaveRecordValues,
  saveRecordFormFields,
  validateSaveRecordValues,
} from '../../lib/browserSaveRecord';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

export type SaveRecordAssignment = {
  seq: number;
  fieldId: string;
  value: string;
};

type BrowserSaveRecordPanelProps = {
  pageUrl: string;
  pageTitle: string;
  initialCategoryId?: string | null;
  pickingFieldId: string | null;
  resumePickSeq?: number;
  assignment: SaveRecordAssignment | null;
  filePending?: boolean;
  saving?: boolean;
  onCategoryChange?: (categoryId: string) => void;
  onStartPick: (field: FieldDefinition) => void;
  onStopPick: () => void;
  onPickApplied: (values: Record<string, unknown>, fieldId: string, fields: FieldDefinition[]) => void;
  onClose: () => void;
  onSave: (payload: { category: Category; values: Record<string, unknown> }) => Promise<void> | void;
};

export function BrowserSaveRecordPanel({
  pageUrl,
  pageTitle,
  initialCategoryId,
  pickingFieldId,
  resumePickSeq = 0,
  assignment,
  filePending = false,
  saving = false,
  onCategoryChange,
  onStartPick,
  onStopPick,
  onPickApplied,
  onClose,
  onSave,
}: BrowserSaveRecordPanelProps) {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loadError, setLoadError] = React.useState('');
  const [categoryId, setCategoryId] = React.useState(initialCategoryId || '');
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [dateFormats, setDateFormats] = React.useState<string[]>([]);
  const valuesRef = React.useRef(values);
  const appliedSeqRef = React.useRef(0);
  const initialCategoryIdRef = React.useRef(initialCategoryId);
  const pageUrlRef = React.useRef(pageUrl);
  const pageTitleRef = React.useRef(pageTitle);
  const onStartPickRef = React.useRef(onStartPick);
  const onStopPickRef = React.useRef(onStopPick);
  const onPickAppliedRef = React.useRef(onPickApplied);
  const onCategoryChangeRef = React.useRef(onCategoryChange);
  valuesRef.current = values;
  pageUrlRef.current = pageUrl;
  pageTitleRef.current = pageTitle;
  onStartPickRef.current = onStartPick;
  onStopPickRef.current = onStopPick;
  onPickAppliedRef.current = onPickApplied;
  onCategoryChangeRef.current = onCategoryChange;

  const options = React.useMemo(() => flattenSaveRecordCategories(categories), [categories]);
  const selected = options.find((item) => item.id === categoryId)?.category || null;
  const fields = React.useMemo(() => saveRecordFormFields(parseCategoryFields(selected)), [selected]);

  React.useEffect(() => {
    let ignore = false;
    void window.electronAPI.getConfig()
      .then((config) => {
        if (!ignore && Array.isArray(config?.dateParseFormats)) {
          setDateFormats(config.dateParseFormats);
        }
      })
      .catch(() => undefined);
    void window.electronAPI.getCategories()
      .then((rows) => {
        if (ignore) return;
        const list = Array.isArray(rows) ? rows : [];
        setCategories(list);
        setLoadError('');
        const preferred = initialCategoryIdRef.current;
        const nextId = (preferred && list.some((item) => item.id === preferred)
          ? preferred
          : flattenSaveRecordCategories(list)[0]?.id) || '';
        setCategoryId(nextId);
      })
      .catch((error) => {
        if (ignore) return;
        setCategories([]);
        setLoadError(error instanceof Error ? error.message : '카테고리를 불러오지 못했습니다.');
      });
    return () => {
      ignore = true;
    };
  }, []);

  React.useEffect(() => {
    const nextValues = prefillSaveRecordValues(fields, {
      url: pageUrlRef.current,
      title: pageTitleRef.current,
    });
    setValues(nextValues);
    setErrors({});
    const nextId = nextEmptyPickableFieldId(fields, nextValues);
    const field = fields.find((item) => item.id === nextId);
    if (field) onStartPickRef.current(field);
    else onStopPickRef.current();
  }, [categoryId, fields]);

  React.useEffect(() => {
    if (categoryId) onCategoryChangeRef.current?.(categoryId);
  }, [categoryId]);

  React.useEffect(() => {
    if (!resumePickSeq) return;
    const nextId = nextEmptyPickableFieldId(fields, valuesRef.current)
      || fields.find(isPickableSaveRecordField)?.id
      || null;
    const field = fields.find((item) => item.id === nextId);
    if (field) onStartPickRef.current(field);
  }, [fields, resumePickSeq]);

  React.useEffect(() => {
    if (!assignment || assignment.seq === appliedSeqRef.current) return;
    appliedSeqRef.current = assignment.seq;
    setValues((current) => {
      const next = { ...current, [assignment.fieldId]: assignment.value };
      onPickAppliedRef.current(next, assignment.fieldId, fields);
      return next;
    });
    setErrors((current) => {
      if (!current[assignment.fieldId]) return current;
      const next = { ...current };
      delete next[assignment.fieldId];
      return next;
    });
  }, [assignment, fields]);

  const updateValue = (fieldId: string, value: unknown) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
    setErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  };

  const handleSave = async () => {
    if (!selected) return;
    const normalized = normalizeSaveRecordDateFields(fields, valuesRef.current, dateFormats);
    setValues(normalized.values);
    valuesRef.current = normalized.values;
    const nextErrors = {
      ...validateSaveRecordValues(fields, normalized.values),
      ...normalized.errors,
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSave({ category: selected, values: normalized.values });
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-gray-800 bg-discord-sidebar">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-800 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text">레코드로 등록</h2>
        <Button
          type="button"
          variant="ghost"
          className="h-7 w-7 p-0 hover:bg-discord-hover hover:text-discord-text"
          aria-label="닫기"
          onClick={onClose}
        >
          <X size={14} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto discord-scrollbar p-3">
        {loadError ? (
          <p className="text-sm leading-relaxed text-discord-muted">{loadError}</p>
        ) : options.length === 0 ? (
          <p className="text-sm leading-relaxed text-discord-muted">
            등록할 카테고리가 없습니다. 본 화면에서 카테고리를 먼저 만들어 주세요.
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs text-discord-muted">카테고리</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-8 w-full rounded-md border border-gray-600 bg-discord-bg px-2 text-sm text-discord-text"
              >
                {options.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-relaxed text-discord-muted">
              십자 버튼을 누른 뒤 페이지에서 요소를 클릭하면 해당 필드에 값이 들어갑니다.
            </p>
            {fields.length === 0 && (
              <p className="text-sm leading-relaxed text-discord-muted">
                이 카테고리에는 브라우저에서 채울 수 있는 필드가 없습니다.
              </p>
            )}
            {fields.map((field) => (
              <SaveRecordField
                key={field.id}
                field={field}
                value={values[field.id]}
                error={errors[field.id]}
                picking={pickingFieldId === field.id}
                disabled={saving || filePending}
                onChange={(value) => updateValue(field.id, value)}
                onPick={() => {
                  if (pickingFieldId === field.id) onStopPick();
                  else onStartPick(field);
                }}
              />
            ))}
          </>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-gray-800 p-3">
        <Button
          type="button"
          variant="outline"
          className="h-8 flex-1 border-gray-600 text-sm"
          onClick={onClose}
        >
          취소
        </Button>
        <Button
          type="button"
          className="h-8 flex-1 bg-discord-accent text-sm text-white hover:bg-blue-600"
          disabled={!selected || saving || filePending || fields.length === 0}
          onClick={() => void handleSave()}
        >
          {filePending ? '파일 저장 중...' : saving ? '등록 중...' : '등록'}
        </Button>
      </div>
    </aside>
  );
}

function SaveRecordField({
  field,
  value,
  error,
  picking,
  disabled,
  onChange,
  onPick,
}: {
  field: FieldDefinition;
  value: unknown;
  error?: string;
  picking: boolean;
  disabled: boolean;
  onChange: (value: unknown) => void;
  onPick: () => void;
}) {
  const pickable = isPickableSaveRecordField(field);
  const textValue = value == null || value === false ? '' : String(value);

  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1 text-xs text-discord-muted">
        <span className="min-w-0 flex-1 truncate">
          {field.name}
          {field.required ? ' *' : ''}
        </span>
        {pickable && (
          <button
            type="button"
            className={`inline-flex h-6 w-6 items-center justify-center rounded ${
              picking ? 'bg-discord-accent text-white' : 'text-discord-muted hover:bg-discord-hover hover:text-discord-text'
            }`}
            aria-label={`${field.name} 값을 페이지에서 선택`}
            aria-pressed={picking}
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              onPick();
            }}
          >
            <Crosshair size={13} />
          </button>
        )}
      </span>
      {field.type === 'longtext' ? (
        <Textarea
          value={textValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[72px] border-gray-600 bg-discord-bg text-sm text-discord-text"
        />
      ) : field.type === 'select' ? (
        <select
          value={textValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full rounded-md border border-gray-600 bg-discord-bg px-2 text-sm text-discord-text"
        >
          <option value="">선택</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-discord-accent"
        />
      ) : (
        <Input
          value={textValue}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.type === 'date' ? 'yyyy-MM 또는 yyyy-MM-dd' : field.type === 'file' ? '페이지에서 이미지를 선택' : ''}
          className="h-8 border-gray-600 bg-discord-bg text-sm text-discord-text"
        />
      )}
      {error && <span className="block text-[11px] text-red-400">{error}</span>}
    </label>
  );
}
