import { expect, test } from 'vitest';
import { nextBrowserZoomFactor, resolveEmbeddedBrowserShortcut } from './browser-shortcuts';

test('reloads the page with F5 and Ctrl+R', () => {
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'F5' })).toBe('reload');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'r', control: true })).toBe('reload');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'R', meta: true })).toBe('reload');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'F5', shift: true })).toBe('hard-reload');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'F5', control: true })).toBe('hard-reload');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'r', control: true, shift: true })).toBe('hard-reload');
});

test('navigates history with Alt arrows', () => {
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'ArrowLeft', alt: true })).toBe('back');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'ArrowRight', alt: true })).toBe('forward');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: '[', control: true })).toBe('back');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: ']', control: true })).toBe('forward');
});

test('focuses the address bar with Ctrl+L', () => {
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'l', control: true })).toBe('focus-address');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'd', alt: true })).toBe('focus-address');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'F6' })).toBe('focus-address');
});

test('zooms the page with Ctrl plus, minus, and 0', () => {
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: '=', control: true })).toBe('zoom-in');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: '+', control: true, shift: true })).toBe('zoom-in');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: '-', control: true })).toBe('zoom-out');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: '0', control: true })).toBe('zoom-reset');
  expect(nextBrowserZoomFactor(1, 'in')).toBe(1.1);
  expect(nextBrowserZoomFactor(1.1, 'out')).toBe(1);
});

test('navigates with mouse side buttons', () => {
  expect(resolveEmbeddedBrowserShortcut({ type: 'mouseUp', button: 3 })).toBe('back');
  expect(resolveEmbeddedBrowserShortcut({ type: 'mouseUp', button: 4 })).toBe('forward');
  expect(resolveEmbeddedBrowserShortcut({ type: 'mouseDown', button: 'back' })).toBe('back');
});

test('ignores key-up, auto-repeat, and unrelated keys', () => {
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyUp', key: 'F5' })).toBeNull();
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'F5', isAutoRepeat: true })).toBeNull();
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'r' })).toBeNull();
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: 'Escape' })).toBe('stop');
  expect(resolveEmbeddedBrowserShortcut({ type: 'keyDown', key: '=', control: true, isAutoRepeat: true })).toBe('zoom-in');
});
