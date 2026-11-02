import { contextBridge, ipcRenderer } from 'electron';

type UrlChangeCallback = (url: string) => void;

function isSideMouseButton(button: number) {
  return button === 3 || button === 4;
}

function preventSideMouseButton(event: MouseEvent) {
  if (!isSideMouseButton(event.button)) return;
  event.preventDefault();
  event.stopPropagation();
}

function sendToHost(channel: string, ...args: unknown[]) {
  if (typeof ipcRenderer.sendToHost !== 'function') return;
  ipcRenderer.sendToHost(channel, ...args);
}

function httpHrefFromEvent(event: MouseEvent) {
  const target = event.target as Element | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor) return null;
  try {
    const parsed = new URL(anchor.href, window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

window.addEventListener('mousedown', preventSideMouseButton, true);
window.addEventListener('auxclick', (event) => {
  preventSideMouseButton(event);
  if (event.button !== 1) return;
  const href = httpHrefFromEvent(event);
  if (!href) return;
  event.preventDefault();
  event.stopPropagation();
  sendToHost('browser:open-tab', href, true);
}, true);
window.addEventListener('mouseup', (event) => {
  if (!isSideMouseButton(event.button)) return;
  preventSideMouseButton(event);
  sendToHost('browser:mouse-button', event.button);
}, true);

window.addEventListener('wheel', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  sendToHost('browser:zoom-wheel', event.deltaY);
}, { capture: true, passive: false });

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
