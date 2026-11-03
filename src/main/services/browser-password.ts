import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import { decodeEncryptedBase64, encodeEncryptedBase64 } from '../lib/openai-secret';
import {
  addNeverSaveOrigin,
  deletePasswordEntry,
  emptyPasswordVault,
  normalizePasswordVault,
  originFromBrowserUrl,
  summarizePasswordEntries,
  upsertPasswordEntry,
} from '../lib/browser-password-store';

const PENDING_MS = 120000;
const pendingById = new Map();
let cachedVault = null;

function getSafeStorageCrypto() {
  try {
    if (typeof app.isReady === 'function' && !app.isReady()) return null;
    if (typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()) {
      return null;
    }
    return safeStorage;
  } catch {
    return null;
  }
}

function vaultFilePath() {
  return path.join(app.getPath('userData'), 'browser-passwords.json');
}

function decryptVaultPayload(encrypted, crypto) {
  try {
    if (!crypto || typeof crypto.decryptString !== 'function') return emptyPasswordVault();
    const buffer = decodeEncryptedBase64(encrypted);
    if (!buffer) return emptyPasswordVault();
    const parsed = JSON.parse(crypto.decryptString(buffer));
    return normalizePasswordVault(parsed);
  } catch {
    return emptyPasswordVault();
  }
}

function readVault() {
  if (cachedVault) return cachedVault;
  try {
    const raw = JSON.parse(fs.readFileSync(vaultFilePath(), 'utf8'));
    cachedVault = decryptVaultPayload(raw?.encrypted, getSafeStorageCrypto());
  } catch {
    cachedVault = emptyPasswordVault();
  }
  return cachedVault;
}

function writeVault(vault) {
  const crypto = getSafeStorageCrypto();
  if (!crypto || typeof crypto.encryptString !== 'function') {
    return { success: false, error: '이 환경에서는 비밀번호를 안전하게 저장할 수 없습니다.' };
  }
  const normalized = normalizePasswordVault(vault);
  try {
    const encryptedBuffer = crypto.encryptString(JSON.stringify(normalized));
    const encrypted = encodeEncryptedBase64(
      Buffer.isBuffer(encryptedBuffer) ? encryptedBuffer : Buffer.from(encryptedBuffer),
    );
    if (!encrypted) {
      return { success: false, error: '비밀번호를 암호화하지 못했습니다.' };
    }
    fs.writeFileSync(vaultFilePath(), JSON.stringify({ version: 1, encrypted }, null, 2), 'utf8');
    cachedVault = normalized;
    return { success: true };
  } catch {
    return { success: false, error: '비밀번호를 저장하지 못했습니다.' };
  }
}

function prunePending() {
  const now = Date.now();
  pendingById.forEach((item, id) => {
    if (!item || item.expiresAt <= now) pendingById.delete(id);
  });
}

function senderOrigin(event) {
  try {
    return originFromBrowserUrl(event?.sender?.getURL?.());
  } catch {
    return '';
  }
}

function isWebviewSender(event) {
  try {
    return event?.sender?.getType?.() === 'webview';
  } catch {
    return false;
  }
}

function refuseUnlessWebview(event) {
  if (isWebviewSender(event)) return null;
  return { success: false, error: '허용되지 않은 요청입니다.' };
}

function refuseIfWebview(event) {
  if (!isWebviewSender(event)) return null;
  return { success: false, error: '허용되지 않은 요청입니다.' };
}

export function listBrowserPasswordSummaries(event) {
  if (isWebviewSender(event)) return [];
  return summarizePasswordEntries(readVault().entries);
}

export function listBrowserPasswordsForOrigin(event) {
  if (!isWebviewSender(event)) return [];
  const origin = senderOrigin(event);
  if (!origin) return [];
  return summarizePasswordEntries(readVault().entries.filter((item) => item.origin === origin));
}

export function stageBrowserPassword(event, payload) {
  const refused = refuseUnlessWebview(event);
  if (refused) return refused;
  if (!getSafeStorageCrypto()) {
    return { success: false, error: '이 환경에서는 비밀번호를 안전하게 저장할 수 없습니다.' };
  }
  const origin = senderOrigin(event);
  const result = upsertPasswordEntry(readVault(), {
    origin,
    username: payload?.username,
    password: payload?.password,
  });
  if (result.skipped === 'invalid') {
    return { success: false, error: '저장할 로그인 정보가 없습니다.' };
  }
  if (result.skipped === 'never' || result.skipped === 'unchanged') {
    return { success: true, skipped: result.skipped };
  }

  prunePending();
  const pendingId = crypto.randomUUID();
  pendingById.set(pendingId, {
    origin,
    username: result.entry.username,
    password: payload?.password,
    expiresAt: Date.now() + PENDING_MS,
    updated: Boolean(result.updated),
  });
  return {
    success: true,
    pendingId,
    origin,
    username: result.entry.username,
    updated: Boolean(result.updated),
  };
}

export function commitBrowserPassword(event, pendingId) {
  const refused = refuseIfWebview(event);
  if (refused) return refused;
  prunePending();
  const pending = pendingById.get(String(pendingId || ''));
  if (!pending) return { success: false, error: '저장할 로그인이 만료되었습니다.' };
  pendingById.delete(String(pendingId || ''));
  const result = upsertPasswordEntry(readVault(), pending);
  if (result.skipped === 'never') {
    return { success: true, skipped: 'never' };
  }
  if (result.skipped === 'invalid') {
    return { success: false, error: '저장할 로그인 정보가 없습니다.' };
  }
  const saved = writeVault(result.vault);
  if (!saved.success) return saved;
  return { success: true, updated: Boolean(result.updated), entry: summarizePasswordEntries([result.entry])[0] };
}

export function dismissBrowserPassword(event, pendingId) {
  const refused = refuseIfWebview(event);
  if (refused) return refused;
  pendingById.delete(String(pendingId || ''));
  return { success: true };
}

export function unlockBrowserPassword(event, id) {
  const refused = refuseUnlessWebview(event);
  if (refused) return refused;
  const origin = senderOrigin(event);
  const entry = readVault().entries.find((item) => item.id === String(id || ''));
  if (!origin || !entry || entry.origin !== origin) {
    return { success: false, error: '저장된 로그인을 열 수 없습니다.' };
  }
  return {
    success: true,
    username: entry.username,
    password: entry.password,
  };
}

export function deleteBrowserPassword(event, id) {
  const refused = refuseIfWebview(event);
  if (refused) return refused;
  const result = deletePasswordEntry(readVault(), id);
  const saved = writeVault(result.vault);
  if (!saved.success) return saved;
  return { success: true };
}

export function neverSaveBrowserOrigin(event, origin) {
  const refused = refuseIfWebview(event);
  if (refused) return refused;
  const result = addNeverSaveOrigin(readVault(), origin);
  if (!result.origin) return { success: false, error: '사이트 주소를 확인하지 못했습니다.' };
  const saved = writeVault(result.vault);
  if (!saved.success) return saved;
  return { success: true, origin: result.origin };
}
