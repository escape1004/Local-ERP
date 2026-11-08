export type EmbeddedBrowserShortcutAction =
  | 'reload'
  | 'hard-reload'
  | 'back'
  | 'forward'
  | 'stop'
  | 'devtools'
  | 'focus-address'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'new-tab'
  | 'close-tab'
  | 'restore-tab'
  | 'duplicate-tab'
  | 'find'
  | 'find-next'
  | 'find-prev'
  | 'next-tab'
  | 'prev-tab'
  | 'tab-1' | 'tab-2' | 'tab-3' | 'tab-4' | 'tab-5' | 'tab-6' | 'tab-7' | 'tab-8' | 'tab-9';

const HOST_SHORTCUT_ACTIONS = new Set<EmbeddedBrowserShortcutAction>([
  'focus-address',
  'new-tab',
  'close-tab',
  'restore-tab',
  'duplicate-tab',
  'find',
  'find-next',
  'find-prev',
  'next-tab',
  'prev-tab',
]);

function isHostShortcutAction(action: string): action is EmbeddedBrowserShortcutAction {
  return HOST_SHORTCUT_ACTIONS.has(action as EmbeddedBrowserShortcutAction) || /^tab-[1-9]$/.test(action);
}

const BROWSER_ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

type ShortcutInput = {
  type?: string;
  key?: string;
  code?: string;
  button?: number | string;
  control?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  isAutoRepeat?: boolean;
};

function keyOf(input: ShortcutInput) {
  return String(input.key || '');
}

function codeOf(input: ShortcutInput) {
  return String(input.code || '');
}

function isKey(input: ShortcutInput, keys: string[], codes: string[] = keys) {
  const key = keyOf(input);
  const code = codeOf(input);
  return keys.includes(key) || codes.includes(code);
}

export function nextBrowserZoomFactor(current, direction: 'in' | 'out' | 'reset') {
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

export function resolveEmbeddedBrowserPointer(input: ShortcutInput = {}): EmbeddedBrowserShortcutAction | null {
  const type = String(input.type || '');
  if (type !== 'mouseDown' && type !== 'mouseUp') return null;
  const button = input.button;
  if (button === 3 || button === 'back') return 'back';
  if (button === 4 || button === 'forward') return 'forward';
  return null;
}

export function resolveEmbeddedBrowserShortcut(input: ShortcutInput = {}): EmbeddedBrowserShortcutAction | null {
  const pointer = resolveEmbeddedBrowserPointer(input);
  if (pointer) return pointer;
  if (input.type && input.type !== 'keyDown') return null;

  const key = keyOf(input);
  const control = Boolean(input.control || input.meta);
  const shift = Boolean(input.shift);
  const alt = Boolean(input.alt);
  const letter = key.length === 1 ? key.toLowerCase() : '';

  if (control && !alt && isKey(input, ['+', '=', 'Add'], ['Equal', 'NumpadAdd', 'numadd'])) return 'zoom-in';
  if (control && !alt && isKey(input, ['-', '_', 'Subtract'], ['Minus', 'NumpadSubtract', 'numsub'])) return 'zoom-out';
  if (control && !alt && !shift && !input.isAutoRepeat && isKey(input, ['0'], ['Digit0', 'Numpad0', 'num0'])) {
    return 'zoom-reset';
  }

  if (input.isAutoRepeat) return null;

  if (isKey(input, ['BrowserRefresh'])) {
    return shift ? 'hard-reload' : 'reload';
  }
  if (isKey(input, ['F5']) && !alt) {
    return (shift || control) ? 'hard-reload' : 'reload';
  }
  if (control && !alt && (letter === 'r' || isKey(input, ['r', 'R'], ['KeyR']))) {
    return shift ? 'hard-reload' : 'reload';
  }

  if (isKey(input, ['BrowserBack']) && !control && !alt && !shift) return 'back';
  if (isKey(input, ['BrowserForward']) && !control && !alt && !shift) return 'forward';
  if (alt && !control && !shift && isKey(input, ['ArrowLeft', 'Left'])) return 'back';
  if (alt && !control && !shift && isKey(input, ['ArrowRight', 'Right'])) return 'forward';
  if (control && !alt && !shift && isKey(input, ['['], ['BracketLeft'])) return 'back';
  if (control && !alt && !shift && isKey(input, [']'], ['BracketRight'])) return 'forward';

  if (isKey(input, ['F6']) && !control && !alt && !shift) return 'focus-address';
  if (control && !alt && !shift && (letter === 'l' || isKey(input, ['l', 'L'], ['KeyL']))) return 'focus-address';
  if (alt && !control && !shift && (letter === 'd' || isKey(input, ['d', 'D'], ['KeyD']))) return 'focus-address';

  if (control && !alt && shift && (letter === 't' || isKey(input, ['t', 'T'], ['KeyT']))) return 'restore-tab';
  if (control && !alt && !shift && (letter === 't' || isKey(input, ['t', 'T'], ['KeyT']))) return 'new-tab';
  if (control && !alt && shift && (letter === 'd' || isKey(input, ['d', 'D'], ['KeyD']))) return 'duplicate-tab';
  if (control && !alt && !shift && (letter === 'w' || isKey(input, ['w', 'W'], ['KeyW']))) return 'close-tab';
  if (control && !alt && !shift && (letter === 'f' || isKey(input, ['f', 'F'], ['KeyF']))) return 'find';
  if (isKey(input, ['F3']) && !control && !alt) return shift ? 'find-prev' : 'find-next';
  if (control && !alt && (letter === 'g' || isKey(input, ['g', 'G'], ['KeyG']))) {
    return shift ? 'find-prev' : 'find-next';
  }
  if (control && !alt && !shift && isKey(input, ['F4'])) return 'close-tab';
  if (control && !alt && isKey(input, ['Tab'])) return shift ? 'prev-tab' : 'next-tab';
  if (control && !alt && !shift && isKey(input, ['PageDown'])) return 'next-tab';
  if (control && !alt && !shift && isKey(input, ['PageUp'])) return 'prev-tab';
  if (control && !alt && !shift && /^[1-9]$/.test(key)) {
    return `tab-${key}` as EmbeddedBrowserShortcutAction;
  }

  if (isKey(input, ['Escape', 'Esc']) && !control && !alt && !shift) return 'stop';

  if (isKey(input, ['F12']) && !control && !alt && !shift) return 'devtools';
  if (control && shift && !alt && (letter === 'i' || isKey(input, ['i', 'I'], ['KeyI']))) return 'devtools';

  return null;
}

function isWebContentsLoading(contents) {
  try {
    return Boolean(contents && !contents.isDestroyed() && contents.isLoading());
  } catch {
    return false;
  }
}

function canGoBack(contents) {
  try {
    return contents.navigationHistory?.canGoBack?.() ?? contents.canGoBack?.() ?? false;
  } catch {
    return false;
  }
}

function canGoForward(contents) {
  try {
    return contents.navigationHistory?.canGoForward?.() ?? contents.canGoForward?.() ?? false;
  } catch {
    return false;
  }
}

export function toggleEmbeddedBrowserDevTools(contents) {
  if (!contents || contents.isDestroyed()) return false;
  try {
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: 'detach' });
    return true;
  } catch {
    return false;
  }
}

