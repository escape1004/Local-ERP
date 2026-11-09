import { Languages } from 'lucide-react';
import type { FieldDefinition } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { TextCaseContextMenu } from './TextCaseContextMenu';
import { getTranslatedFieldId, isTranslationEnabledField } from '../../lib/translation';

interface RecordModalTranslationFieldProps {
  field: FieldDefinition;
  formData: Record<string, unknown>;
  translatingFieldIds: Set<string>;
  hasOpenAiApiKey: boolean;
  onTranslationChange: (fieldId: string, value: string) => void;
  onAutoTranslate: (field: FieldDefinition) => void;
}

export function RecordModalTranslationField({
  field,
  formData,
  translatingFieldIds,
  hasOpenAiApiKey,
  onTranslationChange,
  onAutoTranslate,
}: RecordModalTranslationFieldProps) {
  if (!isTranslationEnabledField(field)) {
    return null;
  }

  const translationFieldId = getTranslatedFieldId(field.id);
  const translationValue = typeof formData[translationFieldId] === 'string'
    ? String(formData[translationFieldId])
    : '';
  const isTranslating = translatingFieldIds.has(field.id);
  const autoTranslateTooltip = !hasOpenAiApiKey
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
            onValueChange={(next) => onTranslationChange(field.id, next)}
            disabled={isTranslating}
          >
            <Textarea
              value={translationValue}
              onChange={(e) => onTranslationChange(field.id, e.target.value)}
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
                    onClick={() => void onAutoTranslate(field)}
                    disabled={!hasOpenAiApiKey || isTranslating}
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
            onValueChange={(next) => onTranslationChange(field.id, next)}
            disabled={isTranslating}
            className="flex-1"
          >
            <Input
              type="text"
              value={translationValue}
              onChange={(e) => onTranslationChange(field.id, e.target.value)}
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
                    onClick={() => void onAutoTranslate(field)}
                    disabled={!hasOpenAiApiKey || isTranslating}
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
      {!hasOpenAiApiKey && (
        <p className="text-xs text-amber-300">
          자동 번역을 사용하려면 환경설정 &gt; 번역에서 OpenAI API 키를 먼저 저장해주세요.
        </p>
      )}
    </div>
  );
}
