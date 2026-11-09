import React from 'react';
import { ChevronLeft, ChevronRight, File, FileImage, FileText, FileVideo, Search, X } from 'lucide-react';
import { Input } from '../ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ImageViewer } from './ImageViewer';
import { VideoViewer } from './VideoViewer';
import type { ArchiveFile } from './types';
import { isImageFileName, isVideoFileName } from './viewerLogic';

const tooltipClassName = "relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words";

interface ArchiveViewerProps {
  currentFile?: ArchiveFile;
  currentFileExt?: string;
  filteredArchiveFiles: Array<{ file: ArchiveFile; originalIndex: number }>;
  currentArchiveIndex: number;
  archiveSearchQuery: string;
  currentArchiveDataUrl: string | null;
  currentArchiveText: string | null;
  isFirstArchiveFile: boolean;
  isLastArchiveFile: boolean;
  isArchiveGif: boolean;
  archiveImgScale: number;
  archiveVideoScale: number;
  imgContainerRef: React.RefObject<HTMLDivElement>;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSelectFile: (index: number) => void;
  onOpenUnsupportedFile: (file: ArchiveFile) => void;
  onPrevious: () => void;
  onNext: () => void;
  imageViewer: React.ComponentProps<typeof ImageViewer> | null;
  videoViewer: React.ComponentProps<typeof VideoViewer> | null;
}

