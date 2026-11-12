import React, { type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Plus, X } from 'lucide-react';
import { faviconUrlFor } from '../../lib/browserFavicon';
import { BROWSER_TAB_ANIMATION_MS, getBrowserTabItemStyle } from '../../lib/browserTabLayout';
import type { BrowserTabState } from '../../lib/browserTabs';
import { cn } from '../../lib/utils';
import { WindowControls } from '../TitleBar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';

interface CSSPropertiesWithWebkit extends CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

const dragStyle = { WebkitAppRegion: 'drag' } as CSSPropertiesWithWebkit;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSPropertiesWithWebkit;
const TAB_DRAG_THRESHOLD_PX = 8;

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

function TabFace({
  tab,
  active,
  elevated,
  className,
  style,
  onClose,
}: {
  tab: BrowserTabState;
  active?: boolean;
  elevated?: boolean;
  className?: string;
  style?: CSSProperties;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative flex h-8 w-full min-w-0 select-none items-center gap-1.5 overflow-hidden rounded-t-md px-2 text-sm',
        active || elevated ? 'bg-discord-bg text-discord-text' : 'text-discord-muted',
        className,
      )}
      style={style}
    >
      <TabFavicon url={tab.url} />
      <span className="min-w-0 flex-1 truncate [mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent)]">
        {tab.loading ? '불러오는 중' : tab.title}
      </span>
      {onClose ? (
        <button
          type="button"
          aria-label={`${tab.title} 탭 닫기`}
          className={cn(
            'absolute right-1 top-1/2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm hover:bg-white/10',
            active ? 'opacity-80' : 'opacity-0 group-hover:opacity-80',
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
        >
          <X size={11} />
        </button>
      ) : null}
    </div>
  );
}

type TabBarProps = {
  tabs: BrowserTabState[];
  activeId: string;
  canRestoreClosedTab?: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTab: () => void;
  onDuplicate?: (tabId: string) => void;
  onRestoreClosedTab?: () => void;
  onReorder?: (tabId: string, toIndex: number) => void;
};

type PendingDrag = {
  id: string;
  startX: number;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
};

type ExitingTab = {
  tab: BrowserTabState;
  index: number;
};

