import { expect, test } from 'vitest';
import {
  BROWSER_TAB_ANIMATION_MS,
  BROWSER_TAB_MAX_WIDTH_PX,
  BROWSER_TAB_MIN_WIDTH_PX,
  getBrowserTabItemStyle,
} from './browserTabLayout';

test('uses Chrome-like equal flex shrink between favicon min and 240px max', () => {
  expect(BROWSER_TAB_MIN_WIDTH_PX).toBe(32);
  expect(BROWSER_TAB_MAX_WIDTH_PX).toBe(240);
  expect(BROWSER_TAB_ANIMATION_MS).toBe(200);
  expect(getBrowserTabItemStyle()).toEqual({
    flex: '0 1 240px',
    width: 240,
    minWidth: 32,
    maxWidth: 240,
  });
});
