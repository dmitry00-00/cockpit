#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { REPOSITORY_ROOT, settingImportPlan, validateSettingImportProfile } from './setting-import-plan.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROFILE = resolve(REPOSITORY_ROOT, 'packages/fr/import-profile.json');
const CONTENT_ENV = 'DM_COCKPIT_CONTENT_ROOT';

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function parseArgs(argv) {
  const positional = [];
  const inputs = new Map();
  let output;
  let python = process.env.PYTHON ?? 'python3';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--output' || arg === '--python' || arg === '--input') {
      const value = argv[++i];
      if (!value) throw new Error(`${arg}: требуется значение`);
      if (arg === '--output') output = value;
      else if (arg === '--python') python = value;
      else {
        const equals = value.indexOf('=');
        if (equals < 1 || equals === value.length - 1) throw new Error('--input: формат <artifactId>=<путь>');
        const id = value.slice(0, equals);
        if (inputs.has(id)) throw new Error(`--input: повторный артефакт ${id}`);
        inputs.set(id, value.slice(equals + 1));
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`неизвестный параметр ${arg}`);
    } else positional.push(arg);
  }
  if (positional.length > 1) throw new Error('укажите не более одного файла профиля');
  return { profilePath: resolve(positional[0] ?? DEFAULT_PROFILE), output, inputs, python };
}

function help() {
  return [
    'Изолированный запуск конвейера сборки пакета сеттинга.',
    '',
    'Использование:',
    '  node scripts/setting-import-run.mjs [profile.json] --output <новая-папка-пакета> --input dump=<локальный-дамп.xml>',
    '  node scripts/setting-import-run.mjs packages/fr/import-profile.json --output /tmp/fr-package --input dump=<dump.xml> --input gisPackage=<toril.gpkg>',
    '',
    'Папка результата должна быть новой или пустой и находиться за пределами checkout проекта.',
    'Необязательные входы профиля можно опустить; каждый этап применит объявленный безопасный fallback.',
    'Выходы каждого этапа сверяются с writes и alsoWrites профиля.',
  ].join('\n');
}

async function assertNoSymlinks(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`символическая ссылка не допускается: ${path}`);
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) await assertNoSymlinks(join(path, entry));
  }
}

async function projectPath(projectRelativePath) {
  const root = await realpath(REPOSITORY_ROOT);
  const candidate = resolve(root, projectRelativePath);
  if (!inside(root, candidate)) throw new Error(`путь выходит за каталог проекта: ${projectRelativePath}`);
  let current = root;
  for (const part of relative(root, candidate).split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`символическая ссылка не допускается: ${current}`);
  }
  const canonical = await realpath(candidate);
  if (!inside(root, canonical)) throw new Error(`путь разрешается за каталог проекта: ${projectRelativePath}`);
  return canonical;
}

