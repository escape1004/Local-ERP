import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';

type BrowserTranslateBarProps = {
  status: 'loading' | 'done' | 'error';
  error?: string;
  onRestore: () => void;
  onClose: () => void;
};

export function BrowserTranslateBar({ status, error = '', onRestore, onClose }: BrowserTranslateBarProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-gray-700 bg-[#1e1f22] px-2 py-1 shadow-xl">
      <span className="max-w-[16rem] truncate text-xs text-discord-text">
        {status === 'loading' && '페이지를 번역하는 중...'}
        {status === 'done' && '이 페이지를 번역했습니다.'}
        {status === 'error' && (error || '페이지를 번역하지 못했습니다.')}
      </span>
      {status === 'done' && (
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs hover:bg-discord-hover hover:text-discord-text"
          onClick={onRestore}
        >
          원문 보기
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        className="h-7 w-7 p-0 hover:bg-discord-hover hover:text-discord-text"
        aria-label="번역 표시 닫기"
        onClick={onClose}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
