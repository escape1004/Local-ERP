import React, { useEffect } from 'react';
import { Button } from './button';
import { X } from 'lucide-react';
import { MODAL_DIM_CLASS } from '@/lib/modalOverlay';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  variant = 'info'
}) => {
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

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: '⚠️',
          confirmButtonClass: 'bg-red-600 hover:bg-red-700 text-white',
          titleClass: 'text-red-400'
        };
      case 'warning':
        return {
          icon: '⚠️',
          confirmButtonClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
          titleClass: 'text-yellow-400'
        };
      default:
        return {
          icon: 'ℹ️',
          confirmButtonClass: 'bg-discord-accent hover:bg-blue-600 text-white',
          titleClass: 'text-discord-text'
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className={`fixed inset-0 ${MODAL_DIM_CLASS} flex items-center justify-center z-50`}>
      <div className="bg-discord-bg rounded-xl w-full max-w-md border border-gray-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{styles.icon}</span>
            <h3 className={`text-lg font-semibold ${styles.titleClass}`}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-discord-text text-sm leading-relaxed">
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-discord-text hover:bg-discord-hover"
          >
            {cancelText}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={styles.confirmButtonClass}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}; 