async function ensureSafeOutput(pathValue) {
  if (!pathValue) throw new Error('нужен --output <новая-папка>');
  const requested = resolve(pathValue);
  const projectRoot = await realpath(REPOSITORY_ROOT);

  // Check the nearest existing ancestor first. This rejects an output nested
  // in the checkout without creating any of its missing directories.
  let existingParent = dirname(requested);
  while (true) {
    try {
      const info = await stat(existingParent);
      if (!info.isDirectory()) throw new Error(`родитель результата не является папкой: ${existingParent}`);
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const next = dirname(existingParent);
      if (next === existingParent) throw error;
      existingParent = next;
    }
  }
  const canonicalAncestor = await realpath(existingParent);
  const missingParent = relative(existingParent, dirname(requested));
  const prospectiveTarget = resolve(canonicalAncestor, missingParent, basename(requested));
  if (inside(projectRoot, prospectiveTarget)) throw new Error('папка результата должна находиться за пределами checkout проекта');

  await mkdir(dirname(requested), { recursive: true });
  const parent = await realpath(dirname(requested));
  const target = resolve(parent, basename(requested));
  if (inside(projectRoot, target)) throw new Error('папка результата должна находиться за пределами checkout проекта');
  try {
    const current = await lstat(target);
    if (current.isSymbolicLink()) throw new Error(`папка результата не должна быть ссылкой: ${target}`);
    if (!current.isDirectory()) throw new Error(`путь результата не является папкой: ${target}`);
    if ((await readdir(target)).length) throw new Error(`папка результата должна быть пустой: ${target}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(target);
  }
  const canonicalTarget = await realpath(target);
  if (inside(projectRoot, canonicalTarget)) throw new Error('папка результата разрешается внутрь checkout проекта');
  return canonicalTarget;
}

function contentRelativePath(artifactPath, label) {
  if (!artifactPath.startsWith('content/')) throw new Error(`${label}: runner поддерживает пакетные слои только под content/`);
  return artifactPath.slice('content/'.length);
}

function artifactPath(profile, artifactId, { outputRoot, scratchRoot, inputs }) {
  const artifact = profile.artifacts[artifactId];
  if (!artifact) throw new Error(`неизвестный артефакт ${artifactId}`);
  if (artifact.kind === 'external-input') {
    const supplied = inputs.get(artifactId);
    if (!supplied) return null;
    return resolve(supplied);
  }
  if (artifact.kind === 'temporary-output') return join(scratchRoot, `${artifactId}.tmp`);
  if (artifact.kind === 'package-layer') {
    contentRelativePath(artifact.path, artifactId);
    return join(outputRoot, artifact.path);
  }
  if (artifact.kind === 'existing-layer') {
    if (artifact.path.startsWith('content/')) return join(outputRoot, artifact.path);
    return resolve(REPOSITORY_ROOT, artifact.path);
  }
  throw new Error(`${artifactId}: неизвестный тип артефакта ${artifact.kind}`);
}

async function validateExistingLayers(profile) {
  const sources = new Map();
  const contentRoot = await projectPath('content');
  await assertNoSymlinks(contentRoot);
  sources.set('content', contentRoot);
  sources.set('package-manifest', await projectPath(profile.packageManifest));
  for (const [id, artifact] of Object.entries(profile.artifacts)) {
    if (artifact.kind !== 'existing-layer') continue;
    const source = await projectPath(artifact.path);
    await assertNoSymlinks(source);
    const info = await stat(source);
    if (!info.isFile() && !info.isDirectory()) throw new Error(`${id}: неподдерживаемый тип исходного слоя ${source}`);
    if (!artifact.path.startsWith('content/')) sources.set(id, source);
  }
  return sources;
}

async function copyExistingLayers(profile, outputRoot, sources) {
  for (const [id, artifact] of Object.entries(profile.artifacts)) {
    if (artifact.kind !== 'existing-layer' || !artifact.path.startsWith('content/')) continue;
    const source = sources.get('content') ? await projectPath(artifact.path) : null;
    if (!source) throw new Error(`${id}: отсутствует проверенный исходный слой`);
    const target = join(outputRoot, artifact.path);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, errorOnExist: true, force: false });
  }
}

async function validateInputs(profile, inputs) {
  for (const id of inputs.keys()) {
    const artifact = profile.artifacts[id];
    if (!artifact || artifact.kind !== 'external-input') throw new Error(`--input ${id}: нужен зарегистрированный external-input`);
  }
  for (const [id, artifact] of Object.entries(profile.artifacts)) {
    if (artifact.kind !== 'external-input') continue;
    const supplied = inputs.get(id);
    if (!supplied) {
      if (!artifact.optional) throw new Error(`не задан обязательный вход --input ${id}=<путь>`);
      continue;
    }
    const path = resolve(supplied);
    const canonicalPath = await realpath(path).catch(() => null);
    if (!canonicalPath) throw new Error(`${id}: входной файл не найден: ${path}`);
    const info = await stat(canonicalPath).catch(() => null);
    if (!info?.isFile()) throw new Error(`${id}: входной путь должен быть файлом: ${path}`);
    if (artifact.outsideRepository) {
      const repositoryRoot = await realpath(REPOSITORY_ROOT);
      if (inside(repositoryRoot, path) || inside(repositoryRoot, canonicalPath)) {
        throw new Error(`${id}: вход должен находиться за пределами checkout: ${path}`);
      }
    }
    inputs.set(id, canonicalPath);
  }
}

async function snapshot(root) {
  // Directory entries are recorded as well as file digests so empty undeclared
  // folders cannot bypass a stage's writes/alsoWrites contract.
  const files = new Map();
  async function walk(path, relativePath = '') {
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`этап создал символическую ссылку: ${path}`);
    if (info.isDirectory()) {
      if (relativePath) files.set(relativePath, 'directory');
      for (const name of await readdir(path)) await walk(join(path, name), relativePath ? `${relativePath}/${name}` : name);
    } else if (info.isFile()) {
      files.set(relativePath || '.', await sha256File(path));
    } else throw new Error(`этап создал неподдерживаемый объект: ${path}`);
  }
  await walk(root);
  return files;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function externalInputMetadata(inputs) {
  const metadata = new Map();
  for (const [id, expectedPath] of inputs) {
    const linkInfo = await lstat(expectedPath).catch(() => null);
    if (!linkInfo || linkInfo.isSymbolicLink() || !linkInfo.isFile()) {
      throw new Error(`${id}: внешний вход исчез, стал ссылкой или перестал быть обычным файлом: ${expectedPath}`);
    }
    const canonicalPath = await realpath(expectedPath).catch(() => null);
    if (canonicalPath !== expectedPath) throw new Error(`${id}: внешний вход разрешается по другому пути: ${expectedPath}`);
    const info = await stat(canonicalPath);
    metadata.set(id, {
      path: canonicalPath,
      device: String(info.dev),
      inode: String(info.ino),
      links: info.nlink,
      mode: info.mode,
      size: String(info.size),
      modified: info.mtimeMs,
      changed: info.ctimeMs,
    });
  }
  return metadata;
}

function externalInputMetadataRecord(path, info) {
  return {
    path,
    device: String(info.dev),
    inode: String(info.ino),
    links: info.nlink,
    mode: info.mode,
    size: String(info.size),
    modified: info.mtimeMs,
    changed: info.ctimeMs,
  };
}

function sameExternalInputMetadata(actual, expected) {
  return actual.path === expected.path
    && actual.device === expected.device
    && actual.inode === expected.inode
    && actual.links === expected.links
    && actual.mode === expected.mode
    && actual.size === expected.size
    && actual.modified === expected.modified
    && actual.changed === expected.changed;
}

async function hashPinnedExternalInput(id, path, expectedMetadata) {
  const linkInfo = await lstat(path).catch(() => null);
  if (!linkInfo || linkInfo.isSymbolicLink() || !linkInfo.isFile()) {
    throw new Error(`${id}: внешний вход не является обычным файлом: ${path}`);
  }
  const canonicalPath = await realpath(path).catch(() => null);
  if (canonicalPath !== path) throw new Error(`${id}: внешний вход разрешается по другому пути: ${path}`);

  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await open(path, fsConstants.O_RDONLY | noFollow);
  try {
    const openedMetadata = externalInputMetadataRecord(path, await handle.stat());
    if (!sameExternalInputMetadata(openedMetadata, expectedMetadata)) {
      throw new Error(`${id}: внешний вход изменился между проверкой и открытием: ${path}`);
    }

    const hash = createHash('sha256');
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) hash.update(chunk);

    const afterReadMetadata = externalInputMetadataRecord(path, await handle.stat());
    if (!sameExternalInputMetadata(afterReadMetadata, expectedMetadata)) {
      throw new Error(`${id}: внешний вход изменился во время хэширования: ${path}`);
    }
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

async function externalInputHashes(inputs, expectedMetadata) {
  const hashes = new Map();
  for (const [id, path] of inputs) {
    hashes.set(id, await hashPinnedExternalInput(id, path, expectedMetadata.get(id)));
  }
  return hashes;
}

function changedExternalInputMetadata(expected, actual) {
  return [...expected.keys()].filter(id => JSON.stringify(expected.get(id)) !== JSON.stringify(actual.get(id)));
}

async function assertExternalInputMetadata(inputs, expected, stageId, phase) {
  let actual;
  try {
    actual = await externalInputMetadata(inputs);
  } catch (error) {
    throw new Error(`${stageId}: не удалось проверить внешние входы ${phase}: ${error.message}`);
  }
  const changed = changedExternalInputMetadata(expected, actual);
  if (changed.length) throw new Error(`${stageId}: изменились метаданные внешних входов ${phase}: ${changed.join(', ')}`);
}

function combineRunErrors(primary, additional) {
  if (!primary) return additional;
  return new Error(`${additional.message}; также возникла ошибка: ${primary.message}`);
}

async function snapshotReadOnlySources(sources) {
  const combined = new Map();
  for (const [label, path] of sources) {
    for (const [relativePath, digest] of await snapshot(path)) {
      combined.set(`${label}/${relativePath}`, digest);
    }
  }
  return combined;
}

function changedFiles(before, after) {
  const changed = new Set();
  for (const [path, digest] of before) if (after.get(path) !== digest) changed.add(path);
  for (const path of after.keys()) if (!before.has(path)) changed.add(path);
  return [...changed].sort();
}

function declaredOutputPaths(profile, stage) {
  const paths = [];
  for (const id of stage.writes) {
    const artifact = profile.artifacts[id];
    if (artifact.kind === 'package-layer') paths.push(artifact.path);
  }
  for (const projectPath of stage.alsoWrites ?? []) {
    contentRelativePath(projectPath, `${stage.id}.alsoWrites`);
    paths.push(projectPath);
  }
  return paths;
}

function declaredScratchOutputPaths(profile, stage, artifactPaths, scratchRoot) {
  const relativePaths = [];
  for (const id of stage.writes) {
    if (profile.artifacts[id].kind !== 'temporary-output') continue;
    const output = artifactPaths.get(id);
    const rel = relative(scratchRoot, output);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new Error(`${stage.id}: временный выход выходит за scratch root (${id})`);
    }
    relativePaths.push(rel.split(sep).join('/'));
  }
  return relativePaths;
}

function matchesOutput(path, allowed, isDirectory = false) {
  return allowed.some(base => path === base
    || path.startsWith(`${base}/`)
    || (isDirectory && base.startsWith(`${path}/`)));
}

function resolveArguments(args, profile, paths) {
  return args.map(argument => argument.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_match, id) => {
    const value = paths.get(id);
    if (!value) throw new Error(`не задан путь артефакта {${id}}`);
    return value;
  }));
}

async function runStage({ profile, stage, outputRoot, scratchRoot, inputs, python, readOnlySources, externalInputMetadataBaseline }) {
  const paths = new Map(Object.keys(profile.artifacts).map(id => [id, artifactPath(profile, id, { outputRoot, scratchRoot, inputs })]));
  const args = resolveArguments(stage.args, profile, paths);
  for (const binding of stage.optionalInputs ?? []) {
    const value = paths.get(binding.artifact);
    if (value) args.push(binding.flag, value);
    else args.push(...binding.fallback);
  }
  const contentRoot = join(outputRoot, 'content');
  if (stage.contentRoot) args.push('--content-root', contentRoot);

  const script = await projectPath(stage.script);
  const isPython = script.endsWith('.py');
  const command = isPython ? python : process.execPath;
  const commandArgs = isPython ? ['-I', script, ...args] : [script, ...args];
  const before = await snapshot(outputRoot);
  const beforeScratch = await snapshot(scratchRoot);
  const readOnlyBefore = await snapshotReadOnlySources(readOnlySources);
  await assertExternalInputMetadata(inputs, externalInputMetadataBaseline, stage.id, 'перед этапом');
  process.stdout.write(`\n[${stage.id}] ${stage.script}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: scratchRoot,
    stdio: 'inherit',
    env: { ...process.env, [CONTENT_ENV]: contentRoot },
  });
  let externalInputError = null;
  try {
    await assertExternalInputMetadata(inputs, externalInputMetadataBaseline, stage.id, 'после этапа');
  } catch (error) {
    externalInputError = error;
  }
  const readOnlyAfter = await snapshotReadOnlySources(readOnlySources);
  const sourceChanges = changedFiles(readOnlyBefore, readOnlyAfter);
  if (sourceChanges.length) throw new Error(`${stage.id}: изменены исходные слои, объявленные только для чтения: ${sourceChanges.join(', ')}`);
  const after = await snapshot(outputRoot);
  const afterScratch = await snapshot(scratchRoot);
  const changes = changedFiles(before, after);
  const scratchChanges = changedFiles(beforeScratch, afterScratch);
  const allowed = declaredOutputPaths(profile, stage);
  const allowedScratch = declaredScratchOutputPaths(profile, stage, scratchRoot);
  const unexpected = changes.filter(path => {
    const entryType = after.get(path) ?? before.get(path);
    return !matchesOutput(path, allowed, entryType === 'directory');
  });
  if (unexpected.length) throw new Error(`${stage.id}: изменены не объявленные выходы: ${unexpected.join(', ')}`);
  const unexpectedScratch = scratchChanges.filter(path => !allowedScratch.includes(path));
  if (unexpectedScratch.length) throw new Error(`${stage.id}: изменены не объявленные временные выходы: ${unexpectedScratch.join(', ')}`);
  const stageError = result.error ?? (result.status !== 0 ? new Error(`${stage.id}: процесс завершился с кодом ${result.status ?? 'неизвестно'}`) : null);
  if (stageError && externalInputError) throw combineRunErrors(stageError, externalInputError);
  if (stageError) throw stageError;
  if (externalInputError) throw externalInputError;
  for (const id of stage.writes) {
    const artifact = profile.artifacts[id];
    if (!['package-layer', 'temporary-output'].includes(artifact.kind)) continue;
    const output = paths.get(id);
    const info = await lstat(output).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isFile()) throw new Error(`${stage.id}: не создан заявленный файловый выход ${artifact.path}`);
  }
  process.stdout.write(`[${stage.id}] проверено выходов: пакет=${changes.length}, временные=${scratchChanges.length}\n`);
}