export function applyEmbeddedBrowserShortcut(contents, action: EmbeddedBrowserShortcutAction) {
  if (!contents || contents.isDestroyed()) return;

  if (isHostShortcutAction(action)) {
    const host = contents.hostWebContents || contents;
    if (!host.isDestroyed()) host.send('browser:shortcut', action);
    return;
  }

  if (action === 'reload') {
    contents.reload();
    return;
  }
  if (action === 'hard-reload') {
    contents.reloadIgnoringCache();
    return;
  }
  if (action === 'back') {
    if (canGoBack(contents)) contents.goBack();
    return;
  }
  if (action === 'forward') {
    if (canGoForward(contents)) contents.goForward();
    return;
  }
  if (action === 'stop') {
    contents.stop();
    const host = contents.hostWebContents;
    if (host && !host.isDestroyed()) host.send('browser:shortcut', 'stop');
    return;
  }
  if (action === 'devtools') {
    toggleEmbeddedBrowserDevTools(contents);
    return;
  }

  if (action === 'zoom-in' || action === 'zoom-out' || action === 'zoom-reset') {
    const direction = action === 'zoom-in' ? 'in' : action === 'zoom-out' ? 'out' : 'reset';
    try {
      const current = contents.getZoomFactor?.() ?? 1;
      contents.setZoomFactor(nextBrowserZoomFactor(current, direction));
    } catch {
      // zoom APIs can throw before the guest is ready
    }
  }
}

export function attachEmbeddedBrowserShortcutGuard(contents, options: {
  resolveTarget?: (contents, action: EmbeddedBrowserShortcutAction) => unknown;
  handleWheelZoom?: boolean;
} = {}) {
  if (!contents || contents.__erpBrowserShortcutsAttached) return;
  contents.__erpBrowserShortcutsAttached = true;

  contents.on('before-input-event', (event, input) => {
    const action = resolveEmbeddedBrowserShortcut(input);
    if (!action) return;

    const target = typeof options.resolveTarget === 'function'
      ? options.resolveTarget(contents, action)
      : contents;

    if (action === 'stop' && !isWebContentsLoading(target || contents)) {
      event.preventDefault();
      const host = contents.hostWebContents || contents;
      if (host && !host.isDestroyed()) host.send('browser:shortcut', 'stop');
      return;
    }

    event.preventDefault();
    if (target) applyEmbeddedBrowserShortcut(target, action);
  });

  try {
    contents.setVisualZoomLevelLimits(1, 1);
  } catch {
    // older guests may not expose visual zoom limits
  }

  const handleWheelZoom = options.handleWheelZoom !== false && !contents.hostWebContents;
  if (!handleWheelZoom) return;

  contents.on('zoom-changed', (_event, direction) => {
    const action = direction === 'in' ? 'zoom-in' : 'zoom-out';
    const target = typeof options.resolveTarget === 'function'
      ? options.resolveTarget(contents, action)
      : contents;
    if (target) applyEmbeddedBrowserShortcut(target, action);
  });
}
