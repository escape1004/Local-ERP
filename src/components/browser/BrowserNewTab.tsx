import React from 'react';
import { Globe, RefreshCw, Search, Shuffle } from 'lucide-react';
import { faviconUrlFor, shortcutLabelForBookmark } from '../../lib/browserFavicon';
import { hostLabelForUrl, pickRandomBookmarks } from '../../lib/browserNewTab';
import { resolveBrowserAddressInput } from '../../lib/browserNavigation';
import { Input } from '../ui/input';
import type { BrowserBookmark } from '../../types';

type NewTabPage = {
  id: string;
  url: string;
  title?: string;
};

type BrowserNewTabProps = {
  shortcuts: BrowserBookmark[];
  bookmarks: BrowserBookmark[];
  onOpen: (page: NewTabPage, options?: { newTab?: boolean; background?: boolean }) => void;
  onNavigate: (url: string) => void;
};

function NewTabFavicon({ url, size = 22 }: { url: string; size?: number }) {
  const src = faviconUrlFor(url, size >= 22 ? 64 : 32);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return <Globe size={size} className="text-discord-muted" />;
  }
  const pixels = size >= 22 ? 'h-7 w-7' : 'h-4 w-4';
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={`${pixels} rounded-md`}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function openWithModifiers(
  event: React.MouseEvent,
  page: NewTabPage,
  onOpen: BrowserNewTabProps['onOpen'],
) {
  onOpen(page, {
    newTab: event.ctrlKey || event.metaKey,
    background: false,
  });
}

function bindMiddleClick(page: NewTabPage, onOpen: BrowserNewTabProps['onOpen']) {
  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      onOpen(page, { newTab: true, background: true });
    },
    onAuxClick: (event: React.MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      onOpen(page, { newTab: true, background: true });
    },
  };
}

export function BrowserNewTab({
  shortcuts,
  bookmarks,
  onOpen,
  onNavigate,
}: BrowserNewTabProps) {
  const [query, setQuery] = React.useState('');
  const [randomPages, setRandomPages] = React.useState<NewTabPage[]>([]);
  const bookmarkKey = bookmarks.map((item) => item.id).join(',');

  const reshuffle = React.useCallback(() => {
    setRandomPages(pickRandomBookmarks(bookmarks));
  }, [bookmarks]);

  React.useEffect(() => {
    reshuffle();
  }, [bookmarkKey, reshuffle]);

  const submitQuery = (event: React.FormEvent) => {
    event.preventDefault();
    const next = resolveBrowserAddressInput(query);
    if (!next) return;
    onNavigate(next);
  };

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-discord-bg">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-6 py-8">
        <div className="flex flex-col items-center gap-10">
          <img
            src="icon.png"
            alt="Local ERP"
            draggable={false}
            className="h-24 w-24"
          />
          <form className="w-full" onSubmit={submitQuery}>
            <label className="sr-only" htmlFor="browser-new-tab-search">검색 또는 주소 입력</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-discord-muted" size={18} />
              <Input
                id="browser-new-tab-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="검색 또는 주소 입력"
                className="h-12 rounded-full border-gray-700 bg-discord-sidebar pl-11 text-discord-text"
              />
            </div>
          </form>
        </div>

        {shortcuts.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium text-white">바로가기</h2>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {shortcuts.map((bookmark) => {
                const label = shortcutLabelForBookmark(bookmark);
                return (
                  <button
                    key={bookmark.id}
                    type="button"
                    title={bookmark.url}
                    aria-label={label}
                    className="flex flex-col items-center gap-2 rounded-xl px-1 py-2 text-discord-text hover:bg-discord-hover"
                    onClick={(event) => openWithModifiers(event, bookmark, onOpen)}
                    {...bindMiddleClick(bookmark, onOpen)}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-discord-sidebar">
                      <NewTabFavicon url={bookmark.url} />
                    </span>
                    <span className="line-clamp-2 w-full text-center text-xs leading-4">{label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {randomPages.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Shuffle size={14} className="text-discord-muted" />
                랜덤 북마크
              </div>
              <button
                type="button"
                onClick={reshuffle}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-discord-muted hover:bg-discord-hover hover:text-discord-text"
                aria-label="랜덤 북마크 다시 불러오기"
              >
                <RefreshCw size={12} />
                다시 뽑기
              </button>
            </div>
            <div className="rounded-xl border border-gray-800 bg-discord-sidebar/60">
              {randomPages.map((page) => {
                const label = shortcutLabelForBookmark(page);
                return (
                  <button
                    key={page.id}
                    type="button"
                    title={page.url}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-discord-text hover:bg-discord-hover"
                    onClick={(event) => openWithModifiers(event, page, onOpen)}
                    {...bindMiddleClick(page, onOpen)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-discord-sidebar">
                      <NewTabFavicon url={page.url} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{label}</span>
                      <span className="block truncate text-xs text-discord-muted">{hostLabelForUrl(page.url)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {shortcuts.length === 0 && randomPages.length === 0 && (
          <p className="text-center text-sm text-discord-muted">
            북마크를 추가하거나, 위에서 검색해 보세요
          </p>
        )}
      </div>
    </div>
  );
}
