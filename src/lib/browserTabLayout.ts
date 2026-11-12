import type { CSSProperties } from 'react';

/** Chrome Refresh standard tab width is 240 DIP. */
export const BROWSER_TAB_MAX_WIDTH_PX = 240;
/** Favicon stays left-aligned; Chrome inactive tabs shrink to about this interior size. */
export const BROWSER_TAB_MIN_WIDTH_PX = 32;
export const BROWSER_TAB_ANIMATION_MS = 200;

export function getBrowserTabItemStyle(): CSSProperties {
  return {
    flex: `0 1 ${BROWSER_TAB_MAX_WIDTH_PX}px`,
    width: BROWSER_TAB_MAX_WIDTH_PX,
    minWidth: BROWSER_TAB_MIN_WIDTH_PX,
    maxWidth: BROWSER_TAB_MAX_WIDTH_PX,
  };
}
