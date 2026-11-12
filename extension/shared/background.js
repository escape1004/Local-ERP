const api = typeof browser !== 'undefined' ? browser : chrome;

async function loadNativeConfig() {
  const response = await fetch(api.runtime.getURL('native-config.json'));
  if (!response.ok) {
    throw new Error('missing-config');
  }
  return response.json();
}

async function bridgeFetch(pathname, options = {}) {
  const config = await loadNativeConfig();
  const response = await fetch(`${config.origin}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Lcerp-Token': config.token,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `bridge-${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

const ICON_IDLE = {
  16: 'icons/idle-16.png',
  32: 'icons/idle-32.png',
  48: 'icons/idle-48.png',
  128: 'icons/idle-128.png',
};
const ICON_FOUND = {
  16: 'icons/found-16.png',
  32: 'icons/found-32.png',
  48: 'icons/found-48.png',
  128: 'icons/found-128.png',
};

async function setRecordIcon(tabId, found) {
  if (!api.action?.setIcon || !tabId) return;
  const path = found ? ICON_FOUND : ICON_IDLE;
  const title = found ? 'Local ERP · 레코드에 있음' : 'Local ERP · 레코드에 없음';
  try {
    await api.action.setIcon({ tabId, path });
    await api.action.setTitle?.({ tabId, title });
    await api.action.setBadgeText?.({ tabId, text: '' });
  } catch {
    // tab may have been closed
  }
}

async function refreshRecordIcon(tabId, url) {
  let found = false;
  if (/^https?:/i.test(url || '')) {
    try {
      const payload = await bridgeFetch('/records-by-url', { method: 'POST', body: { url } });
      found = Array.isArray(payload.records) && payload.records.length > 0;
    } catch {
      found = false;
    }
  }
  await setRecordIcon(tabId, found);
}

async function refreshActiveRecordIcon() {
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (tab?.id) await refreshRecordIcon(tab.id, tab.url || '');
}

if (api.sidePanel?.setPanelBehavior) {
  void api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

api.tabs.onActivated.addListener((info) => {
  void api.tabs.get(info.tabId).then((tab) => refreshRecordIcon(tab.id, tab.url || '')).catch(() => undefined);
});
api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  void refreshRecordIcon(tabId, changeInfo.url || tab?.url || '');
});
void refreshActiveRecordIcon();

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'findRecordsByUrl') {
    bridgeFetch('/records-by-url', { method: 'POST', body: { url: message.url } })
      .then((payload) => sendResponse({ records: payload.records || [] }))
      .catch((error) => sendResponse({ error: error.message || 'bridge-failed' }));
    return true;
  }
  if (message?.type === 'listBookmarks') {
    bridgeFetch('/bookmarks')
      .then((payload) => sendResponse({ tree: payload.tree || [] }))
      .catch((error) => sendResponse({ error: error.message || 'bridge-failed' }));
    return true;
  }
  if (message?.type === 'listScripts') {
    const path = message.url ? `/scripts?url=${encodeURIComponent(message.url)}` : '/scripts';
    bridgeFetch(path)
      .then((payload) => sendResponse({ scripts: payload.scripts || [] }))
      .catch((error) => sendResponse({ error: error.message || 'bridge-failed' }));
    return true;
  }
  if (message?.type === 'scriptsForUrl') {
    bridgeFetch('/scripts-for-url', { method: 'POST', body: { url: message.url } })
      .then((payload) => sendResponse({ scripts: payload.scripts || [] }))
      .catch((error) => sendResponse({ error: error.message || 'bridge-failed' }));
    return true;
  }
  return undefined;
});
