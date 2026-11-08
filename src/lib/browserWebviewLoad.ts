import { isInternalBrowserTab, NEW_TAB_URL } from './browserTabs';

export const BACKGROUND_TAB_LOAD_STAGGER_MS = 90;

export function resolveWebviewStartNavigation(input: {
  startUrl: string;
  isActive: boolean;
  tabIndex?: number;
}) {
  const startUrl = String(input.startUrl || '').trim() || NEW_TAB_URL;
  if (isInternalBrowserTab({ url: startUrl })) {
    return { src: NEW_TAB_URL, deferUrl: null as string | null, deferMs: 0 };
  }
  if (input.isActive) {
    return { src: startUrl, deferUrl: null as string | null, deferMs: 0 };
  }
  const index = Math.max(0, Math.trunc(Number(input.tabIndex) || 0));
  return {
    src: NEW_TAB_URL,
    deferUrl: startUrl,
    deferMs: BACKGROUND_TAB_LOAD_STAGGER_MS * (index + 1),
  };
}

export function shouldLoadPendingWebviewUrl(currentUrl: string | null | undefined, pendingUrl: string) {
  const pending = String(pendingUrl || '').trim();
  if (!pending || isInternalBrowserTab({ url: pending })) return false;
  return String(currentUrl || '') !== pending;
}

export function upsertBrowserScriptList<T extends { id: string; name: string }>(scripts: T[], next: T) {
  const list = scripts.some((item) => item.id === next.id)
    ? scripts.map((item) => (item.id === next.id ? next : item))
    : [...scripts, next];
  return list.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
}
