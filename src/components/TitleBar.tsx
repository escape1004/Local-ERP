import type { CSSProperties } from 'react';
import { AlertTriangle, Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { FIELD_TOOLTIP_CLASSNAME } from './records/FieldValueRenderer';
import type { ElectronAPI } from '../types';

interface CSSPropertiesWithWebkit extends CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

type WindowControlsProps = {
  onOpenSettings?: () => void;
  onOpenUpdate?: () => void;
  updateAvailable?: boolean;
  settingsDisabled?: boolean;
  showUtilityButtons?: boolean;
};

interface TitleBarProps extends WindowControlsProps {
  title?: string;
}

const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSPropertiesWithWebkit;

export function WindowControls({
  onOpenSettings,
  onOpenUpdate,
  updateAvailable = false,
  settingsDisabled = false,
  showUtilityButtons = true,
}: WindowControlsProps) {
  const electronAPI = window.electronAPI as ElectronAPI;

  const handleMinimize = () => {
    if (electronAPI && typeof electronAPI.send === 'function') {
      electronAPI.send('window-control', 'minimize');
    }
  };

  const handleMaximize = () => {
    if (electronAPI && typeof electronAPI.send === 'function') {
      electronAPI.send('window-control', 'maximize');
    }
  };

  const handleClose = () => {
    if (electronAPI && typeof electronAPI.send === 'function') {
      electronAPI.send('window-control', 'close');
    }
  };

  return (
    <div className="flex h-full shrink-0" style={noDragStyle}>
      {showUtilityButtons && updateAvailable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenUpdate}
              className="flex h-full w-12 items-center justify-center text-yellow-400 transition-colors hover:bg-yellow-500/15 hover:text-yellow-300"
              aria-label="새 버전 업데이트"
            >
              <AlertTriangle className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>새 버전을 사용할 수 있습니다</TooltipContent>
        </Tooltip>
      )}
      {showUtilityButtons && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex h-full">
              <button
                onClick={onOpenSettings}
                disabled={settingsDisabled}
                className="w-12 h-full transition-colors flex items-center justify-center hover:bg-[#404249] hover:text-white disabled:cursor-default disabled:text-[#5F6670] disabled:hover:bg-transparent disabled:hover:text-[#5F6670]"
                aria-label="환경설정"
              >
                <Settings className="w-4 h-4" />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>환경설정</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleMinimize}
            className="w-12 h-full hover:bg-[#404249] hover:text-white transition-colors flex items-center justify-center"
            aria-label="최소화"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M14 8v1H3V8h11z" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>최소화</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleMaximize}
            className="w-12 h-full hover:bg-[#404249] hover:text-white transition-colors flex items-center justify-center"
            aria-label="최대화"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 3h10v10H3V3z" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>최대화</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClose}
            className="w-12 h-full hover:bg-[#DA373C] hover:text-white transition-colors flex items-center justify-center"
            aria-label="닫기"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className={FIELD_TOOLTIP_CLASSNAME}>닫기</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function TitleBar({
  title = 'Local ERP',
  onOpenSettings,
  onOpenUpdate,
  updateAvailable = false,
  settingsDisabled = false,
  showUtilityButtons = true,
}: TitleBarProps) {
  return (
    <div
      className="h-8 flex items-center justify-between bg-[#2B2D31] text-[#949BA4]"
      style={{ WebkitAppRegion: 'drag' } as CSSPropertiesWithWebkit}
    >
      <div className="flex items-center px-3 space-x-2">
        <img
          src={"icon.png"}
          alt="App Icon"
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">{title}</span>
      </div>

      <WindowControls
        onOpenSettings={onOpenSettings}
        onOpenUpdate={onOpenUpdate}
        updateAvailable={updateAvailable}
        settingsDisabled={settingsDisabled}
        showUtilityButtons={showUtilityButtons}
      />
    </div>
  );
} 
