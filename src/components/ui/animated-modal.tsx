import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MODAL_DIM_CLASS } from '@/lib/modalOverlay';

interface AnimatedModalProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  animateContent?: boolean;
  exitAnimation?: boolean;
}

const ANIMATION_DURATION_MS = 200;

export function AnimatedModal({
  isOpen,
  children,
  className,
  contentClassName,
  animateContent = true,
  exitAnimation = true,
}: AnimatedModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    if (!exitAnimation) {
      setShouldRender(false);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setShouldRender(false);
    }, ANIMATION_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [exitAnimation, isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200',
        MODAL_DIM_CLASS,
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      <div
        className={cn(
          'overflow-hidden rounded-xl',
          animateContent && 'transition-all duration-200',
          animateContent && (isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'),
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}
