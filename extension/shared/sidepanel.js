const api = typeof browser !== 'undefined' ? browser : chrome;
const bookmarksPane = document.getElementById('bookmarks-pane');
const scriptsPane = document.getElementById('scripts-pane');
const statusEl = document.getElementById('status');
const actionsEl = document.getElementById('bookmark-actions');
const EXPANDED_KEY = 'lcerp-record-tree-expanded';
const TAB_KEY = 'lcerp-side-tab';
const MANUAL_BOOKMARK_FOLDER_ID = '__manual__';

const ICONS = {
  chevronDown: '<svg class="chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronRight: '<svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg class="folder-icon category" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  folderManual: '<svg class="folder-icon manual" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  star: '<svg class="folder-icon star" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

let bookmarkMenuOpen = false;

function folderGlyph(folder) {
  if (folder.id === MANUAL_BOOKMARK_FOLDER_ID) return ICONS.star;
  if (folder.kind === 'manual') return ICONS.folderManual;
  return ICONS.folder;
}

function bookmarkHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url || '';
  }
}

let expandedIds = new Set();
let recordFolders = [];
let saveTargets = [];
let scripts = [];
let matchKeys = recordMatchKeys([]);
let currentUrl = '';
let currentTitle = '';
let currentMatch = { record: false, manual: false, records: [], manuals: [] };
let activeTab = 'bookmarks';

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

function closeBookmarkMenu() {
  bookmarkMenuOpen = false;
  const toggle = actionsEl.querySelector('.bookmark-toggle');
  const menu = actionsEl.querySelector('.bookmark-menu');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (menu) menu.hidden = true;
}

function addBookmarkTo(folderId) {
  closeBookmarkMenu();
  void api.runtime.sendMessage({
    type: 'addBookmark',
    url: currentUrl,
    title: currentTitle,
    folderId,
  }).then(() => {
    lastRefreshKey = '';
    void refresh(true);
  });
}

