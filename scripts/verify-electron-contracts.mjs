import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const rootDir = process.cwd();
const mainDir = path.join(rootDir, 'src', 'main');
const mainPath = path.join(mainDir, 'main.ts');
const preloadPath = path.join(mainDir, 'preload.ts');
const baselinePath = path.join(rootDir, 'docs', 'electron-runtime-baseline.json');

function listMainSourceFiles() {
  const files = [];
  const pending = [mainDir];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (
        entry.name.endsWith('.ts')
        && entry.name !== 'preload.ts'
        && !entry.name.endsWith('.d.ts')
        && !entry.name.endsWith('.test.ts')
      ) {
        files.push(entryPath);
      }
    }
  }
  return files.sort();
}

function parseSource(filePath, scriptKind) {
  return ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function getStaticString(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : null;
}

function getIpcCall(node, objectName) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== objectName) return null;

  const method = node.expression.name.text;
  if (!['handle', 'on', 'invoke', 'send'].includes(method)) return null;
  return {
    method,
    channel: getStaticString(node.arguments[0]) ?? '<dynamic>',
  };
}

function extractMainRegistrations(sourceFile) {
  const registrations = [];
  walk(sourceFile, (node) => {
    const call = getIpcCall(node, 'ipcMain');
    if (call) registrations.push(call);
  });
  return registrations;
}

function getPropertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function findApiObject(sourceFile) {
  let apiObject = null;
  walk(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== 'api') return;
    if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) apiObject = node.initializer;
  });
  return apiObject;
}

function extractPreloadApi(sourceFile) {
  const apiObject = findApiObject(sourceFile);
  if (!apiObject) throw new Error(`Could not find the preload api object in ${preloadPath}`);

  return apiObject.properties
    .map((property) => {
      if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) return null;
      const name = getPropertyName(property.name);
      if (!name) return null;

      const calls = [];
      walk(property, (node) => {
        const call = getIpcCall(node, 'ipcRenderer');
        if (call) calls.push(`${call.method}:${call.channel}`);
      });

      return { name, calls: [...new Set(calls)].sort() };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findDuplicates(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function listRendererUsage() {
  const sourceRoot = path.join(rootDir, 'src');
  const result = new Set();
  const pending = [sourceRoot];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(entryPath, 'utf8');
        for (const match of source.matchAll(/electronAPI(?:\?\.|\.|\s+as\s+any\)\.)\s*([A-Za-z_$][\w$]*)/g)) {
          result.add(match[1]);
        }
      }
    }
  }

  return [...result].sort();
}

function listRendererSendChannels() {
  const sourceRoot = path.join(rootDir, 'src');
  const result = new Set();
  const pending = [sourceRoot];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = fs.readFileSync(entryPath, 'utf8');
        for (const match of source.matchAll(/electronAPI(?:\?\.|\.)send\(\s*['"]([^'"]+)['"]/g)) {
          result.add(match[1]);
        }
      }
    }
  }

  return [...result].sort();
}

function buildActualContract() {
  const preloadSource = parseSource(preloadPath, ts.ScriptKind.TS);
  const mainRegistrations = listMainSourceFiles().flatMap((filePath) => (
    extractMainRegistrations(parseSource(filePath, ts.ScriptKind.TS))
  ));
  const preloadApi = extractPreloadApi(preloadSource);
  const handlers = mainRegistrations.filter(({ method }) => method === 'handle').map(({ channel }) => channel);
  const onChannels = mainRegistrations.filter(({ method }) => method === 'on').map(({ channel }) => channel);
  const preloadInvokeChannels = preloadApi
    .flatMap(({ calls }) => calls)
    .filter((call) => call.startsWith('invoke:'))
    .map((call) => call.slice('invoke:'.length));

  return {
    main: {
      source: 'src/main/main.ts',
      entry: 'dist-electron-app/main.js',
      handlers: [...new Set(handlers)].sort(),
      onChannels: [...new Set(onChannels)].sort(),
      duplicateHandlers: findDuplicates(handlers),
    },
    preload: {
      source: 'src/main/preload.ts',
      output: 'dist-electron-app/preload.js',
      browserWindowPath: "path.join(electronDistDir, 'preload.js')",
      api: preloadApi,
    },
    ipcAudit: {
      preloadWithoutMainHandler: [...new Set(preloadInvokeChannels)]
        .filter((channel) => !handlers.includes(channel))
        .sort(),
      mainHandlerWithoutPreload: [...new Set(handlers)]
        .filter((channel) => !preloadInvokeChannels.includes(channel))
        .sort(),
    },
    rendererApiUsage: listRendererUsage(),
    rendererSendChannels: listRendererSendChannels(),
  };
}

function collectMainSources() {
  return listMainSourceFiles().map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
}