export function TabBar({
  tabs,
  activeId,
  canRestoreClosedTab = false,
  onSelect,
  onClose,
  onNewTab,
  onDuplicate,
  onRestoreClosedTab,
  onReorder,
}: TabBarProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const ghostRef = React.useRef<HTMLDivElement>(null);
  const pendingDragRef = React.useRef<PendingDrag | null>(null);
  const draggingIdRef = React.useRef<string | null>(null);
  const dropIndexRef = React.useRef<number | null>(null);
  const grabRef = React.useRef({ x: 0, y: 0 });
  const suppressClickRef = React.useRef(false);
  const hydratedRef = React.useRef(false);
  const prevTabsRef = React.useRef(tabs);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropIndex, setDropIndex] = React.useState<number | null>(null);
  const [ghost, setGhost] = React.useState<{ tab: BrowserTabState; width: number; height: number; x: number; y: number } | null>(null);
  const [enteringIds, setEnteringIds] = React.useState<string[]>([]);
  const [exitingTabs, setExitingTabs] = React.useState<ExitingTab[]>([]);

  const resolveRemainingIndex = React.useCallback((clientX: number) => {
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') || [])];
    const index = nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    return index === -1 ? nodes.length : index;
  }, []);

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !draggingIdRef.current) {
        if (Math.abs(event.clientX - pending.startX) >= TAB_DRAG_THRESHOLD_PX) {
          pendingDragRef.current = null;
          suppressClickRef.current = true;
          draggingIdRef.current = pending.id;
          grabRef.current = { x: pending.grabX, y: pending.grabY };
          const from = tabs.findIndex((item) => item.id === pending.id);
          dropIndexRef.current = Math.max(0, from);
          setDropIndex(Math.max(0, from));
          const tab = tabs.find((item) => item.id === pending.id);
          if (tab) {
            setGhost({
              tab,
              width: pending.width,
              height: pending.height,
              x: event.clientX - pending.grabX,
              y: event.clientY - pending.grabY,
            });
          }
          setDraggingId(pending.id);
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
          return;
        }
      }
      if (!draggingIdRef.current) return;
      const x = event.clientX - grabRef.current.x;
      const y = event.clientY - grabRef.current.y;
      if (ghostRef.current) {
        ghostRef.current.style.left = `${x}px`;
        ghostRef.current.style.top = `${y}px`;
      }
      const nextIndex = resolveRemainingIndex(event.clientX);
      dropIndexRef.current = nextIndex;
      setDropIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const onUp = () => {
      pendingDragRef.current = null;
      const id = draggingIdRef.current;
      const remainingIndex = dropIndexRef.current;
      const from = tabs.findIndex((tab) => tab.id === id);
      draggingIdRef.current = null;
      dropIndexRef.current = null;
      setDraggingId(null);
      setDropIndex(null);
      setGhost(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (id && remainingIndex != null && from >= 0) {
        const fullIndex = remainingIndex > from ? remainingIndex + 1 : remainingIndex;
        onReorder?.(id, fullIndex);
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
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [onReorder, resolveRemainingIndex, tabs]);

  React.useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth) return;
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      event.preventDefault();
      node.scrollLeft += delta;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  React.useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [activeId, tabs.length]);

  const tabsRef = React.useRef(tabs);
  tabsRef.current = tabs;
  const tabIdsKey = tabs.map((tab) => tab.id).join(',');
  const previousTabs = prevTabsRef.current;
  const previousIds = previousTabs.map((tab) => tab.id);
  const currentIds = tabs.map((tab) => tab.id);
  const addedNow = hydratedRef.current
    ? currentIds.filter((id) => !previousIds.includes(id))
    : [];
  const removedNow = hydratedRef.current
    ? previousTabs
      .map((tab, index) => ({ tab, index }))
      .filter((item) => !currentIds.includes(item.tab.id))
    : [];

  React.useLayoutEffect(() => {
    const nextTabs = tabsRef.current;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      prevTabsRef.current = nextTabs;
      return;
    }

    const previous = prevTabsRef.current;
    const previousTabIds = previous.map((tab) => tab.id);
    const nextIds = nextTabs.map((tab) => tab.id);
    if (previousTabIds.length === 0 && nextIds.length > 0) {
      prevTabsRef.current = nextTabs;
      return;
    }

    const added = nextIds.filter((id) => !previousTabIds.includes(id));
    const removed = previous
      .map((tab, index) => ({ tab, index }))
      .filter((item) => !nextIds.includes(item.tab.id));
    prevTabsRef.current = nextTabs;

    if (added.length > 0) {
      setEnteringIds((current) => [...current, ...added.filter((id) => !current.includes(id))]);
      window.setTimeout(() => {
        setEnteringIds((current) => current.filter((id) => !added.includes(id)));
      }, BROWSER_TAB_ANIMATION_MS);
    }

    if (removed.length > 0) {
      setExitingTabs((current) => {
        const next = [...current];
        removed.forEach((item) => {
          if (!next.some((entry) => entry.tab.id === item.tab.id)) next.push(item);
        });
        return next;
      });
      const removedIds = new Set(removed.map((item) => item.tab.id));
      window.setTimeout(() => {
        setExitingTabs((current) => current.filter((item) => !removedIds.has(item.tab.id)));
      }, BROWSER_TAB_ANIMATION_MS);
    }
  }, [tabIdsKey]);

  const draggingTab = draggingId ? tabs.find((tab) => tab.id === draggingId) : null;
  const liveTabs = draggingId ? tabs.filter((tab) => tab.id !== draggingId) : tabs;
  const pendingExit = React.useMemo(() => {
    const merged = [...exitingTabs];
    removedNow.forEach((item) => {
      if (
        !merged.some((entry) => entry.tab.id === item.tab.id)
        && !liveTabs.some((tab) => tab.id === item.tab.id)
      ) {
        merged.push(item);
      }
    });
    return merged;
  }, [exitingTabs, liveTabs, removedNow]);
  const stripTabs = React.useMemo(() => {
    const next = [...liveTabs];
    const liveIds = new Set(liveTabs.map((tab) => tab.id));
    pendingExit.forEach((item) => {
      if (liveIds.has(item.tab.id)) return;
      liveIds.add(item.tab.id);
      next.splice(Math.min(item.index, next.length), 0, item.tab);
    });
    return next;
  }, [liveTabs, pendingExit]);
  const gapIndex = draggingId ? (dropIndex ?? Math.max(0, tabs.findIndex((tab) => tab.id === draggingId))) : null;
  const exitingIds = new Set(pendingExit.map((item) => item.tab.id));

  return (
    <div
      className="flex h-9 shrink-0 cursor-default items-stretch bg-[#2B2D31] text-[#949BA4] [&_button]:cursor-default"
      style={dragStyle}
    >
      <div className="flex min-w-0 flex-1 pl-1">
        <div className="flex min-w-0 max-w-full">
          <div ref={listRef} className="flex min-w-0 items-end gap-px overflow-x-auto pt-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {stripTabs.map((tab, index) => {
              const active = tab.id === activeId;
              const collapsed = exitingIds.has(tab.id);
              const entering = !collapsed && (addedNow.includes(tab.id) || enteringIds.includes(tab.id));
              return (
                <React.Fragment key={tab.id}>
                  {gapIndex === index && draggingTab && (
                    <div
                      className="h-8 rounded-t-md bg-black/30"
                      style={getBrowserTabItemStyle()}
                    />
                  )}
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        role="tab"
                        data-tab-id={tab.id}
                        aria-selected={active}
                        title={tab.title}
                        onClick={() => {
                          if (suppressClickRef.current || collapsed) return;
                          onSelect(tab.id);
                        }}
                        onContextMenu={() => onSelect(tab.id)}
                        onPointerDown={(event) => {
                          if (event.button !== 0 || tabs.length < 2 || collapsed) return;
                          const rect = event.currentTarget.getBoundingClientRect();
                          pendingDragRef.current = {
                            id: tab.id,
                            startX: event.clientX,
                            grabX: event.clientX - rect.left,
                            grabY: event.clientY - rect.top,
                            width: rect.width,
                            height: rect.height,
                          };
                        }}
                        onDragStart={(event) => event.preventDefault()}
                        style={{ ...noDragStyle, ...getBrowserTabItemStyle() }}
                        className={cn(
                          'overflow-hidden cursor-default',
                          entering && 'browser-tab-enter',
                          collapsed && 'browser-tab-exit',
                        )}
                      >
                        <TabFace
                          tab={tab}
                          active={active}
                          className={active ? '' : 'hover:bg-discord-hover hover:text-discord-text'}
                          onClose={collapsed ? undefined : () => onClose(tab.id)}
                        />
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-[180px] border-gray-700 bg-discord-sidebar text-discord-text">
                      <ContextMenuItem onSelect={() => onDuplicate?.(tab.id)}>탭 복제</ContextMenuItem>
                      <ContextMenuItem disabled={!canRestoreClosedTab} onSelect={() => onRestoreClosedTab?.()}>
                        닫은 탭 다시 열기
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-gray-700" />
                      <ContextMenuItem onSelect={() => onClose(tab.id)}>탭 닫기</ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </React.Fragment>
              );
            })}
            {gapIndex === stripTabs.length && draggingTab && (
              <div
                className="h-8 rounded-t-md bg-black/30"
                style={getBrowserTabItemStyle()}
              />
            )}
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
        </div>
        <div className="min-w-0 grow" />
      </div>
      <WindowControls showUtilityButtons={false} />
      {ghost && createPortal(
        <div
          ref={ghostRef}
          className="pointer-events-none fixed z-[200]"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.width,
            height: ghost.height,
            ...noDragStyle,
          }}
        >
          <TabFace
            tab={ghost.tab}
            active={ghost.tab.id === activeId}
            elevated
            className="w-full shadow-2xl ring-1 ring-white/15"
            style={{ width: ghost.width }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
