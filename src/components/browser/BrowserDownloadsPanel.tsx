import React from 'react';
import { ExternalLink, FileDown, Film, FolderOpen, Image, X } from 'lucide-react';
import {
  downloadMetaLabel,
  downloadProgressPercent,
  filterBrowserDownloads,
  recentBrowserDownloads,
  type BrowserDownloadItem,
} from '../../lib/browserDownloads';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type BrowserDownloadsPanelProps = {
  items: BrowserDownloadItem[];
  variant?: 'panel' | 'page' | 'bubble';
  onOpen: (id: string) => void;
  onShowInFolder: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onOpenAll?: () => void;
  onClose?: () => void;
};

function kindIcon(kind: BrowserDownloadItem['kind']) {
  if (kind === 'video') return Film;
  if (kind === 'image') return Image;
  return FileDown;
}

function DownloadThumb({ item }: { item: BrowserDownloadItem }) {
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (item.kind !== 'image' || item.state !== 'completed' || !item.filePath) {
      setSrc(null);
      return undefined;
    }
    let cancelled = false;
    void window.electronAPI.getThumbnailDataUrl(item.filePath).then((url) => {
      if (!cancelled) setSrc(url);
    }).catch(() => {
      if (!cancelled) setSrc(null);
    });
    return () => {
      cancelled = true;
    };
  }, [item.filePath, item.kind, item.state]);

  if (src) {
    return <img src={src} alt="" className="h-9 w-9 rounded object-cover" />;
  }
  const Icon = kindIcon(item.kind);
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded bg-black/40 text-discord-muted">
      <Icon size={16} />
    </span>
  );
}

function DownloadRow({
  item,
  compact,
  onOpen,
  onShowInFolder,
  onDelete,
}: {
  item: BrowserDownloadItem;
  compact?: boolean;
  onOpen: (id: string) => void;
  onShowInFolder: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const percent = downloadProgressPercent(item);
  const done = item.state === 'completed';
  return (
    <div className={`flex items-center gap-2 ${compact ? 'px-3 py-2 hover:bg-white/5' : 'rounded-md px-2 py-2 hover:bg-discord-hover'}`}>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-70"
        disabled={!done}
        onClick={() => onOpen(item.id)}
      >
        <DownloadThumb item={item} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-discord-text">{item.filename}</span>
          <span className="mt-0.5 block truncate text-xs text-discord-muted">{downloadMetaLabel(item)}</span>
          {item.state === 'progressing' && (
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-black/40">
              <span className="block h-full bg-discord-accent" style={{ width: `${percent}%` }} />
            </span>
          )}
        </span>
      </button>
      {!compact && (
        <button
          type="button"
          aria-label="폴더에서 보기"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-muted hover:bg-white/10 hover:text-discord-text"
          onClick={() => onShowInFolder(item.id)}
        >
          <FolderOpen size={14} />
        </button>
      )}
      <button
        type="button"
        aria-label={`${item.filename} 기록 삭제`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-discord-muted hover:bg-white/10 hover:text-discord-text"
        onClick={() => onDelete(item.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function BrowserDownloadsPanel({
  items,
  variant = 'panel',
  onOpen,
  onShowInFolder,
  onDelete,
  onClear,
  onOpenAll,
  onClose,
}: BrowserDownloadsPanelProps) {
  const [query, setQuery] = React.useState('');
  const page = variant === 'page';
  const visible = variant === 'bubble' ? recentBrowserDownloads(items) : filterBrowserDownloads(items, query);

  if (variant === 'bubble') {
    return (
      <div className="w-[360px] overflow-hidden rounded-xl border border-white/10 bg-[#2B2D31] shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-discord-text">최근 다운로드 기록</p>
          {onClose && (
            <button
              type="button"
              aria-label="다운로드 목록 닫기"
              className="flex h-7 w-7 items-center justify-center rounded-full text-discord-muted hover:bg-white/10 hover:text-discord-text"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto discord-scrollbar">
          {visible.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-discord-muted">다운로드한 파일이 없습니다.</p>
          )}
          {visible.map((item) => (
            <DownloadRow
              key={item.id}
              item={item}
              compact
              onOpen={onOpen}
              onShowInFolder={onShowInFolder}
              onDelete={onDelete}
            />
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 py-2">
          <button
            type="button"
            className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm text-discord-text hover:bg-white/5"
            onClick={onOpenAll}
          >
            전체 다운로드 기록
          </button>
          <button
            type="button"
            aria-label="전체 다운로드 기록 열기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-discord-muted hover:bg-white/10 hover:text-discord-text"
            onClick={onOpenAll}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${page ? 'bg-discord-bg' : ''}`}>
      <div className={`shrink-0 space-y-2 border-b border-gray-800 ${page ? 'px-6 py-4' : 'p-3'}`}>
        {page && <h1 className="text-lg font-semibold text-discord-text">다운로드</h1>}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="다운로드 검색"
          className="h-8 bg-discord-sidebar border-gray-600 text-sm text-discord-text"
        />
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto discord-scrollbar ${page ? 'px-4 py-3' : 'p-2'}`}>
        {visible.length === 0 && (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-discord-muted">
            {items.length === 0 ? '다운로드한 파일이 없습니다.' : '검색 결과가 없습니다.'}
          </p>
        )}
        {visible.map((item) => (
          <DownloadRow
            key={item.id}
            item={item}
            onOpen={onOpen}
            onShowInFolder={onShowInFolder}
            onDelete={onDelete}
          />
        ))}
      </div>
      <div className={`shrink-0 border-t border-gray-800 ${page ? 'px-6 py-4' : 'p-3'}`}>
        <Button
          variant="outline"
          className="h-8 w-full border-gray-600 text-sm"
          disabled={items.length === 0}
          onClick={onClear}
        >
          목록 비우기
        </Button>
      </div>
    </div>
  );
}
