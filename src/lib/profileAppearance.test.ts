import { expect, test } from 'vitest';
import {
  DEFAULT_PROFILE_NAME,
  formatPasswordLockRemainingLabel,
  getProfileSwatchStyle,
  isDefaultProfile,
  normalizeProfileColor,
  PROFILE_COLORS,
  RAINBOW_PROFILE_COLOR,
} from './profileAppearance';

test('keeps rainbow colors and uppercases valid hex swatches', () => {
  expect(normalizeProfileColor(RAINBOW_PROFILE_COLOR)).toBe('rainbow');
  expect(normalizeProfileColor('#3ba55d')).toBe('#3BA55D');
  expect(normalizeProfileColor('not-a-color')).toBe(PROFILE_COLORS[0]);
});

test('uses a rainbow gradient for the rainbow swatch and a solid color otherwise', () => {
  expect(getProfileSwatchStyle(RAINBOW_PROFILE_COLOR).backgroundImage).toContain('linear-gradient');
  expect(getProfileSwatchStyle('#3ba55d')).toEqual({ backgroundColor: '#3BA55D' });
});

test('treats only the default profile name as undeletable', () => {
  expect(isDefaultProfile({ name: DEFAULT_PROFILE_NAME })).toBe(true);
  expect(isDefaultProfile({ name: '작업용' })).toBe(false);
});

test('formats the password lock countdown in minutes and seconds', () => {
  expect(formatPasswordLockRemainingLabel(125)).toBe('2분 5초');
  expect(formatPasswordLockRemainingLabel(-3)).toBe('0분 0초');
});
