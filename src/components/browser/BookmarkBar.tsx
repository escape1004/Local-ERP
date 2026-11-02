import React from 'react';
import { Star } from 'lucide-react';
import { BOOKMARK_BAR_FOLDER_ID, MANUAL_BOOKMARK_FOLDER_ID, type BrowserBookmark, type BrowserBookmarkFolder } from '../../types';
import { faviconUrlFor } from '../../lib/browserFavicon';
import { MANUAL_DRAG_THRESHOLD_PX, type ManualDragItem } from './bookmark-dnd';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';
import { cn } from '../../lib/utils';

export type BookmarkSaveTarget = {
  id: string | null;
  name: string;
  depth: number;
};

export function collectManualSaveTargets(tree: BrowserBookmarkFolder[]): BookmarkSaveTarget[] {
  const options: BookmarkSaveTarget[] = [
    { id: BOOKMARK_BAR_FOLDER_ID, name: '북마크 바', depth: 0 },
  ];

  const walk = (folder: BrowserBookmarkFolder, depth: number) => {
    if (folder.kind !== 'manual') return;
    if (folder.id === MANUAL_BOOKMARK_FOLDER_ID) {
      options.push({ id: null, name: '직접 추가', depth: 0 });
      folder.children.forEach((child) => walk(child, 1));
      return;
    }
    options.push({ id: folder.id, name: folder.name, depth });
    folder.children.forEach((child) => walk(child, depth + 1));
  };

  tree.forEach((folder) => walk(folder, 0));
  if (!options.some((item) => item.id === null)) {
    options.push({ id: null, name: '직접 추가', depth: 0 });
  }
  return options;
}

function BookmarkFavicon({ url }: { url: string }) {
  const src = faviconUrlFor(url);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return <Star size={12} className="shrink-0 fill-yellow-400 text-yellow-400" />;
  }
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className="h-3.5 w-3.5 shrink-0 rounded-sm"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

type BookmarkBarProps = {
  bookmarks: BrowserBookmark[];
  activeUrls?: string[];
  acceptDrop?: boolean;
  draggingId?: string | null;
  onOpen: (bookmark: BrowserBookmark) => void;
  onRemove: (bookmark: BrowserBookmark) => void;
  onRename: (bookmark: BrowserBookmark, title: string) => void | Promise<void>;
  onDropBookmark: (payload: { id: string; index: number }) => void;
  onDragChange?: (item: ManualDragItem | null) => void;
};

