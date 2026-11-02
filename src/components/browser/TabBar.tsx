import React, { type CSSProperties } from 'react';
import { Globe, Plus, X } from 'lucide-react';
import { faviconUrlFor } from '../../lib/browserFavicon';
import type { BrowserTabState } from '../../lib/browserTabs';
import { cn } from '../../lib/utils';
import { WindowControls } from '../TitleBar';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';

interface CSSPropertiesWithWebkit extends CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

const dragStyle = { WebkitAppRegion: 'drag' } as CSSPropertiesWithWebkit;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSPropertiesWithWebkit;

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
    <div
      className="flex h-9 shrink-0 items-stretch bg-[#2B2D31] text-[#949BA4]"
      style={dragStyle}
    >
      <div className="flex min-w-0 flex-1 pl-1">
        <div className="flex min-w-0 items-end gap-px overflow-x-auto pt-1 discord-scrollbar">
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={active}
                title={tab.title}
                onClick={() => onSelect(tab.id)}
                style={noDragStyle}
                className={cn(
                  'group flex h-8 w-40 min-w-[112px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2 text-sm',
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
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="새 탭"
              style={noDragStyle}
              className="mb-0.5 mt-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-discord-muted hover:bg-discord-hover hover:text-discord-text"
              onClick={onNewTab}
            >
              <Plus size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className={FIELD_TOOLTIP_CLASSNAME}>
            새 탭 (Ctrl+T)
          </TooltipContent>
        </Tooltip>
        <div className="min-w-8 flex-1" />
      </div>
      <WindowControls showUtilityButtons={false} />
    </div>
  );
}
