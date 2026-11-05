import React from 'react';
import { Download, Loader2, Play, RefreshCw, Video } from 'lucide-react';
import {
  browserVideoKindLabel,
  browserVideoQualityOptions,
  displayBrowserVideoName,
  mergeBrowserVideoCaptures,
  formatBrowserVideoCountBadge,
  formatBrowserVideoDuration,
  isUnsupportedBrowserVideoPage,
  type BrowserPageVideoCapture,
} from '../../lib/browserPageVideos';
import { getLocalVideoHttpUrl } from '../../lib/local-media';
import type { BrowserDetectedVideo, BrowserMediaTrack } from '../../types';
import { Button } from '../ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { toast } from '../ui/use-toast';
import { FIELD_TOOLTIP_CLASSNAME } from '../records/FieldValueRenderer';

type BrowserVideoMenuProps = {
  disabled: boolean;
  pageUrl: string;
  pageTitle: string;
  collectCaptures: () => Promise<BrowserPageVideoCapture[]>;
};

const PREVIEW_DEFAULT_VOLUME = 0.05;

function defaultQualityUrl(video: BrowserDetectedVideo) {
  return video.qualities?.[0]?.url || video.url;
}

function BrowserVideoPreviewPlayer({ src }: { src: string }) {
  const playerRef = React.useRef<HTMLVideoElement>(null);
  React.useLayoutEffect(() => {
    if (playerRef.current) playerRef.current.volume = PREVIEW_DEFAULT_VOLUME;
  }, [src]);
  return (
    <video
      ref={playerRef}
      src={src}
      controls
      autoPlay
      className="max-h-[70vh] w-full rounded-md bg-black"
    />
  );
}

