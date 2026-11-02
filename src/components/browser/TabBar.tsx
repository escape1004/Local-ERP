import React from 'react';
import { Globe, Plus, X } from 'lucide-react';
import { faviconUrlFor } from '../../lib/browserFavicon';
import type { BrowserTabState } from '../../lib/browserTabs';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';

function TabFavicon({ url }: { url: string }) {
  const src = faviconUrlFor(url);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return <Globe size={12} className="shrink-0 text-discord-muted" />;
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

type TabBarProps = {
  tabs: BrowserTabState[];
  activeId: string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTab: () => void;
};

export function TabBar({ tabs, activeId, onSelect, onClose, onNewTab }: TabBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-end gap-px overflow-x-auto bg-[#1e1f22] px-1 pt-1 discord-scrollbar">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.title}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'group flex h-8 min-w-[112px] max-w-[200px] flex-1 cursor-pointer items-center gap-1.5 rounded-t-md px-2 text-xs',
              active ? 'bg-discord-bg text-discord-text' : 'text-discord-muted hover:bg-discord-hover hover:text-discord-text',
            )}
          >
            <TabFavicon url={tab.url} />
            <span className="min-w-0 flex-1 truncate">{tab.loading ? '불러오는 중' : tab.title}</span>
            <button
              type="button"
              aria-label={`${tab.title} 탭 닫기`}
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-white/10',
                active ? 'opacity-80' : 'opacity-0 group-hover:opacity-80',
              )}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose(tab.id);
              }}
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="새 탭"
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-muted hover:bg-discord-hover hover:text-discord-text"
            onClick={onNewTab}
          >
            <Plus size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className={FIELD_TOOLTIP_CLASSNAME}>
          새 탭 (Ctrl+T)
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
