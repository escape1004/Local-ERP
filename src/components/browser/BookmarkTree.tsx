import React from 'react';
import { ChevronDown, ChevronRight, Folder, Link2, Plus, Star } from 'lucide-react';
import { MANUAL_BOOKMARK_FOLDER_ID, type BrowserBookmark, type BrowserBookmarkFolder } from '../../types';
import { MANUAL_DRAG_THRESHOLD_PX, type ManualDragItem } from './bookmark-dnd';
import { focusRenameInput, startRenameAfterMenuClose } from './bookmark-rename';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';
import { cn } from '../../lib/utils';

const FOLDER_ROW_HEIGHT = 36;

type DragItem = ManualDragItem;
type DropTarget =
  | { mode: 'into'; folderId: string }
  | { mode: 'folders'; parentId: string; index: number }
  | { mode: 'bookmarks'; parentId: string; index: number };

type BookmarkTreeProps = {
  tree: BrowserBookmarkFolder[];
  activeUrls?: string[];
  onOpen: (bookmark: BrowserBookmark, options?: { newTab?: boolean; background?: boolean }) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
  onRenameManual: (bookmark: BrowserBookmark, title: string) => void | Promise<void>;
  onDragChange?: (item: ManualDragItem | null) => void;
  externalDrag?: ManualDragItem | null;
  onCreateManualFolder: () => void | Promise<void>;
  onRenameManualFolder: (folder: BrowserBookmarkFolder, name: string) => void | Promise<void>;
  onRemoveManualFolder: (folder: BrowserBookmarkFolder) => void | Promise<void>;
  onMoveManualItem: (payload: {
    kind: 'bookmark' | 'folder';
    id: string;
    parentId: string | null;
    index: number;
  }) => void | Promise<void>;
};

type BookmarkEditProps = {
  renamingId: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: (bookmark: BrowserBookmark) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
};

type FolderEditProps = {
  renamingId: string | null;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: (folder: BrowserBookmarkFolder) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onRemoveFolder: (folder: BrowserBookmarkFolder) => void;
};

type DndContextValue = {
  dragging: DragItem | null;
  dropTarget: DropTarget | null;
  armDrag: (item: DragItem, event: React.PointerEvent) => void;
  consumeClickSuppression: () => boolean;
};

const ManualDndContext = React.createContext<DndContextValue | null>(null);

function bookmarkHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function countBookmarks(folder: BrowserBookmarkFolder): number {
  return folder.bookmarks.length + folder.children.reduce((sum, child) => sum + countBookmarks(child), 0);
}

function collectFolderIds(folder: BrowserBookmarkFolder): string[] {
  return [folder.id, ...folder.children.flatMap(collectFolderIds)];
}

function findFolder(folders: BrowserBookmarkFolder[], id: string): BrowserBookmarkFolder | null {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    const nested = findFolder(folder.children, id);
    if (nested) return nested;
  }
  return null;
}

