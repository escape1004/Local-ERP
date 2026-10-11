import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../ui/context-menu';
import type { SubtitleBackground, SubtitleColor, SubtitleSize, SubtitleSource } from './types';
import { clampSubtitleOffset } from './viewerLogic';

interface SubtitleControllerProps {
  children: React.ReactElement;
  onPlayInPictureInPicture: () => void;
  subtitles: SubtitleSource[];
  activeSubtitleId: string | null;
  subtitleSize: SubtitleSize;
  subtitleColor: SubtitleColor;
  subtitleBackground: SubtitleBackground;
  subtitleOffset: number;
  onSubtitleChange: (id: string | null) => void;
  onSubtitleSizeChange: (size: SubtitleSize) => void;
  onSubtitleColorChange: (color: SubtitleColor) => void;
  onSubtitleBackgroundChange: (background: SubtitleBackground) => void;
  onSubtitleOffsetChange: (offset: number) => void;
}

export const SubtitleController: React.FC<SubtitleControllerProps> = ({
  children,
  onPlayInPictureInPicture,
  subtitles,
  activeSubtitleId,
  subtitleSize,
  subtitleColor,
  subtitleBackground,
  subtitleOffset,
  onSubtitleChange,
  onSubtitleSizeChange,
  onSubtitleColorChange,
  onSubtitleBackgroundChange,
  onSubtitleOffsetChange,
}) => (
  <ContextMenu>
    <ContextMenuTrigger asChild>
      {children}
    </ContextMenuTrigger>
    <ContextMenuContent className="z-[80] min-w-[180px]">
      <ContextMenuItem onSelect={onPlayInPictureInPicture}>
        PIP 재생
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger>자막</ContextMenuSubTrigger>
        <ContextMenuSubContent className="z-[80] min-w-[220px]">
          <ContextMenuRadioGroup value={activeSubtitleId || 'off'} onValueChange={value => onSubtitleChange(value === 'off' ? null : value)}>
            <ContextMenuRadioItem value="off">끄기</ContextMenuRadioItem>
            {subtitles.map(subtitle => (
              <ContextMenuRadioItem key={subtitle.id} value={subtitle.id}>
                <span className="max-w-[260px] truncate">{subtitle.name}</span>
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
          {subtitles.length === 0 && (
            <ContextMenuItem disabled>일치하는 자막 없음</ContextMenuItem>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>자막 크기</ContextMenuSubTrigger>
        <ContextMenuSubContent className="z-[80]">
          <ContextMenuRadioGroup value={subtitleSize} onValueChange={value => onSubtitleSizeChange(value as SubtitleSize)}>
            <ContextMenuRadioItem value="small">작게</ContextMenuRadioItem>
            <ContextMenuRadioItem value="medium">보통</ContextMenuRadioItem>
            <ContextMenuRadioItem value="large">크게</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>자막 색상</ContextMenuSubTrigger>
        <ContextMenuSubContent className="z-[80]">
          <ContextMenuRadioGroup value={subtitleColor} onValueChange={value => onSubtitleColorChange(value as SubtitleColor)}>
            <ContextMenuRadioItem value="white">흰색</ContextMenuRadioItem>
            <ContextMenuRadioItem value="yellow">노란색</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>자막 배경</ContextMenuSubTrigger>
        <ContextMenuSubContent className="z-[80]">
          <ContextMenuRadioGroup value={subtitleBackground} onValueChange={value => onSubtitleBackgroundChange(value as SubtitleBackground)}>
            <ContextMenuRadioItem value="none">없음</ContextMenuRadioItem>
            <ContextMenuRadioItem value="translucent">반투명</ContextMenuRadioItem>
            <ContextMenuRadioItem value="dark">진하게</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          자막 싱크
          <span className="ml-auto pl-3 text-xs text-discord-muted">
            {subtitleOffset > 0 ? '+' : ''}{subtitleOffset.toFixed(1)}초
          </span>
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="z-[80]">
          <ContextMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onSubtitleOffsetChange(clampSubtitleOffset(subtitleOffset - 0.5));
            }}
          >
            0.5초 빠르게
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onSubtitleOffsetChange(0);
            }}
          >
            초기화
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onSubtitleOffsetChange(clampSubtitleOffset(subtitleOffset + 0.5));
            }}
          >
            0.5초 느리게
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    </ContextMenuContent>
  </ContextMenu>
);
