import { normalizeBrowserStartupMode } from './config-normalize';
import { parseExternalHttpUrl } from './security';

export const MAX_BROWSER_SESSION_TABS = 16;

export function getEmbeddedBrowserHash(url?: string) {
  const parsed = url ? parseExternalHttpUrl(String(url)) : null;
  if (!parsed) return '/browser';
  return `/browser?url=${encodeURIComponent(parsed.toString())}`;
}

export function normalizeBrowserSessionUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text === 'about:blank' || text === 'about:history' || text === 'about:downloads') return text;
  const parsed = parseExternalHttpUrl(text);
  return parsed ? parsed.toString() : '';
}

export function normalizeBrowserSessionTabs(value) {
  if (!Array.isArray(value)) return [];
  const urls = [];
  for (const item of value) {
    const raw = typeof item === 'string'
      ? item
      : (item && typeof item === 'object' ? item.url : '');
    const normalized = normalizeBrowserSessionUrl(raw);
    if (!normalized) continue;
    urls.push(normalized);
    if (urls.length >= MAX_BROWSER_SESSION_TABS) break;
  }
  return urls;
}

export function normalizePersistedBrowserSession(tabs, activeIndex, lastUrl) {
  const urls = normalizeBrowserSessionTabs(tabs);
  const fallback = normalizeBrowserSessionUrl(lastUrl);
  const nextUrls = urls.length > 0 ? urls : (fallback ? [fallback] : []);
  let index = Number.parseInt(String(activeIndex), 10);
  if (!Number.isInteger(index) || index < 0 || index >= nextUrls.length) {
    const matched = fallback ? nextUrls.indexOf(fallback) : -1;
    index = matched >= 0 ? matched : 0;
  }
  return { urls: nextUrls, activeIndex: nextUrls.length ? index : 0 };
}

export function hasBrowserSessionsByProfile(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}

function toStoredBrowserSession(session) {
  const lastUrl = session.urls[session.activeIndex] || '';
  return {
    tabs: session.urls,
    activeIndex: session.activeIndex,
    lastUrl,
  };
}

export function readBrowserSessionForProfile(config, profileId) {
  const map = config?.browserSessionsByProfile;
  if (hasBrowserSessionsByProfile(map)) {
    const scoped = profileId ? map[profileId] : null;
    if (!scoped || typeof scoped !== 'object' || Array.isArray(scoped)) {
      return { urls: [], activeIndex: 0 };
    }
    return normalizePersistedBrowserSession(scoped.tabs ?? scoped.urls, scoped.activeIndex, scoped.lastUrl);
  }

  return normalizePersistedBrowserSession(
    config?.browserLastTabs,
    config?.browserLastTabIndex,
    config?.browserLastUrl,
  );
}

export function writeBrowserSessionForProfile(config, profileId, session) {
  const next = normalizePersistedBrowserSession(session?.urls ?? session?.tabs, session?.activeIndex, session?.lastUrl);
  const stored = toStoredBrowserSession(next);
  if (profileId) {
    const existing = config.browserSessionsByProfile;
    const map = existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...existing }
      : {};
    map[profileId] = stored;
    config.browserSessionsByProfile = map;
  }
  config.browserLastTabs = stored.tabs;
  config.browserLastTabIndex = stored.activeIndex;
  config.browserLastUrl = stored.lastUrl;
  return next;
}

export function claimLegacyBrowserSessionForProfile(config, profileId) {
  if (!profileId || hasBrowserSessionsByProfile(config.browserSessionsByProfile)) {
    return false;
  }

  const legacy = normalizePersistedBrowserSession(
    config.browserLastTabs,
    config.browserLastTabIndex,
    config.browserLastUrl,
  );
  config.browserSessionsByProfile = {
    [profileId]: toStoredBrowserSession(legacy),
  };
  return true;
}

export function deleteBrowserSessionForProfile(config, profileId) {
  const map = config?.browserSessionsByProfile;
  if (!profileId || !map || typeof map !== 'object' || Array.isArray(map) || !Object.prototype.hasOwnProperty.call(map, profileId)) {
    return false;
  }

  const next = { ...map };
  delete next[profileId];
  config.browserSessionsByProfile = next;
  if (Object.keys(next).length === 0) {
    config.browserLastTabs = [];
    config.browserLastTabIndex = 0;
    config.browserLastUrl = '';
  }
  return true;
}

export function resolveEmbeddedBrowserSession(input) {
  const requestedUrl = input?.requestedUrl;
  const requested = requestedUrl ? parseExternalHttpUrl(String(requestedUrl)) : null;
  if (normalizeBrowserStartupMode(input?.startupMode) !== 'continue') {
    return { urls: requested ? [requested.toString()] : [], activeIndex: 0 };
  }
  return normalizePersistedBrowserSession(input?.lastTabs, input?.lastTabIndex, input?.lastUrl);
}

export function resolveEmbeddedBrowserOpenUrl(requestedUrl, lastUrl, startupMode) {
  const parsed = requestedUrl ? parseExternalHttpUrl(String(requestedUrl)) : null;
  if (parsed) return parsed.toString();
  if (normalizeBrowserStartupMode(startupMode) !== 'continue') return '';
  const restored = normalizeBrowserSessionUrl(lastUrl);
  return restored === 'about:blank' ? '' : restored;
}
