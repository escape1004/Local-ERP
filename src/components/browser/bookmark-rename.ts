export function focusRenameInput(node: HTMLInputElement | null) {
  if (!node) return;
  node.focus({ preventScroll: true });
  node.select();
}

export function startRenameAfterMenuClose(
  event: Event,
  pending: { current: boolean },
  start: () => void,
) {
  if (!pending.current) return;
  event.preventDefault();
  pending.current = false;
  start();
}
