import { contextBridge, ipcRenderer } from 'electron';

type UrlChangeCallback = (url: string) => void;

const urlChangeListeners = new Set<UrlChangeCallback>();

ipcRenderer.on('browser:url-changed', (_event, url) => {
  if (typeof url !== 'string') return;
  urlChangeListeners.forEach((listener) => {
    try {
      listener(url);
    } catch (error) {
      console.error('[ERP userscript] onUrlChange failed:', error);
    }
  });
});

contextBridge.exposeInMainWorld('erp', {
  getCurrentUrl: () => window.location.href,
  findRecordsByUrl: (url?: string) => ipcRenderer.invoke('browser:findRecordsByUrl', url || window.location.href),
  onUrlChange: (callback: UrlChangeCallback) => {
    if (typeof callback !== 'function') return () => undefined;
    urlChangeListeners.add(callback);
    return () => {
      urlChangeListeners.delete(callback);
    };
  },
});
