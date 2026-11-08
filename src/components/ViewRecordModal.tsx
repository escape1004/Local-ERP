import React, { useCallback, useEffect, useState } from 'react';
import { X, ChevronRight, HelpCircle, Upload, Archive, ImageOff } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { Category, DataRecord, RelatedRecordSummary } from '../types';
import { Button } from './ui/button';
import { toast } from './ui/use-toast';
import { ViewerModal } from './ViewerModal';
import { TimeInput } from './TimeInput';
import { format } from "date-fns";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import { resolveFilePath } from '../lib/pathResolver';
import { AnimatedModal } from './ui/animated-modal';
import { FieldValueRenderer } from './records/FieldValueRenderer';
import { CustomThumbnailBadge } from './records/ThumbnailCell';
import { ReferringRecordsPanel } from './records/ReferringRecordsPanel';
import { RelatedRecordsPanel } from './records/RelatedRecordsPanel';
import { isCustomThumbnailRecord } from '../lib/recordFields';
import {
  getCategoryFileField,
  getIncomingRelationFields,
  getReferringRecords,
  getReferringSourceCategory,
} from '../lib/referringRecords';

declare global {
  interface WindowEventMap {
    'thumbnail:regenerated': CustomEvent<{ filePath: string; customThumbnail?: boolean }>;
  }
}

interface ViewRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category | null;
  record: DataRecord | null;
  onViewRecord?: (record: DataRecord, category: Category) => void;
}

const SUPPORTED_THUMBNAIL_EXTS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.avi', '.mkv', '.mov',
  '.zip', '.7z'
];

