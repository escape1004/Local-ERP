import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app, dialog, session as electronSession, shell } from 'electron';
import { db } from '../database/connection';
import { log } from '../app/state';
import {
  ensureFilenameExtension,
  filenameFromContentDisposition,
  suggestedDownloadKind,
  suggestedSaveFilename,
  type BrowserDownloadItem,
  type BrowserDownloadKind,
} from './browser-downloads';

const BROWSER_PARTITION = 'persist:erp-browser';

const MAX_STORED_DOWNLOADS = 100;
const items = new Map<string, BrowserDownloadItem>();
const pendingSaveByUrl = new Map<string, { id: string; filePath: string }>();
let downloadsAttached = false;
let notifyDownloadsChanged: ((items: BrowserDownloadItem[]) => void) | null = null;

export function setBrowserDownloadsChangedListener(listener: ((items: BrowserDownloadItem[]) => void) | null) {
  notifyDownloadsChanged = listener;
}

function nowIso() {
  return new Date().toISOString();
}

function safeFilename(name: string) {
  const cleaned = String(name || 'download').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return path.basename(cleaned).slice(0, 120) || 'download';
}

function uniquePath(target: string) {
  if (!fs.existsSync(target)) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);
  let index = 1;
  while (fs.existsSync(`${stem} (${index})${ext}`)) index += 1;
  return `${stem} (${index})${ext}`;
}

function broadcastDownloads() {
  notifyDownloadsChanged?.(listBrowserDownloads());
}

