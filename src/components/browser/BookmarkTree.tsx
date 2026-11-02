import React from 'react';
import { ChevronDown, ChevronRight, Folder, Link2, Star } from 'lucide-react';
import type { BrowserBookmark, BrowserBookmarkFolder } from '../../types';
import { cn } from '../../lib/utils';

type BookmarkTreeProps = {
  tree: BrowserBookmarkFolder[];
  activeUrls?: string[];
  onOpen: (bookmark: BrowserBookmark) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
};

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
  const isRecord = bookmark.source === 'record';

  return (
    <div
      className={cn(
        'group flex items-start gap-2 rounded-md py-1.5 pr-2',
        active ? 'bg-discord-accent/20' : 'hover:bg-discord-hover',
      )}
      style={{ paddingLeft: 32 + depth * 20 }}
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
        onClick={() => onOpen(bookmark)}
      >
        <div className="flex items-center gap-1.5">
          {isRecord ? (
            <Link2 size={13} className="shrink-0 text-discord-accent" />
          ) : (
            <Star size={13} className="shrink-0 fill-yellow-400 text-yellow-400" />
          )}
          <span className="truncate text-sm text-discord-text">{bookmark.title}</span>
        </div>
        <div className="truncate pl-[18px] text-[11px] text-discord-muted">{bookmarkHost(bookmark.url)}</div>
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
  collapsed,
  activeUrls,
  onToggle,
  onOpen,
  onRemoveManual,
}: {
  folder: BrowserBookmarkFolder;
  depth: number;
  collapsed: Set<string>;
  activeUrls: string[];
  onToggle: (id: string) => void;
  onOpen: (bookmark: BrowserBookmark) => void;
  onRemoveManual: (bookmark: BrowserBookmark) => void;
}) {
  const open = !collapsed.has(folder.id);
  const total = countBookmarks(folder);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-md py-2 pr-2 text-left hover:bg-discord-hover"
        style={{ paddingLeft: 12 + depth * 20 }}
        onClick={() => onToggle(folder.id)}
      >
        {depth > 0 && <span className="text-xs text-gray-400">└</span>}
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-discord-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-discord-muted" />
        )}
        {folder.kind === 'manual' ? (
          <Star size={14} className="shrink-0 fill-yellow-400 text-yellow-400" />
        ) : (
          <Folder size={14} className="shrink-0 text-discord-accent" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text">{folder.name}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-discord-muted">{total}</span>
      </button>
      {open && (
        <>
          {folder.bookmarks.map((bookmark) => (
            <BookmarkRow
              key={bookmark.id}
              bookmark={bookmark}
              depth={depth}
              active={activeUrls.includes(bookmark.url)}
              onOpen={onOpen}
              onRemoveManual={onRemoveManual}
            />
          ))}
          {folder.children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              collapsed={collapsed}
              activeUrls={activeUrls}
              onToggle={onToggle}
              onOpen={onOpen}
              onRemoveManual={onRemoveManual}
            />
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
}: BookmarkTreeProps) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (tree.length === 0) {
    return <div className="py-8 text-center text-xs text-discord-muted">저장된 북마크가 없습니다.</div>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 px-1 text-[11px] text-discord-muted">
        <span className="inline-flex items-center gap-1.5">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          직접 추가
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Link2 size={12} className="text-discord-accent" />
          레코드
        </span>
      </div>
      {tree.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={0}
          collapsed={collapsed}
          activeUrls={activeUrls}
          onToggle={toggle}
          onOpen={onOpen}
          onRemoveManual={onRemoveManual}
        />
      ))}
    </div>
  );
}
