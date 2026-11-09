import { useCallback, useState } from 'react';
import type { ViewerFitMode } from '../components/viewer/types';
import { parseViewerFitMode, VIEWER_FIT_MODE_STORAGE_KEY } from '../components/viewer/viewerLogic';

function readStoredFitMode(): ViewerFitMode {
  try {
    return parseViewerFitMode(localStorage.getItem(VIEWER_FIT_MODE_STORAGE_KEY));
  } catch {
    return 'original';
  }
}

export function useViewerFitMode() {
  const [fitMode, setFitModeState] = useState<ViewerFitMode>(readStoredFitMode);

  const setFitMode = useCallback((mode: ViewerFitMode) => {
    setFitModeState(mode);
    try {
      localStorage.setItem(VIEWER_FIT_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore quota / private-mode failures and keep the in-memory choice.
    }
  }, []);

  return { fitMode, setFitMode };
}