export function BookmarkBar({
  bookmarks,
  activeUrls = [],
  acceptDrop = false,
  draggingId = null,
  onOpen,
  onRemove,
  onRename,
  onDropBookmark,
  onDragChange,
}: BookmarkBarProps) {
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const renamingIdRef = React.useRef<string | null>(null);
  const pendingDragRef = React.useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressClickRef = React.useRef(false);
  const startedFromBarRef = React.useRef(false);
  const dragIdRef = React.useRef<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  if (draggingId) dragIdRef.current = draggingId;
  else if (!startedFromBarRef.current) dragIdRef.current = null;

  const resolveIndex = React.useCallback((clientX: number) => {
    const nodes = [...(barRef.current?.querySelectorAll<HTMLElement>('[data-bar-bookmark]') || [])];
    const index = nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    return index === -1 ? bookmarks.length : index;
  }, [bookmarks.length]);

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !startedFromBarRef.current && !dragIdRef.current) {
        const dx = event.clientX - pending.x;
        const dy = event.clientY - pending.y;
        if ((dx * dx) + (dy * dy) >= MANUAL_DRAG_THRESHOLD_PX * MANUAL_DRAG_THRESHOLD_PX) {
          pendingDragRef.current = null;
          suppressClickRef.current = true;
          startedFromBarRef.current = true;
          dragIdRef.current = pending.id;
          onDragChange?.({ kind: 'bookmark', id: pending.id });
        }
      }

      const id = dragIdRef.current;
      if (!id || !barRef.current) return;
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      if (!hovered || !barRef.current.contains(hovered)) {
        setDropIndex(null);
        return;
      }
      const nextIndex = resolveIndex(event.clientX);
      setDropIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const onUp = (event: PointerEvent) => {
      pendingDragRef.current = null;
      const fromBar = startedFromBarRef.current;
      startedFromBarRef.current = false;
      const id = dragIdRef.current;
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      const overBar = Boolean(id && barRef.current && hovered && barRef.current.contains(hovered));
      if (overBar && id) {
        const index = resolveIndex(event.clientX);
        setDropIndex(null);
        onDropBookmark({ id, index });
        onDragChange?.(null);
      } else {
        setDropIndex(null);
        if (fromBar && !hovered?.closest('[data-manual-tree]')) onDragChange?.(null);
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [onDragChange, onDropBookmark, resolveIndex]);

  if (bookmarks.length === 0 && !acceptDrop) return null;

  const startRename = (bookmark: BrowserBookmark) => {
    renamingIdRef.current = bookmark.id;
    setRenamingId(bookmark.id);
    setRenameDraft(bookmark.title);
  };

  const submitRename = () => {
    const id = renamingIdRef.current;
    const bookmark = bookmarks.find((item) => item.id === id);
    const title = renameDraft;
    renamingIdRef.current = null;
    setRenamingId(null);
    if (!bookmark || title === bookmark.title) return;
    void onRename(bookmark, title);
  };

  const cancelRename = () => {
    renamingIdRef.current = null;
    setRenamingId(null);
  };

  return (
    <div
      ref={barRef}
      data-bookmark-bar="true"
      className={cn(
        'flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-800 bg-discord-sidebar px-2 discord-scrollbar',
        acceptDrop && dropIndex !== null && 'bg-discord-accent/10',
      )}
    >
      {bookmarks.length === 0 ? (
        <span className="px-1 text-[11px] text-discord-muted">여기에 놓으면 북마크 바로 이동합니다</span>
      ) : bookmarks.map((bookmark, index) => {
        const active = activeUrls.includes(bookmark.url);
        const renaming = renamingId === bookmark.id;
        const iconOnly = !String(bookmark.title || '').trim();
        return (
          <React.Fragment key={bookmark.id}>
            {acceptDrop && dropIndex === index && (
              <span className="h-5 w-0.5 shrink-0 rounded-full bg-discord-accent" />
            )}
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <span
                  className={cn('inline-flex shrink-0 select-none', draggingId === bookmark.id && 'opacity-50')}
                  data-bar-bookmark={bookmark.id}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    if (renaming || event.button !== 0) return;
                    if ((event.target as HTMLElement | null)?.closest('input, textarea')) return;
                    pendingDragRef.current = { id: bookmark.id, x: event.clientX, y: event.clientY };
                  }}
                >
                  {renaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      className="h-6 w-32 rounded-sm border border-gray-600 bg-discord-bg px-1 text-xs text-discord-text outline-none"
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => submitRename()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitRename();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                    />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label={bookmark.title.trim() || bookmark.url}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md text-xs text-discord-text hover:bg-discord-hover',
                            iconOnly ? 'h-7 w-7 justify-center' : 'max-w-[180px] px-2 py-1',
                            'cursor-grab active:cursor-grabbing',
                            active && 'bg-discord-accent/20',
                          )}
                          onClick={() => {
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            onOpen(bookmark);
                          }}
                        >
                          <BookmarkFavicon url={bookmark.url} />
                          {iconOnly ? null : (
                            <span className="truncate whitespace-pre">{bookmark.title}</span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className={FIELD_TOOLTIP_CLASSNAME}>
                        <div className="whitespace-pre">{bookmark.title || bookmark.url}</div>
                        {bookmark.title ? (
                          <div className="mt-0.5 text-[11px] text-discord-muted">{bookmark.url}</div>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </span>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => startRename(bookmark)}>이름 변경</ContextMenuItem>
                <ContextMenuItem
                  className="text-red-400 focus:text-red-400"
                  onSelect={() => onRemove(bookmark)}
                >
                  삭제
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </React.Fragment>
        );
      })}
      {acceptDrop && dropIndex === bookmarks.length && bookmarks.length > 0 && (
        <span className="h-5 w-0.5 shrink-0 rounded-full bg-discord-accent" />
      )}
    </div>
  );
}
