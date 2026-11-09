import type { RefObject } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Profile } from '../types';
import { GateCard } from './GateCard';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface AppPasswordGateProps {
  currentProfile: Profile | null;
  passwordInput: string;
  showPassword: boolean;
  isPasswordLocked: boolean;
  passwordError: string;
  passwordLockRemainingLabel: string;
  passwordInputRef: RefObject<HTMLInputElement | null>;
  onPasswordChange: (value: string) => void;
  onToggleShowPassword: () => void;
  onUnlock: () => void;
  onKeepFocus: () => void;
}

export function AppPasswordGate({
  currentProfile,
  passwordInput,
  showPassword,
  isPasswordLocked,
  passwordError,
  passwordLockRemainingLabel,
  passwordInputRef,
  onPasswordChange,
  onToggleShowPassword,
  onUnlock,
  onKeepFocus,
}: AppPasswordGateProps) {
  return (
    <div
      className={`${currentProfile ? 'absolute inset-0 z-50' : 'h-full'} flex items-center justify-center bg-discord-bg p-6`}
      onMouseDownCapture={(e) => {
        if (e.target === passwordInputRef.current) return;
        if ((e.target as HTMLElement).closest('[data-password-toggle]')) return;
        e.preventDefault();
        onKeepFocus();
      }}
    >
      <GateCard
        title="앱 잠금 해제"
        description={currentProfile
          ? '자리를 비운 동안 앱이 잠겼습니다. 비밀번호를 입력하면 이어서 사용할 수 있습니다.'
          : '비밀번호를 입력한 뒤 프로필을 선택할 수 있습니다.'}
        className="max-w-md"
      >
        <div className="max-w-md space-y-3">
          <div className="relative">
            <Input
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              value={passwordInput}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void onUnlock();
                }
              }}
              onBlur={() => {
                if (!isPasswordLocked) {
                  onKeepFocus();
                }
              }}
              className="bg-discord-bg border-gray-600 pr-10 text-discord-text"
              placeholder="비밀번호"
              autoFocus
              disabled={isPasswordLocked}
            />
            <button
              type="button"
              data-password-toggle
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-discord-muted hover:text-discord-text disabled:cursor-not-allowed disabled:opacity-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onToggleShowPassword}
              disabled={isPasswordLocked}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {isPasswordLocked && (
            <p className="text-sm text-amber-300">
              보안을 위해 비밀번호 입력이 {passwordLockRemainingLabel} 동안 잠겼습니다.
            </p>
          )}
          {passwordError && <p className="text-sm text-red-400">{passwordError}</p>}
          <Button
            onClick={() => void onUnlock()}
            className="w-full bg-discord-accent hover:bg-blue-600 text-white"
            disabled={isPasswordLocked || !passwordInput.trim()}
          >
            잠금 해제
          </Button>
        </div>
      </GateCard>
    </div>
  );
}
