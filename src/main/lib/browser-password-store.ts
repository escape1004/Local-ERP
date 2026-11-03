export const MAX_BROWSER_PASSWORD_ENTRIES = 200;
export const MAX_BROWSER_USERNAME_LENGTH = 200;
export const MAX_BROWSER_PASSWORD_LENGTH = 500;

export function originFromBrowserUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

export function emptyPasswordVault() {
  return { entries: [], neverSaveOrigins: [] };
}

export function normalizePasswordVault(value) {
  const vault = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const seen = new Set();
  const entries = [];
  (Array.isArray(vault.entries) ? vault.entries : []).forEach((item) => {
    const entry = createPasswordEntry(item, Date.parse(item?.updatedAt) || Date.now());
    if (!entry || seen.has(`${entry.origin}\0${entry.username}`)) return;
    if (entries.length >= MAX_BROWSER_PASSWORD_ENTRIES) return;
    seen.add(`${entry.origin}\0${entry.username}`);
    entries.push(entry);
  });
  const neverSaveOrigins = [];
  const neverSeen = new Set();
  (Array.isArray(vault.neverSaveOrigins) ? vault.neverSaveOrigins : []).forEach((item) => {
    const origin = originFromBrowserUrl(item) || '';
    if (!origin || neverSeen.has(origin)) return;
    neverSeen.add(origin);
    neverSaveOrigins.push(origin);
  });
  return { entries, neverSaveOrigins };
}

export function createPasswordEntry(raw, now = Date.now()) {
  const origin = originFromBrowserUrl(raw?.origin || raw?.url);
  const username = String(raw?.username || '').trim().slice(0, MAX_BROWSER_USERNAME_LENGTH);
  const password = String(raw?.password || '');
  if (!origin || !username || !password || password.length > MAX_BROWSER_PASSWORD_LENGTH) return null;
  const updatedAt = Number.isFinite(now) ? new Date(now).toISOString() : new Date().toISOString();
  const createdAt = String(raw?.createdAt || '').trim() || updatedAt;
  const id = String(raw?.id || '').trim() || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `pw-${updatedAt}`);
  return {
    id,
    origin,
    username,
    password,
    createdAt,
    updatedAt,
  };
}

export function summarizePasswordEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((item) => ({
    id: item.id,
    origin: item.origin,
    username: item.username,
    updatedAt: item.updatedAt,
  }));
}

export function upsertPasswordEntry(vault, nextEntry) {
  const current = normalizePasswordVault(vault);
  const entry = createPasswordEntry(nextEntry);
  if (!entry) return { vault: current, skipped: 'invalid' };
  if (current.neverSaveOrigins.includes(entry.origin)) {
    return { vault: current, skipped: 'never' };
  }

  const index = current.entries.findIndex((item) => (
    item.origin === entry.origin && item.username === entry.username
  ));
  if (index >= 0) {
    if (current.entries[index].password === entry.password) {
      return { vault: current, skipped: 'unchanged', entry: current.entries[index] };
    }
    const updated = {
      ...current.entries[index],
      password: entry.password,
      updatedAt: entry.updatedAt,
    };
    const entries = current.entries.slice();
    entries[index] = updated;
    return { vault: { ...current, entries }, updated: true, entry: updated };
  }

  return {
    vault: {
      ...current,
      entries: [entry, ...current.entries].slice(0, MAX_BROWSER_PASSWORD_ENTRIES),
    },
    created: true,
    entry,
  };
}

export function deletePasswordEntry(vault, id) {
  const current = normalizePasswordVault(vault);
  const nextId = String(id || '');
  return {
    vault: {
      ...current,
      entries: current.entries.filter((item) => item.id !== nextId),
    },
  };
}

export function addNeverSaveOrigin(vault, origin) {
  const current = normalizePasswordVault(vault);
  const nextOrigin = originFromBrowserUrl(origin);
  if (!nextOrigin || current.neverSaveOrigins.includes(nextOrigin)) {
    return { vault: current, origin: nextOrigin };
  }
  return {
    vault: {
      entries: current.entries.filter((item) => item.origin !== nextOrigin),
      neverSaveOrigins: [...current.neverSaveOrigins, nextOrigin],
    },
    origin: nextOrigin,
  };
}
