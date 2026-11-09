import { useEffect, useMemo, useState } from 'react';
import { Archive, ImageOff } from 'lucide-react';
import type { Category, DataRecord } from '../../types';
import { resolveFilePath } from '../../lib/pathResolver';
import { SUPPORTED_THUMBNAIL_EXTS } from '../../lib/dashboardStats';

export function DashboardRecordThumbnail({ category, record }: { category: Category; record: DataRecord }) {
  const fileField = useMemo(
    () => category.fields.find((field) => field.type === 'file') || null,
    [category]
  );
  const filePath = useMemo(
    () => (fileField ? resolveFilePath(record.data[fileField.id], fileField) : null),
    [fileField, record]
  );
  const fileExt = useMemo(
    () => (filePath ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : ''),
    [filePath]
  );
  const isArchiveFile = fileExt === '.zip' || fileExt === '.7z';
  const isSupportedThumbnail = !!filePath && SUPPORTED_THUMBNAIL_EXTS.includes(fileExt);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;

    if (!isSupportedThumbnail || !filePath) {
      setThumbnailDataUrl(null);
      setLoading(false);
      return () => {
        ignore = true;
      };
    }

    setLoading(true);
    window.electronAPI.getThumbnailDataUrlHybrid(record, filePath)
      .then((result) => {
        if (!ignore) {
          setThumbnailDataUrl(result || null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setThumbnailDataUrl(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [filePath, isSupportedThumbnail, record]);

  if (!fileField) {
    return null;
  }

  return (
    <div className="w-14 h-14 shrink-0 rounded border border-dashed border-[#4f545c] bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.20),_transparent_58%),linear-gradient(180deg,_#2b2d31_0%,_#1e1f22_100%)] flex items-center justify-center overflow-hidden">
      {loading ? (
        <span className="text-[10px] text-discord-muted">로딩</span>
      ) : thumbnailDataUrl ? (
        <img src={thumbnailDataUrl} alt="썸네일" className="w-full h-full object-cover" />
      ) : filePath ? (
        <div className="w-full h-full flex items-center justify-center text-[#b5bac1]">
          {isArchiveFile ? (
            <Archive size={18} className="text-[#f0b232]" />
          ) : (
            <ImageOff size={18} className="text-[#b9bbbe]" />
          )}
        </div>
      ) : (
        <div className="w-full h-full bg-[linear-gradient(180deg,_#232428_0%,_#18191c_100%)] flex items-center justify-center text-[#72767d]">
          <ImageOff size={18} className="text-[#72767d]" />
        </div>
      )}
    </div>
  );
}
