import type { CSSProperties } from 'react';
import type { Profile } from '../types';

export const PROFILE_COLORS = ['#5865F2', '#3BA55D', '#F97316', '#EC4899', '#0EA5E9', '#EAB308'];
export const RAINBOW_PROFILE_COLOR = 'rainbow';
export const DEFAULT_PROFILE_NAME = '기본 프로필';

export function normalizeProfileColor(value: string) {
  if (value === RAINBOW_PROFILE_COLOR) return value;

  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : PROFILE_COLORS[0];
}

export function getProfileSwatchStyle(color?: string): CSSProperties {
  if (color === RAINBOW_PROFILE_COLOR) {
    return {
      backgroundImage: 'linear-gradient(135deg, #ff5f6d 0%, #ffc371 22%, #47cf73 44%, #3b82f6 68%, #a855f7 100%)',
    };
  }

  return {
    backgroundColor: normalizeProfileColor(color || PROFILE_COLORS[0]),
  };
}

export function isDefaultProfile(profile: Pick<Profile, 'name'>) {
  return profile.name === DEFAULT_PROFILE_NAME;
}

export function formatPasswordLockRemainingLabel(remainingSeconds: number) {
  const safeSeconds = Math.max(0, remainingSeconds);
  return `${Math.floor(safeSeconds / 60)}분 ${safeSeconds % 60}초`;
}
