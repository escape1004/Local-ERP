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
  16: 'icons/star-idle-16.png',
  32: 'icons/star-idle-32.png',
  48: 'icons/star-idle-48.png',
  128: 'icons/star-idle-128.png',
};
const ICON_RECORD = {
  16: 'icons/star-record-16.png',
  32: 'icons/star-record-32.png',
  48: 'icons/star-record-48.png',
  128: 'icons/star-record-128.png',
};
const ICON_MANUAL = {
  16: 'icons/star-manual-16.png',
  32: 'icons/star-manual-32.png',
  48: 'icons/star-manual-48.png',
  128: 'icons/star-manual-128.png',
};

function iconForMatch(match) {
  if (match?.record) {
    return { path: ICON_RECORD, title: 'Local ERP · 레코드에 있음' };
  }
  if (match?.manual) {
    return { path: ICON_MANUAL, title: 'Local ERP · 직접 추가 북마크' };
  }
  return { path: ICON_IDLE, title: 'Local ERP · 북마크 없음' };
}

async function setRecordIcon(tabId, match) {
  if (!api.action?.setIcon || !tabId) return;
  const { path, title } = iconForMatch(match);
  try {
    await api.action.setIcon({ tabId, path });
    await api.action.setTitle?.({ tabId, title });
    await api.action.setBadgeText?.({ tabId, text: '' });
  } catch {
    // tab may have been closed
  }
}

async function refreshRecordIcon(tabId, url) {
  let match = { record: false, manual: false };
  if (/^https?:/i.test(url || '')) {
    try {
      match = await bridgeFetch('/bookmark-match', { method: 'POST', body: { url } });
    } catch {
      match = { record: false, manual: false };
    }
  }
  await setRecordIcon(tabId, match);
}

async function refreshActiveRecordIcon() {
  const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (tab?.id) await refreshRecordIcon(tab.id, tab.url || '');
}

async function notifyBookmarksChanged() {
  await refreshActiveRecordIcon();
  try {
    await api.runtime.sendMessage({ type: 'bookmarksChanged' });
  } catch {
    // no listeners
  }
}

if (api.sidePanel?.setPanelBehavior) {
  void api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else if (api.action?.onClicked && api.sidebarAction?.open) {
  api.action.onClicked.addListener(() => {
    void api.sidebarAction.open();
  });
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
  if (message?.type === 'findBookmarkMatch') {
    bridgeFetch('/bookmark-match', { method: 'POST', body: { url: message.url } })
      .then((payload) => sendResponse(payload))
      .catch((error) => sendResponse({ error: error.message || 'bridge-failed' }));
    return true;
  }
  if (message?.type === 'listBookmarks') {
    bridgeFetch('/bookmarks')
      .then((payload) => sendResponse({
        tree: payload.tree || [],
        saveTargets: payload.saveTargets || [],
      }))
      .catch((error) => sendResponse({ error: error.message || 'bridge-failed' }));
    return true;
  }
  if (message?.type === 'addBookmark') {
    bridgeFetch('/bookmarks', {
      method: 'POST',
      body: { url: message.url, title: message.title, folderId: message.folderId },
    })
      .then(async (payload) => {
        await notifyBookmarksChanged();
        sendResponse(payload);
      })
      .catch((error) => sendResponse({ success: false, error: error.message || 'bridge-failed' }));
    return true;
  }
  if (message?.type === 'removeBookmark') {
    bridgeFetch('/bookmarks/remove', { method: 'POST', body: { id: message.id } })
      .then(async (payload) => {
        await notifyBookmarksChanged();
        sendResponse(payload);
      })
      .catch((error) => sendResponse({ success: false, error: error.message || 'bridge-failed' }));
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
