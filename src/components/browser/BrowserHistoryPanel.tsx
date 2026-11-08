import React from 'react';
import { Globe, Trash2 } from 'lucide-react';
import { faviconUrlFor } from '../../lib/browserFavicon';
import { filterBrowserHistory, type BrowserHistoryItem } from '../../lib/browserHistory';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type BrowserHistoryPanelProps = {
  items: BrowserHistoryItem[];
  variant?: 'panel' | 'page';
  onOpen: (url: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
};

function formatVisitedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function HistoryFavicon({ url }: { url: string }) {
  const src = faviconUrlFor(url);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) return <Globe size={14} className="shrink-0 text-discord-muted" />;
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className="h-3.5 w-3.5 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

export function BrowserHistoryPanel({ items, variant = 'panel', onOpen, onDelete, onClear }: BrowserHistoryPanelProps) {
  const [query, setQuery] = React.useState('');
  const filtered = filterBrowserHistory(items, query);
  const page = variant === 'page';

  return (
    <div className={`flex h-full flex-col ${page ? 'bg-discord-bg' : ''}`}>
      <div className={`shrink-0 space-y-2 border-b border-gray-800 ${page ? 'px-6 py-4' : 'p-3'}`}>
        {page && <h1 className="text-lg font-semibold text-discord-text">기록</h1>}
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="기록 검색"
          className="h-8 bg-discord-sidebar border-gray-600 text-sm text-discord-text"
        />
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto discord-scrollbar ${page ? 'px-4 py-3' : 'p-2'}`}>
        {filtered.length === 0 && (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-discord-muted">
            {items.length === 0 ? '방문 기록이 없습니다.' : '검색 결과가 없습니다.'}
          </p>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="group flex items-start gap-1 rounded-md px-1 py-1 hover:bg-discord-hover">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-1 text-left"
              onClick={() => onOpen(item.url)}
            >
              <HistoryFavicon url={item.url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-discord-text">{item.title}</span>
                <span className="mt-0.5 block truncate text-xs text-discord-muted">{item.url}</span>
                <span className="mt-0.5 block text-[11px] text-discord-muted">{formatVisitedAt(item.visitedAt)}</span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`${item.title} 기록 삭제`}
              className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-discord-muted opacity-0 hover:bg-white/10 hover:text-discord-text group-hover:opacity-100"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className={`shrink-0 border-t border-gray-800 ${page ? 'px-6 py-4' : 'p-3'}`}>
        <Button
          variant="outline"
          className="h-8 w-full border-gray-600 text-sm"
          disabled={items.length === 0}
          onClick={onClear}
        >
          기록 모두 삭제
        </Button>
      </div>
    </div>
  );
}
