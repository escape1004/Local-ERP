import { expect, test } from 'vitest';
import { isProfileHydrationPending, shouldHideAppUntilReady } from './profileHydration';

test('shows the profile loader only after a profile is selected and before data is ready', () => {
  expect(isProfileHydrationPending(null, false)).toBe(false);
  expect(isProfileHydrationPending({ id: 'p1' }, false)).toBe(true);
  expect(isProfileHydrationPending({ id: 'p1' }, true)).toBe(false);
});

test('hides the app chrome until the profile is ready or a password is still required', () => {
  expect(shouldHideAppUntilReady(false, false)).toBe(true);
  expect(shouldHideAppUntilReady(false, true)).toBe(false);
  expect(shouldHideAppUntilReady(true, true)).toBe(true);
});
