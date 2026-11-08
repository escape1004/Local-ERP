import { contextBridge, ipcRenderer } from 'electron';
import { isBotChallengeUrl } from './lib/embedded-browser-policy';

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

const isTopGuestFrame = (() => {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
})();
const isChallengeFrame = !isTopGuestFrame && isBotChallengeUrl(window.location.href);

if (!isChallengeFrame) {
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
}

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

if (isTopGuestFrame) {
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
}

if (isTopGuestFrame) {
function isVisibleInput(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement) || element.disabled) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return element.getClientRects().length > 0;
}

function setNativeInputValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function looksLikeUsername(element: HTMLInputElement) {
  const type = (element.getAttribute('type') || 'text').toLowerCase();
  if (!['text', 'email', 'tel', 'url', 'search'].includes(type)) return false;
  const hint = `${element.autocomplete} ${element.name} ${element.id} ${element.placeholder}`.toLowerCase();
  return /user|email|login|account|id|아이디|이메일/.test(hint) || type === 'email';
}

function findLoginFields() {
  const passwords = [...document.querySelectorAll('input[type="password"]')].filter(isVisibleInput);
  if (passwords.length !== 1) return null;
  const password = passwords[0];
  const root: ParentNode = password.form || document;
  const candidates = [...root.querySelectorAll('input')].filter((element) => (
    element !== password && isVisibleInput(element)
  ));
  const username = candidates.find(looksLikeUsername) || candidates.find((element) => {
    const type = (element.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'email', 'tel'].includes(type);
  }) || null;
  return { username, password };
}

function readLoginFields() {
  const fields = findLoginFields();
  const username = String(fields?.username?.value || '').trim();
  const password = String(fields?.password?.value || '');
  if (!fields || !username || !password) return null;
  return { username, password };
}

function isSubmitControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const control = target.closest('button, input[type="submit"], input[type="image"]');
  if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement)) return false;
  if (control instanceof HTMLInputElement && (control.type === 'submit' || control.type === 'image')) return true;
  if (control instanceof HTMLButtonElement && (control.type === 'submit' || !control.type)) return true;
  const label = `${control.textContent || ''} ${control.getAttribute('value') || ''}`.toLowerCase();
  return /log\s*in|sign\s*in|로그인|접속/.test(label);
}

let lastStageKey = '';
let lastStageAt = 0;

async function stageLogin() {
  const login = readLoginFields();
  if (!login) return;
  const origin = window.location.origin;
  const key = `${origin}\0${login.username}\0${login.password}`;
  const now = Date.now();
  if (key === lastStageKey && now - lastStageAt < 1500) return;
  lastStageKey = key;
  lastStageAt = now;
  try {
    const staged = await ipcRenderer.invoke('browser:stagePassword', {
      username: login.username,
      password: login.password,
    }) as {
      success?: boolean;
      pendingId?: string;
      origin?: string;
      username?: string;
      updated?: boolean;
      skipped?: string;
    };
    if (!staged?.success || !staged.pendingId) return;
    sendToHost('browser:password-prompt', {
      pendingId: staged.pendingId,
      origin: staged.origin || origin,
      username: staged.username || login.username,
      updated: Boolean(staged.updated),
    });
  } catch {
    // guest pages should not surface vault errors
  }
}

async function offerSavedLogins() {
  try {
    const accounts = await ipcRenderer.invoke('browser:listPasswordsForOrigin') as Array<{
      id?: string;
      username?: string;
      origin?: string;
      updatedAt?: string;
    }>;
    if (!Array.isArray(accounts) || accounts.length === 0) return;
    sendToHost('browser:password-fill', {
      accounts: accounts.map((item) => ({
        id: String(item.id || ''),
        username: String(item.username || ''),
        origin: String(item.origin || ''),
        updatedAt: String(item.updatedAt || ''),
      })).filter((item) => item.id && item.username),
    });
  } catch {
    // ignore fill lookup errors
  }
}

async function fillSavedLogin(id: string) {
  const unlocked = await ipcRenderer.invoke('browser:unlockPassword', id) as {
    success?: boolean;
    username?: string;
    password?: string;
  };
  if (!unlocked?.success) return;
  const username = String(unlocked.username || '');
  const password = String(unlocked.password || '');
  const apply = () => {
    const fields = findLoginFields();
    if (!fields) return false;
    if (fields.username) setNativeInputValue(fields.username, username);
    setNativeInputValue(fields.password, password);
    return true;
  };
  if (apply()) return;
  window.setTimeout(apply, 400);
}

window.addEventListener('submit', () => {
  void stageLogin();
}, true);
window.addEventListener('click', (event) => {
  if (!isSubmitControl(event.target)) return;
  void stageLogin();
}, true);
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.type !== 'password' && !looksLikeUsername(event.target)) return;
  void stageLogin();
}, true);

ipcRenderer.on('browser:fill-login', (_event, payload) => {
  const id = payload && typeof payload === 'object' ? String((payload as { id?: string }).id || '') : '';
  if (!id) return;
  void fillSavedLogin(id);
});

function scheduleFillOffer() {
  window.setTimeout(() => {
    void offerSavedLogins();
  }, 250);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scheduleFillOffer, { once: true });
} else {
  scheduleFillOffer();
}
window.addEventListener('load', scheduleFillOffer, { once: true });
}

