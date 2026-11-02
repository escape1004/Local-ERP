import { expect, test } from 'vitest';
import { nextBrowserZoomFactor, resolveBrowserMouseButton } from './browserChrome';

test('maps mouse side buttons to history navigation', () => {
  expect(resolveBrowserMouseButton(3)).toBe('back');
  expect(resolveBrowserMouseButton(4)).toBe('forward');
  expect(resolveBrowserMouseButton(0)).toBeNull();
  expect(resolveBrowserMouseButton(2)).toBeNull();
});

test('steps page zoom like a browser', () => {
  expect(nextBrowserZoomFactor(1, 'in')).toBe(1.1);
  expect(nextBrowserZoomFactor(1.1, 'out')).toBe(1);
  expect(nextBrowserZoomFactor(1.05, 'reset')).toBe(1);
  expect(nextBrowserZoomFactor(5, 'in')).toBe(5);
  expect(nextBrowserZoomFactor(0.25, 'out')).toBe(0.25);
});
