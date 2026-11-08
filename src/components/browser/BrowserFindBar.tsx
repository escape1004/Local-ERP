import React from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type BrowserFindBarProps = {
  query: string;
  matchLabel: string;
  focusSeq?: number;
  onQueryChange: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
};

export function BrowserFindBar({
  query,
  matchLabel,
  focusSeq = 0,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: BrowserFindBarProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusSeq]);

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-gray-700 bg-[#1e1f22] px-1.5 py-1 shadow-xl">
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="찾기"
        className="h-7 w-44 border-0 bg-transparent px-2 text-sm text-discord-text shadow-none focus-visible:ring-0"
      />
      <span className="min-w-[3.5rem] px-1 text-center text-[11px] text-discord-muted">{matchLabel}</span>
      <Button
        type="button"
        variant="ghost"
        className="h-7 w-7 p-0 hover:bg-discord-hover hover:text-discord-text"
        aria-label="이전 찾기"
        onClick={onPrev}
      >
        <ChevronUp size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-7 w-7 p-0 hover:bg-discord-hover hover:text-discord-text"
        aria-label="다음 찾기"
        onClick={onNext}
      >
        <ChevronDown size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-7 w-7 p-0 hover:bg-discord-hover hover:text-discord-text"
        aria-label="찾기 닫기"
        onClick={onClose}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