if (isTopGuestFrame) {
  const PICK_HIGHLIGHT_ID = 'erp-record-pick-highlight';
  const PICK_LABEL_ID = 'erp-record-pick-label';
  const PICK_STYLE_ID = 'erp-record-pick-style';
  let pickActive = false;
  let pickTarget: Element | null = null;

  function absHttpUrl(value: string) {
    try {
      const parsed = new URL(String(value || ''), window.location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function backgroundSrc(element: Element) {
    try {
      const image = window.getComputedStyle(element).backgroundImage || '';
      const match = image.match(/url\((['"]?)(.*?)\1\)/i);
      return match ? absHttpUrl(match[2]) : '';
    } catch {
      return '';
    }
  }

  function ensurePickOverlay() {
    let style = document.getElementById(PICK_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = PICK_STYLE_ID;
      style.textContent = 'html.erp-picking, html.erp-picking * { cursor: crosshair !important; }';
      document.documentElement.appendChild(style);
    }
    let box = document.getElementById(PICK_HIGHLIGHT_ID) as HTMLDivElement | null;
    if (!box) {
      box = document.createElement('div');
      box.id = PICK_HIGHLIGHT_ID;
      box.setAttribute('data-erp-picker', '1');
      Object.assign(box.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483646',
        border: '2px solid #4c8dff',
        background: 'rgba(76, 141, 255, 0.12)',
        borderRadius: '2px',
        display: 'none',
      });
      document.documentElement.appendChild(box);
    }
    let label = document.getElementById(PICK_LABEL_ID) as HTMLDivElement | null;
    if (!label) {
      label = document.createElement('div');
      label.id = PICK_LABEL_ID;
      label.setAttribute('data-erp-picker', '1');
      Object.assign(label.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483647',
        background: '#4c8dff',
        color: '#fff',
        font: '11px/1.2 sans-serif',
        padding: '1px 4px',
        borderRadius: '2px',
        display: 'none',
      });
      document.documentElement.appendChild(label);
    }
    return { box, label };
  }

  function elementAtPoint(x: number, y: number) {
    const stack = document.elementsFromPoint(x, y);
    return stack.find((element) => element && !element.closest?.('[data-erp-picker]')) || null;
  }

  function updatePickHighlight(element: Element | null) {
    const { box, label } = ensurePickOverlay();
    if (!element || element === document.documentElement) {
      pickTarget = null;
      box.style.display = 'none';
      label.style.display = 'none';
      return;
    }
    pickTarget = element;
    const rect = element.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${Math.round(rect.left)}px`;
    box.style.top = `${Math.round(rect.top)}px`;
    box.style.width = `${Math.max(0, Math.round(rect.width))}px`;
    box.style.height = `${Math.max(0, Math.round(rect.height))}px`;
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    label.textContent = `${tag}${id}`;
    label.style.display = 'block';
    const labelTop = rect.top > 18 ? rect.top - 16 : Math.max(0, rect.bottom);
    label.style.left = `${Math.max(0, Math.round(rect.left))}px`;
    label.style.top = `${Math.round(labelTop)}px`;
  }

  function extractPicked(element: Element) {
    const html = element as HTMLElement;
    const image = element.closest('img') as HTMLImageElement | null;
    const media = element.closest('video, audio, source') as HTMLMediaElement | null;
    const anchor = element.closest('a[href]') as HTMLAnchorElement | null;
    const src = absHttpUrl(
      image?.currentSrc || image?.src || media?.currentSrc || (media as HTMLMediaElement | null)?.src || '',
    ) || backgroundSrc(element);
    const href = absHttpUrl(anchor?.href || '');
    const text = String(html.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
    return {
      tag: element.tagName,
      text,
      href: href || undefined,
      src: src || undefined,
      alt: image?.alt || html.getAttribute?.('alt') || undefined,
      title: html.getAttribute?.('title') || image?.alt || undefined,
    };
  }

  function stopPicker() {
    if (!pickActive) return;
    pickActive = false;
    pickTarget = null;
    document.documentElement.classList.remove('erp-picking');
    window.removeEventListener('mousemove', onPickMove, true);
    window.removeEventListener('mousedown', onPickGuard, true);
    window.removeEventListener('click', onPickClick, true);
    window.removeEventListener('auxclick', onPickGuard, true);
    window.removeEventListener('scroll', onPickScroll, true);
    window.removeEventListener('resize', onPickScroll);
    const box = document.getElementById(PICK_HIGHLIGHT_ID);
    const label = document.getElementById(PICK_LABEL_ID);
    if (box) box.style.display = 'none';
    if (label) label.style.display = 'none';
  }

  function onPickMove(event: MouseEvent) {
    updatePickHighlight(elementAtPoint(event.clientX, event.clientY));
  }

  function onPickScroll() {
    if (!pickTarget) return;
    updatePickHighlight(pickTarget);
  }

  function onPickGuard(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function onPickClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const element = elementAtPoint(event.clientX, event.clientY) || pickTarget;
    if (!element) return;
    sendToHost('browser:element-picked', extractPicked(element));
  }

  function startPicker() {
    if (pickActive) {
      updatePickHighlight(pickTarget);
      return;
    }
    pickActive = true;
    document.documentElement.classList.add('erp-picking');
    ensurePickOverlay();
    window.addEventListener('mousemove', onPickMove, true);
    window.addEventListener('mousedown', onPickGuard, true);
    window.addEventListener('click', onPickClick, true);
    window.addEventListener('auxclick', onPickGuard, true);
    window.addEventListener('scroll', onPickScroll, true);
    window.addEventListener('resize', onPickScroll);
  }

  ipcRenderer.on('browser:pick-element-start', () => startPicker());
  ipcRenderer.on('browser:pick-element-stop', () => stopPicker());
}
