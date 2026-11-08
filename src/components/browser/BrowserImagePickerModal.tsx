import React from 'react';
import { Check } from 'lucide-react';
import { filenameFromImageUrl, type BrowserPageImage } from '../../lib/browserPageImages';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';

type BrowserImagePickerModalProps = {
  open: boolean;
  images: BrowserPageImage[];
  loading?: boolean;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload: (images: BrowserPageImage[]) => void;
};

export function BrowserImagePickerModal({
  open,
  images,
  loading = false,
  saving = false,
  onOpenChange,
  onDownload,
}: BrowserImagePickerModalProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set(images.map((item) => item.url)));
  }, [images, open]);

  const chosen = images.filter((item) => selected.has(item.url));

  const toggle = (url: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col gap-3 border-gray-700 bg-discord-sidebar p-4 text-discord-text">
        <DialogTitle className="text-base text-discord-text">페이지 이미지</DialogTitle>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 border-gray-600 text-sm"
            disabled={images.length === 0}
            onClick={() => setSelected(new Set(images.map((item) => item.url)))}
          >
            모두 선택
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 border-gray-600 text-sm"
            disabled={selected.size === 0}
            onClick={() => setSelected(new Set())}
          >
            모두 해제
          </Button>
          <span className="ml-auto text-xs text-discord-muted">
            {loading ? '이미지를 찾는 중...' : `${chosen.length} / ${images.length}장 선택`}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto discord-scrollbar">
          {images.length === 0 && !loading && (
            <p className="py-10 text-center text-sm text-discord-muted">이 페이지에서 저장할 이미지를 찾지 못했습니다.</p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image, index) => {
              const checked = selected.has(image.url);
              return (
                <button
                  key={image.url}
                  type="button"
                  aria-pressed={checked}
                  className={cn(
                    'group relative overflow-hidden rounded-md border bg-black/40',
                    checked ? 'border-discord-accent' : 'border-gray-700 hover:border-gray-500',
                  )}
                  onClick={() => toggle(image.url)}
                >
                  <img
                    src={image.url}
                    alt={filenameFromImageUrl(image.url, index)}
                    referrerPolicy="no-referrer"
                    className="aspect-square h-full w-full object-cover"
                  />
                  <span
                    className={cn(
                      'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-sm border',
                      checked ? 'border-discord-accent bg-discord-accent text-white' : 'border-white/40 bg-black/50 text-transparent',
                    )}
                  >
                    <Check size={12} />
                  </span>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-1 text-[10px] text-white">
                    {filenameFromImageUrl(image.url, index)}
                    {image.width && image.height ? ` · ${image.width}×${image.height}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="h-8" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            className="h-8 bg-discord-accent hover:bg-blue-600"
            disabled={chosen.length === 0 || saving}
            onClick={() => onDownload(chosen)}
          >
            {saving ? '저장 중...' : `${chosen.length}장 다운로드`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
