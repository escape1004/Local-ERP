import { isBlankBrowserTab, type BrowserTabState } from './browserTabs';

export const MAX_CLOSED_BROWSER_TABS = 20;

export type ClosedBrowserTab = {
  url: string;
  title: string;
};

export function toClosedBrowserTab(tab: Pick<BrowserTabState, 'url' | 'title'>): ClosedBrowserTab | null {
  if (isBlankBrowserTab(tab)) return null;
  const url = String(tab.url || '').trim();
  if (!url) return null;
  return {
    url,
    title: String(tab.title || '').trim() || url,
  };
}

export function pushClosedBrowserTab(stack: ClosedBrowserTab[], tab: ClosedBrowserTab | null): ClosedBrowserTab[] {
  if (!tab) return stack;
  return [tab, ...stack.filter((item) => item.url !== tab.url)].slice(0, MAX_CLOSED_BROWSER_TABS);
}

export function popClosedBrowserTab(stack: ClosedBrowserTab[]) {
  if (stack.length === 0) return { stack, tab: null as ClosedBrowserTab | null };
  const [tab, ...rest] = stack;
  return { stack: rest, tab };
}