function sameDropTarget(left: DropTarget | null, right: DropTarget | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function findBookmark(folders: BrowserBookmarkFolder[], id: string): BrowserBookmark | null {
  for (const folder of folders) {
    const match = folder.bookmarks.find((bookmark) => bookmark.id === id);
    if (match) return match;
    const nested = findBookmark(folder.children, id);
    if (nested) return nested;
  }
  return null;
}

function InsertLine({
  active,
  target,
}: {
  active: boolean;
  target: DropTarget;
}) {
  return (
    <div className="relative h-4" data-manual-drop={JSON.stringify(target)}>
      <div
        className={cn(
          'absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 rounded-full',
          active ? 'bg-discord-accent' : 'bg-transparent',
        )}
      />
    </div>
  );
}

function BookmarkRow({
  bookmark,
  depth,
  parentId,
  insertIndex,
  active,
  onOpen,
  onRemoveManual,
  bookmarkEdit,
}: {
  bookmark: BrowserBookmark;
  depth: number;
  parentId: string;
  insertIndex: number;
  active: boolean;
  onOpen: (bookmark: BrowserBookmark, options?: { newTab?: boolean; background?: boolean }) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
  bookmarkEdit: BookmarkEditProps;
}) {
  const dnd = React.useContext(ManualDndContext);
  const pendingRenameRef = React.useRef(false);
  const isRecord = bookmark.source === 'record';
  const secondary = isRecord ? bookmark.subtitle : bookmarkHost(bookmark.url);
  const dragging = dnd?.dragging?.kind === 'bookmark' && dnd.dragging.id === bookmark.id;
  const renaming = bookmarkEdit.renamingId === bookmark.id;
  const canDrag = !isRecord && !renaming && Boolean(dnd);

  const row = (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-md py-1.5 pr-2 select-none',
        active ? 'bg-discord-accent/20' : 'hover:bg-discord-hover',
        'cursor-default',
        dragging && 'opacity-50',
      )}
      style={{ paddingLeft: 32 + depth * 20 }}
      data-manual-item={
        !isRecord && insertIndex >= 0
          ? JSON.stringify({ id: bookmark.id, parentId, index: insertIndex })
          : undefined
      }
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          if (!renaming) onOpen(bookmark, { newTab: true, background: true });
          return;
        }
        if (!canDrag || !dnd) return;
        dnd.armDrag({ kind: 'bookmark', id: bookmark.id }, event);
      }}
      onAuxClick={(event) => {
        if (renaming || event.button !== 1) return;
        event.preventDefault();
        onOpen(bookmark, { newTab: true, background: true });
      }}
    >
      <span
        className={cn(
          'mt-1 h-8 w-0.5 shrink-0 rounded-full',
          isRecord ? 'bg-discord-accent' : 'bg-yellow-400',
        )}
      />
      <div
        role="button"
        tabIndex={0}
        className="min-w-0 flex-1 text-left"
        title={bookmark.url}
        onClick={(event) => {
          if (renaming) return;
          if (dnd?.consumeClickSuppression()) return;
          onOpen(bookmark, {
            newTab: event.ctrlKey || event.metaKey,
            background: false,
          });
        }}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(bookmark);
          }
        }}
      >
        <div className="flex items-center gap-1.5">
          {isRecord ? (
            <Link2 size={13} className="shrink-0 text-discord-accent" />
          ) : (
            <span className="w-3.5 shrink-0 text-center text-sm leading-none text-discord-muted">-</span>
          )}
          {renaming ? (
            <input
              ref={focusRenameInput}
              value={bookmarkEdit.renameDraft}
              className="h-6 min-w-0 flex-1 rounded-sm border border-gray-600 bg-discord-bg px-1 text-sm text-discord-text outline-none"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => bookmarkEdit.onRenameDraftChange(event.target.value)}
              onBlur={() => bookmarkEdit.onSubmitRename()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  bookmarkEdit.onSubmitRename();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  bookmarkEdit.onCancelRename();
                }
              }}
            />
          ) : (
            <span className="truncate text-sm text-discord-text whitespace-pre">{bookmark.title}</span>
          )}
        </div>
        {secondary ? (
          <div className="truncate pl-[18px] text-xs text-discord-muted">{secondary}</div>
        ) : null}
      </div>
    </div>
  );

  if (isRecord) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>{row}</div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          startRenameAfterMenuClose(event, pendingRenameRef, () => bookmarkEdit.onStartRename(bookmark));
        }}
      >
        <ContextMenuItem
          onSelect={() => {
            pendingRenameRef.current = true;
          }}
        >
          이름 변경
        </ContextMenuItem>
        <ContextMenuItem
          className="text-red-400 focus:text-red-400"
          onSelect={() => onRemoveManual(bookmark)}
        >
          삭제
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FolderNode({
  folder,
  depth,
  expanded,
  activeUrls,
  onToggle,
  onOpen,
  onRemoveManual,
  folderEdit,
  bookmarkEdit,
}: {
  folder: BrowserBookmarkFolder;
  depth: number;
  expanded: Set<string>;
  activeUrls: string[];
  onToggle: (id: string) => void;
  onOpen: (bookmark: BrowserBookmark, options?: { newTab?: boolean; background?: boolean }) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
  folderEdit: FolderEditProps;
  bookmarkEdit: BookmarkEditProps;
}) {
  const dnd = React.useContext(ManualDndContext);
  const pendingRenameRef = React.useRef(false);
  const open = expanded.has(folder.id);
  const total = countBookmarks(folder);
  const isManual = folder.kind === 'manual';
  const canDrag = Boolean(dnd) && isManual && folder.id !== MANUAL_BOOKMARK_FOLDER_ID;
  const dragging = dnd?.dragging?.kind === 'folder' && dnd.dragging.id === folder.id;
  const dropInto = dnd?.dropTarget?.mode === 'into' && dnd.dropTarget.folderId === folder.id;
  const renaming = folderEdit.renamingId === folder.id;
  const canEditFolder = isManual && folder.id !== MANUAL_BOOKMARK_FOLDER_ID;

  const folderChildren = folder.children.filter((child) => dnd?.dragging?.kind !== 'folder' || child.id !== dnd.dragging.id);
  const folderBookmarks = folder.bookmarks.filter((bookmark) => (
    bookmark.source === 'record' || dnd?.dragging?.kind !== 'bookmark' || bookmark.id !== dnd.dragging.id
  ));

  const header = (
      <div
        className="sticky bg-discord-sidebar"
        style={{ top: depth * FOLDER_ROW_HEIGHT, zIndex: 30 - depth, height: FOLDER_ROW_HEIGHT }}
        data-manual-drop={isManual ? JSON.stringify({ mode: 'into', folderId: folder.id }) : undefined}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (!canDrag || renaming || !dnd) return;
          dnd.armDrag({ kind: 'folder', id: folder.id }, event);
        }}
      >
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'flex h-full w-full cursor-default select-none items-center gap-1.5 overflow-hidden pr-2 text-left hover:bg-discord-hover',
            dragging && 'opacity-50',
            dropInto && 'bg-discord-accent/20',
          )}
          style={{ paddingLeft: 12 + depth * 20 }}
          onClick={() => {
            if (renaming) return;
            if (dnd?.consumeClickSuppression()) return;
            onToggle(folder.id);
          }}
          onKeyDown={(event) => {
            if (renaming) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggle(folder.id);
            }
          }}
        >
          {depth > 0 && <span className="text-sm text-gray-400">└</span>}
          {open ? (
            <ChevronDown size={14} className="shrink-0 text-discord-muted" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-discord-muted" />
          )}
          {folder.id === MANUAL_BOOKMARK_FOLDER_ID ? (
            <Star size={14} className="shrink-0 fill-yellow-400 text-yellow-400" />
          ) : (
            <Folder
              size={14}
              className={folder.kind === 'manual' ? 'shrink-0 text-yellow-400' : 'shrink-0 text-discord-accent'}
            />
          )}
          {renaming ? (
            <input
              ref={focusRenameInput}
              value={folderEdit.renameDraft}
              className="h-6 min-w-0 flex-1 rounded-sm border border-gray-600 bg-discord-bg px-1 text-sm text-discord-text outline-none"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => folderEdit.onRenameDraftChange(event.target.value)}
              onBlur={() => folderEdit.onSubmitRename()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  folderEdit.onSubmitRename();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  folderEdit.onCancelRename();
                }
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text">{folder.name}</span>
          )}
          <span className="shrink-0 text-xs tabular-nums text-discord-muted">{total}</span>
        </div>
      </div>
  );

  return (
    <div>
      {canEditFolder ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
          <ContextMenuContent
            onCloseAutoFocus={(event) => {
              startRenameAfterMenuClose(event, pendingRenameRef, () => folderEdit.onStartRename(folder));
            }}
          >
            <ContextMenuItem
              onSelect={() => {
                pendingRenameRef.current = true;
              }}
            >
              이름 변경
            </ContextMenuItem>
            <ContextMenuItem
              className="text-red-400 focus:text-red-400"
              onSelect={() => folderEdit.onRemoveFolder(folder)}
            >
              삭제
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : header}
      {open && (
        <>
          {isManual && dnd?.dragging?.kind === 'folder' && (
            <InsertLine
              active={dnd.dropTarget?.mode === 'folders' && dnd.dropTarget.parentId === folder.id && dnd.dropTarget.index === 0}
              target={{ mode: 'folders', parentId: folder.id, index: 0 }}
            />
          )}
          {folder.children.map((child) => (
            <React.Fragment key={child.id}>
              <FolderNode
                folder={child}
                depth={depth + 1}
                expanded={expanded}
                activeUrls={activeUrls}
                onToggle={onToggle}
                onOpen={onOpen}
                onRemoveManual={onRemoveManual}
                folderEdit={folderEdit}
                bookmarkEdit={bookmarkEdit}
              />
              {isManual && dnd?.dragging?.kind === 'folder' && child.id !== dnd.dragging.id && (
                <InsertLine
                  active={
                    dnd.dropTarget?.mode === 'folders'
                    && dnd.dropTarget.parentId === folder.id
                    && dnd.dropTarget.index === folderChildren.findIndex((item) => item.id === child.id) + 1
                  }
                  target={{
                    mode: 'folders',
                    parentId: folder.id,
                    index: Math.max(0, folderChildren.findIndex((item) => item.id === child.id) + 1),
                  }}
                />
              )}
            </React.Fragment>
          ))}
          {isManual && dnd?.dragging?.kind === 'bookmark' && (
            <InsertLine
              active={dnd.dropTarget?.mode === 'bookmarks' && dnd.dropTarget.parentId === folder.id && dnd.dropTarget.index === 0}
              target={{ mode: 'bookmarks', parentId: folder.id, index: 0 }}
            />
          )}
          {folder.bookmarks.map((bookmark) => (
            <React.Fragment key={bookmark.id}>
              <BookmarkRow
                bookmark={bookmark}
                depth={depth}
                parentId={folder.id}
                insertIndex={isManual ? folderBookmarks.findIndex((item) => item.id === bookmark.id) : -1}
                active={activeUrls.includes(bookmark.url)}
                onOpen={onOpen}
                onRemoveManual={onRemoveManual}
                bookmarkEdit={bookmarkEdit}
              />
              {isManual && dnd?.dragging?.kind === 'bookmark' && bookmark.source !== 'record' && bookmark.id !== dnd.dragging.id && (
                <InsertLine
                  active={
                    dnd.dropTarget?.mode === 'bookmarks'
                    && dnd.dropTarget.parentId === folder.id
                    && dnd.dropTarget.index === folderBookmarks.findIndex((item) => item.id === bookmark.id) + 1
                  }
                  target={{
                    mode: 'bookmarks',
                    parentId: folder.id,
                    index: Math.max(0, folderBookmarks.findIndex((item) => item.id === bookmark.id) + 1),
                  }}
                />
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}

export function BookmarkTree({
  tree,
  activeUrls = [],
  onOpen,
  onRemoveManual,
  onRenameManual,
  onDragChange,
  externalDrag = null,
  onCreateManualFolder,
  onRenameManualFolder,
  onRemoveManualFolder,
  onMoveManualItem,
}: BookmarkTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [creating, setCreating] = React.useState(false);
  const [dragging, setDragging] = React.useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const renamingIdRef = React.useRef<string | null>(null);
  const [renamingBookmarkId, setRenamingBookmarkId] = React.useState<string | null>(null);
  const [bookmarkRenameDraft, setBookmarkRenameDraft] = React.useState('');
  const renamingBookmarkIdRef = React.useRef<string | null>(null);
  const pendingDragRef = React.useRef<{ item: DragItem; x: number; y: number } | null>(null);
  const suppressClickRef = React.useRef(false);
  const draggingRef = React.useRef<DragItem | null>(null);
  const dropTargetRef = React.useRef<DropTarget | null>(null);
  const treeRef = React.useRef(tree);
  const externalDragRef = React.useRef(externalDrag);
  treeRef.current = tree;
  externalDragRef.current = externalDrag;

  React.useEffect(() => {
    if (!externalDrag) return;
    if (draggingRef.current?.kind === externalDrag.kind && draggingRef.current?.id === externalDrag.id) return;
    draggingRef.current = externalDrag;
    setDragging(externalDrag);
    if (externalDrag.kind === 'bookmark') {
      setExpanded((current) => {
        if (current.has(MANUAL_BOOKMARK_FOLDER_ID)) return current;
        const next = new Set(current);
        next.add(MANUAL_BOOKMARK_FOLDER_ID);
        return next;
      });
    }
  }, [externalDrag]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createFolder = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await onCreateManualFolder();
      setExpanded((current) => {
        const next = new Set(current);
        next.add(MANUAL_BOOKMARK_FOLDER_ID);
        return next;
      });
    } finally {
      setCreating(false);
    }
  };

  React.useEffect(() => {
    if (!dropTarget || dropTarget.mode !== 'into') return;
    const folderId = dropTarget.folderId;
    const timer = window.setTimeout(() => {
      setExpanded((current) => {
        if (current.has(folderId)) return current;
        const next = new Set(current);
        next.add(folderId);
        return next;
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [dropTarget]);

  const clearDrag = React.useCallback(() => {
    pendingDragRef.current = null;
    draggingRef.current = null;
    dropTargetRef.current = null;
    setDragging(null);
    setDropTarget(null);
    onDragChange?.(null);
  }, [onDragChange]);

  const commitDrop = React.useCallback((target: DropTarget) => {
    const current = draggingRef.current;
    if (!current) return;
    const destFolderId = target.mode === 'into' ? target.folderId : target.parentId;
    if (current.kind === 'folder' && target.mode === 'into') {
      const source = findFolder(treeRef.current, current.id);
      const blocked = new Set(source ? collectFolderIds(source) : [current.id]);
      if (blocked.has(destFolderId)) {
        clearDrag();
        return;
      }
    }

    const destFolder = findFolder(treeRef.current, destFolderId);
    const parentId = destFolderId === MANUAL_BOOKMARK_FOLDER_ID ? null : destFolderId;
    let index = 0;
    if (target.mode === 'into') {
      const siblings = current.kind === 'folder'
        ? (destFolder?.children || []).filter((item) => item.id !== current.id)
        : (destFolder?.bookmarks || []).filter((item) => item.id !== current.id);
      index = siblings.length;
    } else {
      index = target.index;
    }

    setExpanded((expandedFolders) => {
      const next = new Set(expandedFolders);
      next.add(destFolderId);
      return next;
    });
    clearDrag();
    void onMoveManualItem({
      kind: current.kind,
      id: current.id,
      parentId,
      index,
    });
  }, [clearDrag, onMoveManualItem]);

  const folderEdit = React.useMemo<FolderEditProps>(() => ({
    renamingId,
    renameDraft,
    onRenameDraftChange: setRenameDraft,
    onStartRename: (folder) => {
      renamingIdRef.current = folder.id;
      setRenamingId(folder.id);
      setRenameDraft(folder.name);
    },
    onSubmitRename: () => {
      const id = renamingIdRef.current;
      if (!id) return;
      const folder = findFolder(tree, id);
      const name = renameDraft.trim();
      renamingIdRef.current = null;
      setRenamingId(null);
      if (!folder || !name || name === folder.name) return;
      void onRenameManualFolder(folder, name);
    },
    onCancelRename: () => {
      renamingIdRef.current = null;
      setRenamingId(null);
    },
    onRemoveFolder: (folder) => {
      renamingIdRef.current = renamingIdRef.current === folder.id ? null : renamingIdRef.current;
      setRenamingId((current) => (current === folder.id ? null : current));
      void onRemoveManualFolder(folder);
    },
  }), [onRemoveManualFolder, onRenameManualFolder, renameDraft, renamingId, tree]);

  const bookmarkEdit = React.useMemo<BookmarkEditProps>(() => ({
    renamingId: renamingBookmarkId,
    renameDraft: bookmarkRenameDraft,
    onRenameDraftChange: setBookmarkRenameDraft,
    onStartRename: (bookmark) => {
      renamingBookmarkIdRef.current = bookmark.id;
      setRenamingBookmarkId(bookmark.id);
      setBookmarkRenameDraft(bookmark.title);
    },
    onSubmitRename: () => {
      const id = renamingBookmarkIdRef.current;
      if (!id) return;
      const bookmark = findBookmark(tree, id);
      const title = bookmarkRenameDraft;
      renamingBookmarkIdRef.current = null;
      setRenamingBookmarkId(null);
      if (!bookmark || title === bookmark.title) return;
      void onRenameManual(bookmark, title);
    },
    onCancelRename: () => {
      renamingBookmarkIdRef.current = null;
      setRenamingBookmarkId(null);
    },
  }), [bookmarkRenameDraft, onRenameManual, renamingBookmarkId, tree]);

  const armDrag = React.useCallback((item: DragItem, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest('input, textarea')) return;
    pendingDragRef.current = { item, x: event.clientX, y: event.clientY };
  }, []);

  const consumeClickSuppression = React.useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  React.useEffect(() => {
    const readDropTarget = (event: PointerEvent): DropTarget | null => {
      const current = draggingRef.current;
      if (!current) return null;
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      if (!hovered || hovered.closest('[data-bookmark-bar]')) return null;

      const zone = hovered.closest('[data-manual-drop]') as HTMLElement | null;
      if (zone?.dataset.manualDrop) {
        try {
          const target = JSON.parse(zone.dataset.manualDrop) as DropTarget;
          if (target.mode === 'into' && current.kind === 'folder') {
            const source = findFolder(treeRef.current, current.id);
            const blocked = new Set(source ? collectFolderIds(source) : [current.id]);
            if (blocked.has(target.folderId)) return null;
          }
          if (target.mode === 'into' && current.kind === 'folder' && target.folderId === current.id) return null;
          if (target.mode === 'folders' && current.kind !== 'folder') return null;
          if (target.mode === 'bookmarks' && current.kind !== 'bookmark') return null;
          return target;
        } catch {
          return null;
        }
      }

      const item = hovered.closest('[data-manual-item]') as HTMLElement | null;
      if (current.kind === 'bookmark' && item?.dataset.manualItem) {
        try {
          const meta = JSON.parse(item.dataset.manualItem) as { id?: string; parentId: string; index: number };
          if (!meta.parentId || meta.id === current.id || !Number.isFinite(meta.index) || meta.index < 0) return null;
          const rect = item.getBoundingClientRect();
          const index = event.clientY < rect.top + rect.height / 2 ? meta.index : meta.index + 1;
          return { mode: 'bookmarks', parentId: meta.parentId, index };
        } catch {
          return null;
        }
      }
      if (current.kind === 'bookmark' && hovered.closest('[data-manual-tree]')) {
        return { mode: 'into', folderId: MANUAL_BOOKMARK_FOLDER_ID };
      }
      return null;
    };

    const onMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !draggingRef.current) {
        const dx = event.clientX - pending.x;
        const dy = event.clientY - pending.y;
        if ((dx * dx) + (dy * dy) < MANUAL_DRAG_THRESHOLD_PX * MANUAL_DRAG_THRESHOLD_PX) return;
        pendingDragRef.current = null;
        suppressClickRef.current = true;
        draggingRef.current = pending.item;
        setDragging(pending.item);
        onDragChange?.(pending.item);
      }

      if (!draggingRef.current && externalDragRef.current) {
        draggingRef.current = externalDragRef.current;
      }
      const current = draggingRef.current;
      if (!current) return;
      event.preventDefault();
      const target = readDropTarget(event);
      if (!sameDropTarget(dropTargetRef.current, target)) {
        dropTargetRef.current = target;
        setDropTarget(target);
      }
    };

    const onUp = (event: PointerEvent) => {
      pendingDragRef.current = null;
      if (!draggingRef.current && externalDragRef.current) {
        draggingRef.current = externalDragRef.current;
      }
      const current = draggingRef.current;
      if (!current) return;
      const hovered = document.elementFromPoint(event.clientX, event.clientY);
      if (hovered?.closest('[data-bookmark-bar]')) {
        draggingRef.current = null;
        dropTargetRef.current = null;
        setDragging(null);
        setDropTarget(null);
        onDragChange?.(null);
      } else {
        const target = readDropTarget(event) || dropTargetRef.current;
        if (target) commitDrop(target);
        else clearDrag();
      }
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [clearDrag, commitDrop, onDragChange]);

  const dndValue = React.useMemo<DndContextValue>(() => ({
    dragging,
    dropTarget,
    armDrag,
    consumeClickSuppression,
  }), [armDrag, consumeClickSuppression, dragging, dropTarget]);

  return (
    <ManualDndContext.Provider value={dndValue}>
      <div className="flex h-full min-h-0 cursor-default flex-col [&_button]:cursor-default [&_[role=button]]:cursor-default">
        <div className="flex shrink-0 items-center gap-4 px-3 pb-2 pt-3 text-sm text-discord-muted">
          <span className="inline-flex items-center gap-1.5">
            <Star size={12} className="fill-yellow-400 text-yellow-400" />
            직접 추가
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Link2 size={12} className="text-discord-accent" />
            레코드
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-auto inline-flex">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-discord-muted hover:bg-discord-hover hover:text-discord-text disabled:opacity-50"
                  aria-label="직접 추가 폴더 만들기"
                  disabled={creating}
                  onClick={() => void createFolder()}
                >
                  <Plus size={14} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>직접 추가 폴더 만들기</TooltipContent>
          </Tooltip>
        </div>
        <div
          data-manual-tree="true"
          className={cn('min-h-0 flex-1 overflow-y-auto discord-scrollbar px-3 pb-3', dragging && 'select-none')}
        >
          {tree.length === 0 ? (
            <div className="py-8 text-center text-sm text-discord-muted">저장된 북마크가 없습니다.</div>
          ) : (
            tree.map((folder) => (
              <FolderNode
                key={folder.id}
                folder={folder}
                depth={0}
                expanded={expanded}
                activeUrls={activeUrls}
                onToggle={toggle}
                onOpen={onOpen}
                onRemoveManual={onRemoveManual}
                folderEdit={folderEdit}
                bookmarkEdit={bookmarkEdit}
              />
            ))
          )}
        </div>
      </div>
    </ManualDndContext.Provider>
  );
}