function assertRuntimeTopology(actual) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const mainSource = fs.readFileSync(mainPath, 'utf8');
  const allMainSources = collectMainSources();
  const viteSource = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf8');
  const mainTsconfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.main.json'), 'utf8'));
  const packagedFiles = packageJson.build?.files ?? [];
  const errors = [];

  if (packageJson.main !== actual.main.entry) errors.push(`package.json main is ${packageJson.main}`);
  if (packageJson.build?.directories?.output !== 'release') errors.push('electron-builder output is not release');
  if (!packagedFiles.includes('dist-electron-app/main.js')) errors.push('compiled main is not packaged');
  if (!packagedFiles.includes('dist-electron-app/preload.js')) errors.push('compiled preload is not packaged');
  if (!packagedFiles.includes('dist-electron-app/**/*.js')) errors.push('compiled main-process modules are not packaged');
  if (packagedFiles.includes('electron/main.js')) errors.push('legacy JavaScript main is still packaged');
  if (fs.existsSync(path.join(rootDir, 'electron', 'main.js'))) errors.push('legacy JavaScript main file still exists');
  if (mainSource.includes('@ts-nocheck')) errors.push('canonical main still disables TypeScript checking');
  if (/\brequire\s*\(/.test(allMainSources)) errors.push('main-process TypeScript still uses CommonJS require');
  const electronDevScript = packageJson.scripts?.['electron:dev'] ?? '';
  const electronLaunchCount = (electronDevScript.match(/electron\s+\./g) ?? []).length;
  if (electronLaunchCount !== 1) errors.push(`electron:dev launches Electron ${electronLaunchCount} times`);
  if (electronDevScript.includes('5173')) errors.push('electron:dev still waits for port 5173');
  if ((electronDevScript.match(/build:electron/g) ?? []).length !== 1) errors.push('electron:dev does not build Electron sources exactly once');
  if (packageJson.scripts?.dev !== 'vite') errors.push('npm run dev has responsibilities other than the renderer server');
  if (packageJson.scripts?.['build:main'] !== 'tsc --project tsconfig.main.json') errors.push('build:main does not compile the canonical TypeScript main');
  if (packageJson.scripts?.['build:electron'] !== 'npm run clean:electron && npm run build:main && npm run build:preload') errors.push('Electron clean/main/preload build order differs from baseline');
  if (mainTsconfig.compilerOptions?.outDir !== 'dist-electron-app') errors.push('TypeScript main output differs from baseline');
  if (mainTsconfig.compilerOptions?.rootDir !== 'src/main') errors.push('TypeScript main root differs from baseline');
  if (!(mainTsconfig.include ?? []).some((pattern) => pattern.includes('src/main/'))) errors.push('TypeScript main include does not cover domain modules');
  if (!allMainSources.includes(actual.preload.browserWindowPath)) errors.push('BrowserWindow preload path differs from baseline');
  if (!viteSource.includes("outDir: 'dist-electron-app'")) errors.push('preload build output differs from baseline');
  if (!viteSource.includes('strictPort: true')) errors.push('Vite development server is not pinned to port 5174');
  if (viteSource.includes('vite-plugin-electron')) errors.push('vite-plugin-electron still owns Electron startup/build');
  if (/require\(['"]\.\.\/dist\//.test(allMainSources) || /from ['"]\.\.\/dist\//.test(allMainSources)) {
    errors.push('active main has a runtime dependency on renderer output');
  }
  if (actual.main.duplicateHandlers.length > 0) errors.push('duplicate ipcMain.handle registrations detected');
  if (actual.rendererSendChannels.some((channel) => channel !== 'window-control')) errors.push('renderer uses a non-allowlisted send channel');

  const requiredPackagingExclusions = [
    '!resources/save',
    '!resources/save/**',
    '!save',
    '!save/**',
    '!**/*.db',
    '!**/*.db-wal',
    '!**/*.db-shm',
  ];
  for (const pattern of requiredPackagingExclusions) {
    if (!packagedFiles.includes(pattern)) {
      errors.push(`packaged files must exclude ${pattern}`);
    }
  }
  if (packagedFiles.some((pattern) => !pattern.startsWith('!') && /(^|\/)save(\/|$)/.test(String(pattern).replace(/\\/g, '/')))) {
    errors.push('packaged files must not include a save directory');
  }
  if (packageJson.build?.nsis?.deleteAppDataOnUninstall !== false) {
    errors.push('NSIS installer must keep AppData on uninstall');
  }

  const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  if (!gitignore.includes('save/') || !gitignore.includes('*.db')) {
    errors.push('gitignore must ignore user save/ and database files');
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function buildBaselineSummary(actual) {
  return {
    main: {
      source: actual.main.source,
      entry: actual.main.entry,
      handlerCount: actual.main.handlers.length,
      handlersSha256: fingerprint(actual.main.handlers),
      onChannels: actual.main.onChannels,
      duplicateHandlers: actual.main.duplicateHandlers,
    },
    preload: {
      source: actual.preload.source,
      output: actual.preload.output,
      browserWindowPath: actual.preload.browserWindowPath,
      apiCount: actual.preload.api.length,
      apiAndChannelsSha256: fingerprint(actual.preload.api),
    },
    ipcAudit: actual.ipcAudit,
    rendererApiUsageCount: actual.rendererApiUsage.length,
    rendererApiUsageSha256: fingerprint(actual.rendererApiUsage),
    rendererSendChannels: actual.rendererSendChannels,
  };
}

const actual = buildActualContract();
assertRuntimeTopology(actual);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(actual, null, 2)}\n`);
  process.exit(0);
}

if (process.argv.includes('--summary')) {
  process.stdout.write(`${JSON.stringify(buildBaselineSummary(actual), null, 2)}\n`);
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const summary = buildBaselineSummary(actual);
if (JSON.stringify(summary) !== JSON.stringify(expected)) {
  console.error('Electron runtime contract differs from docs/electron-runtime-baseline.json.');
  console.error('Run `npm run verify:electron-contracts -- --json` and review the change.');
  process.exit(1);
}

console.log(`Electron runtime contract verified: ${actual.main.handlers.length} handlers, ${actual.preload.api.length} preload APIs.`);
