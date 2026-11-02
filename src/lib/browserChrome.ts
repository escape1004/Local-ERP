export const BROWSER_MOUSE_BACK_BUTTON = 3;
export const BROWSER_MOUSE_FORWARD_BUTTON = 4;

export const BROWSER_ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
] as const;

export type BrowserZoomDirection = 'in' | 'out' | 'reset';

export function resolveBrowserMouseButton(button: number): 'back' | 'forward' | null {
  if (button === BROWSER_MOUSE_BACK_BUTTON) return 'back';
  if (button === BROWSER_MOUSE_FORWARD_BUTTON) return 'forward';
  return null;
}

export function nextBrowserZoomFactor(current: number, direction: BrowserZoomDirection) {
  if (direction === 'reset') return 1;
  const value = Number(current);
  const factor = Number.isFinite(value) && value > 0 ? value : 1;
  if (direction === 'in') {
    return BROWSER_ZOOM_STEPS.find((step) => step > factor + 0.005) ?? BROWSER_ZOOM_STEPS[BROWSER_ZOOM_STEPS.length - 1];
  }
  for (let index = BROWSER_ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    if (BROWSER_ZOOM_STEPS[index] < factor - 0.005) return BROWSER_ZOOM_STEPS[index];
  }
  return BROWSER_ZOOM_STEPS[0];
}