async function copyPackageManifest(profile, outputRoot) {
  const source = await projectPath(profile.packageManifest);
  const manifest = JSON.parse(await readFile(source, 'utf8'));
  if (manifest.id !== profile.id) throw new Error(`манифест пакета ${profile.packageManifest} не совпадает с профилем ${profile.id}`);
  await cp(source, join(outputRoot, 'package.json'), { errorOnExist: true, force: false });
}

async function validatePackageOutput(profile, outputRoot) {
  const manifest = JSON.parse(await readFile(join(outputRoot, 'package.json'), 'utf8'));
  if (manifest.id !== profile.id || !Array.isArray(manifest.layers) || manifest.layers.length === 0) {
    throw new Error('манифест собранного пакета повреждён или не совпадает с профилем');
  }
  for (const layer of manifest.layers) {
    if (typeof layer.path !== 'string' || !layer.path.startsWith('content/')) {
      throw new Error(`слой пакета должен находиться внутри content/: ${String(layer.path)}`);
    }
    const target = resolve(outputRoot, layer.path);
    if (!inside(outputRoot, target)) throw new Error(`слой выходит за корень пакета: ${layer.path}`);
    const info = await lstat(target).catch(() => null);
    if (!info) throw new Error(`слой манифеста отсутствует в пакете: ${layer.path}`);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error(`слой манифеста должен быть обычным файлом: ${layer.path}`);
  }
  const contentRoot = join(outputRoot, 'content');
  const files = await snapshot(contentRoot);
  const declaredLayers = manifest.layers.map(layer => layer.path.replaceAll('\\', '/'));
  for (const [relativePath, entryType] of files) {
    const packagePath = `content/${relativePath.replaceAll(sep, '/')}`;
    const covered = declaredLayers.some(layerPath => packagePath === layerPath
      || packagePath.startsWith(`${layerPath}/`)
      || (entryType === 'directory' && layerPath.startsWith(`${packagePath}/`)));
    if (!covered) {
      throw new Error(`путь content/ не описан в манифесте пакета: ${packagePath}`);
    }
  }
  const entries = await readdir(outputRoot);
  if (entries.some(entry => entry !== 'content' && entry !== 'package.json')) {
    throw new Error('папка пакета содержит неожиданные корневые файлы');
  }
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const profile = JSON.parse(await readFile(options.profilePath, 'utf8'));
  validateSettingImportProfile(profile);
  const plan = settingImportPlan(profile);
  await validateInputs(profile, options.inputs);
  const externalInputMetadataBaseline = await externalInputMetadata(options.inputs);
  const externalInputHashesBaseline = await externalInputHashes(options.inputs, externalInputMetadataBaseline);
  await assertExternalInputMetadata(options.inputs, externalInputMetadataBaseline, 'run-start', 'после начального хэширования');
  let outputRoot = null;
  let scratchRoot = null;
  let runError = null;
  try {
    const readOnlySources = await validateExistingLayers(profile);
    outputRoot = await ensureSafeOutput(options.output);
    await copyPackageManifest(profile, outputRoot);
    await copyExistingLayers(profile, outputRoot, readOnlySources);
    scratchRoot = await mkdtemp(join(tmpdir(), `setting-import-${profile.id}-`));
    for (const stage of plan) {
      await runStage({ profile, stage, outputRoot, scratchRoot, inputs: options.inputs, python: options.python, readOnlySources, externalInputMetadataBaseline });
    }
    await validatePackageOutput(profile, outputRoot);
  } catch (error) {
    runError = error;
  } finally {
    try {
      await assertExternalInputMetadata(options.inputs, externalInputMetadataBaseline, 'run-final', 'в конце запуска');
    } catch (error) {
      runError = combineRunErrors(runError, error);
    }
    try {
      const externalInputHashesAfterRun = await externalInputHashes(options.inputs, externalInputMetadataBaseline);
      const changed = [...externalInputHashesBaseline.keys()].filter(id => externalInputHashesBaseline.get(id) !== externalInputHashesAfterRun.get(id));
      if (changed.length) runError = combineRunErrors(runError, new Error(`изменилось содержимое внешних входов после запуска: ${changed.join(', ')}`));
    } catch (error) {
      runError = combineRunErrors(runError, new Error(`не удалось проверить содержимое внешних входов после запуска: ${error.message}`));
    }
    if (scratchRoot) {
      try {
        await rm(scratchRoot, { recursive: true, force: true });
      } catch (error) {
        runError = combineRunErrors(runError, error);
      }
    }
  }
  if (runError) throw runError;
  process.stdout.write(`\nГотово: пакет ${profile.id} собран в ${outputRoot}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
