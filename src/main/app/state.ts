import { app } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import XLSX from 'xlsx';
import { format, isValid, parse } from 'date-fns';
import { electronDistDir } from '../ffmpeg-paths';
import { redactSensitive } from '../lib/redact';
import {
  DEFAULT_DATE_PARSE_FORMATS,
  DEFAULT_PROFILE_COLOR,
  DEFAULT_TRANSLATION_MODEL,
  SUPPORTED_TRANSLATION_MODELS,
  getDateParseFormats,
  getStoredDateOutputFormat,
  normalizeBackupInterval,
  normalizeDateParseFormat,
  normalizeDateParseFormats,
  normalizeDefaultGalleryZoom,
  normalizeIdleLockMinutes,
  normalizePasswordLockDurationMinutes,
  normalizePasswordLockMaxAttempts,
  normalizeThumbnailPreviewScale,
  normalizeBrowserStartupMode,
  normalizeTranslationDisplayMode,
  normalizeTranslationModel,
  normalizeTranslationTargetLanguage,
  normalizeZoomPercent
} from '../lib/config-normalize';
import {
  ingestSavedOpenAiSecrets,
  migrateOpenAiSecrets,
  omitOpenAiSecretsFromConfig
} from '../services/openai-secret';

export { electronDistDir };
export {
  DEFAULT_DATE_PARSE_FORMATS,
  DEFAULT_PROFILE_COLOR,
  DEFAULT_TRANSLATION_MODEL,
  SUPPORTED_TRANSLATION_MODELS,
  getDateParseFormats,
  getStoredDateOutputFormat,
  normalizeBackupInterval,
  normalizeDateParseFormat,
  normalizeDateParseFormats,
  normalizeDefaultGalleryZoom,
  normalizeIdleLockMinutes,
  normalizePasswordLockDurationMinutes,
  normalizePasswordLockMaxAttempts,
  normalizeThumbnailPreviewScale,
  normalizeBrowserStartupMode,
  normalizeTranslationDisplayMode,
  normalizeTranslationModel,
  normalizeTranslationTargetLanguage,
  normalizeZoomPercent
};

// 콘솔 출력 인코딩을 UTF-8로 고정 (Windows 환경 한글 깨짐 방지)
if (process.stdout && typeof process.stdout.setDefaultEncoding === 'function') {
  process.stdout.setDefaultEncoding('utf8');
}
if (process.stderr && typeof process.stderr.setDefaultEncoding === 'function') {
  process.stderr.setDefaultEncoding('utf8');
}
if (process.platform === 'win32') {
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
    process.env.LANG = 'ko_KR.UTF-8';
  } catch (e) {
    // 콘솔 코드페이지 변경 실패 시 무시
  }
}

