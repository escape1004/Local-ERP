import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Globe, Languages, X } from 'lucide-react';
import type { Category, DataRecord, FieldDefinition } from '../../types';
import { toast } from '../ui/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { formatFieldDisplayValue } from '../../lib/fieldFormat';
import {
  formatStoredDate,
  getPercentageMeta,
  getPercentageTextClassName,
  isBlankDisplayValue,
  isUrlString,
  type FieldValue,
} from '../../lib/recordFields';
import {
  DEFAULT_TRANSLATION_DISPLAY_MODE,
  getTranslatedFieldValue,
  getTranslationMeta,
  isTranslationEnabledField,
  normalizeTranslationDisplayMode,
  type TranslationDisplayMode,
} from '../../lib/translation';
import { getRelationDisplayLabel } from '../../utils/relationDisplay';
import { cn } from '../../lib/utils';

export const FIELD_TOOLTIP_CLASSNAME = "relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words";

export async function copyOnCtrlClick(
  event: React.MouseEvent,
  text: string,
  successDescription: string,
  onSelectRow?: () => void,
) {
  onSelectRow?.();
  event.stopPropagation();
  if (!event.ctrlKey) return;

  try {
    await navigator.clipboard.writeText(text);
    toast({ title: '복사 완료', description: successDescription });
  } catch {
    toast({
      title: '복사 실패',
      description: '클립보드 복사에 실패했습니다.',
      variant: 'destructive',
    });
  }
}

async function copyText(text: string, successDescription: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: '복사 완료', description: successDescription });
  } catch {
    toast({
      title: '복사 실패',
      description: '클립보드 복사에 실패했습니다.',
      variant: 'destructive',
    });
  }
}

