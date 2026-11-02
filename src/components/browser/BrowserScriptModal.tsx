import React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { AnimatedModal } from '../ui/animated-modal';
import { splitScriptSearchChunks } from '../../lib/browserScriptSearch';
import type { BrowserScript } from '../../types';

type BrowserScriptModalProps = {
  open: boolean;
  draft: BrowserScript;
  saving: boolean;
  onChange: (draft: BrowserScript) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
};

export function BrowserScriptModal({
  open,
  draft,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: BrowserScriptModalProps) {
  const isNew = !draft.id;
  const [query, setQuery] = React.useState('');
  const overlayRef = React.useRef<HTMLPreElement | null>(null);
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const chunks = React.useMemo(
    () => splitScriptSearchChunks(draft.source, query),
    [draft.source, query],
  );

  React.useEffect(() => {
    if (open) setQuery('');
  }, [open, draft.id]);

  React.useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const area = areaRef.current;
    if (!overlay || !area) return;
    overlay.scrollTop = area.scrollTop;
    overlay.scrollLeft = area.scrollLeft;
  }, [draft.source, query]);

  const syncOverlayScroll = () => {
    const overlay = overlayRef.current;
    const area = areaRef.current;
    if (!overlay || !area) return;
    overlay.scrollTop = area.scrollTop;
    overlay.scrollLeft = area.scrollLeft;
  };

  return (
    <AnimatedModal isOpen={open} contentClassName="bg-discord-bg rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-700 p-5">
        <h2 className="text-lg font-bold text-discord-text">{isNew ? '새 스크립트' : '스크립트 수정'}</h2>
        <button type="button" onClick={onClose} className="text-discord-muted hover:text-discord-text" aria-label="닫기">
          <X size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto discord-scrollbar p-5">
        <p className="text-sm leading-relaxed text-discord-muted">
          매치되는 페이지에 스크립트가 주입됩니다. 직접 작성한 코드이므로 신뢰할 수 있는 내용만 저장하세요.
        </p>
        <Input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          className="h-9 bg-discord-sidebar border-gray-600 text-sm text-discord-text"
          placeholder="스크립트 이름"
        />
        <Input
          value={draft.matches.join(', ')}
          onChange={(event) => onChange({
            ...draft,
            matches: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
          })}
          className="h-9 bg-discord-sidebar border-gray-600 text-sm text-discord-text"
          placeholder="매치 패턴, 쉼표로 구분"
        />
        <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-discord-sidebar px-3 py-2">
          <span className={`text-sm ${draft.enabled ? 'text-discord-accent' : 'text-discord-muted'}`}>
            {draft.enabled ? '스크립트 켜짐' : '스크립트 꺼짐'}
          </span>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
            disabled={saving}
            className="data-[state=checked]:bg-discord-accent data-[state=unchecked]:bg-gray-600"
            aria-label={draft.enabled ? '스크립트 켜짐' : '스크립트 꺼짐'}
          />
        </div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-discord-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 bg-discord-sidebar border-gray-600 pl-8 text-sm text-discord-text"
            placeholder="스크립트 검색"
          />
        </div>
        <div className="relative h-[280px] overflow-hidden rounded-md border border-gray-600 bg-discord-sidebar">
          <pre
            ref={overlayRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-sm leading-5 text-discord-text [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {chunks.length === 0 ? (
              <span className="text-gray-500">window.erp.findRecordsByUrl(url) 를 사용할 수 있습니다.</span>
            ) : chunks.map((chunk, index) => (
              chunk.match ? (
                <mark key={index} className="rounded-sm bg-discord-accent/50 text-white">
                  {chunk.text}
                </mark>
              ) : (
                <span key={index}>{chunk.text}</span>
              )
            ))}
          </pre>
          <textarea
            ref={areaRef}
            value={draft.source}
            onChange={(event) => onChange({ ...draft, source: event.target.value })}
            onScroll={syncOverlayScroll}
            spellCheck={false}
            className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-3 font-mono text-sm leading-5 text-transparent caret-white outline-none selection:bg-discord-accent/30 discord-scrollbar"
            placeholder=""
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-700 p-5">
        {draft.id && onDelete ? (
          <Button
            variant="outline"
            className="h-9 border-gray-600 text-sm text-red-400"
            disabled={saving}
            onClick={onDelete}
          >
            삭제
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" className="h-9 text-discord-text hover:bg-discord-hover" disabled={saving} onClick={onClose}>
            취소
          </Button>
          <Button className="h-9 bg-discord-accent hover:bg-blue-600" disabled={saving} onClick={onSave}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </AnimatedModal>
  );
}