export const ArchiveViewer: React.FC<ArchiveViewerProps> = ({
  currentFile,
  currentFileExt,
  filteredArchiveFiles,
  currentArchiveIndex,
  archiveSearchQuery,
  currentArchiveDataUrl,
  currentArchiveText,
  isFirstArchiveFile,
  isLastArchiveFile,
  archiveImgScale,
  archiveVideoScale,
  imgContainerRef,
  onSearchChange,
  onClearSearch,
  onSelectFile,
  onOpenUnsupportedFile,
  onPrevious,
  onNext,
  imageViewer,
  videoViewer,
}) => (
  <div className="w-full h-full flex flex-row">
    <div className="flex h-full w-48 flex-shrink-0 flex-col border-r border-gray-700 bg-discord-sidebar">
      <div className="flex-shrink-0 border-b border-gray-700 p-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-muted"
          />
          <Input
            type="text"
            value={archiveSearchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="파일 검색"
            aria-label="압축파일 내부 파일 검색"
            className="h-8 border-gray-600 bg-discord-bg pl-8 pr-8 text-xs text-discord-text placeholder:text-discord-muted"
          />
          {archiveSearchQuery && (
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center text-discord-muted transition-colors hover:text-discord-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TooltipProvider>
          <ul className="py-2">
            {filteredArchiveFiles.map(({ file, originalIndex: idx }) => {
              const fileExt = file.name.toLowerCase().split('.').pop();
              const isImage = isImageFileName(file.name);
              const isVideo = isVideoFileName(file.name);
              const isText = fileExt === 'txt';
              const isSupported = Boolean(file.isSupported);

              const fileListItem = (
                <li
                  aria-disabled={!isSupported}
                  title={!isSupported ? `${file.name} (미지원 파일)` : undefined}
                  className={`flex items-center gap-2 px-2 py-1 rounded ${
                    isSupported
                      ? `cursor-pointer hover:bg-discord-hover ${idx === currentArchiveIndex ? 'bg-discord-hover font-bold' : ''}`
                      : 'cursor-not-allowed text-discord-muted opacity-45'
                  }`}
                  onClick={() => {
                    if (isSupported && idx !== currentArchiveIndex) {
                      void onSelectFile(idx);
                    }
                  }}
                >
                  {isImage && <FileImage size={14} className="text-blue-400 flex-shrink-0" />}
                  {isVideo && <FileVideo size={14} className="text-green-400 flex-shrink-0" />}
                  {isText && <FileText size={14} className="text-green-400 flex-shrink-0" />}
                  {!isSupported && <File size={14} className="flex-shrink-0" />}
                  <span className="truncate flex-1 min-w-0">{file.name}</span>
                </li>
              );

              if (!isSupported) {
                return (
                  <ContextMenu key={`${file.name}-${idx}`}>
                    <ContextMenuTrigger asChild>
                      {fileListItem}
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => void onOpenUnsupportedFile(file)}>
                        원본 파일 열기
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              }

              return (
                <Tooltip key={`${file.name}-${idx}`}>
                  <TooltipTrigger asChild>
                    {fileListItem}
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    align="center"
                    className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs max-w-sm break-all"
                  >
                    {file.name}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {filteredArchiveFiles.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-discord-muted">
                검색 결과가 없습니다.
              </li>
            )}
          </ul>
        </TooltipProvider>
      </div>
    </div>
    <div className="flex-1 flex flex-col h-full">
      <div
        ref={imgContainerRef}
        className={`flex-1 flex items-center justify-center relative overflow-hidden ${
          currentFile && isVideoFileName(currentFile.name) ? 'bg-black' : ''
        }`}
      >
        {currentFile && currentFileExt !== 'txt' && archiveImgScale === 1 && archiveVideoScale === 1 && (
          <>
            {!isFirstArchiveFile && (
              <button
                type="button"
                className="group absolute top-0 left-0 h-full w-16 z-[1] flex items-center justify-center bg-transparent"
                onClick={onPrevious}
                aria-label="이전 파일"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/0 transition-all group-hover:bg-black/55">
                  <ChevronLeft size={24} className="text-white/0 transition-all group-hover:scale-110 group-hover:text-white/90" />
                </span>
              </button>
            )}
            {!isLastArchiveFile && (
              <button
                type="button"
                className="group absolute top-0 right-0 h-full w-16 z-[1] flex items-center justify-center bg-transparent"
                onClick={onNext}
                aria-label="다음 파일"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/0 transition-all group-hover:bg-black/55">
                  <ChevronRight size={24} className="text-white/0 transition-all group-hover:scale-110 group-hover:text-white/90" />
                </span>
              </button>
            )}
          </>
        )}
        {!currentFile ? (
          <div className="text-discord-muted">지원되는 파일이 없습니다.</div>
        ) : currentFileExt === 'txt' ? (
          <div className="relative h-full w-full bg-discord-bg text-discord-text">
            {!isFirstArchiveFile && (
              <button
                type="button"
                className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white/70 transition-all hover:scale-110 hover:bg-black/60 hover:text-white"
                onClick={onPrevious}
                aria-label="이전 파일"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            <div className="h-full w-full overflow-auto p-4">
              {currentArchiveText ? (
                <pre className="select-text whitespace-pre-wrap font-noto text-sm leading-relaxed">
                  {currentArchiveText}
                </pre>
              ) : (
                <div className="text-discord-muted">텍스트를 로드할 수 없습니다.</div>
              )}
            </div>
            {!isLastArchiveFile && (
              <button
                type="button"
                className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white/70 transition-all hover:scale-110 hover:bg-black/60 hover:text-white"
                onClick={onNext}
                aria-label="다음 파일"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        ) : isVideoFileName(currentFile.name) ? (
          currentArchiveDataUrl && videoViewer ? (
            <VideoViewer {...videoViewer} src={currentArchiveDataUrl} layout="embedded" toolbarOverlayClassName="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300" />
          ) : (
            <div className="text-discord-muted">동영상을 로드할 수 없습니다.</div>
          )
        ) : (
          currentArchiveDataUrl && imageViewer ? (
            <ImageViewer
              {...imageViewer}
              src={currentArchiveDataUrl}
              className="max-h-full max-w-full object-contain select-none"
              wrapperClassName="relative flex h-full w-full items-center justify-center overflow-hidden"
            />
          ) : (
            <div className="text-discord-muted">이미지를 로드할 수 없습니다.</div>
          )
        )}
      </div>
      <div className="flex-shrink-0 flex items-center justify-center gap-4 p-4">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onPrevious}
                disabled={isFirstArchiveFile}
                className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors disabled:text-white/30 disabled:hover:text-white/30"
              >
                <ChevronLeft size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className={tooltipClassName}>이전 파일 (←)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="text-discord-text text-sm min-w-[200px] text-center">
          {currentFile?.name}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onNext}
                disabled={isLastArchiveFile}
                className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors disabled:text-white/30 disabled:hover:text-white/30"
              >
                <ChevronRight size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className={tooltipClassName}>다음 파일 (→)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  </div>
);