export function renderTextWithHashtags(text: string) {
  const hashtagRegex = /#(\S+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = hashtagRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={match.index}
        className="inline-block px-2 py-0.5 text-xs rounded bg-gray-600/20 text-gray-400 mr-1"
      >
        #{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

const FieldTextHoverSlot = React.forwardRef<
  HTMLDivElement | HTMLSpanElement,
  {
    as: 'span' | 'div';
    originalText: string;
    translationText: string;
    displayedText: string;
    reserveSpace: boolean;
    slotClassName: string;
    layerClassName: string;
    onClick: (event: React.MouseEvent) => void;
  }
>(({
  as: Component,
  originalText,
  translationText,
  displayedText,
  reserveSpace,
  slotClassName,
  layerClassName,
  onClick,
}, ref) => {
  if (!reserveSpace) {
    return (
      <Component ref={ref as never} className={slotClassName} onClick={onClick}>
        {renderTextWithHashtags(displayedText)}
      </Component>
    );
  }

  return (
    <Component ref={ref as never} className={slotClassName} onClick={onClick}>
      <span className={cn(layerClassName, 'invisible pointer-events-none')} aria-hidden>
        {renderTextWithHashtags(originalText)}
      </span>
      <span className={cn(layerClassName, 'invisible pointer-events-none')} aria-hidden>
        {renderTextWithHashtags(translationText)}
      </span>
      <span className={layerClassName}>
        {renderTextWithHashtags(displayedText)}
      </span>
    </Component>
  );
});
FieldTextHoverSlot.displayName = 'FieldTextHoverSlot';

let sharedTranslationDisplayMode: TranslationDisplayMode = DEFAULT_TRANSLATION_DISPLAY_MODE;
const translationDisplayModeListeners = new Set<(mode: TranslationDisplayMode) => void>();
let translationDisplayModeStarted = false;

function notifyTranslationDisplayMode(mode: TranslationDisplayMode) {
  sharedTranslationDisplayMode = mode;
  translationDisplayModeListeners.forEach((listener) => listener(mode));
}

function ensureTranslationDisplayModeSubscription() {
  if (translationDisplayModeStarted || typeof window === 'undefined' || !window.electronAPI?.getConfig) {
    return;
  }

  translationDisplayModeStarted = true;
  window.electronAPI.getConfig().then((config) => {
    notifyTranslationDisplayMode(normalizeTranslationDisplayMode(config?.translationDisplayMode));
  }).catch(() => {
    notifyTranslationDisplayMode(DEFAULT_TRANSLATION_DISPLAY_MODE);
  });

  window.addEventListener('config:updated', (event) => {
    const mode = (event as CustomEvent<{ translationDisplayMode?: TranslationDisplayMode }>).detail?.translationDisplayMode;
    if (mode) {
      notifyTranslationDisplayMode(normalizeTranslationDisplayMode(mode));
    }
  });
}

function useTranslationDisplayMode() {
  const [mode, setMode] = useState(sharedTranslationDisplayMode);

  useEffect(() => {
    ensureTranslationDisplayModeSubscription();
    translationDisplayModeListeners.add(setMode);
    setMode(sharedTranslationDisplayMode);
    return () => {
      translationDisplayModeListeners.delete(setMode);
    };
  }, []);

  return mode;
}

function UrlValue({
  url,
  variant,
  onSelectRow,
}: {
  url: string;
  variant: 'list' | 'detail';
  onSelectRow?: () => void;
}) {
  const openInAppBrowser = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const result = await window.electronAPI.openBrowserWindow(url);
      if (!result.success) {
        toast({
          title: '브라우저를 열 수 없습니다.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: '브라우저를 열 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  const openUrl = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const result = await window.electronAPI.openExternal(url);
      if (!result.success) {
        toast({
          title: '링크 열기 실패',
          description: '외부 브라우저에서 링크를 열 수 없습니다.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: '링크 열기 실패',
        description: '외부 브라우저에서 링크를 열 수 없습니다.',
        variant: 'destructive',
      });
    }
  };

  const copyUrl = async (event: React.MouseEvent) => {
    onSelectRow?.();
    event.stopPropagation();
    await copyText(url, 'URL이 클립보드에 복사되었습니다.');
  };

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {variant === 'detail' ? (
              <button
                type="button"
                className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left truncate"
                onClick={copyUrl}
              >
                {url}
              </button>
            ) : (
              <span
                className="text-discord-accent px-1 py-0.5 rounded transition-colors inline-block max-w-full truncate cursor-pointer"
                onClick={copyUrl}
              >
                {url}
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
            {variant === 'detail' ? '클릭하여 복사' : `${url} (클릭하여 복사)`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={openInAppBrowser}
              className="text-discord-accent hover:text-blue-400 flex-shrink-0"
            >
              <Globe size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
            앱 브라우저에서 열기
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={openUrl}
              className="text-discord-muted hover:text-blue-400 flex-shrink-0"
            >
              <ExternalLink size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
            외부 브라우저에서 열기
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function ExpandableChips({
  items,
  expandable,
}: {
  items: React.ReactNode[];
  expandable: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const maxVisible = 3;
  const hasMore = expandable && items.length > maxVisible;
  const visibleItems = hasMore && !isExpanded ? items.slice(0, maxVisible) : items;

  return (
    <div className="flex flex-wrap gap-1">
      {visibleItems}
      {hasMore && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsExpanded((value) => !value);
          }}
          className="px-2 py-1 text-xs rounded bg-gray-600/20 text-gray-400 hover:bg-gray-600/30 cursor-pointer"
        >
          {isExpanded ? '접기' : `+${items.length - maxVisible}개 더보기`}
        </button>
      )}
    </div>
  );
}

export function renderGalleryCopyableText(
  text: string,
  successDescription: string,
  onSelectRow?: () => void,
  className?: string,
) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={className}
            onClick={(event) => {
              void copyOnCtrlClick(event, text, successDescription, onSelectRow);
            }}
          >
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
          Ctrl+클릭하여 복사
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface FieldValueRendererProps {
  field: FieldDefinition;
  value: FieldValue;
  variant: 'list' | 'detail';
  categories: Category[];
  getCategoryRecords: (categoryId: string) => DataRecord[];
  recordData?: Record<string, unknown>;
  onSelectRow?: () => void;
  onViewRelatedRecord?: (record: DataRecord, category: Category) => void;
  fileValue?: React.ReactNode;
}

export const FieldValueRenderer: React.FC<FieldValueRendererProps> = ({
  field,
  value,
  variant,
  categories,
  getCategoryRecords,
  recordData,
  onSelectRow,
  onViewRelatedRecord,
  fileValue,
}) => {
  const translationDisplayMode = useTranslationDisplayMode();
  const [isShowingTranslation, setIsShowingTranslation] = useState(false);

  if (field.type === 'file') {
    return <>{fileValue ?? <span className="text-gray-500">-</span>}</>;
  }

  if (isBlankDisplayValue(value)) {
    return <span className="text-gray-500">-</span>;
  }

  const isDetail = variant === 'detail';

  const copyable = (
    text: string,
    successDescription: string,
    content: React.ReactNode,
    options?: { clickToCopy?: boolean; className?: string; tooltip?: string },
  ) => {
    const clickToCopy = options?.clickToCopy ?? isDetail;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={options?.className ?? (
                isDetail
                  ? 'text-discord-text px-1 py-0.5 rounded transition-colors'
                  : 'text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors inline-block max-w-full truncate'
              )}
              onClick={async (event) => {
                if (clickToCopy) {
                  event.stopPropagation();
                  await copyText(text, successDescription);
                  return;
                }
                await copyOnCtrlClick(event, text, successDescription, onSelectRow);
              }}
            >
              {content}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
            {options?.tooltip ?? (clickToCopy ? '복사하기' : 'Ctrl+클릭하여 복사')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  switch (field.type) {
    case 'text':
    case 'longtext': {
      const formattedValue = formatFieldDisplayValue(field, value);
      const translatedText = isTranslationEnabledField(field)
        ? getTranslatedFieldValue(recordData, field.id)
        : '';
      const translationMeta = translatedText ? getTranslationMeta(recordData, field.id) : null;
      const showTranslatedInline = translationDisplayMode === 'inline-hover' && Boolean(translatedText) && isShowingTranslation;
      const displayedText = showTranslatedInline ? translatedText : formattedValue;
      const reserveHoverSpace = translationDisplayMode === 'inline-hover' && Boolean(translatedText);
      if (isUrlString(formattedValue, isDetail)) {
        return <UrlValue url={formattedValue} variant={variant} onSelectRow={onSelectRow} />;
      }

      const textColorClassName = showTranslatedInline ? 'text-blue-200' : 'text-discord-text';
      const chromeClassName = !isDetail
        ? cn('max-w-full min-w-0 hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors', textColorClassName)
        : field.type === 'longtext'
          ? cn('w-full min-w-0 px-3 py-2 rounded transition-colors border border-gray-600 max-h-[240px] overflow-y-auto', textColorClassName)
          : cn('min-w-0 px-1 py-0.5 rounded transition-colors', textColorClassName);
      const wrapClassName = !isDetail
        ? 'truncate'
        : 'whitespace-pre-wrap break-words overflow-wrap-anywhere';
      const slotClassName = reserveHoverSpace
        ? cn(isDetail && field.type === 'longtext' ? 'grid' : 'inline-grid', chromeClassName)
        : cn(!isDetail || field.type !== 'longtext' ? 'inline-block' : 'block', chromeClassName, wrapClassName);
      const layerClassName = cn('col-start-1 row-start-1 min-w-0 w-full', wrapClassName);

      return (
        <div
          className={isDetail ? 'flex items-start gap-1' : 'inline-flex max-w-full min-w-0 items-center gap-1'}
          onMouseEnter={() => {
            if (translationDisplayMode === 'inline-hover' && translatedText) {
              setIsShowingTranslation(true);
            }
          }}
          onMouseLeave={() => setIsShowingTranslation(false)}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <FieldTextHoverSlot
                  as={isDetail ? 'div' : 'span'}
                  originalText={formattedValue}
                  translationText={translatedText}
                  displayedText={displayedText}
                  reserveSpace={reserveHoverSpace}
                  slotClassName={slotClassName}
                  layerClassName={layerClassName}
                  onClick={(event) => {
                    if (isDetail && field.type === 'longtext') {
                      void copyOnCtrlClick(event, displayedText, '긴 텍스트가 클립보드에 복사되었습니다.');
                      return;
                    }
                    if (isDetail) {
                      void copyOnCtrlClick(event, displayedText, '텍스트가 클립보드에 복사되었습니다.');
                      return;
                    }
                    void copyOnCtrlClick(event, displayedText, '값이 클립보드에 복사되었습니다.', onSelectRow);
                  }}
                />
              </TooltipTrigger>
              {!(translationDisplayMode === 'inline-hover' && translatedText) && (
                <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
                  Ctrl+클릭하여 복사
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {translatedText && translationDisplayMode === 'tooltip' && (
            <TooltipProvider delayDuration={0} skipDelayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={`inline-flex shrink-0 cursor-help items-center rounded p-1 text-blue-300 transition-colors hover:bg-discord-hover hover:text-blue-200 ${isDetail ? 'mt-0.5' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectRow?.();
                    }}
                  >
                    <Languages size={14} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
                  <div className="max-w-xs whitespace-pre-wrap break-words">{translatedText}</div>
                  {translationMeta?.autoTranslated && (
                    <div className="mt-1 text-[11px] text-blue-200">자동 번역</div>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {translatedText && translationDisplayMode === 'inline-hover' && (
            <span
              className={`inline-flex shrink-0 items-center rounded p-1 text-blue-300 ${isDetail ? 'mt-0.5' : ''}`}
            >
              <Languages size={14} />
            </span>
          )}
        </div>
      );
    }

    case 'number':
      return copyable(String(value), '숫자가 클립보드에 복사되었습니다.', String(value));

    case 'date':
      if (!isDetail) {
        return copyable(String(value), '값이 클립보드에 복사되었습니다.', String(value), { clickToCopy: false });
      }
      return copyable(formatStoredDate(value), '날짜가 클립보드에 복사되었습니다.', formatStoredDate(value));

    case 'percentage': {
      const percentage = getPercentageMeta(field, value);
      return (
        <span className={isDetail ? undefined : 'text-discord-text px-1 py-0.5 rounded inline-block max-w-full truncate'}>
          {percentage.value} / {percentage.max}{' '}
          <span className={getPercentageTextClassName(percentage.percent)}>
            ({percentage.percent}%)
          </span>
        </span>
      );
    }

    case 'checkbox':
      return value ? <Check className="w-5 h-5 text-discord-accent" /> : <X className="w-5 h-5 text-discord-danger" />;

    case 'select':
      if (Array.isArray(value)) {
        if (isDetail) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-wrap gap-1">
                    {value.map((item) => (
                      <span
                        key={String(item)}
                        className="px-2 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors"
                        style={{ cursor: 'pointer' }}
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyText(String(item), '값이 클립보드에 복사되었습니다.');
                        }}
                      >
                        {String(item)}
                      </span>
                    ))}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
                  복사하기
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return (
          <ExpandableChips
            expandable
            items={value.map((item, index) => (
              <TooltipProvider key={`${item}-${index}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="px-2 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                      onClick={(event) => {
                        onSelectRow?.();
                        event.stopPropagation();
                        void copyText(String(item), '값이 클립보드에 복사되었습니다.');
                      }}
                    >
                      {String(item)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
                    복사하기
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          />
        );
      }
      return copyable(
        String(value),
        isDetail ? '선택된 값이 클립보드에 복사되었습니다.' : '값이 클립보드에 복사되었습니다.',
        String(value),
        { clickToCopy: isDetail },
      );

    case 'relation': {
      if (!field.relationCategoryId) return <>{String(value)}</>;
      const relatedCategory = categories.find((category) => category.id === field.relationCategoryId);
      if (!relatedCategory) return <>{String(value)}</>;
      const relatedRecords = getCategoryRecords(field.relationCategoryId);

      const openRelated = (relatedRecord: DataRecord, event: React.MouseEvent, label: string) => {
        void (async () => {
          if (event.ctrlKey) {
            await copyOnCtrlClick(event, label, '관계형 필드 값이 클립보드에 복사되었습니다.', onSelectRow);
            return;
          }
          event.stopPropagation();
          onSelectRow?.();
          onViewRelatedRecord?.(relatedRecord, relatedCategory);
        })();
      };

      if (Array.isArray(value)) {
        const chips = value.map((relatedId) => {
          const relatedRecord = relatedRecords.find((record) => record.id === relatedId);
          if (!relatedRecord) return null;
          const label = getRelationDisplayLabel(relatedRecord, field, categories, getCategoryRecords);
          return (
            <span
              key={String(relatedId)}
              className="px-2 py-1 text-xs rounded bg-green-600/20 text-green-500 cursor-pointer hover:bg-green-600/30"
              onClick={(event) => openRelated(relatedRecord, event, label)}
            >
              {label}
            </span>
          );
        }).filter(Boolean);

        if (isDetail) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-wrap gap-1">{chips}</div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
                  복사하기
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }

        return <ExpandableChips expandable items={chips} />;
      }

      const relatedRecord = relatedRecords.find((record) => record.id === value);
      if (!relatedRecord) {
        return isDetail ? <>{String(value)}</> : <span className="inline-block max-w-full truncate">{String(value)}</span>;
      }
      const label = getRelationDisplayLabel(relatedRecord, field, categories, getCategoryRecords);
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={isDetail ? 'text-green-500 cursor-pointer hover:underline' : 'text-green-500 hover:underline cursor-pointer inline-block max-w-full truncate'}
                onClick={(event) => openRelated(relatedRecord, event, label)}
              >
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
              {isDetail ? '상세 보기' : '클릭하여 상세 보기, Ctrl+클릭하여 복사'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    default:
      if (typeof value === 'string' && isUrlString(value, isDetail)) {
        return <UrlValue url={value} variant={variant} onSelectRow={onSelectRow} />;
      }
      if (Array.isArray(value) && !isDetail) {
        return (
          <ExpandableChips
            expandable
            items={value.map((item, index) => (
              <TooltipProvider key={`${item}-${index}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="px-2 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                      onClick={(event) => {
                        onSelectRow?.();
                        event.stopPropagation();
                        void copyText(String(item), '값이 클립보드에 복사되었습니다.');
                      }}
                    >
                      {String(item)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
                    복사하기
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          />
        );
      }
      return copyable(
        String(value),
        '값이 클립보드에 복사되었습니다.',
        typeof value === 'string' ? renderTextWithHashtags(value) : String(value),
        { clickToCopy: isDetail },
      );
  }
};