export function BrowserVideoMenu({
  disabled,
  pageUrl,
  pageTitle,
  collectCaptures,
}: BrowserVideoMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [savingId, setSavingId] = React.useState('');
  const [previewingId, setPreviewingId] = React.useState('');
  const [videos, setVideos] = React.useState<BrowserDetectedVideo[]>([]);
  const [detectedCount, setDetectedCount] = React.useState(0);
  const [selectedQuality, setSelectedQuality] = React.useState<Record<string, string>>({});
  const [preview, setPreview] = React.useState<{ title: string; src: string } | null>(null);
  const unsupported = isUnsupportedBrowserVideoPage(pageUrl);
  const countBadge = formatBrowserVideoCountBadge(open ? videos.length : detectedCount);

  const refresh = React.useCallback(async () => {
    if (disabled || unsupported || !pageUrl) {
      setVideos([]);
      setDetectedCount(0);
      return;
    }
    setLoading(true);
    try {
      const captures = await collectCaptures();
      const listed = await window.electronAPI.listBrowserPageVideos({
        pageUrl,
        pageTitle,
        urls: captures.flatMap((item) => item.urls),
        captures,
      });
      const next = mergeBrowserVideoCaptures(Array.isArray(listed) ? listed : [], captures);
      setVideos(next);
      setDetectedCount(next.length);
      setSelectedQuality((current) => {
        const updated = { ...current };
        next.forEach((video) => {
          const options = browserVideoQualityOptions(video);
          const urls = new Set(options.map((item) => item.url));
          if (!updated[video.id] || !urls.has(updated[video.id])) {
            updated[video.id] = options[0]?.url || defaultQualityUrl(video);
          }
        });
        return updated;
      });
    } catch {
      setVideos([]);
      setDetectedCount(0);
    } finally {
      setLoading(false);
    }
  }, [collectCaptures, disabled, pageTitle, pageUrl, unsupported]);

  React.useEffect(() => {
    if (disabled || unsupported || !pageUrl) {
      setDetectedCount(0);
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const listed = await window.electronAPI.listBrowserPageVideos({
          pageUrl,
          pageTitle,
          enrich: false,
        });
        if (!cancelled) setDetectedCount(Array.isArray(listed) ? listed.length : 0);
      } catch {
        if (!cancelled) setDetectedCount(0);
      }
    };
    void tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [disabled, pageTitle, pageUrl, unsupported]);

  const saveVideo = async (video: BrowserDetectedVideo, track: BrowserMediaTrack = 'av') => {
    if (savingId) return;
    setSavingId(video.id);
    try {
      const result = await window.electronAPI.downloadBrowserPageVideo({
        pageUrl,
        id: video.id,
        url: video.url,
        qualityUrl: selectedQuality[video.id] || defaultQualityUrl(video),
        track,
      });
      if (!result?.success) {
        if (result?.error) toast({ title: result.error, variant: 'destructive' });
        return;
      }
      toast({
        title: track === 'audio' ? '음성을 저장했습니다.' : track === 'video' ? '영상만 저장했습니다.' : '영상을 저장했습니다.',
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '영상을 저장하지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSavingId('');
    }
  };

  const previewVideo = async (video: BrowserDetectedVideo) => {
    if (previewingId) return;
    setPreviewingId(video.id);
    try {
      const result = await window.electronAPI.previewBrowserPageVideo({
        pageUrl,
        id: video.id,
        url: video.url,
        qualityUrl: selectedQuality[video.id] || defaultQualityUrl(video),
      });
      if (!result?.success || !result.path) {
        toast({ title: result?.error || '미리보기를 만들지 못했습니다.', variant: 'destructive' });
        return;
      }
      setOpen(false);
      setPreview({
        title: displayBrowserVideoName(video),
        src: await getLocalVideoHttpUrl(result.path),
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : '미리보기를 만들지 못했습니다.',
        variant: 'destructive',
      });
    } finally {
      setPreviewingId('');
    }
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) void refresh();
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="relative inline-flex">
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={disabled}
                  aria-label={countBadge ? `영상 저장 ${countBadge}개` : '영상 저장'}
                >
                  {savingId || previewingId ? <Loader2 size={16} className="animate-spin" /> : <Video size={16} />}
                </Button>
              </PopoverTrigger>
              {countBadge ? (
                <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {countBadge}
                </span>
              ) : null}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>
            영상 저장
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="w-[420px] border-gray-700 bg-[#1e1f22] p-0 text-discord-text shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <div className="text-sm font-semibold">영상 저장</div>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-discord-muted hover:bg-discord-hover hover:text-discord-text"
              aria-label="다시 감지"
              onClick={() => void refresh()}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="px-3 py-2 text-[12px] font-medium text-yellow-400">
            일부 미디어는 재생을 시작해야 감지할 수 있습니다.
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto px-3 pb-3 discord-scrollbar">
            {unsupported ? (
              <div className="rounded-md bg-black/30 px-3 py-4 text-xs text-discord-muted">
                YouTube와 DRM 보호 영상은 저장할 수 없습니다.
              </div>
            ) : loading && videos.length === 0 ? (
              <div className="flex items-center gap-2 px-1 py-4 text-xs text-discord-muted">
                <Loader2 size={14} className="animate-spin" />
                영상을 찾는 중
              </div>
            ) : videos.length === 0 ? (
              <div className="rounded-md bg-black/30 px-3 py-4 text-xs text-discord-muted">
                이 페이지에서 저장할 수 있는 영상을 아직 찾지 못했습니다. 재생을 시작한 뒤 다시 열어 보세요.
              </div>
            ) : (
              videos.map((video) => {
                const duration = formatBrowserVideoDuration(video.duration);
                const qualities = browserVideoQualityOptions(video);
                const qualityUrl = qualities.find((item) => item.url === selectedQuality[video.id])?.url
                  || qualities[0]?.url
                  || '';
                return (
                  <ContextMenu key={video.id}>
                    <ContextMenuTrigger asChild>
                  <div className="flex h-[72px] items-stretch gap-3">
                    <button
                      type="button"
                      className="relative h-full w-[128px] shrink-0 overflow-hidden rounded-md bg-black"
                      aria-label="미리보기 재생"
                      disabled={Boolean(previewingId)}
                      onClick={() => void previewVideo(video)}
                    >
                      {video.preview ? (
                        <img src={video.preview} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-discord-muted">
                          <Play size={22} fill="currentColor" />
                        </span>
                      )}
                      {previewingId === video.id ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <Loader2 size={18} className="animate-spin text-white" />
                        </span>
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/25">
                          <Play size={20} className="text-white opacity-80" fill="currentColor" />
                        </span>
                      )}
                      {duration ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 text-[10px] text-white">
                          {duration}
                        </span>
                      ) : null}
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div className="flex h-8 items-center gap-2">
                        <span className="rounded bg-[#5865f2] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {browserVideoKindLabel(video.kind)}
                        </span>
                        <span className="truncate text-sm" title={displayBrowserVideoName(video)}>
                          {displayBrowserVideoName(video)}
                        </span>
                      </div>
                      <div className="flex h-8 items-center gap-2">
                        <select
                          className="h-8 min-w-0 flex-1 rounded-md border border-gray-600 bg-[#2b2d31] px-2 text-xs text-discord-text"
                          value={qualityUrl}
                          onChange={(event) => {
                            setSelectedQuality((current) => ({ ...current, [video.id]: event.target.value }));
                          }}
                          aria-label="해상도 선택"
                        >
                          {qualities.map((quality, index) => (
                            <option key={`${quality.label}:${quality.url}:${index}`} value={quality.url}>
                              {quality.label}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          className="h-8 bg-[#5865f2] px-3 text-xs text-white hover:bg-[#4752c4]"
                          disabled={Boolean(savingId)}
                          onClick={() => void saveVideo(video, 'av')}
                        >
                          {savingId === video.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          다운로드
                        </Button>
                      </div>
                    </div>
                  </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="border-gray-700 bg-discord-sidebar text-discord-text">
                      <ContextMenuItem
                        className="cursor-pointer text-discord-text focus:bg-discord-hover focus:text-discord-text"
                        disabled={Boolean(savingId)}
                        onSelect={() => void saveVideo(video, 'video')}
                      >
                        영상만 저장
                      </ContextMenuItem>
                      <ContextMenuItem
                        className="cursor-pointer text-discord-text focus:bg-discord-hover focus:text-discord-text"
                        disabled={Boolean(savingId)}
                        onSelect={() => void saveVideo(video, 'audio')}
                      >
                        음성만 저장
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={Boolean(preview)} onOpenChange={(next) => { if (!next) setPreview(null); }}>
        <DialogContent className="max-w-3xl border-gray-700 bg-black p-3 text-white">
          <DialogTitle className="truncate px-1 pb-2 text-sm font-medium text-discord-text">
            {preview?.title || '미리보기'}
          </DialogTitle>
          {preview?.src ? <BrowserVideoPreviewPlayer key={preview.src} src={preview.src} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
