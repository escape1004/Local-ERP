import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { AnimatedModal } from '../ui/animated-modal';
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
  return (
    <AnimatedModal isOpen={open} contentClassName="bg-discord-bg rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-700 p-5">
        <h2 className="text-lg font-bold text-discord-text">{isNew ? '새 스크립트' : '스크립트 수정'}</h2>
        <button type="button" onClick={onClose} className="text-discord-muted hover:text-discord-text" aria-label="닫기">
          <X size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto discord-scrollbar p-5">
        <p className="text-xs leading-relaxed text-discord-muted">
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
        <label className="flex items-center gap-2 text-sm text-discord-muted">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          />
          사용
        </label>
        <Textarea
          value={draft.source}
          onChange={(event) => onChange({ ...draft, source: event.target.value })}
          className="min-h-[280px] bg-discord-sidebar border-gray-600 font-mono text-xs text-discord-text"
          placeholder="window.erp.findRecordsByUrl(url) 를 사용할 수 있습니다."
        />
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
