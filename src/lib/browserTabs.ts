export const NEW_TAB_URL = 'about:blank';
export const HISTORY_PAGE_URL = 'about:history';
export const DOWNLOADS_PAGE_URL = 'about:downloads';
export const MAX_BROWSER_TABS = 16;

export type BrowserTabState = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
};

export type OpenBrowserTabOptions = {
  background?: boolean;
  reuseEmpty?: boolean;
};

let tabSeq = 0;

export function isBlankBrowserTab(tab: Pick<BrowserTabState, 'url'>) {
  return !tab.url || tab.url === NEW_TAB_URL;
}

export function isHistoryBrowserTab(tab: Pick<BrowserTabState, 'url'>) {
  return tab.url === HISTORY_PAGE_URL;
}

export function isDownloadsBrowserTab(tab: Pick<BrowserTabState, 'url'>) {
  return tab.url === DOWNLOADS_PAGE_URL;
}

export function isInternalBrowserTab(tab: Pick<BrowserTabState, 'url'>) {
  return isBlankBrowserTab(tab) || isHistoryBrowserTab(tab) || isDownloadsBrowserTab(tab);
}

export function titleForBrowserTab(url: string, title?: string) {
  const trimmed = String(title || '').trim();
  if (isHistoryBrowserTab({ url })) return '기록';
  if (isDownloadsBrowserTab({ url })) return '다운로드';
  if (trimmed && trimmed !== '브라우저') return trimmed;
  if (isBlankBrowserTab({ url })) return '새 탭';
  try {
    return new URL(url).hostname || url;
  } catch {
    return url || '새 탭';
  }
}

export function createBrowserTab(url = NEW_TAB_URL): BrowserTabState {
  tabSeq += 1;
  const nextUrl = url || NEW_TAB_URL;
  return {
    id: `tab-${tabSeq}`,
    url: nextUrl,
    title: titleForBrowserTab(nextUrl),
    loading: !isInternalBrowserTab({ url: nextUrl }),
    canGoBack: false,
    canGoForward: false,
  };
}

export function openBrowserTab(
  tabs: BrowserTabState[],
  activeId: string,
  url = NEW_TAB_URL,
  options: OpenBrowserTabOptions = {},
) {
  const reuseEmpty = options.reuseEmpty !== false && !options.background;
  if (reuseEmpty) {
    const active = tabs.find((tab) => tab.id === activeId);
    if (active && isBlankBrowserTab(active) && url && url !== NEW_TAB_URL) {
      return {
        tabs: tabs.map((tab) => (
          tab.id === activeId
            ? { ...tab, url, title: titleForBrowserTab(url), loading: true }
            : tab
        )),
        activeId,
        reusedId: activeId,
        created: false,
      };
    }
  }

  if (tabs.length >= MAX_BROWSER_TABS) {
    return { tabs, activeId, reusedId: null, created: false, limited: true as const };
  }

  const tab = createBrowserTab(url);
  return {
    tabs: [...tabs, tab],
    activeId: options.background ? activeId : tab.id,
    reusedId: null,
    created: true,
    tab,
  };
}

export function closeBrowserTab(tabs: BrowserTabState[], activeId: string, tabId: string) {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return { tabs, activeId, closedId: null };

  if (tabs.length === 1) {
    const replacement = createBrowserTab();
    return { tabs: [replacement], activeId: replacement.id, closedId: tabId };
  }

  const nextTabs = tabs.filter((tab) => tab.id !== tabId);
  if (activeId !== tabId) return { tabs: nextTabs, activeId, closedId: tabId };
  const nextActive = nextTabs[Math.max(0, index - 1)];
  return { tabs: nextTabs, activeId: nextActive.id, closedId: tabId };
}

export function selectBrowserTabByNumber(tabs: BrowserTabState[], number: number) {
  if (tabs.length === 0 || !Number.isInteger(number) || number < 1) return null;
  if (number === 9) return tabs[tabs.length - 1].id;
  return tabs[number - 1]?.id || null;
}

export function moveBrowserTab(tabs: BrowserTabState[], tabId: string, toIndex: number) {
  const from = tabs.findIndex((tab) => tab.id === tabId);
  if (from < 0 || tabs.length < 2) return tabs;
  let target = Math.max(0, Math.min(tabs.length, Math.trunc(Number(toIndex) || 0)));
  if (from === target || from + 1 === target) return tabs;
  const next = [...tabs];
  const [tab] = next.splice(from, 1);
  if (target > from) target -= 1;
  next.splice(target, 0, tab);
  return next;
}

export function cycleBrowserTab(tabs: BrowserTabState[], activeId: string, delta: number) {
  if (tabs.length === 0) return activeId;
  const index = Math.max(0, tabs.findIndex((tab) => tab.id === activeId));
  const next = (index + delta) % tabs.length;
  return tabs[(next + tabs.length) % tabs.length].id;
}

export function restoreBrowserSession(urls: string[], activeIndex = 0, requestedUrl = '') {
  const cleaned = urls
    .map((url) => String(url || '').trim() || NEW_TAB_URL)
    .slice(0, MAX_BROWSER_TABS);
  const source = cleaned.length > 0 ? cleaned : [NEW_TAB_URL];
  const tabs = source.map((url) => createBrowserTab(url));
  const safeIndex = Math.min(Math.max(0, Math.trunc(Number(activeIndex) || 0)), tabs.length - 1);
  const activeId = tabs[safeIndex].id;

  const requested = String(requestedUrl || '').trim();
  if (!requested || requested === NEW_TAB_URL) {
    return { tabs, activeId };
  }

  const existing = tabs.find((tab) => tab.url === requested);
  if (existing) return { tabs, activeId: existing.id };

  const opened = openBrowserTab(tabs, activeId, requested, { reuseEmpty: true });
  return { tabs: opened.tabs, activeId: opened.activeId };
}
