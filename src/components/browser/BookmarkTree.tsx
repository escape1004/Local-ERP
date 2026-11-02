import React from 'react';
import { ChevronDown, ChevronRight, Folder, Link2, Plus, Star } from 'lucide-react';
import { MANUAL_BOOKMARK_FOLDER_ID, type BrowserBookmark, type BrowserBookmarkFolder } from '../../types';
import { cn } from '../../lib/utils';

const FOLDER_ROW_HEIGHT = 36;
const DRAG_PREFIX = 'erp-manual:';

type DragItem = { kind: 'bookmark' | 'folder'; id: string };
type DropTarget =
  | { mode: 'into'; folderId: string }
  | { mode: 'folders'; parentId: string; index: number }
  | { mode: 'bookmarks'; parentId: string; index: number };

type BookmarkTreeProps = {
  tree: BrowserBookmarkFolder[];
  activeUrls?: string[];
  onOpen: (bookmark: BrowserBookmark) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
  onCreateManualFolder: () => void | Promise<void>;
  onMoveManualItem: (payload: {
    kind: 'bookmark' | 'folder';
    id: string;
    parentId: string | null;
    index: number;
  }) => void | Promise<void>;
};

type DndContextValue = {
  dragging: DragItem | null;
  dropTarget: DropTarget | null;
  blockedFolderIds: Set<string>;
  setDragging: (item: DragItem | null) => void;
  setDropTarget: (target: DropTarget | null) => void;
  commitDrop: (target: DropTarget) => void;
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

function encodeDragItem(item: DragItem) {
  return `${DRAG_PREFIX}${JSON.stringify(item)}`;
}

function InsertLine({
  active,
  onDragOver,
  onDrop,
}: {
  active: boolean;
  onDragOver: React.DragEventHandler;
  onDrop: React.DragEventHandler;
}) {
  return (
    <div className="relative h-2" onDragOver={onDragOver} onDrop={onDrop}>
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
  active,
  onOpen,
  onRemoveManual,
}: {
  bookmark: BrowserBookmark;
  depth: number;
  active: boolean;
  onOpen: (bookmark: BrowserBookmark) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
}) {
  const dnd = React.useContext(ManualDndContext);
  const isRecord = bookmark.source === 'record';
  const secondary = isRecord ? bookmark.subtitle : bookmarkHost(bookmark.url);
  const dragging = dnd?.dragging?.kind === 'bookmark' && dnd.dragging.id === bookmark.id;
  const canDrag = !isRecord && Boolean(dnd);
  const draggedRef = React.useRef(false);

  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-md py-1.5 pr-2',
        active ? 'bg-discord-accent/20' : 'hover:bg-discord-hover',
        canDrag && 'cursor-grab active:cursor-grabbing',
        dragging && 'opacity-50',
      )}
      style={{ paddingLeft: 32 + depth * 20 }}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag || !dnd) return;
        draggedRef.current = true;
        event.dataTransfer.setData('text/plain', encodeDragItem({ kind: 'bookmark', id: bookmark.id }));
        event.dataTransfer.effectAllowed = 'move';
        dnd.setDragging({ kind: 'bookmark', id: bookmark.id });
      }}
      onDragEnd={() => dnd?.setDragging(null)}
    >
      <span
        className={cn(
          'mt-1 h-8 w-0.5 shrink-0 rounded-full',
          isRecord ? 'bg-discord-accent' : 'bg-yellow-400',
        )}
      />
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        title={bookmark.url}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          onOpen(bookmark);
        }}
      >
        <div className="flex items-center gap-1.5">
          {isRecord ? (
            <Link2 size={13} className="shrink-0 text-discord-accent" />
          ) : (
            <Star size={13} className="shrink-0 fill-yellow-400 text-yellow-400" />
          )}
          <span className="truncate text-sm text-discord-text">{bookmark.title}</span>
        </div>
        {secondary ? (
          <div className="truncate pl-[18px] text-[11px] text-discord-muted">{secondary}</div>
        ) : null}
      </button>
      {!isRecord && (
        <button
          type="button"
          className="mt-1 hidden shrink-0 text-[11px] text-discord-muted hover:text-red-400 group-hover:inline"
          onClick={() => onRemoveManual(bookmark)}
        >
          삭제
        </button>
      )}
    </div>
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
}: {
  folder: BrowserBookmarkFolder;
  depth: number;
  expanded: Set<string>;
  activeUrls: string[];
  onToggle: (id: string) => void;
  onOpen: (bookmark: BrowserBookmark) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
}) {
  const dnd = React.useContext(ManualDndContext);
  const open = expanded.has(folder.id);
  const total = countBookmarks(folder);
  const isManual = folder.kind === 'manual';
  const canDrag = Boolean(dnd) && isManual && folder.id !== MANUAL_BOOKMARK_FOLDER_ID;
  const canDropInto = Boolean(dnd)
    && isManual
    && dnd.dragging
    && !dnd.blockedFolderIds.has(folder.id)
    && !(dnd.dragging.kind === 'folder' && dnd.dragging.id === folder.id);
  const dragging = dnd?.dragging?.kind === 'folder' && dnd.dragging.id === folder.id;
  const dropInto = dnd?.dropTarget?.mode === 'into' && dnd.dropTarget.folderId === folder.id;
  const draggedRef = React.useRef(false);

  const setInsertTarget = (event: React.DragEvent, target: DropTarget) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (!sameDropTarget(dnd?.dropTarget || null, target)) dnd?.setDropTarget(target);
  };

  const folderChildren = folder.children.filter((child) => dnd?.dragging?.kind !== 'folder' || child.id !== dnd.dragging.id);
  const folderBookmarks = folder.bookmarks.filter((bookmark) => (
    bookmark.source === 'record' || dnd?.dragging?.kind !== 'bookmark' || bookmark.id !== dnd.dragging.id
  ));

  return (
    <div>
      <div
        className="sticky bg-discord-sidebar"
        style={{ top: depth * FOLDER_ROW_HEIGHT, zIndex: 30 - depth, height: FOLDER_ROW_HEIGHT }}
        draggable={canDrag}
        onDragStart={(event) => {
          if (!canDrag || !dnd) return;
          draggedRef.current = true;
          event.dataTransfer.setData('text/plain', encodeDragItem({ kind: 'folder', id: folder.id }));
          event.dataTransfer.effectAllowed = 'move';
          dnd.setDragging({ kind: 'folder', id: folder.id });
        }}
        onDragEnd={() => dnd?.setDragging(null)}
        onDragOver={(event) => {
          if (!canDropInto || !dnd?.dragging) return;
          setInsertTarget(event, { mode: 'into', folderId: folder.id });
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (canDropInto) dnd?.commitDrop({ mode: 'into', folderId: folder.id });
        }}
      >
        <button
          type="button"
          className={cn(
            'flex h-full w-full items-center gap-1.5 overflow-hidden pr-2 text-left hover:bg-discord-hover',
            canDrag && 'cursor-grab active:cursor-grabbing',
            dragging && 'opacity-50',
            dropInto && 'bg-discord-accent/20',
          )}
          style={{ paddingLeft: 12 + depth * 20 }}
          onClick={() => {
            if (draggedRef.current) {
              draggedRef.current = false;
              return;
            }
            onToggle(folder.id);
          }}
        >
          {depth > 0 && <span className="text-xs text-gray-400">└</span>}
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
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text">{folder.name}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-discord-muted">{total}</span>
        </button>
      </div>
      {open && (
        <>
          {isManual && dnd?.dragging?.kind === 'folder' && (
            <InsertLine
              active={dnd.dropTarget?.mode === 'folders' && dnd.dropTarget.parentId === folder.id && dnd.dropTarget.index === 0}
              onDragOver={(event) => setInsertTarget(event, { mode: 'folders', parentId: folder.id, index: 0 })}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dnd.commitDrop({ mode: 'folders', parentId: folder.id, index: 0 });
              }}
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
              />
              {isManual && dnd?.dragging?.kind === 'folder' && child.id !== dnd.dragging.id && (
                <InsertLine
                  active={
                    dnd.dropTarget?.mode === 'folders'
                    && dnd.dropTarget.parentId === folder.id
                    && dnd.dropTarget.index === folderChildren.findIndex((item) => item.id === child.id) + 1
                  }
                  onDragOver={(event) => {
                    const nextIndex = folderChildren.findIndex((item) => item.id === child.id) + 1;
                    setInsertTarget(event, { mode: 'folders', parentId: folder.id, index: Math.max(0, nextIndex) });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextIndex = folderChildren.findIndex((item) => item.id === child.id) + 1;
                    dnd.commitDrop({ mode: 'folders', parentId: folder.id, index: Math.max(0, nextIndex) });
                  }}
                />
              )}
            </React.Fragment>
          ))}
          {isManual && dnd?.dragging?.kind === 'bookmark' && (
            <InsertLine
              active={dnd.dropTarget?.mode === 'bookmarks' && dnd.dropTarget.parentId === folder.id && dnd.dropTarget.index === 0}
              onDragOver={(event) => setInsertTarget(event, { mode: 'bookmarks', parentId: folder.id, index: 0 })}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dnd.commitDrop({ mode: 'bookmarks', parentId: folder.id, index: 0 });
              }}
            />
          )}
          {folder.bookmarks.map((bookmark) => (
            <React.Fragment key={bookmark.id}>
              <BookmarkRow
                bookmark={bookmark}
                depth={depth}
                active={activeUrls.includes(bookmark.url)}
                onOpen={onOpen}
                onRemoveManual={onRemoveManual}
              />
              {isManual && dnd?.dragging?.kind === 'bookmark' && bookmark.source !== 'record' && bookmark.id !== dnd.dragging.id && (
                <InsertLine
                  active={
                    dnd.dropTarget?.mode === 'bookmarks'
                    && dnd.dropTarget.parentId === folder.id
                    && dnd.dropTarget.index === folderBookmarks.findIndex((item) => item.id === bookmark.id) + 1
                  }
                  onDragOver={(event) => {
                    const nextIndex = folderBookmarks.findIndex((item) => item.id === bookmark.id) + 1;
                    setInsertTarget(event, { mode: 'bookmarks', parentId: folder.id, index: Math.max(0, nextIndex) });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const nextIndex = folderBookmarks.findIndex((item) => item.id === bookmark.id) + 1;
                    dnd.commitDrop({ mode: 'bookmarks', parentId: folder.id, index: Math.max(0, nextIndex) });
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
  onCreateManualFolder,
  onMoveManualItem,
}: BookmarkTreeProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [creating, setCreating] = React.useState(false);
  const [dragging, setDragging] = React.useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);

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

  const blockedFolderIds = React.useMemo(() => {
    if (dragging?.kind !== 'folder') return new Set<string>();
    const source = findFolder(tree, dragging.id);
    return new Set(source ? collectFolderIds(source) : [dragging.id]);
  }, [dragging, tree]);

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

  const commitDrop = React.useCallback((target: DropTarget) => {
    if (!dragging) return;
    const destFolderId = target.mode === 'into' ? target.folderId : target.parentId;
    if (dragging.kind === 'folder' && blockedFolderIds.has(destFolderId) && target.mode === 'into') {
      setDragging(null);
      setDropTarget(null);
      return;
    }

    const destFolder = findFolder(tree, destFolderId);
    const parentId = destFolderId === MANUAL_BOOKMARK_FOLDER_ID ? null : destFolderId;
    let index = 0;
    if (target.mode === 'into') {
      const siblings = dragging.kind === 'folder'
        ? (destFolder?.children || []).filter((item) => item.id !== dragging.id)
        : (destFolder?.bookmarks || []).filter((item) => item.id !== dragging.id);
      index = siblings.length;
    } else {
      index = target.index;
    }

    setExpanded((current) => {
      const next = new Set(current);
      next.add(destFolderId);
      return next;
    });
    setDragging(null);
    setDropTarget(null);
    void onMoveManualItem({
      kind: dragging.kind,
      id: dragging.id,
      parentId,
      index,
    });
  }, [blockedFolderIds, dragging, onMoveManualItem, tree]);

  const dndValue = React.useMemo<DndContextValue>(() => ({
    dragging,
    dropTarget,
    blockedFolderIds,
    setDragging: (item) => {
      setDragging(item);
      if (!item) setDropTarget(null);
    },
    setDropTarget,
    commitDrop,
  }), [blockedFolderIds, commitDrop, dragging, dropTarget]);

  return (
    <ManualDndContext.Provider value={dndValue}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-4 px-3 pb-2 pt-3 text-[11px] text-discord-muted">
          <span className="inline-flex items-center gap-1.5">
            <Star size={12} className="fill-yellow-400 text-yellow-400" />
            직접 추가
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Link2 size={12} className="text-discord-accent" />
            레코드
          </span>
          <button
            type="button"
            className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-discord-muted hover:bg-discord-hover hover:text-discord-text disabled:opacity-50"
            title="직접 추가 폴더 만들기"
            disabled={creating}
            onClick={() => void createFolder()}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto discord-scrollbar px-3 pb-3', dragging && 'select-none')}>
          {tree.length === 0 ? (
            <div className="py-8 text-center text-xs text-discord-muted">저장된 북마크가 없습니다.</div>
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
              />
            ))
          )}
        </div>
      </div>
    </ManualDndContext.Provider>
  );
}