// 로그 파일 설정
export const logPath = path.join(app.getPath('userData'), 'app.log');
export const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function getArgValue(prefix) {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function getIsolatedRendererUrl() {
  const fromEnv = String(process.env.VITE_DEV_SERVER_URL || '').trim();
  return fromEnv || getArgValue('--smoke-url=');
}

function getOverrideDataDir() {
  const fromEnv = String(process.env.LOCAL_ERP_DATA_DIR || '').trim();
  const fromArg = getArgValue('--data-dir=');
  const override = fromEnv || fromArg;
  return override ? path.resolve(override) : '';
}

// 데이터베이스 및 백업 경로 설정
export const isolatedRendererUrl = getIsolatedRendererUrl();
export const isDev = process.env.VITE_DEV_SERVER_URL;
export const isPreview = process.env.ELECTRON === 'true' || process.env.npm_lifecycle_event === 'electron:preview';

// 개발 환경에서는 프로젝트 루트의 save 폴더 사용, 빌드된 앱에서는 Local 경로 사용 (용량 제한 없음)
export const projectRoot = isDev ? path.resolve(electronDistDir, '..') : path.join(os.homedir(), 'AppData', 'Local');
export const appDataDir = getOverrideDataDir() || path.join(projectRoot, isDev ? 'save' : 'Local ERP');
export const dbPath = path.join(appDataDir, 'erp.db');
export const backupDir = path.join(path.join(os.homedir(), 'AppData', 'Local'), 'backups');
export const configPath = path.join(app.getPath('userData'), 'config.json');

export const defaultConfig = {
  backupDir,
  backupInterval: 60,
  backupEnabled: true,
  rememberWindowBounds: false,
  muteAudioWhenBackgrounded: false,
  windowBounds: null,
  rememberBrowserWindowBounds: false,
  browserWindowBounds: null,
  browserStartupMode: 'newtab',
  browserTrackerBlocking: true,
  browserLastUrl: '',
  browserLastTabs: [],
  browserLastTabIndex: 0,
  passwordHash: null,
  passwordLockMaxAttempts: 5,
  passwordLockDurationMinutes: 1,
  passwordFailedAttempts: 0,
  passwordLockUntil: null,
  openAiApiKeyEncrypted: '',
  translationTargetLanguage: 'ko',
  translationModel: DEFAULT_TRANSLATION_MODEL,
  translationDisplayMode: 'tooltip',
  videoSeekSeconds: 5,
  videoAutoPlay: true,
  listThumbnailFit: 'cover',
  videoHoverPreviewEnabled: true,
  zoomPercent: 100,
  thumbnailPreviewScale: 100,
  defaultGalleryZoom: 100,
  dateParseFormats: null,
  idleLockMinutes: 0
};

export let appConfig = { ...defaultConfig };
export let currentProfileId = null;

export function setCurrentProfileId(id) {
  currentProfileId = id;
}

// save 폴더가 없으면 생성
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

// 백업 폴더가 없으면 생성
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

export function loadAppConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!savedConfig || typeof savedConfig !== 'object' || Array.isArray(savedConfig)) {
        appConfig = { ...defaultConfig };
        ingestSavedOpenAiSecrets({});
        return;
      }

      const {
        openAiApiKey: _ignoredPlaintextKey,
        openAiApiKeyEncrypted: _ignoredEncryptedKey,
        ...rest
      } = savedConfig;
      appConfig = { ...defaultConfig, ...rest, openAiApiKeyEncrypted: '' };
      ingestSavedOpenAiSecrets(savedConfig);
    }
  } catch (error) {
    console.error('Failed to load app config:', error);
    appConfig = { ...defaultConfig };
    ingestSavedOpenAiSecrets({});
  }
}

