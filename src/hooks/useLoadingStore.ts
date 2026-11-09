import { create } from 'zustand';

interface LoadingState {
  isLoading: boolean;
  message: string;
  showCancelButton: boolean;
  setLoading: (loading: boolean, message?: string) => void;
  showLoading: (message?: string, timeout?: number, showCancel?: boolean) => void;
  hideLoading: () => void;
  cancelLoading: () => void;
}

export const useLoadingStore = create<LoadingState>((set, get) => ({
  isLoading: false,
  message: '',
  showCancelButton: false,
  setLoading: (loading: boolean, message: string = '') => set({ isLoading: loading, message, showCancelButton: false }),
  showLoading: (message: string = '로딩 중...', timeout?: number, showCancel: boolean = false) => {
    // 이미 로딩 중이면 메시지만 업데이트
    if (get().isLoading) {
      set({ message, showCancelButton: showCancel });
      return;
    }
    
    // 500ms 후에 로딩 화면 표시 (깜빡임 방지)
    const timeoutId = setTimeout(() => {
      set({ isLoading: true, message, showCancelButton: showCancel });
      
      // 자동 타임아웃 설정 (기본 30초)
      if (timeout !== undefined) {
        const autoTimeoutId = setTimeout(() => {
          const currentState = get();
          if (currentState.isLoading) {
            set({ 
              isLoading: false, 
              message: '', 
              showCancelButton: false 
            });
          }
        }, timeout);
        
        (get as any).autoTimeoutId = autoTimeoutId;
      }
    }, 500);
    
    // 타임아웃 ID를 저장하여 hideLoading에서 취소할 수 있도록 함
    (get as any).loadingTimeoutId = timeoutId;
  },
  hideLoading: () => {
    // 타임아웃이 있다면 취소
    const timeoutId = (get as any).loadingTimeoutId;
    if (timeoutId) {
      clearTimeout(timeoutId);
      (get as any).loadingTimeoutId = null;
    }
    
    // 자동 타임아웃이 있다면 취소
    const autoTimeoutId = (get as any).autoTimeoutId;
    if (autoTimeoutId) {
      clearTimeout(autoTimeoutId);
      (get as any).autoTimeoutId = null;
    }
    
    set({ isLoading: false, message: '', showCancelButton: false });
  },
  cancelLoading: () => {
    // 타임아웃들 취소
    const timeoutId = (get as any).loadingTimeoutId;
    if (timeoutId) {
      clearTimeout(timeoutId);
      (get as any).loadingTimeoutId = null;
    }
    
    const autoTimeoutId = (get as any).autoTimeoutId;
    if (autoTimeoutId) {
      clearTimeout(autoTimeoutId);
      (get as any).autoTimeoutId = null;
    }
    
    set({ isLoading: false, message: '', showCancelButton: false });
  },
})); 