function renderBookmarkActions() {
  actionsEl.replaceChildren();
  bookmarkMenuOpen = false;
  const show = activeTab === 'bookmarks' && /^https?:/i.test(currentUrl) && !currentMatch.record;
  actionsEl.hidden = !show;
  if (!show) return;

  if (currentMatch.manual) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'action-btn danger';
    remove.textContent = '북마크 해제';
    remove.addEventListener('click', () => {
      const id = currentMatch.manuals?.[0]?.id;
      if (!id) return;
      void api.runtime.sendMessage({ type: 'removeBookmark', id }).then(() => {
        lastRefreshKey = '';
        void refresh(true);
      });
    });
    actionsEl.appendChild(remove);
    return;
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'bookmark-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.innerHTML = `<span>북마크</span>${ICONS.chevronDown}`;

  const menu = document.createElement('div');
  menu.className = 'bookmark-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'listbox');

  const targets = saveTargets.length ? saveTargets : [{ id: null, name: '직접 추가', depth: 0 }];
  targets.forEach((target) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'bookmark-menu-item';
    row.style.paddingLeft = `${12 + Number(target.depth || 0) * 12}px`;
    row.textContent = target.name;
    row.addEventListener('click', (event) => {
      event.stopPropagation();
      addBookmarkTo(target.id);
    });
    menu.appendChild(row);
  });

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    bookmarkMenuOpen = !bookmarkMenuOpen;
    toggle.setAttribute('aria-expanded', bookmarkMenuOpen ? 'true' : 'false');
    menu.hidden = !bookmarkMenuOpen;
  });

  actionsEl.appendChild(toggle);
  actionsEl.appendChild(menu);
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
    else expandedIds = new Set([MANUAL_BOOKMARK_FOLDER_ID]);
    if (stored?.[TAB_KEY] === 'scripts' || stored?.[TAB_KEY] === 'bookmarks') {
      activeTab = stored[TAB_KEY];
    }
  } catch {
    expandedIds = new Set([MANUAL_BOOKMARK_FOLDER_ID]);
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
  renderBookmarkActions();
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
  header.innerHTML = `${depth > 0 ? '<span class="nest">└</span>' : ''}${open ? ICONS.chevronDown : ICONS.chevronRight}${folderGlyph(folder)}<span class="folder-name">${escapeHtml(folder.name || '폴더')}</span><span class="count">${total}</span>`;
  header.addEventListener('click', () => toggleFolder(folder.id));
  wrap.appendChild(header);

  if (open) {
    (folder.children || []).forEach((child) => renderFolder(child, wrap, depth + 1));
    (folder.bookmarks || []).forEach((bookmark) => {
      const isRecord = bookmark.source === 'record';
      const active = isRecordBookmarkActive(bookmark, matchKeys);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `item${active ? ' active' : ''}${isRecord ? '' : ' manual'}`;
      button.style.paddingLeft = `${32 + depth * 20}px`;
      button.title = bookmark.url || '';
      const subtitle = isRecord ? (bookmark.subtitle || '') : bookmarkHost(bookmark.url);
      const titleIcon = isRecord ? ICONS.link : '<span class="dash">-</span>';
      button.innerHTML = `<span class="rail${isRecord ? '' : ' manual'}"></span><span class="item-body"><span class="item-title">${titleIcon}<span>${escapeHtml(bookmark.title || bookmark.url)}</span></span>${subtitle ? `<span class="item-sub">${escapeHtml(subtitle)}</span>` : ''}</span>`;
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
      if (!isRecord) {
        button.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          showBookmarkMenu(event, bookmark);
        });
      }
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
    empty.textContent = '표시할 북마크가 없습니다.';
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

async function currentTabInfo() {
  const queries = [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
  ];
  for (const query of queries) {
    const tabs = await api.tabs.query(query);
    const tab = tabs.find((item) => /^https?:/i.test(item?.url || '')) || tabs[0];
    if (tab?.url) return { url: tab.url, title: tab.title || '' };
  }
  return { url: '', title: '' };
}

function applyCurrentMatch(match) {
  currentMatch = {
    record: Boolean(match?.record),
    manual: Boolean(match?.manual),
    records: Array.isArray(match?.records) ? match.records : [],
    manuals: Array.isArray(match?.manuals) ? match.manuals : [],
  };
  const records = currentMatch.records;
  const manuals = currentMatch.manuals;
  matchKeys = recordMatchKeys([
    ...records,
    { urls: manuals.map((item) => item.url).filter(Boolean) },
  ]);
  folderIdsContainingActiveBookmarks(recordFolders, matchKeys).forEach((id) => expandedIds.add(id));
  void saveExpanded();
  renderBookmarkActions();
}

function isSidePanelActive() {
  return document.visibilityState === 'visible';
}

let lastRefreshKey = '';

async function refresh(force = false) {
  if (!force && !isSidePanelActive()) return;
  const tab = await currentTabInfo();
  currentUrl = tab.url;
  currentTitle = tab.title;
  const httpUrl = /^https?:/i.test(currentUrl);
  const refreshKey = `${currentUrl}|${activeTab}`;
  if (!force && refreshKey === lastRefreshKey) return;
  lastRefreshKey = refreshKey;
  const [bookmarksResult, matchResult, scriptsResult] = await Promise.all([
    api.runtime.sendMessage({ type: 'listBookmarks' }),
    httpUrl ? api.runtime.sendMessage({ type: 'findBookmarkMatch', url: currentUrl }) : Promise.resolve({
      record: false,
      manual: false,
      records: [],
      manuals: [],
    }),
    api.runtime.sendMessage({ type: 'listScripts', url: httpUrl ? currentUrl : '' }),
  ]);

  if (bookmarksResult?.error || scriptsResult?.error) {
    const error = bookmarksResult?.error || scriptsResult?.error;
    recordFolders = [];
    saveTargets = [];
    scripts = [];
    currentMatch = { record: false, manual: false, records: [], manuals: [] };
    setStatus(error === 'missing-config' || error === 'unauthorized'
      ? 'LCERP 앱을 실행한 뒤 확장을 다시 로드하세요.'
      : 'LCERP 앱이 실행 중인지 확인하세요.');
    renderBookmarkActions();
    renderBookmarks();
    renderScripts();
    return;
  }

  const tree = Array.isArray(bookmarksResult?.tree) ? bookmarksResult.tree : [];
  recordFolders = tree;
  saveTargets = Array.isArray(bookmarksResult?.saveTargets) ? bookmarksResult.saveTargets : [];
  scripts = Array.isArray(scriptsResult?.scripts) ? scriptsResult.scripts : [];
  setStatus('');
  applyCurrentMatch(matchResult?.error ? { record: false, manual: false, records: [], manuals: [] } : matchResult);
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

let contextMenu = null;

function hideBookmarkMenu() {
  contextMenu?.remove();
  contextMenu = null;
}

function showBookmarkMenu(event, bookmark) {
  hideBookmarkMenu();
  contextMenu = document.createElement('div');
  contextMenu.className = 'ctx';
  contextMenu.style.left = `${event.clientX}px`;
  contextMenu.style.top = `${event.clientY}px`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ctx-item danger';
  remove.textContent = '삭제';
  remove.addEventListener('click', () => {
    hideBookmarkMenu();
    void api.runtime.sendMessage({ type: 'removeBookmark', id: bookmark.id }).then(() => {
      lastRefreshKey = '';
      void refresh(true);
    });
  });
  contextMenu.appendChild(remove);
  document.body.appendChild(contextMenu);
}

document.addEventListener('click', (event) => {
  hideBookmarkMenu();
  if (event.target instanceof Element && event.target.closest('.bookmark-actions')) return;
  closeBookmarkMenu();
});
document.addEventListener('scroll', (event) => {
  hideBookmarkMenu();
  const target = event.target;
  if (target instanceof Element && target.closest('.bookmark-menu')) return;
  if (target === document || target === document.documentElement || target === document.body) {
    closeBookmarkMenu();
  }
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideBookmarkMenu();
    closeBookmarkMenu();
  }
});

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
api.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'bookmarksChanged') return;
  lastRefreshKey = '';
  scheduleRefresh();
});

void loadPrefs().then(() => {
  setSideTab(activeTab);
  return refresh(true);
});
