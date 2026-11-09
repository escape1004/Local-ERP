import { expect, test } from 'vitest';
import {
  createBrowserIdleTracker,
  isIdleActivityInputType,
  raceWithTimeout,
} from './browser-idle';

test('counts pointer, wheel, and key events as idle activity', () => {
  expect(isIdleActivityInputType('mouseMove')).toBe(true);
  expect(isIdleActivityInputType('mouseDown')).toBe(true);
  expect(isIdleActivityInputType('mouseWheel')).toBe(true);
  expect(isIdleActivityInputType('keyDown')).toBe(true);
  expect(isIdleActivityInputType('mouseEnter')).toBe(false);
  expect(isIdleActivityInputType('keyUp')).toBe(false);
});

test('records activity from input events and ignores focus-only types', () => {
  let now = 1_000;
  const tracker = createBrowserIdleTracker({ now: () => now });

  tracker.handleInputEvent('mouseEnter');
  expect(tracker.getLastActivityAt()).toBe(0);

  now = 2_000;
  tracker.handleInputEvent('mouseMove');
  expect(tracker.getLastActivityAt()).toBe(2_000);
});

test('resolves a hung probe to the fallback so idle lock can still run', async () => {
  const hung = new Promise(() => {});
  await expect(raceWithTimeout(hung, 20, false)).resolves.toBe(false);
});