export function saveAppConfig() {
  try {
    const persisted = omitOpenAiSecretsFromConfig(appConfig);
    fs.writeFileSync(configPath, JSON.stringify(persisted, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save app config:', error);
  }
}

export function migratePersistedOpenAiSecrets() {
  try {
    const result = migrateOpenAiSecrets();
    if (result.shouldSave) {
      saveAppConfig();
    }
  } catch (error) {
    console.error('Failed to migrate OpenAI API key storage:', error);
  }
}

export function getConfiguredZoomPercent() {
  return normalizeZoomPercent(appConfig.zoomPercent) ?? 100;
}

export function getConfiguredThumbnailPreviewScale() {
  return normalizeThumbnailPreviewScale(appConfig.thumbnailPreviewScale) ?? 100;
}

export function getConfiguredDefaultGalleryZoom() {
  return normalizeDefaultGalleryZoom(appConfig.defaultGalleryZoom) ?? 100;
}

export function getConfiguredTranslationTargetLanguage() {
  return normalizeTranslationTargetLanguage(appConfig.translationTargetLanguage);
}

export function getConfiguredTranslationModel() {
  return normalizeTranslationModel(appConfig.translationModel);
}

export function getConfiguredTranslationDisplayMode() {
  return normalizeTranslationDisplayMode(appConfig.translationDisplayMode);
}

export function getConfiguredBackupInterval() {
  return normalizeBackupInterval(appConfig.backupInterval) ?? 60;
}

export function getConfiguredBackupDir() {
  const configuredPath = String(appConfig.backupDir || '').trim();
  return configuredPath ? path.resolve(configuredPath) : backupDir;
}

export function getConfiguredPasswordLockMaxAttempts() {
  return normalizePasswordLockMaxAttempts(appConfig.passwordLockMaxAttempts) ?? 5;
}

export function getConfiguredPasswordLockDurationMinutes() {
  return normalizePasswordLockDurationMinutes(appConfig.passwordLockDurationMinutes) ?? 1;
}

export function getConfiguredIdleLockMinutes() {
  return normalizeIdleLockMinutes(appConfig.idleLockMinutes) ?? 0;
}

export function getConfiguredBrowserStartupMode() {
  return normalizeBrowserStartupMode(appConfig.browserStartupMode);
}

export function getConfiguredBrowserTrackerBlocking() {
  return appConfig.browserTrackerBlocking !== false;
}

export function getPasswordLockUntil() {
  const lockUntil = Number(appConfig.passwordLockUntil);
  return Number.isFinite(lockUntil) && lockUntil > Date.now() ? lockUntil : null;
}

export function resetPasswordLockState() {
  appConfig.passwordFailedAttempts = 0;
  appConfig.passwordLockUntil = null;
}

export function normalizeImportedDateValue(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  if (rawValue instanceof Date && isValid(rawValue)) {
    return format(rawValue, 'yyyy-MM-dd');
  }

  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    const parsedDateCode = XLSX.SSF.parse_date_code(rawValue);
    if (parsedDateCode && parsedDateCode.y && parsedDateCode.m && parsedDateCode.d) {
      const parsedDate = new Date(parsedDateCode.y, parsedDateCode.m - 1, parsedDateCode.d);
      if (
        isValid(parsedDate) &&
        parsedDate.getFullYear() === parsedDateCode.y &&
        parsedDate.getMonth() === parsedDateCode.m - 1 &&
        parsedDate.getDate() === parsedDateCode.d
      ) {
        return format(parsedDate, 'yyyy-MM-dd');
      }
    }
  }

  const text = String(rawValue).trim();
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{4}-\d{2}$/.test(text)) {
    return text;
  }

  const supportedFullDatePatterns = [
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/,
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/
  ];

  for (const pattern of supportedFullDatePatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr, dayStr] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const parsedDate = new Date(year, month - 1, day);

    if (
      year >= 1900 &&
      year <= 2100 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      isValid(parsedDate) &&
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day
    ) {
      return `${yearStr.padStart(4, '0')}-${monthStr.padStart(2, '0')}-${dayStr.padStart(2, '0')}`;
    }

    return text;
  }

  const supportedYearMonthPatterns = [
    /^(\d{4})-(\d{1,2})$/,
    /^(\d{4})\.(\d{1,2})$/,
    /^(\d{4})\/(\d{1,2})$/
  ];

  for (const pattern of supportedYearMonthPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const [, yearStr, monthStr] = match;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return `${yearStr}-${monthStr.padStart(2, '0')}`;
    }
    return text;
  }

  for (const dateFormat of getDateParseFormats(normalizeDateParseFormats(appConfig.dateParseFormats) ?? [])) {
    try {
      const parsedDate = parse(text, dateFormat, new Date());
      if (isValid(parsedDate)) {
        return format(parsedDate, getStoredDateOutputFormat(dateFormat));
      }
    } catch (error) {
      // Ignore invalid format tokens and continue trying other formats.
    }
  }

  return text;
}

export function applyWindowZoom(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;

  const zoomFactor = getConfiguredZoomPercent() / 100;
  targetWindow.webContents.setZoomLevel(0);
  targetWindow.webContents.setZoomFactor(zoomFactor);
}

loadAppConfig();

// 로깅 함수
export function log(message, data: any = '') {
  const timestamp = new Date().toISOString();
  const payload = data ? redactSensitive(data) : '';
  const logMessage = `${timestamp} - ${message} ${payload ? JSON.stringify(payload) : ''}\n`;
  logStream.write(logMessage);
  console.log(logMessage);
}
