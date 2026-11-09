import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLoadingStore } from '../../hooks/useLoadingStore';
import { Button } from './button';
import { MODAL_DIM_CLASS } from '@/lib/modalOverlay';

export const LoadingOverlay: React.FC = () => {
  const { isLoading, message, showCancelButton, cancelLoading } = useLoadingStore();

  if (!isLoading) return null;

  return (
    <div className={`fixed inset-0 ${MODAL_DIM_CLASS} flex items-center justify-center z-[9999]`}>
      <div className="flex flex-col items-center gap-4 min-w-[200px]">
        <Loader2 className="w-8 h-8 text-discord-accent animate-spin" />
        <div className="text-white text-center">
          <div className="font-medium">{message}</div>
          <div className="text-sm text-gray-300 mt-1">잠시만 기다려주세요...</div>
        </div>
        {showCancelButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={cancelLoading}
            className="mt-2 border-gray-500 text-gray-300 hover:bg-gray-700 hover:text-white"
          >
            로딩 취소
          </Button>
        )}
      </div>
    </div>
  );
}; 