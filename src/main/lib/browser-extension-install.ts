import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { shell } from 'electron';
import { appDataDir, log } from '../store';
import { electronDistDir } from '../ffmpeg-paths';
import {
  CHROMIUM_EXTENSION_ID,
  FIREFOX_EXTENSION_ID,
  writeExtensionNativeConfig,
} from './browser-extension-bridge';

export type ExternalBrowserKind = 'brave' | 'firefox';

function fileExists(filePath: string) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export function bundledExtensionRoot() {
  const packaged = path.join(process.resourcesPath || '', 'lcerp-extension');
  if (fileExists(path.join(packaged, 'shared', 'background.js'))) return packaged;
  const fromApp = path.join(electronDistDir, '..', 'extension');
  if (fileExists(path.join(fromApp, 'shared', 'background.js'))) return fromApp;
  return path.join(process.cwd(), 'extension');
}

export function userExtensionRoot() {
  return path.join(appDataDir, 'browser-extension');
}

export function userExtensionDir(kind: ExternalBrowserKind) {
  return path.join(userExtensionRoot(), kind);
}

export function resolveBraveExecutable(env: NodeJS.ProcessEnv = process.env) {
  const localAppData = env.LOCALAPPDATA || '';
  const programFiles = env.PROGRAMFILES || '';
  const programFilesX86 = env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ].find(fileExists) || '';
}

export function resolveFirefoxExecutable(env: NodeJS.ProcessEnv = process.env) {
  const localAppData = env.LOCALAPPDATA || '';
  const programFiles = env.PROGRAMFILES || '';
  const programFilesX86 = env['PROGRAMFILES(X86)'] || '';
  return [
    path.join(programFiles, 'Mozilla Firefox', 'firefox.exe'),
    path.join(programFilesX86, 'Mozilla Firefox', 'firefox.exe'),
    path.join(localAppData, 'Mozilla Firefox', 'firefox.exe'),
  ].find(fileExists) || '';
}

function copyDir(from: string, to: string) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, dest);
    else fs.copyFileSync(source, dest);
  }
}

function writeInstallNotes(dir: string, kind: ExternalBrowserKind) {
  const brave = [
    'Brave에 Local ERP 확장 넣기',
    '',
    '1. brave://extensions 를 엽니다.',
    '2. 오른쪽 위 개발자 모드를 켭니다.',
    '3. "압축해제된 확장 프로그램을 로드합니다"를 누르고 이 폴더를 선택합니다.',
    '4. 개발자 모드는 켜 둔 채로 사용합니다.',
    '',
    `확장 ID: ${CHROMIUM_EXTENSION_ID}`,
  ].join('\n');
  const firefox = [
    'Firefox에 Local ERP 확장 넣기',
    '',
    '1. 주소창에 about:debugging#/runtime/this-firefox 를 엽니다.',
    '2. "임시 부가 기능 로드"를 누릅니다.',
    '3. 이 폴더의 manifest.json 을 선택합니다.',
    '4. Firefox를 끄면 확장이 빠지므로, 다시 쓸 때 같은 방법으로 로드합니다.',
    '',
    `부가 기능 ID: ${FIREFOX_EXTENSION_ID}`,
  ].join('\n');
  fs.writeFileSync(path.join(dir, '설치.txt'), kind === 'brave' ? brave : firefox, 'utf8');
}

export function prepareBrowserExtensionFiles(origin: string, token: string) {
  const bundled = bundledExtensionRoot();
  const shared = path.join(bundled, 'shared');
  if (!fileExists(path.join(shared, 'background.js'))) {
    throw new Error('확장 파일을 찾지 못했습니다.');
  }

  const prepared = {
    brave: userExtensionDir('brave'),
    firefox: userExtensionDir('firefox'),
  };

  for (const kind of ['brave', 'firefox'] as const) {
    const dest = prepared[kind];
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(shared, dest);
    fs.copyFileSync(
      path.join(bundled, kind === 'brave' ? 'chromium' : 'firefox', 'manifest.json'),
      path.join(dest, 'manifest.json'),
    );
    writeExtensionNativeConfig(dest, origin, token);
    writeInstallNotes(dest, kind);
  }

  return prepared;
}

export function getBrowserExtensionInstallInfo(origin: string) {
  const braveDir = userExtensionDir('brave');
  const firefoxDir = userExtensionDir('firefox');
  return {
    origin,
    chromiumExtensionId: CHROMIUM_EXTENSION_ID,
    firefoxExtensionId: FIREFOX_EXTENSION_ID,
    braveInstalled: Boolean(resolveBraveExecutable()),
    firefoxInstalled: Boolean(resolveFirefoxExecutable()),
    braveDir,
    firefoxDir,
    braveReady: fileExists(path.join(braveDir, 'manifest.json')),
    firefoxReady: fileExists(path.join(firefoxDir, 'manifest.json')),
  };
}

function spawnDetached(command: string, args: string[]) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

export async function openBrowserExtensionFolder(kind: ExternalBrowserKind) {
  const dir = userExtensionDir(kind);
  if (!fileExists(dir)) {
    return { success: false, error: '확장 폴더가 아직 준비되지 않았습니다.' };
  }
  const error = await shell.openPath(dir);
  if (error) {
    log('확장 폴더 열기 실패:', error);
    return { success: false, error };
  }
  return { success: true, dir };
}

export function openExternalBrowser(kind: ExternalBrowserKind, url?: string) {
  const command = kind === 'brave' ? resolveBraveExecutable() : resolveFirefoxExecutable();
  if (!command) {
    return {
      success: false,
      error: kind === 'brave' ? 'Brave를 찾지 못했습니다.' : 'Firefox를 찾지 못했습니다.',
    };
  }
  const target = String(url || '').trim();
  const fallback = kind === 'brave'
    ? 'brave://extensions'
    : 'about:debugging#/runtime/this-firefox';
  spawnDetached(command, [target || fallback]);
  return { success: true };
}

export function createExtensionBridgeToken() {
  return crypto.randomBytes(32).toString('hex');
}
