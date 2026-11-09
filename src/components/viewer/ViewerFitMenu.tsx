import React from 'react';
import {
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
} from '../ui/context-menu';
import type { ViewerFitMode } from './types';
import { parseViewerFitMode } from './viewerLogic';

interface ViewerFitMenuItemsProps {
  fitMode: ViewerFitMode;
  onFitModeChange: (mode: ViewerFitMode) => void;
}

export const ViewerFitMenuItems: React.FC<ViewerFitMenuItemsProps> = ({
  fitMode,
  onFitModeChange,
}) => (
  <>
    <ContextMenuLabel>화면 비율</ContextMenuLabel>
    <ContextMenuRadioGroup
      value={fitMode}
      onValueChange={(value) => onFitModeChange(parseViewerFitMode(value))}
    >
      <ContextMenuRadioItem value="original">원본 크기</ContextMenuRadioItem>
      <ContextMenuRadioItem value="contain">화면에 맞추기</ContextMenuRadioItem>
    </ContextMenuRadioGroup>
  </>
);
