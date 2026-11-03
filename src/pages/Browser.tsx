import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Code2,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  RotateCw,
  Sparkles,
  Star,
} from 'lucide-react';
import { BookmarkBar, collectManualSaveTargets } from '../components/browser/BookmarkBar';
import { BrowserAiChat, type BrowserAiChatMessage, type BrowserAiChatScript } from '../components/browser/BrowserAiChat';
import { BrowserScriptModal } from '../components/browser/BrowserScriptModal';
import { BookmarkTree } from '../components/browser/BookmarkTree';
import { TabBar } from '../components/browser/TabBar';
import type { ManualDragItem } from '../components/browser/bookmark-dnd';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Input } from '../components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from '../components/ui/use-toast';
import { FIELD_TOOLTIP_CLASSNAME } from '../components/records/FieldValueRenderer';
import { BOOKMARK_BAR_FOLDER_ID, type BrowserBookmark, type BrowserBookmarkFolder, type BrowserScript } from '../types';
import {
  parsePasswordFillPrompt,
  parsePasswordSavePrompt,
  type BrowserPasswordPrompt,
} from '../lib/browserPasswordPrompt';
import { nextBrowserZoomFactor, resolveBrowserMouseButton } from '../lib/browserChrome';
import { parseExternalHttpUrl, resolveBrowserAddressInput } from '../lib/browserNavigation';
import { scriptMatchesUrl } from '../main/lib/browser-url';
import { wrapUserscript, wrapUserscriptForRunAt } from '../main/lib/browser-userscript';
import { getCaptureBrowserPageContextScript } from '../lib/browserPageContext';
import {
  resolveWebviewStartNavigation,
  shouldLoadPendingWebviewUrl,
  upsertBrowserScriptList,
} from '../lib/browserWebviewLoad';
import {
  closeBrowserTab,
  cycleBrowserTab,
  isBlankBrowserTab,
  MAX_BROWSER_TABS,
  NEW_TAB_URL,
  openBrowserTab,
  restoreBrowserSession,
  selectBrowserTabByNumber,
  titleForBrowserTab,
  type BrowserTabState,
} from '../lib/browserTabs';

type EmbeddedWebview = HTMLElement & {
  src: string;
  loadURL: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  reloadIgnoringCache?: () => void;
  stop: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  getTitle: () => string;
  getZoomFactor?: () => number;
  setZoomFactor?: (factor: number) => void;
  executeJavaScript?: (code: string) => Promise<unknown>;
  send?: (channel: string, ...args: unknown[]) => void;
  openDevTools?: () => void;
  closeDevTools?: () => void;
  isDevToolsOpened?: () => boolean;
};

type WebviewIpcMessageEvent = Event & {
  channel?: string;
  args?: unknown[];
};

type SideTab = 'bookmarks' | 'scripts' | 'ai';

function toPreloadUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\/+/, '')}`;
}

function BrowserTooltip({
  label,
  wrapDisabled,
  children,
}: {
  label: string;
  wrapDisabled?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {wrapDisabled ? <span className="inline-flex">{children}</span> : children}
      </TooltipTrigger>
      <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function emptyScript(): BrowserScript {
  return {
    id: '',
    name: '새 스크립트',
    enabled: true,
    matches: [],
    runAt: 'document-idle',
    source: '',
    updatedAt: '',
  };
}

const BrowserPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const requestedUrl = searchParams.get('url') || '';
  const webviewRef = React.useRef<EmbeddedWebview | null>(null);
  const webviewByTabRef = React.useRef(new Map<string, EmbeddedWebview>());
  const addressInputRef = React.useRef<HTMLInputElement | null>(null);
  const addressFocusedRef = React.useRef(false);
  const addressRef = React.useRef(requestedUrl);
  const tabsRef = React.useRef<BrowserTabState[]>([]);
  const activeTabIdRef = React.useRef('');
  const [tabs, setTabs] = React.useState<BrowserTabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState('');
  const [sessionReady, setSessionReady] = React.useState(false);

  const [preloadPath, setPreloadPath] = React.useState('');
  const [partition, setPartition] = React.useState('persist:erp-browser');
  const [address, setAddress] = React.useState(requestedUrl);
  const [sideTab, setSideTab] = React.useState<SideTab>('bookmarks');
  const [sidePanelOpen, setSidePanelOpen] = React.useState(true);
  const [bookmarks, setBookmarks] = React.useState<BrowserBookmark[]>([]);
  const [bookmarkTree, setBookmarkTree] = React.useState<BrowserBookmarkFolder[]>([]);
  const [barBookmarks, setBarBookmarks] = React.useState<BrowserBookmark[]>([]);
  const [manualDrag, setManualDrag] = React.useState<ManualDragItem | null>(null);
  const [scripts, setScripts] = React.useState<BrowserScript[]>([]);
  const [draft, setDraft] = React.useState<BrowserScript>(emptyScript());
  const [scriptModalOpen, setScriptModalOpen] = React.useState(false);
  const [chatInput, setChatInput] = React.useState('');
  const [chatMessages, setChatMessages] = React.useState<BrowserAiChatMessage[]>([]);
  const [chatContextUrl, setChatContextUrl] = React.useState('');
  const chatSeqRef = React.useRef(0);
  const pendingReloadScriptRef = React.useRef<{ tabId: string; source: string } | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [hasOpenAiApiKey, setHasOpenAiApiKey] = React.useState(false);
  const [passwordPrompts, setPasswordPrompts] = React.useState<Record<string, BrowserPasswordPrompt>>({});

  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const currentUrl = activeTab?.url || NEW_TAB_URL;
  const pageTitle = activeTab?.title || '브라우저';
  const canGoBack = Boolean(activeTab?.canGoBack);
  const canGoForward = Boolean(activeTab?.canGoForward);
  const loading = Boolean(activeTab?.loading);

  const refreshLists = React.useCallback(async () => {
    const [nextBookmarks, nextScripts] = await Promise.all([
      window.electronAPI.listBrowserBookmarks(),
      window.electronAPI.listBrowserScripts(),
    ]);
    setBookmarks(nextBookmarks?.items || []);
    setBookmarkTree(nextBookmarks?.tree || []);
    setBarBookmarks(nextBookmarks?.bar || []);
    setScripts(nextScripts);
  }, []);

  const applyBookmarkLists = React.useCallback((result?: { items?: BrowserBookmark[]; tree?: BrowserBookmarkFolder[]; bar?: BrowserBookmark[] } | null) => {
    if (result?.items) setBookmarks(result.items);
    if (result?.bar) setBarBookmarks(result.bar);
    if (result?.tree) setBookmarkTree(result.tree);
  }, []);

  const renameManualBookmark = async (bookmark: BrowserBookmark, title: string) => {
    const result = await window.electronAPI.renameBrowserBookmark({ id: bookmark.id, title });
    if (!result.success) {
      toast({ title: result.error || '북마크 이름을 바꾸지 못했습니다.', variant: 'destructive' });
      return;
    }
    if (result.items || result.tree || result.bar) applyBookmarkLists(result);
    else await refreshLists();
  };

  const refreshOpenAiAvailability = React.useCallback(async () => {
    const config = await window.electronAPI.getConfig();
    setHasOpenAiApiKey(Boolean(config?.hasOpenAiApiKey));
  }, []);

  React.useEffect(() => {
    let ignore = false;
    void refreshLists();
    void Promise.all([
      window.electronAPI.getBrowserPreloadPath(),
      window.electronAPI.getBrowserPartition(),
      window.electronAPI.getConfig(),
    ]).then(([nextPreload, nextPartition, config]) => {
      if (ignore) return;
      setPreloadPath(nextPreload);
      if (nextPartition) setPartition(nextPartition);
      setHasOpenAiApiKey(Boolean(config?.hasOpenAiApiKey));
      const requested = parseExternalHttpUrl(requestedUrl)?.toString() || '';
      const restored = restoreBrowserSession(
        Array.isArray(config?.browserLastTabs) ? config.browserLastTabs : [],
        Number(config?.browserLastTabIndex) || 0,
        requested,
      );
      setTabs(restored.tabs);
      setActiveTabId(restored.activeId);
      const active = restored.tabs.find((tab) => tab.id === restored.activeId);
      const display = active && !isBlankBrowserTab(active) ? active.url : '';
      addressRef.current = display;
      setAddress(display);
      setSessionReady(true);
    });
    return () => {
      ignore = true;
    };
  }, [refreshLists, requestedUrl]);

  React.useEffect(() => {
    const onFocus = () => {
      void refreshOpenAiAvailability();
      void refreshLists();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshLists, refreshOpenAiAvailability]);

  React.useEffect(() => {
    if (!hasOpenAiApiKey && sideTab === 'ai') {
      setSideTab('bookmarks');
    }
  }, [hasOpenAiApiKey, sideTab]);

  const patchTab = React.useCallback((tabId: string, patch: Partial<BrowserTabState>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const syncTabFromWebview = React.useCallback((tabId: string, webview: EmbeddedWebview, extra?: Partial<BrowserTabState>) => {
    try {
      const nextUrl = webview.getURL() || NEW_TAB_URL;
      patchTab(tabId, {
        url: nextUrl,
        title: titleForBrowserTab(nextUrl, webview.getTitle()),
        canGoBack: webview.canGoBack(),
        canGoForward: webview.canGoForward(),
        ...extra,
      });
      if (tabId === activeTabIdRef.current && !addressFocusedRef.current) {
        const display = isBlankBrowserTab({ url: nextUrl }) ? '' : nextUrl;
        addressRef.current = display;
        setAddress(display);
      }
    } catch {
      // webview methods can throw before attachment
    }
  }, [patchTab]);

  const lastMouseNavRef = React.useRef(0);
  const lastZoomAtRef = React.useRef(0);

  const activeWebview = React.useCallback(() => (
    webviewByTabRef.current.get(activeTabIdRef.current) || null
  ), []);

  const toggleActiveWebviewDevTools = React.useCallback(() => {
    const webview = activeWebview();
    if (!webview?.openDevTools) return;
    try {
      if (webview.isDevToolsOpened?.()) webview.closeDevTools?.();
      else webview.openDevTools();
    } catch {
      // DevTools APIs can throw before attachment
    }
  }, [activeWebview]);

  const navigateFromMouseButton = React.useCallback((button: number) => {
    const action = resolveBrowserMouseButton(button);
    const webview = activeWebview();
    if (!action || !webview) return;
    const now = Date.now();
    if (now - lastMouseNavRef.current < 80) return;
    lastMouseNavRef.current = now;
    if (action === 'back') webview.goBack();
    else webview.goForward();
  }, [activeWebview]);

  const clearPasswordPrompt = React.useCallback((tabId: string) => {
    setPasswordPrompts((current) => {
      if (!current[tabId]) return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }, []);

  const applyPageZoom = React.useCallback((direction: 'in' | 'out' | 'reset') => {
    const webview = activeWebview();
    if (!webview?.getZoomFactor || !webview.setZoomFactor) return;
    const now = Date.now();
    if (direction !== 'reset' && now - lastZoomAtRef.current < 45) return;
    lastZoomAtRef.current = now;
    try {
      webview.setZoomFactor(nextBrowserZoomFactor(webview.getZoomFactor(), direction));
    } catch {
      // zoom APIs can throw before the webview is attached
    }
  }, [activeWebview]);

  const lastOpenedTabRef = React.useRef({ url: '', at: 0 });
  const pendingLoadRef = React.useRef(new Map<string, string>());
  const backgroundLoadTimersRef = React.useRef(new Map<string, number>());

  const readWebviewUrl = React.useCallback((webview: EmbeddedWebview) => {
    try {
      return webview.getURL() || NEW_TAB_URL;
    } catch {
      return '';
    }
  }, []);

  const clearDeferredTabLoad = React.useCallback((tabId: string) => {
    const timer = backgroundLoadTimersRef.current.get(tabId);
    if (timer) {
      window.clearTimeout(timer);
      backgroundLoadTimersRef.current.delete(tabId);
    }
    pendingLoadRef.current.delete(tabId);
  }, []);

  const flushDeferredTabLoad = React.useCallback((tabId: string) => {
    const timer = backgroundLoadTimersRef.current.get(tabId);
    if (timer) {
      window.clearTimeout(timer);
      backgroundLoadTimersRef.current.delete(tabId);
    }
    const pending = pendingLoadRef.current.get(tabId);
    const webview = webviewByTabRef.current.get(tabId);
    if (!pending || !webview) return;
    if (!shouldLoadPendingWebviewUrl(readWebviewUrl(webview), pending)) {
      pendingLoadRef.current.delete(tabId);
      return;
    }
    pendingLoadRef.current.delete(tabId);
    try {
      webview.loadURL(pending);
    } catch {
      webview.src = pending;
    }
  }, [readWebviewUrl]);

  const loadUrlInTab = React.useCallback((tabId: string, nextUrl: string) => {
    patchTab(tabId, { url: nextUrl, title: titleForBrowserTab(nextUrl), loading: true });
    const webview = webviewByTabRef.current.get(tabId);
    if (webview?.loadURL) {
      clearDeferredTabLoad(tabId);
      webview.loadURL(nextUrl);
      return;
    }
    pendingLoadRef.current.set(tabId, nextUrl);
  }, [clearDeferredTabLoad, patchTab]);

  const openTab = React.useCallback((rawUrl?: string, options?: { background?: boolean; newTab?: boolean }) => {
    const nextUrl = rawUrl
      ? (rawUrl === NEW_TAB_URL ? NEW_TAB_URL : resolveBrowserAddressInput(rawUrl))
      : NEW_TAB_URL;
    if (rawUrl && rawUrl !== NEW_TAB_URL && !nextUrl) {
      toast({ title: '주소를 확인할 수 없습니다.', variant: 'destructive' });
      return;
    }
    const url = nextUrl || NEW_TAB_URL;
    if (url !== NEW_TAB_URL) {
      const now = Date.now();
      if (url === lastOpenedTabRef.current.url && now - lastOpenedTabRef.current.at < 250) return;
      lastOpenedTabRef.current = { url, at: now };
    }
    const result = openBrowserTab(tabsRef.current, activeTabIdRef.current, url, {
      background: options?.background,
      reuseEmpty: !options?.newTab && !options?.background,
    });
    if (result.limited) {
      toast({ title: `탭은 최대 ${MAX_BROWSER_TABS}개까지 열 수 있습니다.` });
      return;
    }
    setTabs(result.tabs);
    setActiveTabId(result.activeId);
    if (result.reusedId) loadUrlInTab(result.reusedId, url);
    else if (result.created && result.tab && url !== NEW_TAB_URL) loadUrlInTab(result.tab.id, url);
    if (!options?.background && url !== NEW_TAB_URL) {
      addressRef.current = url;
      setAddress(url);
    }
    if (!options?.background && url === NEW_TAB_URL) {
      addressRef.current = '';
      setAddress('');
      window.setTimeout(() => addressInputRef.current?.focus(), 0);
    }
  }, [loadUrlInTab]);

  const closeTab = React.useCallback((tabId: string) => {
    const result = closeBrowserTab(tabsRef.current, activeTabIdRef.current, tabId);
    clearDeferredTabLoad(tabId);
    const webview = webviewByTabRef.current.get(tabId);
    if (webview) {
      webviewByTabRef.current.delete(tabId);
      webview.remove();
    }
    setTabs(result.tabs);
    setActiveTabId(result.activeId);
  }, [clearDeferredTabLoad]);

  const navigateTo = React.useCallback((rawUrl: string) => {
    const nextUrl = resolveBrowserAddressInput(rawUrl);
    if (!nextUrl) {
      toast({ title: '주소를 확인할 수 없습니다.', variant: 'destructive' });
      return;
    }
    addressRef.current = nextUrl;
    setAddress(nextUrl);
    loadUrlInTab(activeTabIdRef.current, nextUrl);
  }, [loadUrlInTab]);

  const openBookmark = React.useCallback((bookmark: { url: string }, options?: { newTab?: boolean; background?: boolean }) => {
    if (options?.newTab || options?.background) {
      openTab(bookmark.url, options);
      return;
    }
    navigateTo(bookmark.url);
  }, [navigateTo, openTab]);

  React.useEffect(() => {
    webviewRef.current = activeWebview();
    if (addressFocusedRef.current) return;
    const display = isBlankBrowserTab({ url: currentUrl }) ? '' : currentUrl;
    addressRef.current = display;
    setAddress(display);
  }, [activeTabId, activeWebview, currentUrl, tabs]);

  React.useEffect(() => {
    return window.electronAPI.onBrowserOpenUrl((nextUrl, options) => {
      openTab(nextUrl, { background: options?.background });
    });
  }, [openTab]);

  React.useEffect(() => {
    return window.electronAPI.onBrowserShortcut((action) => {
      const webview = activeWebview();
      if (action === 'focus-address') {
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
        return;
      }
      if (action === 'new-tab') {
        openTab(NEW_TAB_URL, { newTab: true });
        return;
      }
      if (action === 'close-tab') {
        closeTab(activeTabIdRef.current);
        return;
      }
      if (action === 'next-tab') {
        setActiveTabId(cycleBrowserTab(tabsRef.current, activeTabIdRef.current, 1));
        return;
      }
      if (action === 'prev-tab') {
        setActiveTabId(cycleBrowserTab(tabsRef.current, activeTabIdRef.current, -1));
        return;
      }
      const tabNumber = /^tab-([1-9])$/.exec(action);
      if (tabNumber) {
        const nextId = selectBrowserTabByNumber(tabsRef.current, Number(tabNumber[1]));
        if (nextId) setActiveTabId(nextId);
        return;
      }
      if (action === 'devtools') {
        toggleActiveWebviewDevTools();
        return;
      }
      if (!webview) return;
      if (action === 'reload') webview.reload();
      if (action === 'hard-reload') {
        if (webview.reloadIgnoringCache) webview.reloadIgnoringCache();
        else webview.reload();
      }
      if (action === 'back' && webview.canGoBack()) webview.goBack();
      if (action === 'forward' && webview.canGoForward()) webview.goForward();
      if (action === 'stop') webview.stop();
      if (action === 'zoom-in') applyPageZoom('in');
      if (action === 'zoom-out') applyPageZoom('out');
      if (action === 'zoom-reset') applyPageZoom('reset');
    });
  }, [activeWebview, applyPageZoom, closeTab, openTab, toggleActiveWebviewDevTools]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isF12 = event.key === 'F12' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
      const isInspect = (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'i';
      if (!isF12 && !isInspect) return;
      event.preventDefault();
      event.stopPropagation();
      toggleActiveWebviewDevTools();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [toggleActiveWebviewDevTools]);

  React.useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (!resolveBrowserMouseButton(event.button)) return;
      event.preventDefault();
      event.stopPropagation();
      navigateFromMouseButton(event.button);
    };
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      applyPageZoom(event.deltaY < 0 ? 'in' : 'out');
    };
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('auxclick', onMouseUp, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('auxclick', onMouseUp, true);
      window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
    };
  }, [applyPageZoom, navigateFromMouseButton]);

  const handleWebviewIpcRef = React.useRef<(tabId: string, message: WebviewIpcMessageEvent) => void>(() => undefined);
  handleWebviewIpcRef.current = (tabId, message) => {
    if (message.channel === 'browser:mouse-button') {
      navigateFromMouseButton(Number(message.args?.[0]));
      return;
    }
    if (message.channel === 'browser:zoom-wheel') {
      applyPageZoom(Number(message.args?.[0]) < 0 ? 'in' : 'out');
      return;
    }
    if (message.channel === 'browser:open-tab') {
      const first = message.args?.[0];
      const url = typeof first === 'string' ? first : (first as { url?: string } | undefined)?.url;
      const background = typeof first === 'object' && first
        ? (first as { background?: boolean }).background !== false
        : message.args?.[1] !== false;
      if (url) openTab(url, { background, newTab: true });
      return;
    }
    if (message.channel === 'browser:password-prompt') {
      const prompt = parsePasswordSavePrompt(message.args?.[0]);
      if (prompt) setPasswordPrompts((current) => ({ ...current, [tabId]: prompt }));
      return;
    }
    if (message.channel === 'browser:password-fill') {
      const prompt = parsePasswordFillPrompt(message.args?.[0]);
      if (!prompt) return;
      setPasswordPrompts((current) => {
        if (current[tabId]?.kind === 'save') return current;
        return { ...current, [tabId]: prompt };
      });
    }
  };

  const attachTabHost = React.useCallback((tabId: string, host: HTMLDivElement | null) => {
    if (!host || !preloadPath) return;
    let webview = webviewByTabRef.current.get(tabId);
    if (!webview) {
      webview = document.createElement('webview') as EmbeddedWebview;
      webview.className = 'h-full w-full';
      webview.style.display = 'inline-flex';
      webview.style.width = '100%';
      webview.style.height = '100%';
      webview.dataset.tabId = tabId;
      webview.setAttribute('partition', partition);
      webview.setAttribute('preload', toPreloadUrl(preloadPath));
      webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
      webview.setAttribute('allowpopups', 'true');
      const startUrl = pendingLoadRef.current.get(tabId)
        || tabsRef.current.find((item) => item.id === tabId)?.url
        || NEW_TAB_URL;
      pendingLoadRef.current.delete(tabId);
      const tabIndex = Math.max(0, tabsRef.current.findIndex((item) => item.id === tabId));
      const navigation = resolveWebviewStartNavigation({
        startUrl,
        isActive: tabId === activeTabIdRef.current,
        tabIndex,
      });
      let ignoreInitialBlank = !isBlankBrowserTab({ url: startUrl });
      webview.src = navigation.src;

      const onNav = () => {
        try {
          const url = webview.getURL() || NEW_TAB_URL;
          if (ignoreInitialBlank && isBlankBrowserTab({ url })) return;
          ignoreInitialBlank = false;
        } catch {
          // webview methods can throw before attachment
        }
        syncTabFromWebview(tabId, webview, { loading: false });
      };
      const onTitle = (event: Event) => {
        const title = (event as Event & { title?: string }).title;
        if (title) patchTab(tabId, { title: titleForBrowserTab(webview.getURL?.() || NEW_TAB_URL, title) });
      };

      webview.addEventListener('did-start-loading', () => {
        patchTab(tabId, { loading: true });
        setPasswordPrompts((current) => {
          if (current[tabId]?.kind !== 'fill') return current;
          const next = { ...current };
          delete next[tabId];
          return next;
        });
      });
      webview.addEventListener('did-stop-loading', onNav);
      webview.addEventListener('did-navigate', onNav);
      webview.addEventListener('did-navigate-in-page', onNav);
      webview.addEventListener('did-finish-load', onNav);
      webview.addEventListener('page-title-updated', onTitle);
      webview.addEventListener('did-fail-load', onNav);
      if (navigation.deferUrl) {
        pendingLoadRef.current.set(tabId, navigation.deferUrl);
        const timer = window.setTimeout(() => flushDeferredTabLoad(tabId), navigation.deferMs);
        backgroundLoadTimersRef.current.set(tabId, timer);
      }
      webview.addEventListener('ipc-message', (event: Event) => {
        handleWebviewIpcRef.current(tabId, event as WebviewIpcMessageEvent);
      });
      webviewByTabRef.current.set(tabId, webview);
    }
    if (webview.parentElement !== host) host.replaceChildren(webview);
    if (tabId === activeTabIdRef.current) webviewRef.current = webview;
  }, [flushDeferredTabLoad, partition, patchTab, preloadPath, syncTabFromWebview]);

  React.useEffect(() => {
    flushDeferredTabLoad(activeTabId);
  }, [activeTabId, flushDeferredTabLoad]);

  React.useEffect(() => {
    const ids = new Set(tabs.map((tab) => tab.id));
    webviewByTabRef.current.forEach((webview, tabId) => {
      if (ids.has(tabId)) return;
      clearDeferredTabLoad(tabId);
      webviewByTabRef.current.delete(tabId);
      webview.remove();
    });
    setPasswordPrompts((current) => {
      let changed = false;
      const next = { ...current };
      Object.keys(next).forEach((tabId) => {
        if (ids.has(tabId)) return;
        delete next[tabId];
        changed = true;
      });
      return changed ? next : current;
    });
  }, [clearDeferredTabLoad, tabs]);

  const [canonicalCurrent, setCanonicalCurrent] = React.useState('');
  React.useEffect(() => {
    let ignore = false;
    if (!currentUrl || currentUrl === 'about:blank') {
      setCanonicalCurrent('');
      return undefined;
    }
    void window.electronAPI.canonicalizeBrowserUrl(currentUrl).then((value) => {
      if (!ignore) setCanonicalCurrent(value || currentUrl);
    });
    return () => {
      ignore = true;
    };
  }, [currentUrl]);

  React.useEffect(() => {
    if (!sessionReady || tabs.length === 0) return undefined;
    const urls = tabs.map((tab) => tab.url || NEW_TAB_URL);
    const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
    const save = () => {
      void window.electronAPI.saveBrowserLastUrl({ urls, activeIndex });
    };
    const timer = window.setTimeout(save, 400);
    return () => {
      window.clearTimeout(timer);
      save();
    };
  }, [activeTabId, sessionReady, tabs]);

  const matchesCurrentUrl = (item: BrowserBookmark) => (
    Boolean(item.url) && (item.url === canonicalCurrent || item.url === currentUrl)
  );
  const currentManualBookmark = bookmarks.find((item) => item.source !== 'record' && matchesCurrentUrl(item));
  const currentRecordBookmark = bookmarks.find((item) => item.source === 'record' && matchesCurrentUrl(item));
  const recordLocked = Boolean(currentRecordBookmark);
  const starred = Boolean(currentManualBookmark || currentRecordBookmark);

  const saveTargets = React.useMemo(() => collectManualSaveTargets(bookmarkTree), [bookmarkTree]);

  const removeCurrentBookmark = async () => {
    if (!currentManualBookmark) return;
    await window.electronAPI.removeBrowserBookmark(currentManualBookmark.id);
    await refreshLists();
  };

  const saveBookmarkTo = async (folderId: string | null) => {
    if (currentUrl === 'about:blank' || recordLocked) return;
    const result = await window.electronAPI.addBrowserBookmark({
      url: currentUrl,
      title: pageTitle,
      folderId,
    });
    if (!result.success) {
      toast({ title: result.error || '북마크를 저장하지 못했습니다.', variant: 'destructive' });
      return;
    }
    await refreshLists();
  };

  const collectActivePageUrls = () => {
    const urls = [currentUrl, canonicalCurrent];
    try {
      const guestUrl = activeWebview()?.getURL?.();
      if (guestUrl) urls.push(guestUrl);
    } catch {
      // webview methods can throw before attachment
    }
    return urls;
  };

  const pageMatchesScript = (matches: unknown) => scriptMatchesUrl(matches, collectActivePageUrls());

  const applyScriptToActivePage = (source: string) => {
    const webview = activeWebview();
    if (!webview?.executeJavaScript) return false;
    void webview.executeJavaScript(wrapUserscript(source)).catch(() => undefined);
    return true;
  };

  const reloadActivePage = (source?: string) => {
    const webview = activeWebview();
    const tabId = activeTabIdRef.current;
    if (!webview) return false;
    pendingReloadScriptRef.current = source ? { tabId, source } : null;
    const onFinishLoad = () => {
      webview.removeEventListener('did-finish-load', onFinishLoad);
      const pending = pendingReloadScriptRef.current;
      if (!pending || pending.tabId !== tabId) return;
      pendingReloadScriptRef.current = null;
      if (!pending.source || !webview.executeJavaScript) return;
      void webview.executeJavaScript(wrapUserscriptForRunAt(pending.source, 'document-idle')).catch(() => undefined);
    };
    if (source) webview.addEventListener('did-finish-load', onFinishLoad);
    try {
      webview.reload();
      return true;
    } catch {
      if (source) webview.removeEventListener('did-finish-load', onFinishLoad);
      pendingReloadScriptRef.current = null;
      return false;
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const result = await window.electronAPI.saveBrowserScript({
        id: draft.id || undefined,
        name: draft.name,
        enabled: draft.enabled,
        matches: draft.matches,
        runAt: draft.runAt,
        source: draft.source,
      });
      if (!result.success || !result.script) {
        toast({ title: result.error || '스크립트를 저장하지 못했습니다.', variant: 'destructive' });
        return;
      }
      setDraft(result.script);
      setScriptModalOpen(false);
      setScripts((current) => upsertBrowserScriptList(current, result.script));
      const matchesPage = pageMatchesScript(
        result.script.matches?.length ? result.script.matches : draft.matches,
      );
      const refreshed = matchesPage && reloadActivePage();
      toast({
        title: refreshed
          ? '스크립트를 저장하고 현재 페이지를 새로고침했습니다.'
          : matchesPage
            ? '스크립트를 저장했습니다.'
            : '스크립트를 저장했습니다. 현재 페이지는 대상이 아니라 적용하지 않았습니다.',
      });
    } finally {
      setSaving(false);
    }
  };

  const captureActiveTabPage = async () => {
    const webview = activeWebview();
    const fallbackTitle = activeTab?.title && activeTab.title !== '새 탭' ? activeTab.title : '';
    if (!webview || isBlankBrowserTab({ url: currentUrl })) {
      return { title: fallbackTitle, html: '' };
    }
    try {
      const result = await webview.executeJavaScript?.(getCaptureBrowserPageContextScript());
      const captured = result && typeof result === 'object' ? result as { title?: unknown; html?: unknown } : null;
      const html = typeof captured?.html === 'string' ? captured.html : '';
      const title = typeof captured?.title === 'string' && captured.title.trim()
        ? captured.title.trim()
        : (webview.getTitle?.() || fallbackTitle);
      return { title, html };
    } catch {
      try {
        return { title: webview.getTitle?.() || fallbackTitle, html: '' };
      } catch {
        return { title: fallbackTitle, html: '' };
      }
    }
  };

  const nextChatId = () => {
    chatSeqRef.current += 1;
    return `chat-${chatSeqRef.current}`;
  };

  const resetChat = () => {
    setChatInput('');
    setChatMessages([]);
    setChatContextUrl('');
  };

  const openScriptModal = (script: BrowserScript) => {
    setDraft(script);
    setScriptModalOpen(true);
  };

  const applyChatScript = (script: BrowserAiChatScript) => {
    openScriptModal({
      ...emptyScript(),
      name: script.name,
      matches: script.matches,
      source: script.source,
    });
    if (isBlankBrowserTab({ url: currentUrl }) || !pageMatchesScript(script.matches)) {
      toast({ title: '스크립트 초안에 넣었습니다. 확인 후 저장하세요.' });
      return;
    }
    if (reloadActivePage(script.source)) {
      toast({ title: '스크립트 초안에 넣고 현재 페이지를 새로고침했습니다.' });
      return;
    }
    toast({ title: '스크립트 초안에 넣었습니다. 확인 후 저장하세요.' });
  };

  const deleteDraft = async () => {
    if (!draft.id) return;
    const matchesPage = pageMatchesScript(draft.matches);
    const result = await window.electronAPI.deleteBrowserScript(draft.id);
    if (!result.success) {
      toast({ title: result.error || '스크립트를 삭제하지 못했습니다.', variant: 'destructive' });
      return;
    }
    const deletedId = draft.id;
    setDraft(emptyScript());
    setScriptModalOpen(false);
    setScripts((current) => current.filter((script) => script.id !== deletedId));
    if (matchesPage) reloadActivePage();
    toast({
      title: matchesPage
        ? '스크립트를 삭제하고 현재 페이지에 반영했습니다.'
        : '스크립트를 삭제했습니다. 현재 페이지는 대상이 아니라 적용하지 않았습니다.',
    });
  };

  const testChatScript = (script: BrowserAiChatScript) => {
    if (isBlankBrowserTab({ url: currentUrl })) {
      toast({ title: '테스트를 적용할 페이지가 없습니다.', variant: 'destructive' });
      return;
    }
    if (!pageMatchesScript(script.matches)) {
      toast({ title: '현재 페이지는 이 스크립트의 대상이 아닙니다.', variant: 'destructive' });
      return;
    }
    if (reloadActivePage(script.source) || applyScriptToActivePage(script.source)) {
      toast({ title: '테스트 스크립트를 적용하기 위해 페이지를 새로고침했습니다.' });
      return;
    }
    toast({ title: '테스트를 적용할 페이지가 없습니다.', variant: 'destructive' });
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || generating) return;
    const history = chatMessages.map((message) => ({
      role: message.role,
      content: message.raw || message.content,
    }));
    setChatMessages((current) => [...current, { id: nextChatId(), role: 'user', content: text }]);
    setChatInput('');
    setGenerating(true);
    try {
      const includePageContext = chatContextUrl !== currentUrl;
      const page = includePageContext ? await captureActiveTabPage() : { title: '', html: '' };
      const result = await window.electronAPI.generateBrowserScript({
        url: currentUrl,
        title: page.title,
        pageHtml: page.html,
        includePageContext,
        messages: [...history, { role: 'user', content: text }],
      });
      if (!result.success) {
        toast({ title: result.error || '응답을 받지 못했습니다.', variant: 'destructive' });
        return;
      }
      if (includePageContext) setChatContextUrl(currentUrl);
      setChatMessages((current) => [
        ...current,
        {
          id: nextChatId(),
          role: 'assistant',
          content: result.display || result.reply || '응답을 표시할 수 없습니다.',
          raw: result.reply || result.display,
          script: result.source
            ? {
              name: result.name || '새 스크립트',
              matches: result.matches || ['*'],
              source: result.source,
            }
            : null,
        },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const activePasswordPrompt = passwordPrompts[activeTabId];

  const saveActivePassword = async () => {
    if (activePasswordPrompt?.kind !== 'save') return;
    const result = await window.electronAPI.commitBrowserPassword(activePasswordPrompt.pendingId);
    if (!result.success) {
      toast({ title: result.error || '로그인 정보를 저장하지 못했습니다.', variant: 'destructive' });
      return;
    }
    clearPasswordPrompt(activeTabId);
  };

  const dismissActivePassword = async () => {
    if (activePasswordPrompt?.kind === 'save') {
      await window.electronAPI.dismissBrowserPassword(activePasswordPrompt.pendingId);
    }
    clearPasswordPrompt(activeTabId);
  };

  const neverSaveActivePassword = async () => {
    if (activePasswordPrompt?.kind !== 'save') return;
    const result = await window.electronAPI.neverSaveBrowserOrigin(activePasswordPrompt.origin);
    if (!result.success) {
      toast({ title: result.error || '이 사이트를 제외하지 못했습니다.', variant: 'destructive' });
      return;
    }
    clearPasswordPrompt(activeTabId);
  };

  const fillActivePassword = (id: string) => {
    webviewByTabRef.current.get(activeTabId)?.send?.('browser:fill-login', { id });
    clearPasswordPrompt(activeTabId);
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col bg-discord-bg">
        <TabBar
          tabs={tabs}
          activeId={activeTabId}
          onSelect={setActiveTabId}
          onClose={closeTab}
          onNewTab={() => openTab(NEW_TAB_URL, { newTab: true })}
        />
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-800 px-3 py-2">
          <BrowserTooltip label="뒤로 (Alt+←)" wrapDisabled={!canGoBack}>
            <Button variant="ghost" className="h-8 w-8 p-0" disabled={!canGoBack} aria-label="뒤로" onClick={() => webviewRef.current?.goBack()}>
              <ArrowLeft size={16} />
            </Button>
          </BrowserTooltip>
          <BrowserTooltip label="앞으로 (Alt+→)" wrapDisabled={!canGoForward}>
            <Button variant="ghost" className="h-8 w-8 p-0" disabled={!canGoForward} aria-label="앞으로" onClick={() => webviewRef.current?.goForward()}>
              <ArrowRight size={16} />
            </Button>
          </BrowserTooltip>
          <BrowserTooltip label={loading ? '불러오는 중' : '새로고침 (F5)'}>
            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="새로고침" onClick={() => webviewRef.current?.reload()}>
              <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </BrowserTooltip>
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              navigateTo(addressRef.current);
            }}
          >
            <Input
              ref={addressInputRef}
              value={address}
              onChange={(event) => {
                addressRef.current = event.target.value;
                setAddress(event.target.value);
              }}
              onFocus={() => {
                addressFocusedRef.current = true;
              }}
              onBlur={(event) => {
                addressFocusedRef.current = false;
                const form = event.currentTarget.form;
                window.setTimeout(() => {
                  if (addressFocusedRef.current) return;
                  const active = document.activeElement;
                  if (form && active instanceof HTMLElement && form.contains(active)) return;
                  const webview = activeWebview();
                  if (webview) syncTabFromWebview(activeTabIdRef.current, webview);
                }, 0);
              }}
              placeholder="주소 또는 검색어 입력"
              className="h-8 bg-discord-sidebar border-gray-600 text-sm text-discord-text"
            />
            <BrowserTooltip label="이동 또는 검색">
              <Button type="submit" className="h-8 bg-discord-accent hover:bg-blue-600">이동</Button>
            </BrowserTooltip>
          </form>
          <BrowserTooltip
            label={recordLocked ? '레코드에서 자동 등록된 북마크입니다' : starred ? '북마크 해제' : '북마크할 위치 선택'}
            wrapDisabled
          >
            {starred && !recordLocked ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-discord-hover disabled:opacity-100"
                disabled={currentUrl === 'about:blank'}
                aria-label="북마크 해제"
                onClick={() => void removeCurrentBookmark()}
              >
                <Star size={16} className="fill-yellow-400 text-yellow-400" />
              </button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-100 ${
                      recordLocked ? 'cursor-not-allowed' : 'hover:bg-discord-hover'
                    }`}
                    disabled={currentUrl === 'about:blank' || recordLocked}
                    aria-label={recordLocked ? '레코드에서 자동 등록된 북마크입니다' : '북마크할 위치 선택'}
                  >
                    <Star size={16} className={starred ? 'fill-yellow-400 text-yellow-400' : 'text-discord-text'} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-72 min-w-[180px] overflow-y-auto border-gray-700 bg-discord-sidebar text-discord-text discord-scrollbar"
                >
                  {saveTargets.map((target, index) => (
                    <React.Fragment key={`${target.id ?? 'manual'}:${target.name}`}>
                      {index === 1 && <DropdownMenuSeparator className="bg-gray-700" />}
                      <DropdownMenuItem
                        className="cursor-pointer text-discord-text hover:bg-discord-hover focus:bg-discord-hover focus:text-discord-text"
                        style={{ paddingLeft: 8 + target.depth * 12 }}
                        onSelect={() => void saveBookmarkTo(target.id)}
                      >
                        {target.name}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </BrowserTooltip>
          <BrowserTooltip label={sidePanelOpen ? '사이드 메뉴 접기' : '사이드 메뉴 펼치기'}>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              aria-label={sidePanelOpen ? '사이드 메뉴 접기' : '사이드 메뉴 펼치기'}
              onClick={() => setSidePanelOpen((open) => !open)}
            >
              {sidePanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </Button>
          </BrowserTooltip>
        </div>

        <BookmarkBar
          bookmarks={barBookmarks}
          activeUrls={[canonicalCurrent, currentUrl].filter(Boolean)}
          acceptDrop={manualDrag?.kind === 'bookmark'}
          draggingId={manualDrag?.kind === 'bookmark' ? manualDrag.id : null}
          onOpen={openBookmark}
          onRemove={async (bookmark) => {
            await window.electronAPI.removeBrowserBookmark(bookmark.id);
            await refreshLists();
          }}
          onRename={renameManualBookmark}
          onDragChange={(item) => {
            setManualDrag(item);
            if (item?.kind === 'bookmark') {
              setSidePanelOpen(true);
              setSideTab('bookmarks');
            }
          }}
          onDropBookmark={(payload) => {
            void window.electronAPI.moveManualBookmarkItem({
              kind: 'bookmark',
              id: payload.id,
              parentId: BOOKMARK_BAR_FOLDER_ID,
              index: payload.index,
            }).then(async (result) => {
              if (!result.success) {
                toast({ title: result.error || '북마크 바로 옮기지 못했습니다.', variant: 'destructive' });
                return;
              }
              if (result.items || result.tree || result.bar) applyBookmarkLists(result);
              else await refreshLists();
            });
          }}
        />

        {activePasswordPrompt?.kind === 'save' && (
          <div className="flex items-center gap-2 border-b border-gray-800 bg-discord-sidebar px-3 py-2 text-sm text-discord-text">
            <span className="min-w-0 flex-1 truncate">
              {activePasswordPrompt.updated
                ? `${activePasswordPrompt.origin} 비밀번호가 바뀌었습니다. 업데이트할까요?`
                : `${activePasswordPrompt.origin} 로그인 정보를 저장할까요?`}
              <span className="ml-2 text-discord-muted">{activePasswordPrompt.username}</span>
            </span>
            <Button className="h-7 bg-discord-accent px-3 text-white hover:bg-blue-600" onClick={() => void saveActivePassword()}>
              {activePasswordPrompt.updated ? '업데이트' : '저장'}
            </Button>
            <Button variant="ghost" className="h-7 px-3" onClick={() => void dismissActivePassword()}>
              나중에
            </Button>
            <Button variant="ghost" className="h-7 px-3" onClick={() => void neverSaveActivePassword()}>
              이 사이트는 안 함
            </Button>
          </div>
        )}

        {activePasswordPrompt?.kind === 'fill' && (
          <div className="flex items-center gap-2 border-b border-gray-800 bg-discord-sidebar px-3 py-2 text-sm text-discord-text">
            <span className="shrink-0 text-discord-muted">저장된 계정으로 입력할까요?</span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {activePasswordPrompt.accounts.map((account) => (
                <Button
                  key={account.id}
                  variant="ghost"
                  className="h-7 max-w-full truncate px-3"
                  onClick={() => fillActivePassword(account.id)}
                >
                  {account.username}
                </Button>
              ))}
            </div>
            <Button variant="ghost" className="h-7 shrink-0 px-3" onClick={() => void dismissActivePassword()}>
              나중에
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 bg-black">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                ref={(node) => attachTabHost(tab.id, node)}
                className={`absolute inset-0 ${tab.id === activeTabId ? '' : 'invisible pointer-events-none'}`}
              />
            ))}
            {(!preloadPath || !sessionReady) && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-discord-muted">브라우저 준비 중...</div>
            )}
            {isBlankBrowserTab({ url: currentUrl }) && !loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-discord-bg/80">
                <div className="text-center text-sm text-discord-muted">
                  <Globe className="mx-auto mb-2" size={28} />
                  주소를 입력하거나 북마크를 선택하세요
                </div>
              </div>
            )}
          </div>

          {sidePanelOpen && (
          <aside className="flex w-80 shrink-0 flex-col border-l border-gray-800 bg-discord-sidebar">
            <div className="flex shrink-0 border-b border-gray-800">
              {([
                ['bookmarks', Bookmark, '북마크'],
                ['scripts', Code2, '스크립트'],
                ...(hasOpenAiApiKey ? [['ai', Sparkles, 'AI'] as const] : []),
              ] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSideTab(id)}
                  aria-label={label}
                  className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 text-sm ${
                    sideTab === id ? 'bg-discord-accent text-white' : 'text-discord-muted hover:bg-discord-hover hover:text-discord-text'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {sideTab === 'bookmarks' && (
                <BookmarkTree
                  tree={bookmarkTree}
                  activeUrls={[canonicalCurrent, currentUrl].filter(Boolean)}
                  onOpen={openBookmark}
                  onRemoveManual={async (bookmark) => {
                    await window.electronAPI.removeBrowserBookmark(bookmark.id);
                    await refreshLists();
                  }}
                  onRenameManual={renameManualBookmark}
                  onDragChange={setManualDrag}
                  externalDrag={manualDrag}
                  onCreateManualFolder={async () => {
                    const result = await window.electronAPI.addBrowserBookmarkFolder();
                    if (!result.success) {
                      toast({ title: result.error || '폴더를 만들지 못했습니다.', variant: 'destructive' });
                      return;
                    }
                    await refreshLists();
                  }}
                  onRenameManualFolder={async (folder, name) => {
                    const result = await window.electronAPI.renameBrowserBookmarkFolder({ id: folder.id, name });
                    if (!result.success) {
                      toast({ title: result.error || '폴더 이름을 바꾸지 못했습니다.', variant: 'destructive' });
                      return;
                    }
                    await refreshLists();
                  }}
                  onRemoveManualFolder={async (folder) => {
                    const result = await window.electronAPI.removeBrowserBookmarkFolder(folder.id);
                    if (!result.success) {
                      toast({ title: result.error || '폴더를 삭제하지 못했습니다.', variant: 'destructive' });
                      return;
                    }
                    await refreshLists();
                  }}
                  onMoveManualItem={async (payload) => {
                    const result = await window.electronAPI.moveManualBookmarkItem(payload);
                    if (!result.success) {
                      toast({ title: result.error || '순서를 바꾸지 못했습니다.', variant: 'destructive' });
                      return;
                    }
                    if (result.items || result.tree || result.bar) applyBookmarkLists(result);
                    else await refreshLists();
                  }}
                />
              )}

              {sideTab === 'scripts' && (
                <div className="flex h-full flex-col">
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto discord-scrollbar p-3">
                    {scripts.length === 0 && (
                      <p className="px-1 py-6 text-center text-sm leading-relaxed text-discord-muted">
                        저장된 스크립트가 없습니다.
                      </p>
                    )}
                    {scripts.map((script) => {
                      const runningHere = Boolean(script.enabled) && pageMatchesScript(script.matches);
                      return (
                      <BrowserTooltip
                        key={script.id}
                        label={`${script.name} (${runningHere ? '이 페이지에서 작동 중' : script.enabled ? '이 페이지 대상 아님' : '꺼짐'})`}
                      >
                        <button
                          type="button"
                          onClick={() => openScriptModal(script)}
                          className="flex w-full items-start rounded-md px-2 py-1.5 text-left text-discord-text hover:bg-discord-hover"
                        >
                          <span
                            className={`mt-1.5 mr-2 h-2 w-2 shrink-0 rounded-full ${runningHere ? 'bg-green-500' : 'bg-gray-500'}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{script.name}</span>
                            {script.matches.length > 0 && (
                              <span className="mt-0.5 block truncate text-xs text-discord-muted">
                                {script.matches.join(', ')}
                              </span>
                            )}
                          </span>
                          <span className={`ml-2 shrink-0 pt-0.5 text-sm ${script.enabled ? 'text-discord-accent' : 'text-discord-muted'}`}>
                            {script.enabled ? '켜짐' : '꺼짐'}
                          </span>
                        </button>
                      </BrowserTooltip>
                      );
                    })}
                  </div>
                  <div className="shrink-0 border-t border-gray-800 p-3">
                    <BrowserTooltip label="새 스크립트 만들기">
                      <Button
                        variant="outline"
                        className="h-8 w-full border-gray-600 text-sm"
                        onClick={() => openScriptModal(emptyScript())}
                      >
                        새 스크립트
                      </Button>
                    </BrowserTooltip>
                  </div>
                </div>
              )}

              {hasOpenAiApiKey && sideTab === 'ai' && (
                <BrowserAiChat
                  currentUrl={currentUrl}
                  contextUrl={chatContextUrl}
                  generating={generating}
                  messages={chatMessages}
                  input={chatInput}
                  onInputChange={setChatInput}
                  onSend={() => void sendChat()}
                  onNewChat={resetChat}
                  onApplyScript={applyChatScript}
                  onTestScript={testChatScript}
                />
              )}
            </div>
          </aside>
          )}
        </div>
      </div>
      <BrowserScriptModal
        open={scriptModalOpen}
        draft={draft}
        saving={saving}
        onChange={setDraft}
        onClose={() => setScriptModalOpen(false)}
        onSave={() => void saveDraft()}
        onDelete={draft.id ? () => void deleteDraft() : undefined}
      />
    </div>
  );
};

export default BrowserPage;
