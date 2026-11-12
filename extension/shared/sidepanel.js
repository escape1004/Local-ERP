const api = typeof browser !== 'undefined' ? browser : chrome;
const bookmarksPane = document.getElementById('bookmarks-pane');
const scriptsPane = document.getElementById('scripts-pane');
const statusEl = document.getElementById('status');
const matchEl = document.getElementById('match');
const EXPANDED_KEY = 'lcerp-record-tree-expanded';
const TAB_KEY = 'lcerp-side-tab';

const ICONS = {
  chevronDown: '<svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronRight: '<svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg class="folder-icon category" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

let expandedIds = new Set();
let recordFolders = [];
let scripts = [];
let matchKeys = recordMatchKeys([]);
let currentUrl = '';
let activeTab = 'bookmarks';

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

function setMatch(text, found) {
  matchEl.textContent = text;
  matchEl.hidden = !text || activeTab !== 'bookmarks';
  matchEl.classList.toggle('found', found === true);
  matchEl.classList.toggle('missing', found === false);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadPrefs() {
  try {
    const stored = await api.storage.local.get([EXPANDED_KEY, TAB_KEY]);
    const ids = stored?.[EXPANDED_KEY];
    if (Array.isArray(ids)) expandedIds = new Set(ids.map(String));
    if (stored?.[TAB_KEY] === 'scripts' || stored?.[TAB_KEY] === 'bookmarks') {
      activeTab = stored[TAB_KEY];
    }
  } catch {
    expandedIds = new Set();
  }
}

async function saveExpanded() {
  try {
    await api.storage.local.set({ [EXPANDED_KEY]: [...expandedIds] });
  } catch {
    // ignore
  }
}

function setSideTab(id) {
  activeTab = id === 'scripts' ? 'scripts' : 'bookmarks';
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === activeTab);
  });
  bookmarksPane.hidden = activeTab !== 'bookmarks';
  scriptsPane.hidden = activeTab !== 'scripts';
  matchEl.hidden = activeTab !== 'bookmarks' || !matchEl.textContent;
  try {
    void api.storage.local.set({ [TAB_KEY]: activeTab });
  } catch {
    // ignore
  }
}

function toggleFolder(id) {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  void saveExpanded();
  renderBookmarks();
}

function renderFolder(folder, parent, depth) {
  const open = expandedIds.has(folder.id);
  const total = countRecordBookmarks(folder);
  const wrap = document.createElement('div');
  wrap.className = 'folder';
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'folder-header';
  header.style.top = `${depth * 36}px`;
  header.style.zIndex = String(30 - depth);
  header.style.paddingLeft = `${12 + depth * 20}px`;
  header.setAttribute('aria-expanded', open ? 'true' : 'false');
  header.innerHTML = `${depth > 0 ? '<span class="nest">└</span>' : ''}${open ? ICONS.chevronDown : ICONS.chevronRight}${ICONS.folder}<span class="folder-name">${escapeHtml(folder.name || '폴더')}</span><span class="count">${total}</span>`;
  header.addEventListener('click', () => toggleFolder(folder.id));
  wrap.appendChild(header);

  if (open) {
    (folder.children || []).forEach((child) => renderFolder(child, wrap, depth + 1));
    (folder.bookmarks || []).forEach((bookmark) => {
      const active = isRecordBookmarkActive(bookmark, matchKeys);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = active ? 'item active' : 'item';
      button.style.paddingLeft = `${32 + depth * 20}px`;
      button.title = bookmark.url || '';
      const subtitle = bookmark.subtitle || bookmark.url || '';
      button.innerHTML = `<span class="rail"></span><span class="item-body"><span class="item-title">${ICONS.link}<span>${escapeHtml(bookmark.title || bookmark.url)}</span></span>${subtitle ? `<span class="item-sub">${escapeHtml(subtitle)}</span>` : ''}</span>`;
      const openBookmark = (options = {}) => {
        if (!bookmark.url) return;
        if (options.newTab) {
          void api.tabs.create({ url: bookmark.url, active: options.active !== false });
          return;
        }
        void api.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          const tab = tabs[0];
          if (tab?.id) void api.tabs.update(tab.id, { url: bookmark.url });
          else void api.tabs.create({ url: bookmark.url });
        });
      };
      button.addEventListener('mousedown', (event) => {
        if (event.button === 1) event.preventDefault();
      });
      button.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        openBookmark({ newTab: true, active: false });
      });
      button.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey) {
          openBookmark({ newTab: true, active: true });
          return;
        }
        openBookmark();
      });
      wrap.appendChild(button);
    });
  }

  parent.appendChild(wrap);
}

