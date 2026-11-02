import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Code2,
  ExternalLink,
  Globe,
  RotateCw,
  Sparkles,
  Star,
} from 'lucide-react';
import { BookmarkTree } from '../components/browser/BookmarkTree';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../components/ui/use-toast';
import type { BrowserBookmark, BrowserBookmarkFolder, BrowserScript } from '../types';
import { parseExternalHttpUrl } from '../lib/browserNavigation';

type EmbeddedWebview = HTMLElement & {
  src: string;
  loadURL: (url: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  getTitle: () => string;
};

type SideTab = 'bookmarks' | 'scripts' | 'ai';

function toPreloadUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\/+/, '')}`;
}

function emptyScript(): BrowserScript {
  return {
    id: '',
    name: '새 스크립트',
    enabled: true,
    matches: ['*://www.youtube.com/*'],
    runAt: 'document-idle',
    source: '',
    updatedAt: '',
  };
}

const BrowserPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const requestedUrl = searchParams.get('url') || '';
  const webviewRef = React.useRef<EmbeddedWebview | null>(null);
  const webviewHostRef = React.useRef<HTMLDivElement | null>(null);
  const addressFocusedRef = React.useRef(false);
  const pendingUrlRef = React.useRef(parseExternalHttpUrl(requestedUrl)?.toString() || '');

  const [preloadPath, setPreloadPath] = React.useState('');
  const [partition, setPartition] = React.useState('persist:erp-browser');
  const [address, setAddress] = React.useState(requestedUrl);
  const [currentUrl, setCurrentUrl] = React.useState('about:blank');
  const [pageTitle, setPageTitle] = React.useState('브라우저');
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [canGoForward, setCanGoForward] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [sideTab, setSideTab] = React.useState<SideTab>('bookmarks');
  const [bookmarks, setBookmarks] = React.useState<BrowserBookmark[]>([]);
  const [bookmarkTree, setBookmarkTree] = React.useState<BrowserBookmarkFolder[]>([]);
  const [scripts, setScripts] = React.useState<BrowserScript[]>([]);
  const [draft, setDraft] = React.useState<BrowserScript>(emptyScript());
  const [intent, setIntent] = React.useState('');
  const [selectedHtml, setSelectedHtml] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [hasOpenAiApiKey, setHasOpenAiApiKey] = React.useState(false);

  const refreshLists = React.useCallback(async () => {
    const [nextBookmarks, nextScripts] = await Promise.all([
      window.electronAPI.listBrowserBookmarks(),
      window.electronAPI.listBrowserScripts(),
    ]);
    setBookmarks(nextBookmarks?.items || []);
    setBookmarkTree(nextBookmarks?.tree || []);
    setScripts(nextScripts);
  }, []);

  const refreshOpenAiAvailability = React.useCallback(async () => {
    const config = await window.electronAPI.getConfig();
    setHasOpenAiApiKey(Boolean(config?.hasOpenAiApiKey));
  }, []);

  React.useEffect(() => {
    void Promise.all([
      window.electronAPI.getBrowserPreloadPath(),
      window.electronAPI.getBrowserPartition(),
      refreshLists(),
      refreshOpenAiAvailability(),
    ]).then(([nextPreload, nextPartition]) => {
      setPreloadPath(nextPreload);
      if (nextPartition) setPartition(nextPartition);
    });
  }, [refreshLists, refreshOpenAiAvailability]);

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

  const syncNavigation = React.useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    try {
      const nextUrl = webview.getURL() || 'about:blank';
      setCurrentUrl(nextUrl);
      if (!addressFocusedRef.current) {
        setAddress(nextUrl === 'about:blank' ? '' : nextUrl);
      }
      setPageTitle(webview.getTitle() || '브라우저');
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    } catch {
      // webview methods can throw before attachment
    }
  }, []);

  const navigateTo = React.useCallback((rawUrl: string) => {
    const parsed = parseExternalHttpUrl(rawUrl);
    if (!parsed) {
      toast({ title: '주소를 확인할 수 없습니다.', variant: 'destructive' });
      return;
    }
    const nextUrl = parsed.toString();
    pendingUrlRef.current = nextUrl;
    setAddress(nextUrl);
    const webview = webviewRef.current;
    if (webview?.loadURL) {
      webview.loadURL(nextUrl);
      return;
    }
    setCurrentUrl(nextUrl);
  }, []);

  React.useEffect(() => {
    return window.electronAPI.onBrowserOpenUrl((nextUrl) => {
      navigateTo(nextUrl);
    });
  }, [navigateTo]);

  React.useEffect(() => {
    const host = webviewHostRef.current;
    if (!preloadPath || !host) return;

    const webview = document.createElement('webview') as EmbeddedWebview;
    webview.className = 'h-full w-full';
    webview.style.display = 'inline-flex';
    webview.style.width = '100%';
    webview.style.height = '100%';
    webview.setAttribute('partition', partition);
    webview.setAttribute('preload', toPreloadUrl(preloadPath));
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no, sandbox=yes');
    webview.src = 'about:blank';

    const onNav = () => {
      setLoading(false);
      syncNavigation();
    };
    const onStart = () => setLoading(true);
    const onTitle = (event: Event) => {
      const title = (event as Event & { title?: string }).title;
      if (title) setPageTitle(title);
    };
    let started = false;
    const loadPending = () => {
      if (started) return;
      const nextUrl = pendingUrlRef.current;
      if (!nextUrl) return;
      started = true;
      webview.loadURL(nextUrl);
    };

    webview.addEventListener('did-attach', loadPending);
    webview.addEventListener('dom-ready', loadPending);
    webview.addEventListener('did-start-loading', onStart);
    webview.addEventListener('did-stop-loading', onNav);
    webview.addEventListener('did-navigate', onNav);
    webview.addEventListener('did-navigate-in-page', onNav);
    webview.addEventListener('did-finish-load', onNav);
    webview.addEventListener('page-title-updated', onTitle);
    webview.addEventListener('did-fail-load', onNav);

    host.replaceChildren(webview);
    webviewRef.current = webview;

    return () => {
      webviewRef.current = null;
      host.replaceChildren();
    };
  }, [partition, preloadPath, syncNavigation]);

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

  const matchesCurrentUrl = (item: BrowserBookmark) => (
    Boolean(item.url) && (item.url === canonicalCurrent || item.url === currentUrl)
  );
  const currentManualBookmark = bookmarks.find((item) => item.source !== 'record' && matchesCurrentUrl(item));
  const currentRecordBookmark = bookmarks.find((item) => item.source === 'record' && matchesCurrentUrl(item));
  const recordLocked = Boolean(currentRecordBookmark);
  const starred = Boolean(currentManualBookmark || currentRecordBookmark);

  const toggleBookmark = async () => {
    if (currentUrl === 'about:blank' || recordLocked) return;
    if (currentManualBookmark) {
      await window.electronAPI.removeBrowserBookmark(currentManualBookmark.id);
      await refreshLists();
      return;
    }
    const result = await window.electronAPI.addBrowserBookmark({ url: currentUrl, title: pageTitle });
    if (!result.success) {
      toast({ title: result.error || '북마크를 저장하지 못했습니다.', variant: 'destructive' });
      return;
    }
    await refreshLists();
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
      await refreshLists();
      toast({ title: '스크립트를 저장했습니다. 페이지를 새로고침하면 적용됩니다.' });
    } finally {
      setSaving(false);
    }
  };

  const generateScript = async () => {
    setGenerating(true);
    try {
      const result = await window.electronAPI.generateBrowserScript({
        url: currentUrl,
        intent,
        selectedHtml,
      });
      if (!result.success || !result.source) {
        toast({ title: result.error || '스크립트를 만들지 못했습니다.', variant: 'destructive' });
        return;
      }
      setDraft({
        ...emptyScript(),
        name: result.name || '새 스크립트',
        matches: result.matches || ['*'],
        source: result.source,
      });
      setSideTab('scripts');
      toast({ title: '초안을 만들었습니다. 확인 후 저장하세요.' });
    } finally {
      setGenerating(false);
    }
  };

  const openExternal = async () => {
    if (currentUrl === 'about:blank') return;
    const result = await window.electronAPI.openExternal(currentUrl);
    if (!result.success) {
      toast({ title: '외부 브라우저에서 열 수 없습니다.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col bg-discord-bg">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-800 px-3 py-2">
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={!canGoBack} onClick={() => webviewRef.current?.goBack()}>
            <ArrowLeft size={16} />
          </Button>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={!canGoForward} onClick={() => webviewRef.current?.goForward()}>
            <ArrowRight size={16} />
          </Button>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => webviewRef.current?.reload()}>
            <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              navigateTo(address);
            }}
          >
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onFocus={() => {
                addressFocusedRef.current = true;
              }}
              onBlur={() => {
                addressFocusedRef.current = false;
                syncNavigation();
              }}
              placeholder="https:// 주소 입력"
              className="h-8 bg-discord-sidebar border-gray-600 text-sm text-discord-text"
            />
            <Button type="submit" className="h-8 bg-discord-accent hover:bg-blue-600">이동</Button>
          </form>
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md disabled:opacity-100 ${
              recordLocked ? 'cursor-not-allowed' : 'hover:bg-discord-hover'
            }`}
            disabled={currentUrl === 'about:blank' || recordLocked}
            title={recordLocked ? '레코드에서 자동 등록된 북마크입니다' : '북마크'}
            onClick={() => void toggleBookmark()}
          >
            <Star size={16} className={starred ? 'fill-yellow-400 text-yellow-400' : 'text-discord-text'} />
          </button>
          <Button variant="ghost" className="h-8 w-8 p-0" onClick={() => void openExternal()} disabled={currentUrl === 'about:blank'}>
            <ExternalLink size={16} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 bg-black">
            <div ref={webviewHostRef} className="h-full w-full" />
            {!preloadPath && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-discord-muted">브라우저 준비 중...</div>
            )}
            {currentUrl === 'about:blank' && !loading && !pendingUrlRef.current && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-discord-bg/80">
                <div className="text-center text-sm text-discord-muted">
                  <Globe className="mx-auto mb-2" size={28} />
                  주소를 입력하거나 북마크를 선택하세요
                </div>
              </div>
            )}
          </div>

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
                  className={`flex flex-1 items-center justify-center gap-1 px-2 py-2 text-xs ${
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
                  onOpen={(bookmark) => {
                    setAddress(bookmark.url);
                    navigateTo(bookmark.url);
                  }}
                  onRemoveManual={async (bookmark) => {
                    await window.electronAPI.removeBrowserBookmark(bookmark.id);
                    await refreshLists();
                  }}
                  onCreateManualFolder={async () => {
                    const result = await window.electronAPI.addBrowserBookmarkFolder();
                    if (!result.success) {
                      toast({ title: result.error || '폴더를 만들지 못했습니다.', variant: 'destructive' });
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
                    if (result.items) setBookmarks(result.items);
                    if (result.tree) setBookmarkTree(result.tree);
                    else await refreshLists();
                  }}
                />
              )}

              {sideTab === 'scripts' && (
                <div className="h-full space-y-3 overflow-y-auto discord-scrollbar p-3">
                  <p className="text-[11px] leading-relaxed text-discord-muted">
                    매치되는 페이지에 스크립트가 주입됩니다. 직접 작성한 코드이므로 신뢰할 수 있는 내용만 저장하세요.
                  </p>
                  <div className="space-y-1">
                    {scripts.map((script) => (
                      <button
                        key={script.id}
                        type="button"
                        onClick={() => setDraft(script)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs ${
                          draft.id === script.id ? 'bg-discord-accent text-white' : 'text-discord-text hover:bg-discord-hover'
                        }`}
                      >
                        <span className="truncate">{script.name}</span>
                        <span className="ml-2 shrink-0 opacity-70">{script.enabled ? '켜짐' : '꺼짐'}</span>
                      </button>
                    ))}
                  </div>
                  <Button variant="outline" className="h-8 w-full border-gray-600 text-xs" onClick={() => setDraft(emptyScript())}>
                    새 스크립트
                  </Button>
                  <Input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    className="h-8 bg-discord-bg border-gray-600 text-xs text-discord-text"
                    placeholder="스크립트 이름"
                  />
                  <Input
                    value={draft.matches.join(', ')}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      matches: event.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                    }))}
                    className="h-8 bg-discord-bg border-gray-600 text-xs text-discord-text"
                    placeholder="매치 패턴, 쉼표로 구분"
                  />
                  <label className="flex items-center gap-2 text-xs text-discord-muted">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
                    />
                    사용
                  </label>
                  <Textarea
                    value={draft.source}
                    onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
                    className="min-h-[180px] bg-discord-bg border-gray-600 font-mono text-[11px] text-discord-text"
                    placeholder="window.erp.findRecordsByUrl(url) 를 사용할 수 있습니다."
                  />
                  <div className="flex gap-2">
                    <Button className="h-8 flex-1 bg-discord-accent hover:bg-blue-600 text-xs" disabled={saving} onClick={() => void saveDraft()}>
                      저장
                    </Button>
                    {draft.id && (
                      <Button
                        variant="outline"
                        className="h-8 border-gray-600 text-xs text-red-400"
                        onClick={async () => {
                          await window.electronAPI.deleteBrowserScript(draft.id);
                          setDraft(emptyScript());
                          await refreshLists();
                        }}
                      >
                        삭제
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {hasOpenAiApiKey && sideTab === 'ai' && (
                <div className="h-full space-y-3 overflow-y-auto discord-scrollbar p-3">
                  <p className="text-[11px] leading-relaxed text-discord-muted">
                    현재 페이지({currentUrl === 'about:blank' ? '없음' : new URL(currentUrl, 'https://example.com').hostname})에 맞는 스크립트 초안을 만듭니다. 환경설정의 OpenAI 키를 사용합니다.
                  </p>
                  <Textarea
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    className="min-h-[90px] bg-discord-bg border-gray-600 text-xs text-discord-text"
                    placeholder="예: 레코드에 있는 유튜브 영상에 파란색 테두리를 그려줘"
                  />
                  <Textarea
                    value={selectedHtml}
                    onChange={(event) => setSelectedHtml(event.target.value)}
                    className="min-h-[70px] bg-discord-bg border-gray-600 font-mono text-[11px] text-discord-text"
                    placeholder="선택한 요소 HTML (선택)"
                  />
                  <Button
                    className="h-8 w-full bg-discord-accent hover:bg-blue-600 text-xs"
                    disabled={generating || !intent.trim()}
                    onClick={() => void generateScript()}
                  >
                    {generating ? '생성 중...' : '스크립트 초안 만들기'}
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default BrowserPage;