function persistDownload(item: BrowserDownloadItem) {
  if (item.state === 'progressing') return;
  try {
    db.prepare(`
      INSERT INTO browser_downloads (
        id, filename, url, file_path, mime, kind, state, received_bytes, total_bytes, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        filename = excluded.filename,
        file_path = excluded.file_path,
        mime = excluded.mime,
        kind = excluded.kind,
        state = excluded.state,
        received_bytes = excluded.received_bytes,
        total_bytes = excluded.total_bytes,
        completed_at = excluded.completed_at
    `).run(
      item.id,
      item.filename,
      item.url,
      item.filePath,
      item.mime || '',
      item.kind,
      item.state,
      item.receivedBytes || 0,
      item.totalBytes || 0,
      item.createdAt,
      item.completedAt || null,
    );
    const extra = db.prepare(`
      SELECT id FROM browser_downloads
      ORDER BY created_at DESC
      LIMIT -1 OFFSET ?
    `).all(MAX_STORED_DOWNLOADS) as Array<{ id: string }>;
    if (extra.length > 0) {
      const ids = extra.map((row) => row.id);
      db.prepare(`DELETE FROM browser_downloads WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  } catch (error) {
    log('브라우저 다운로드 기록 저장 실패:', error);
  }
}

function upsertDownload(item: BrowserDownloadItem) {
  items.set(item.id, item);
  persistDownload(item);
  broadcastDownloads();
  return item;
}

function loadStoredDownloads(): BrowserDownloadItem[] {
  try {
    return db.prepare(`
      SELECT id, filename, url, file_path AS filePath, mime, kind, state,
             received_bytes AS receivedBytes, total_bytes AS totalBytes,
             created_at AS createdAt, completed_at AS completedAt
      FROM browser_downloads
      ORDER BY created_at DESC
      LIMIT ?
    `).all(MAX_STORED_DOWNLOADS) as BrowserDownloadItem[];
  } catch (error) {
    log('브라우저 다운로드 조회 실패:', error);
    return [];
  }
}

export function listBrowserDownloads() {
  const live = [...items.values()];
  const stored = loadStoredDownloads().filter((row) => !items.has(row.id));
  return [...live, ...stored].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export function registerBrowserDownload(payload: Partial<BrowserDownloadItem> & { filename?: string } = {}) {
  const id = String(payload.id || crypto.randomUUID());
  const filename = safeFilename(payload.filename || path.basename(String(payload.filePath || '')) || 'download');
  const item: BrowserDownloadItem = {
    id,
    filename,
    url: String(payload.url || ''),
    filePath: String(payload.filePath || ''),
    mime: String(payload.mime || ''),
    kind: payload.kind || suggestedDownloadKind(filename, payload.mime),
    state: payload.state || 'progressing',
    receivedBytes: Number(payload.receivedBytes) || 0,
    totalBytes: Number(payload.totalBytes) || 0,
    createdAt: payload.createdAt || nowIso(),
    completedAt: payload.completedAt || (payload.state === 'completed' ? nowIso() : ''),
  };
  return upsertDownload(item);
}

export function updateBrowserDownload(id: string, patch: Partial<BrowserDownloadItem> = {}) {
  const current = items.get(id) || loadStoredDownloads().find((row) => row.id === id);
  if (!current) return null;
  const done = patch.state === 'completed' || patch.state === 'cancelled' || patch.state === 'interrupted';
  const next: BrowserDownloadItem = {
    ...current,
    ...patch,
    completedAt: done ? (patch.completedAt || current.completedAt || nowIso()) : current.completedAt,
  };
  return upsertDownload(next);
}

function takePendingSave(url: string) {
  const exact = pendingSaveByUrl.get(url);
  if (exact) {
    pendingSaveByUrl.delete(url);
    return exact;
  }
  return null;
}

export function attachBrowserSessionDownloads(ses) {
  if (!ses || downloadsAttached) return;
  downloadsAttached = true;
  ses.on('will-download', (_event, item) => {
    const url = item.getURL();
    const filename = safeFilename(item.getFilename());
    const pending = takePendingSave(url);
    const dest = pending?.filePath || uniquePath(path.join(app.getPath('downloads'), filename));
    const id = pending?.id || crypto.randomUUID();
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      item.setSavePath(dest);
    } catch (error) {
      log('브라우저 다운로드 경로 지정 실패:', error);
    }
    registerBrowserDownload({
      id,
      filename: path.basename(dest),
      url,
      filePath: dest,
      mime: item.getMimeType(),
      kind: suggestedDownloadKind(filename, item.getMimeType()),
      state: 'progressing',
      receivedBytes: 0,
      totalBytes: item.getTotalBytes() || 0,
    });
    item.on('updated', (_event, state) => {
      updateBrowserDownload(id, {
        filePath: item.getSavePath() || dest,
        receivedBytes: item.getReceivedBytes() || 0,
        totalBytes: item.getTotalBytes() || 0,
        state: state === 'interrupted' ? 'interrupted' : 'progressing',
      });
    });
    item.once('done', (_event, state) => {
      updateBrowserDownload(id, {
        filePath: item.getSavePath() || dest,
        receivedBytes: item.getReceivedBytes() || 0,
        totalBytes: item.getTotalBytes() || 0,
        state: state === 'completed' ? 'completed' : state === 'cancelled' ? 'cancelled' : 'interrupted',
      });
    });
  });
}

async function sniffRemoteSaveHint(url: string) {
  try {
    const response = await electronSession.fromPartition(BROWSER_PARTITION).fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(2500),
    });
    return {
      mime: response.headers.get('content-type') || '',
      filename: filenameFromContentDisposition(response.headers.get('content-disposition') || ''),
    };
  } catch {
    return { mime: '', filename: '' };
  }
}

export async function saveBrowserFileAs(payload: {
  url?: string;
  filename?: string;
  kind?: BrowserDownloadKind;
} = {}, parentWindow) {
  const url = String(payload.url || '');
  if (!/^https?:\/\//i.test(url)) return { success: false, error: '저장할 파일을 찾을 수 없습니다.' };
  const remote = await sniffRemoteSaveHint(url);
  const filename = suggestedSaveFilename({
    url,
    filename: payload.filename || remote.filename,
    mime: remote.mime,
    kind: payload.kind || 'image',
  });
  const ext = filename.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '';
  const { canceled, filePath } = await dialog.showSaveDialog(
    parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    {
      title: '다른 이름으로 저장',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: ext
        ? [
          { name: ext.toUpperCase(), extensions: [ext] },
          { name: '모든 파일', extensions: ['*'] },
        ]
        : [
          { name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'] },
          { name: '모든 파일', extensions: ['*'] },
        ],
    },
  );
  if (canceled || !filePath) return { success: false };
  const dest = ensureFilenameExtension(filePath, filename);
  const item = registerBrowserDownload({
    filename: path.basename(dest),
    url,
    filePath: dest,
    mime: remote.mime,
    kind: payload.kind || suggestedDownloadKind(path.basename(dest), remote.mime),
    state: 'progressing',
  });
  pendingSaveByUrl.set(url, { id: item.id, filePath: dest });
  try {
    electronSession.fromPartition(BROWSER_PARTITION).downloadURL(url);
  } catch (error) {
    pendingSaveByUrl.delete(url);
    updateBrowserDownload(item.id, { state: 'interrupted' });
    log('브라우저 다른 이름으로 저장 실패:', error);
    return { success: false, error: error?.message || '파일을 저장하지 못했습니다.' };
  }
  return { success: true, path: dest };
}

export async function downloadBrowserFiles(payload: {
  files?: Array<{ url?: string; filename?: string; kind?: BrowserDownloadKind }>;
} = {}, parentWindow) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (files.length === 0) return { success: false, error: '저장할 파일이 없습니다.' };
  const { canceled, filePaths } = await dialog.showOpenDialog(
    parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
    {
      title: '저장 폴더 선택',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: app.getPath('downloads'),
    },
  );
  if (canceled || !filePaths?.[0]) return { success: false };
  const folder = filePaths[0];
  const ses = electronSession.fromPartition(BROWSER_PARTITION);
  const started = [];
  files.forEach((file, index) => {
    const url = String(file.url || '');
    if (!/^https?:\/\//i.test(url)) return;
    const filename = safeFilename(file.filename || `file-${index + 1}`);
    const filePath = uniquePath(path.join(folder, filename));
    const item = registerBrowserDownload({
      filename: path.basename(filePath),
      url,
      filePath,
      kind: file.kind || suggestedDownloadKind(filename),
      state: 'progressing',
    });
    pendingSaveByUrl.set(url, { id: item.id, filePath });
    started.push({ id: item.id, url, filePath });
    try {
      ses.downloadURL(url);
    } catch (error) {
      pendingSaveByUrl.delete(url);
      updateBrowserDownload(item.id, { state: 'interrupted' });
      log('브라우저 파일 다운로드 시작 실패:', error);
    }
  });
  return { success: started.length > 0, folder, items: started };
}

export async function openBrowserDownload(id: string) {
  const item = listBrowserDownloads().find((row) => row.id === id);
  if (!item?.filePath) return { success: false, error: '파일을 찾을 수 없습니다.' };
  const error = await shell.openPath(item.filePath);
  return error ? { success: false, error } : { success: true };
}

export async function showBrowserDownloadInFolder(id: string) {
  const item = listBrowserDownloads().find((row) => row.id === id);
  if (!item?.filePath) return { success: false, error: '파일을 찾을 수 없습니다.' };
  shell.showItemInFolder(item.filePath);
  return { success: true };
}

export function deleteBrowserDownload(id: string) {
  const key = String(id || '');
  if (!key) return { success: false, error: '다운로드를 찾을 수 없습니다.' };
  items.delete(key);
  try {
    db.prepare('DELETE FROM browser_downloads WHERE id = ?').run(key);
  } catch (error) {
    log('브라우저 다운로드 기록 삭제 실패:', error);
    return { success: false, error: '다운로드 기록을 삭제하지 못했습니다.' };
  }
  broadcastDownloads();
  return { success: true };
}

export function clearBrowserDownloads() {
  items.clear();
  try {
    db.prepare('DELETE FROM browser_downloads').run();
  } catch (error) {
    log('브라우저 다운로드 기록 삭제 실패:', error);
  }
  broadcastDownloads();
  return { success: true };
}