function renderBookmarks() {
  bookmarksPane.replaceChildren();
  if (recordFolders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '표시할 레코드 URL이 없습니다.';
    bookmarksPane.appendChild(empty);
    return;
  }
  recordFolders.forEach((folder) => renderFolder(folder, bookmarksPane, 0));
}

function renderScripts() {
  scriptsPane.replaceChildren();
  if (scripts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '저장된 스크립트가 없습니다.';
    scriptsPane.appendChild(empty);
    return;
  }
  scripts.forEach((script) => {
    const row = document.createElement('div');
    row.className = 'script';
    const runningHere = Boolean(script.runningHere);
    const matches = Array.isArray(script.matches) ? script.matches.join(', ') : '';
    row.innerHTML = `<span class="dot${runningHere ? ' on' : ''}"></span><span class="script-body"><span class="script-name">${escapeHtml(script.name || '스크립트')}</span>${matches ? `<span class="script-matches">${escapeHtml(matches)}</span>` : ''}</span><span class="script-state${script.enabled ? ' on' : ''}">${script.enabled ? '켜짐' : '꺼짐'}</span>`;
    row.title = runningHere ? '이 페이지에서 작동 중' : script.enabled ? '이 페이지 대상 아님' : '꺼짐';
    scriptsPane.appendChild(row);
  });
}

async function currentTabUrl() {
  const queries = [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
  ];
  for (const query of queries) {
    const tabs = await api.tabs.query(query);
    const tab = tabs.find((item) => /^https?:/i.test(item?.url || '')) || tabs[0];
    if (tab?.url) return tab.url;
  }
  return '';
}

function applyCurrentMatch(records) {
  matchKeys = recordMatchKeys(records);
  folderIdsContainingActiveBookmarks(recordFolders, matchKeys).forEach((id) => expandedIds.add(id));
  void saveExpanded();
  if (!currentUrl || !/^https?:/i.test(currentUrl)) {
    setMatch('', null);
    return;
  }
  if (records.length > 0) {
    const labels = records.map((item) => item.label || item.id).filter(Boolean);
    setMatch(`현재 페이지는 레코드에 있습니다${labels.length ? ` · ${labels.join(', ')}` : ''}`, true);
    return;
  }
  setMatch('현재 페이지는 레코드에 없습니다', false);
}

function isSidePanelActive() {
  return document.visibilityState === 'visible';
}

let lastRefreshKey = '';

async function refresh(force = false) {
  if (!force && !isSidePanelActive()) return;
  currentUrl = await currentTabUrl();
  const httpUrl = /^https?:/i.test(currentUrl);
  const refreshKey = `${currentUrl}|${activeTab}`;
  if (!force && refreshKey === lastRefreshKey) return;
  lastRefreshKey = refreshKey;
  const [bookmarksResult, matchResult, scriptsResult] = await Promise.all([
    api.runtime.sendMessage({ type: 'listBookmarks' }),
    httpUrl ? api.runtime.sendMessage({ type: 'findRecordsByUrl', url: currentUrl }) : Promise.resolve({ records: [] }),
    api.runtime.sendMessage({ type: 'listScripts', url: httpUrl ? currentUrl : '' }),
  ]);

  if (bookmarksResult?.error || scriptsResult?.error) {
    const error = bookmarksResult?.error || scriptsResult?.error;
    recordFolders = [];
    scripts = [];
    setStatus(error === 'missing-config' || error === 'unauthorized'
      ? 'LCERP 앱을 실행한 뒤 확장을 다시 로드하세요.'
      : 'LCERP 앱이 실행 중인지 확인하세요.');
    setMatch('', null);
    renderBookmarks();
    renderScripts();
    return;
  }

  const tree = Array.isArray(bookmarksResult?.tree) ? bookmarksResult.tree : [];
  recordFolders = tree.filter((folder) => folder.kind === 'category');
  scripts = Array.isArray(scriptsResult?.scripts) ? scriptsResult.scripts : [];
  setStatus('');
  applyCurrentMatch(Array.isArray(matchResult?.records) ? matchResult.records : []);
  renderBookmarks();
  renderScripts();
  setSideTab(activeTab);
}

let refreshTimer = 0;
function scheduleRefresh() {
  if (!isSidePanelActive()) return;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void refresh();
  }, 200);
}

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => setSideTab(button.dataset.tab));
});

api.tabs.onActivated.addListener(() => {
  lastRefreshKey = '';
  scheduleRefresh();
});
api.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (!changeInfo.url) return;
  lastRefreshKey = '';
  scheduleRefresh();
});
document.addEventListener('visibilitychange', () => {
  if (!isSidePanelActive()) return;
  lastRefreshKey = '';
  scheduleRefresh();
});

void loadPrefs().then(() => {
  setSideTab(activeTab);
  return refresh(true);
});