export const ViewRecordModal: React.FC<ViewRecordModalProps> = ({
  isOpen,
  onClose,
  category,
  record,
  onViewRecord,
}) => {
  const { categories, getCategoryRecords, selectCategory, loadRecords } = useERPStore();
  const { showLoading, hideLoading, setLoading: setGlobalLoading } = useLoadingStore();

  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerFilePath, setViewerFilePath] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<'image' | 'video' | 'archive' | null>(null);
  const [viewerCategoryId, setViewerCategoryId] = useState('');
  const [viewerRecordId, setViewerRecordId] = useState('');
  const [hh, setHh] = React.useState(0);
  const [mm, setMm] = React.useState(0);
  const [ss, setSs] = React.useState(1); // 기본 1초
  const totalSec = hh * 3600 + mm * 60 + ss;
  const [duration, setDuration] = React.useState<number | null>(null); // 동영상 전체 길이(초)
  const [lastValidDuration, setLastValidDuration] = React.useState<number | null>(null);
  const [regenLoading, setRegenLoading] = React.useState(false);
  const [relatedRecords, setRelatedRecords] = useState<RelatedRecordSummary[]>([]);

  const openViewer = useCallback((
    nextFilePath: string,
    nextCategoryId: string,
    nextRecordId: string,
  ) => {
    setViewerFilePath(nextFilePath);
    setViewerFileType(null);
    setViewerCategoryId(nextCategoryId);
    setViewerRecordId(nextRecordId);
    setViewerModalOpen(true);
  }, []);

  const handleViewerClose = useCallback(() => {
    setViewerModalOpen(false);
    setViewerFilePath('');
    setViewerFileType(null);
    setViewerCategoryId('');
    setViewerRecordId('');
  }, []);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !isOpen) return;
      if (viewerModalOpen) {
        e.preventDefault();
        handleViewerClose();
        return;
      }
      onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleViewerClose, isOpen, onClose, viewerModalOpen]);

  // Get parent categories path
  const getParentPath = useCallback((currentCategory: Category): Category[] => {
    const path: Category[] = [];
    let parent = currentCategory.parentId ? categories.find(c => c.id === currentCategory.parentId) : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    
    return path;
  }, [categories]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    selectCategory(categoryId);
    onClose();
  }, [selectCategory, onClose]);

  // Footer 관련 변수들
  const fileField = category?.fields.find(f => f.type === 'file');
  const filePath = resolveFilePath(fileField ? record?.data[fileField.id] : null, fileField);
  const isThumbnailOnlyFile = !!fileField?.thumbnailOnly;

  React.useEffect(() => {
    if (!isOpen || !record || !fileField || !filePath) return;
    const isVideoFile = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(filePath);
    if (!isVideoFile) return;
    const ts = record.thumbnailTimestamp
      ?? record.data?.__thumbnailTimestamp
      ?? (typeof record.duration === 'number' && record.duration > 0
        ? (record.duration <= 1 ? 0 : record.duration / 2)
        : undefined);
    if (!Number.isFinite(Number(ts))) return;
    const total = Math.max(0, Number(ts));
    const newHh = Math.floor(total / 3600);
    const newMm = Math.floor((total % 3600) / 60);
    const newSs = Math.floor(total % 60);
    setHh(newHh);
    setMm(newMm);
    setSs(newSs);
  }, [isOpen, record, fileField, filePath]);

  useEffect(() => {
    let ignore = false;
    if (isThumbnailOnlyFile) {
      setFileExists(true);
      return () => { ignore = true; };
    }
    if (isOpen && filePath) {
      window.electronAPI.checkFileExists(filePath).then(exists => {
        if (!ignore) {
          setFileExists(exists);
          if (!exists) {
            toast({ title: '원본 파일이 존재하지 않습니다.', variant: 'destructive' });
            // 파일이 존재하지 않으면 해당 레코드의 북마크 삭제
            if (record && category) {
              (async () => {
                try {
                  if ((window.electronAPI as any).removeAllBookmarks) {
                    const result = await (window.electronAPI as any).removeAllBookmarks(category.id, record.id);
                    if (result && !result.success && result.error) {
                      console.error('북마크 삭제 실패:', result.error);
                    }
                  }
                } catch (error) {
                  console.error('북마크 삭제 중 오류:', error);
                  // 북마크 삭제 실패는 사용자에게 알리지 않음 (파일이 없어서 발생하는 정상적인 상황)
                }
              })();
            }
          }
        }
      });
    } else {
      setFileExists(null);
    }
    return () => { ignore = true; };
  }, [isOpen, filePath, record, category, isThumbnailOnlyFile]);

  const canOpenFile = !!filePath && filePath !== '' && filePath !== '-' && fileExists !== false && !isThumbnailOnlyFile;

  const handleThumbnailClick = (filePath: string) => {
    if (!category || !record) return;
    openViewer(filePath, category.id, record.id);
  };

  // 참조 횟수 계산 함수
  const getRecordReferenceCount = useCallback((recordId: string, categoryId: string): number => {
    let count = 0;
    const currentCategory = categories.find(cat => cat.id === categoryId);
    if (!currentCategory || !currentCategory.parentId) return 0;

    const parentCategory = categories.find(cat => cat.id === currentCategory.parentId);
    if (!parentCategory) return 0;

    const relationFields = parentCategory.fields.filter(
      field => field.type === 'relation' && field.relationCategoryId === categoryId
    );

    if (relationFields.length > 0) {
      const records = getCategoryRecords(parentCategory.id);
      records.forEach(record => {
        relationFields.forEach(field => {
          const value = record.data[field.id];
          if (field.multiple && Array.isArray(value)) {
            count += value.filter(id => id === recordId).length;
          } else if (value === recordId) {
            count += 1;
          }
        });
      });
    }

    return count;
  }, [categories, getCategoryRecords]);

  const referringSourceCategory = React.useMemo(
    () => (category ? getReferringSourceCategory(category, categories) : null),
    [category, categories],
  );
  const referringRelationFields = React.useMemo(
    () => (
      category && referringSourceCategory
        ? getIncomingRelationFields(referringSourceCategory, category.id)
        : []
    ),
    [category, referringSourceCategory],
  );
  const referringRecords = React.useMemo(
    () => {
      if (!record || !referringSourceCategory || referringRelationFields.length === 0) return [];
      return getReferringRecords(
        getCategoryRecords(referringSourceCategory.id),
        referringRelationFields,
        record.id,
      );
    },
    [getCategoryRecords, record, referringRelationFields, referringSourceCategory],
  );
  const showReferringRecordsPanel = Boolean(
    isOpen && category?.parentId && referringSourceCategory && referringRelationFields.length > 0
  );
  const showRelatedRecordsPanel = Boolean(isOpen && record && category && !category.parentId);

  React.useEffect(() => {
    if (!showReferringRecordsPanel || !referringSourceCategory) return;
    void loadRecords(referringSourceCategory.id);
  }, [loadRecords, referringSourceCategory, showReferringRecordsPanel]);

  React.useEffect(() => {
    if (!isOpen || !record?.id || !showRelatedRecordsPanel) {
      setRelatedRecords([]);
      return undefined;
    }

    let cancelled = false;
    window.electronAPI.listRelatedRecords(record.id)
      .then((rows) => {
        if (!cancelled) setRelatedRecords(rows);
      })
      .catch((error) => {
        console.error('Failed to load related records:', error);
        if (!cancelled) setRelatedRecords([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, record?.id, showRelatedRecordsPanel]);

  const handleViewRelatedRecord = useCallback((relatedRecord: DataRecord, relatedCategory: Category) => {
    onClose();
    window.setTimeout(() => {
      onViewRecord?.(relatedRecord, relatedCategory);
    }, 200);
  }, [onClose, onViewRecord]);

  const handleSelectReferringRecord = useCallback((referringRecord: DataRecord) => {
    if (!referringSourceCategory) return;
    const sourceFileField = getCategoryFileField(referringSourceCategory);
    const sourceFilePath = resolveFilePath(
      sourceFileField ? referringRecord.data[sourceFileField.id] : null,
      sourceFileField,
    );
    if (!sourceFilePath) {
      toast({ title: '첨부파일이 없습니다.', variant: 'destructive' });
      return;
    }
    openViewer(sourceFilePath, referringSourceCategory.id, referringRecord.id);
  }, [openViewer, referringSourceCategory]);

  if (!record || !category) return null;

  // 썸네일 전용 컴포넌트(상단에만 렌더)
  const TopThumbnail: React.FC<{
    filePath: string;
    canOpenFile: boolean;
    categoryId?: string;
    record: DataRecord;
    hh: number;
    mm: number;
    ss: number;
    duration: number | null;
    setHh: React.Dispatch<React.SetStateAction<number>>;
    setMm: React.Dispatch<React.SetStateAction<number>>;
    setSs: React.Dispatch<React.SetStateAction<number>>;
    setDuration: React.Dispatch<React.SetStateAction<number | null>>;
    setLastValidDuration: React.Dispatch<React.SetStateAction<number | null>>;
  }> = ({
    filePath,
    canOpenFile,
    categoryId,
    record,
    hh,
    mm,
    ss,
    duration,
    setHh,
    setMm,
    setSs,
    setDuration,
    setLastValidDuration,
  }) => {
    const [dataUrl, setDataUrl] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [regenLoading, setRegenLoading] = React.useState(false);
    const [hasEmbeddedCover, setHasEmbeddedCover] = React.useState(false);
    const [customThumbnailApplied, setCustomThumbnailApplied] = React.useState(false);
    const ext = filePath ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : '';
    const isVideo = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(ext);
    const loadRecords = useERPStore(state => state.loadRecords);
    const refreshCategoryRecords = React.useCallback(async () => {
      if (!categoryId) return;
      await loadRecords(categoryId, { force: true });
    }, [categoryId, loadRecords]);
    const { showLoading: showGlobalLoading, hideLoading: hideGlobalLoading, setLoading: setGlobalLoading } = useLoadingStore();
    const missingFile = fileExists === false;
    const thumbnailContext = React.useMemo(() => ({
      recordId: record.id,
      categoryId: categoryId || record.categoryId,
    }), [categoryId, record.id, record.categoryId]);

    React.useEffect(() => {
      setCustomThumbnailApplied(false);
    }, [record.id]);

    // duration: record에서 우선 사용, 없으면 lazy fetch
    React.useEffect(() => {
      let ignore = false;
      if (isVideo && filePath) {
        if (record && typeof (record as any).duration === 'number' && (record as any).duration > 0) {
          setDuration((record as any).duration);
          setLastValidDuration((record as any).duration);
        } else {
          window.electronAPI.getVideoDuration(filePath).then(sec => {
            if (!ignore && sec && sec > 0) {
              setDuration(sec);
              setLastValidDuration(sec);
              // lazy update: DB에 duration 저장 요청
              window.electronAPI.updateRecord(record.id, { ...record.data, duration: sec });
            }
          });
        }
      } else {
        setDuration(null);
      }
      return () => { ignore = true; };
    }, [isVideo, filePath, record, setDuration, setLastValidDuration]);

    React.useEffect(() => {
      let ignore = false;
      if (isVideo && filePath) {
        window.electronAPI.getVideoCodecInfo(filePath)
          .then((info) => {
            if (!ignore) {
              setHasEmbeddedCover(info?.hasEmbeddedCover === true);
            }
          })
          .catch(() => {
            if (!ignore) {
              setHasEmbeddedCover(false);
            }
          });
      } else {
        setHasEmbeddedCover(false);
      }
      return () => { ignore = true; };
    }, [isVideo, filePath]);

    const reloadThumbnail = React.useCallback(() => {
      setLoading(true);
      if (!record) {
        setLoading(false);
        setDataUrl(null);
        setError(null);
        return Promise.resolve(null);
      }
      return window.electronAPI.getThumbnailDataUrlHybrid(record, filePath)
        .then(res => {
          if (res) {
            setDataUrl(res);
            setError(null);
          } else {
            setDataUrl(null);
            setError(null);
          }
          setLoading(false);
          return res;
        })
        .catch(e => {
          setDataUrl(null);
          setError(String(e));
          setLoading(false);
          throw e;
        });
    }, [filePath, record]);

    const handleRemoveCustomThumbnail = React.useCallback(async () => {
      if (!filePath) return;

      try {
        setRegenLoading(true);
        setGlobalLoading(true, '커스텀 썸네일 제거 중...');
        showGlobalLoading('커스텀 썸네일 제거 중...', 30000, true);

        const removed = await window.electronAPI.removeCustomThumbnail(filePath, thumbnailContext);
        if (!removed) {
          toast({
            title: '커스텀 썸네일 제거 실패',
            description: '커스텀 썸네일이 없거나 제거할 수 없습니다.',
            variant: 'destructive',
          });
          return;
        }

        const codecInfo = await window.electronAPI.getVideoCodecInfo(filePath);
        const hasCoverAfterRemoval = codecInfo?.hasEmbeddedCover === true;
        setHasEmbeddedCover(hasCoverAfterRemoval);
        setCustomThumbnailApplied(false);
        if (hasCoverAfterRemoval) {
          toast({
            title: '커스텀 썸네일 제거 실패',
            description: '커스텀 썸네일이 아직 남아 있습니다.',
            variant: 'destructive',
          });
          return;
        }
        window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath, customThumbnail: false } }));
        await reloadThumbnail();
        await refreshCategoryRecords();
        toast({ title: '커스텀 썸네일을 제거했습니다.' });
      } catch (e) {
        toast({
          title: '커스텀 썸네일 제거 실패',
          description: String(e),
          variant: 'destructive',
        });
      } finally {
        setRegenLoading(false);
        hideGlobalLoading();
      }
    }, [filePath, categoryId, refreshCategoryRecords, reloadThumbnail, hideGlobalLoading, setGlobalLoading, showGlobalLoading, thumbnailContext]);

    React.useEffect(() => {
      if (SUPPORTED_THUMBNAIL_EXTS.includes(ext) && filePath) {
        reloadThumbnail();
      } else {
        setDataUrl(null);
        setError(null);
      }
    }, [filePath, reloadThumbnail, ext]);

    // 썸네일 재생성 이벤트 처리
    React.useEffect(() => {
      const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string }>) => {
        if (event.detail.filePath === filePath) {
          // 해당 파일의 썸네일이 재생성되었으므로 다시 로드
          reloadThumbnail();
        }
      };

      window.addEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
      return () => {
        window.removeEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
      };
    }, [filePath, reloadThumbnail]);

    // 시/분/초 입력값 보정 (duration 초과 시 자동 보정)
    React.useEffect(() => {
      if (!isVideo || duration == null) return;
      const totalSec = hh * 3600 + mm * 60 + ss;
      if (totalSec > duration) {
        // duration 내 최대값으로 보정
        let d = duration;
        const newHh = Math.floor(d / 3600);
        d = d % 3600;
        const newMm = Math.floor(d / 60);
        const newSs = d % 60;
        setHh(newHh);
        setMm(newMm);
        setSs(newSs);
      }
    }, [hh, mm, ss, duration, isVideo, setHh, setMm, setSs]);

    // duration이 0이거나 null이면 시간 입력 UI를 렌더하지 않음
    const effectiveDuration = lastValidDuration;

    const showCustomThumbnailBadge = customThumbnailApplied
      || isCustomThumbnailRecord(record)
      || hasEmbeddedCover;

    if (!SUPPORTED_THUMBNAIL_EXTS.includes(ext)) return null;

    const thumbnailBody = loading ? (
      <div className="w-[320px] h-[320px] bg-gray-800 flex items-center justify-center text-lg text-gray-400 rounded-xl border border-gray-700">로딩중...</div>
    ) : dataUrl ? (
      <div className="relative">
        <img
          src={dataUrl}
          alt="썸네일"
          className={`w-[320px] h-[320px] object-contain bg-black rounded-xl border border-gray-700 transition ${canOpenFile ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
          onClick={() => canOpenFile && handleThumbnailClick(filePath)}
        />
        {showCustomThumbnailBadge && <CustomThumbnailBadge size={20} />}
        {missingFile && (
          <div className="absolute inset-0 flex items-center justify-center">
            <HelpCircle size={32} className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
          </div>
        )}
        {/* 파일 확장자명 표시 */}
        {filePath && !isThumbnailOnlyFile && (
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded">
            {ext}
          </div>
        )}
      </div>
    ) : filePath ? (
      <div 
        className={`w-[320px] h-[320px] flex items-center justify-center rounded-xl border border-dashed border-[#4f545c] bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.20),_transparent_58%),linear-gradient(180deg,_#2b2d31_0%,_#1e1f22_100%)] text-[#b5bac1] transition-colors ${canOpenFile ? 'cursor-pointer hover:border-[#6d73c9] hover:bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.30),_transparent_58%),linear-gradient(180deg,_#313338_0%,_#232428_100%)]' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
        onClick={() => canOpenFile && handleThumbnailClick(filePath)}
      >
        {missingFile ? (
          <HelpCircle size={40} className="text-[#dcddde]" />
        ) : ['.zip', '.7z'].includes(ext) ? (
          <Archive size={56} className="text-[#f0b232]" />
        ) : (
          <ImageOff size={44} className="text-[#b9bbbe]" />
        )}
      </div>
    ) : (
      <div className="w-[320px] h-[320px] flex items-center justify-center rounded-xl border border-dashed border-[#3b3f46] bg-[linear-gradient(180deg,_#232428_0%,_#18191c_100%)] text-[#72767d]">
        <ImageOff size={40} className="text-[#72767d]" />
      </div>
    );

    return (
      <div className="flex flex-col items-center">
        {isThumbnailOnlyFile ? (
          thumbnailBody
        ) : dataUrl ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                {thumbnailBody}
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                {filePath ? (missingFile ? '원본 파일이 존재하지 않습니다' : dataUrl ? '썸네일 클릭 시 뷰어 모달 열기' : '클릭 시 뷰어 모달 열기 (썸네일 없음)') : '첨부파일이 없습니다'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : filePath ? (
          // 파일은 있지만 썸네일이 없는 경우
          <div 
            className={`w-[320px] h-[320px] flex items-center justify-center rounded-xl border border-dashed border-[#4f545c] bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.20),_transparent_58%),linear-gradient(180deg,_#2b2d31_0%,_#1e1f22_100%)] text-[#b5bac1] transition-colors ${canOpenFile ? 'cursor-pointer hover:border-[#6d73c9] hover:bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.30),_transparent_58%),linear-gradient(180deg,_#313338_0%,_#232428_100%)]' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
            onClick={() => canOpenFile && handleThumbnailClick(filePath)}
          >
            {missingFile ? <HelpCircle size={40} className="text-[#dcddde]" /> : <ImageOff size={44} className="text-[#b9bbbe]" />}
          </div>
        ) : (
          // 파일이 없는 경우
          <div className="w-[320px] h-[320px] flex items-center justify-center rounded-xl border border-dashed border-[#3b3f46] bg-[linear-gradient(180deg,_#232428_0%,_#18191c_100%)] text-[#72767d]">
            <ImageOff size={40} className="text-[#72767d]" />
          </div>
        )}
        {/* 시간 입력/슬라이더 부분만 분기 */}
        {isVideo && fileExists === true && !isThumbnailOnlyFile && (
          <div className="flex items-center justify-center mt-2">
            {(!effectiveDuration || effectiveDuration === 0) ? (
              <div className="text-xs text-gray-500">동영상 길이 불러오는 중...</div>
            ) : (
              <TimeInput
                hh={hh}
                mm={mm}
                ss={ss}
                maxDuration={effectiveDuration}
                onChange={(newHh, newMm, newSs) => {
                  setHh(newHh);
                  setMm(newMm);
                  setSs(newSs);
                }}
                onRegenerate={async (newHh, newMm, newSs) => {
                  setRegenLoading(true);
                  // 즉시 로딩 표시 (500ms 지연 없이)
                  setGlobalLoading(true, '썸네일 재생성 중...');
                  showLoading('썸네일 재생성 중...', 60000, true); // 60초 타임아웃, 취소 버튼 표시
                  try {
                    const totalSeconds = newHh * 3600 + newMm * 60 + newSs;
                    const res = await window.electronAPI.generateThumbnailWithTime(filePath, totalSeconds, thumbnailContext);
                    if (res) {
                      toast({ title: `썸네일이 ${newHh.toString().padStart(2, '0')}:${newMm.toString().padStart(2, '0')}:${newSs.toString().padStart(2, '0')} 지점에서 재생성되었습니다.` });
                      await window.electronAPI.updateRecord(record.id, { ...record.data, __thumbnailTimestamp: totalSeconds });
                      window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
                      await reloadThumbnail();
                      await refreshCategoryRecords();
                    } else {
                      toast({ title: '썸네일 재생성 실패', description: '', variant: 'destructive' });
                    }
                  } catch (e) {
                    console.error('썸네일 재생성 오류:', e);
                    toast({ title: '썸네일 재생성 실패', description: String(e), variant: 'destructive' });
                  } finally {
                    setRegenLoading(false);
                    hideLoading();
                  }
                }}
                disabled={regenLoading || hasEmbeddedCover}
                loading={regenLoading}
                regenerateTooltip={hasEmbeddedCover ? '커스텀 썸네일이 있어서 재생성이 불가능합니다.' : undefined}
                rightAddon={(
                  <ContextMenu>
                    <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const result = await window.electronAPI.openImageFileDialog();
                              if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                                return;
                              }
                              const imagePath = result.filePaths[0];

                              setRegenLoading(true);
                              setGlobalLoading(true, '커스텀 썸네일 적용 중...');
                              showGlobalLoading('커스텀 썸네일 적용 중...', 30000, true);

                              const res = await window.electronAPI.setCustomThumbnail(filePath, imagePath, thumbnailContext);
                              if (res) {
                                setHasEmbeddedCover(true);
                                setCustomThumbnailApplied(true);
                                toast({ title: '커스텀 썸네일이 적용되었습니다.' });
                                window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath, customThumbnail: true } }));
                                await reloadThumbnail();
                                await refreshCategoryRecords();
                              } else {
                                toast({
                                  title: '커스텀 썸네일 적용 실패',
                                  description: '이미지를 썸네일로 변환하지 못했습니다.',
                                  variant: 'destructive',
                                });
                              }
                            } catch (e) {
                              toast({
                                title: '커스텀 썸네일 적용 실패',
                                description: String(e),
                                variant: 'destructive',
                              });
                            } finally {
                              setRegenLoading(false);
                              hideGlobalLoading();
                            }
                          }}
                          disabled={regenLoading}
                          className="p-1.5 rounded border border-gray-600 text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Upload size={12} />
                        </button>
                        </ContextMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                        이미지 파일을 선택해 썸네일로 등록
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                    <ContextMenuContent>
                      <ContextMenuItem
                        disabled={!hasEmbeddedCover || regenLoading}
                        onClick={handleRemoveCustomThumbnail}
                      >
                        커스텀 썸네일 제거
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )}
              />
            )}
          </div>
        )}
        
        {/* 이미지/압축파일용 썸네일 재생성 / 커스텀 업로드 버튼 영역 */}
        {!isVideo && fileExists === true && !isThumbnailOnlyFile && (
          <div className="flex items-center gap-2 mt-2">
            {/* 이미지/압축파일 자동 재생성 버튼 */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      setRegenLoading(true);
                      // 즉시 로딩 표시 (500ms 지연 없이)
                      setGlobalLoading(true, '썸네일 재생성 중...');
                      showGlobalLoading('썸네일 재생성 중...', 30000, true); // 30초 타임아웃, 취소 버튼 표시
                      try {
                        const res = await window.electronAPI.regenerateThumbnail(filePath, thumbnailContext);
                        if (res) {
                          setCustomThumbnailApplied(false);
                          toast({ title: '썸네일이 재생성되었습니다.' });
                          window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath, customThumbnail: false } }));
                          await reloadThumbnail();
                          await refreshCategoryRecords();
                        } else {
                          toast({ title: '썸네일 재생성 실패', description: '', variant: 'destructive' });
                        }
                      } catch (e) {
                        toast({ title: '썸네일 재생성 실패', description: String(e), variant: 'destructive' });
                      } finally {
                        setRegenLoading(false);
                        hideGlobalLoading();
                      }
                    }}
                    disabled={regenLoading}
                    className="px-3 py-1 text-xs text-discord-muted bg-transparent hover:bg-discord-hover border border-gray-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {regenLoading ? '재생성 중...' : '썸네일 재생성'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  썸네일 재생성
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 직접 업로드 버튼 (동영상/이미지/압축 공통) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const result = await window.electronAPI.openImageFileDialog();
                        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                          return;
                        }
                        const imagePath = result.filePaths[0];

                        setRegenLoading(true);
                        setGlobalLoading(true, '커스텀 썸네일 적용 중...');
                        showGlobalLoading('커스텀 썸네일 적용 중...', 30000, true);

                        const res = await window.electronAPI.setCustomThumbnail(filePath, imagePath, thumbnailContext);
                        if (res) {
                          setCustomThumbnailApplied(true);
                          toast({ title: '커스텀 썸네일이 적용되었습니다.' });
                          window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath, customThumbnail: true } }));
                          await reloadThumbnail();
                          await refreshCategoryRecords();
                        } else {
                          toast({
                            title: '커스텀 썸네일 적용 실패',
                            description: '이미지를 썸네일로 변환하지 못했습니다.',
                            variant: 'destructive',
                          });
                        }
                      } catch (e) {
                        toast({
                          title: '커스텀 썸네일 적용 실패',
                          description: String(e),
                          variant: 'destructive',
                        });
                      } finally {
                        setRegenLoading(false);
                        hideGlobalLoading();
                      }
                    }}
                    disabled={regenLoading}
                    className="p-1.5 rounded border border-gray-600 text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  이미지 파일을 선택해 썸네일로 등록
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <AnimatedModal isOpen={isOpen} contentClassName="w-full bg-transparent overflow-visible">
      <div className="flex w-full max-h-[90vh] items-start justify-center px-4">
      <div className="relative w-full max-w-3xl min-h-[70vh] max-h-[90vh]">
      <div className="bg-discord-bg rounded-xl flex h-full min-h-[70vh] w-full max-h-[90vh] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-end">
            <h2 className="text-xl font-bold text-discord-text">레코드 상세 정보</h2>
            <span className="ml-2 text-sm text-discord-muted flex items-center">
              (
              {(() => {
                const parentPath = getParentPath(category);
                return (
                  <>
                    {parentPath.map((cat, idx) => (
                      <React.Fragment key={cat.id}>
                        <button
                          onClick={() => handleCategoryClick(cat.id)}
                          className="hover:text-discord-text hover:underline"
                        >
                          {cat.name}
                        </button>
                        <ChevronRight size={14} className="mx-1 text-discord-muted" />
                      </React.Fragment>
                    ))}
                    <span className="text-discord-muted font-semibold">{category.name}</span>
                  </>
                );
              })()}
              )
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* 썸네일 최상단 렌더 */}
        {fileField && filePath && (
          <div className="flex flex-col items-center py-6 border-b border-gray-700 bg-discord-sidebar">
            <TopThumbnail
              filePath={filePath}
              canOpenFile={canOpenFile}
              categoryId={category.id}
              record={record}
              hh={hh}
              mm={mm}
              ss={ss}
              duration={duration}
              setHh={setHh}
              setMm={setMm}
              setSs={setSs}
              setDuration={setDuration}
              setLastValidDuration={setLastValidDuration}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
          <div className="space-y-6">
            {category.fields
              .filter(field => !(field.type === 'file' && field.thumbnailOnly))
              .sort((a, b) => a.order - b.order)
              .map(field => (
                <div key={field.id} className="border-b border-gray-800 pb-4 last:border-b-0">
                  <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wide mb-2">
                    {field.name}
                  </h3>
                  <div className="text-discord-text text-sm">
                    {/* 파일 필드는 상세 정보에서 썸네일 대신 경로 복사 버튼만 */}
                    {field.type === 'file' && !field.thumbnailOnly && record?.data[field.id] ? (
                      (() => {
                        const displayPath = resolveFilePath(record.data[field.id], field);
                        if (!displayPath) return '-';
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(displayPath);
                                      toast({ title: '경로가 복사되었습니다.' });
                                    } catch (e) {
                                      toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
                                    }
                                  }}
                                >
                                  {displayPath}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                                복사하기
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()
                    ) : (
                      <FieldValueRenderer
                        variant="detail"
                        field={field}
                        value={record.data[field.id]}
                        categories={categories}
                        getCategoryRecords={getCategoryRecords}
                        recordData={record.data as Record<string, unknown>}
                        onViewRelatedRecord={handleViewRelatedRecord}
                      />
                    )}
                  </div>
                </div>
              ))}
            
            {/* 참조 횟수 - 해당 카테고리가 다른 카테고리에서 참조될 때만 표시 */}
            {categories.some(cat => 
              cat.fields.some(field => 
                field.type === 'relation' && field.relationCategoryId === category.id
              )
            ) && (
              <div className="border-b border-gray-800 pb-4">
                <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wide mb-2">
                  참조 횟수
                </h3>
                <div className="text-discord-text text-sm">
                  {getRecordReferenceCount(record.id, category.id)}
                </div>
              </div>
            )}
            
            {/* Metadata */}
            <div className="pt-4 border-t border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-discord-muted">생성일:</span>
                  <div className="text-discord-text">
                    {format(new Date(record.createdAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                </div>
                <div>
                  <span className="text-discord-muted">수정일:</span>
                  <div className="text-discord-text">
                    {format(new Date(record.updatedAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end p-6 border-t border-gray-700">
          {canOpenFile && (
            <Button
              variant="outline"
              className="mr-2 hover:bg-discord-hover cursor-pointer"
              onClick={async () => {
                try {
                  await window.electronAPI.openFile(filePath);
                } catch (error) {
                  console.error('Failed to open file:', error);
                }
              }}
            >
              원본 파일 열기
            </Button>
          )}
          <Button onClick={onClose} className="bg-discord-accent hover:bg-blue-600">
            닫기
          </Button>
        </div>
      </div>
      {showReferringRecordsPanel && referringSourceCategory && (
        <div className="absolute left-[calc(100%+0.75rem)] top-0 h-full w-80">
          <ReferringRecordsPanel
            key={record.id}
            category={referringSourceCategory}
            records={referringRecords}
            onSelectRecord={handleSelectReferringRecord}
          />
        </div>
      )}
      {showRelatedRecordsPanel && (
        <div className="absolute left-[calc(100%+0.75rem)] top-0 h-full w-80">
          <RelatedRecordsPanel
            key={record.id}
            records={relatedRecords}
            categories={categories}
            onSelectRecord={onViewRecord ? handleViewRelatedRecord : undefined}
          />
        </div>
      )}
      </div>
      </div>
    </AnimatedModal>
    <ViewerModal
      isOpen={viewerModalOpen}
      onClose={handleViewerClose}
      filePath={viewerFilePath}
      fileType={viewerFileType}
      categoryId={viewerCategoryId}
      recordId={viewerRecordId}
    />
    </>
  );
};
