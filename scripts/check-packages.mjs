import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const toPosix = value => value.split(path.sep).join('/');

async function filesBelow(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesBelow(absolute));
    else out.push(absolute);
  }
  return out;
}

// Reuse the app's runtime manifest parser instead of maintaining a second validator in this script.
const source = await readFile(path.join(root, 'src/packages/manifest.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const parserUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { parsePackageManifest } = await import(parserUrl);
const settingDataSource = await readFile(path.join(root, 'src/packages/settingData.ts'), 'utf8');
const settingDataCompiled = ts.transpileModule(settingDataSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const settingDataUrl = `data:text/javascript;base64,${Buffer.from(settingDataCompiled).toString('base64')}`;
const { parseCalendarProfile, parseEditionLensProfile, parseScaleLadderProfile } = await import(settingDataUrl);

const manifestFiles = (await filesBelow(path.join(root, 'packages'))).filter(file => path.basename(file) === 'package.json').sort();
if (!manifestFiles.length) throw new Error('packages/: нет манифестов');

const packages = new Map();
const contentOwners = new Map();
for (const file of manifestFiles) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const manifest = parsePackageManifest(raw);
  const folderId = path.basename(path.dirname(file));
  if (folderId !== manifest.id) throw new Error(`${toPosix(path.relative(root, file))}: каталог не совпадает с id ${manifest.id}`);
  if (packages.has(manifest.id)) throw new Error(`повторяется пакет ${manifest.id}`);
  packages.set(manifest.id, manifest);

  for (const layer of manifest.layers) {
    const absolute = path.resolve(root, layer.path);
    if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`${manifest.id}/${layer.id}: путь выходит за корень проекта`);
    let info;
    try { info = await stat(absolute); } catch { throw new Error(`${manifest.id}/${layer.id}: файл не найден: ${layer.path}`); }
    if (!info.isFile()) throw new Error(`${manifest.id}/${layer.id}: сейчас требуется точный путь к файлу: ${layer.path}`);
    const repoPath = toPosix(path.relative(root, absolute));
    contentOwners.set(repoPath, [...(contentOwners.get(repoPath) ?? []), `${manifest.id}/${layer.id}`]);
  }
  for (const asset of [...(manifest.maps ?? []), ...(manifest.cleanMaps ?? [])]) {
    try { await stat(path.resolve(root, asset)); } catch { throw new Error(`${manifest.id}: карта из maps не найдена: ${asset}`); }
  }
}

for (const manifest of packages.values()) {
  for (const requirement of manifest.requires ?? []) {
    if (!packages.has(requirement.id)) throw new Error(`${manifest.id}: пакет-зависимость не найден: ${requirement.id}`);
  }
  for (const systemId of manifest.rules?.systems ?? []) {
    if (packages.get(systemId)?.kind !== 'rules') throw new Error(`${manifest.id}: картридж правил не найден или имеет неверный kind: ${systemId}`);
  }
  for (const kind of Object.keys(manifest.kinds ?? {})) {
    if (!manifest.layers.some(layer => layer.kinds.includes(kind))) throw new Error(`${manifest.id}: подпись вида ${kind} не соответствует ни одному слою`);
  }
  if (manifest.kind === 'setting') {
    const readJson = async assetPath => JSON.parse(await readFile(path.resolve(root, assetPath), 'utf8'));
    parseCalendarProfile(await readJson(manifest.time.calendarData), manifest.time.calendar);
    parseEditionLensProfile(await readJson(manifest.time.lensesData), manifest.time.lenses);
    const ladder = parseScaleLadderProfile(await readJson(manifest.ladder), manifest.id);
    const maps = new Set();
    for (const mapPath of manifest.maps ?? []) {
      const map = await readJson(mapPath);
      if (typeof map.id !== 'string' || !map.id) throw new Error(`${manifest.id}: в паспорте карты нет id: ${mapPath}`);
      maps.add(map.id);
    }
    for (const rank of ladder.ranks) if (rank.map && !maps.has(rank.map)) throw new Error(`${manifest.id}: лестница ${rank.id} ссылается на неизвестную карту ${rank.map}`);
    for (const place of ladder.roots) if (place.geo && !maps.has(place.geo.map)) throw new Error(`${manifest.id}: корень ${place.id} ссылается на неизвестную карту ${place.geo.map}`);
  }
}

const index = [...packages.values()].map(manifest => ({
  id: manifest.id,
  kind: manifest.kind,
  ...(manifest.maps ? { maps: manifest.maps } : {}),
  ...(manifest.cleanMaps ? { cleanMaps: manifest.cleanMaps } : {}),
  ...(manifest.ladder ? { ladder: manifest.ladder } : {}),
  ...(manifest.time ? { time: manifest.time } : {}),
  ...(manifest.kinds ? { kinds: manifest.kinds } : {}),
  layers: manifest.layers.map(({ id, path, kinds }) => ({ id, path, kinds })),
  layerPaths: manifest.layers.map(layer => layer.path),
}));
const generated = `// Generated from packages/*/package.json by scripts/check-packages.mjs. Do not edit.\nexport interface PackageLayerIndexEntry {\n  id: string;\n  path: string;\n  kinds: readonly string[];\n}\n\nexport interface PackageIndexEntry {\n  id: string;\n  kind: 'rules' | 'setting' | 'shared' | 'campaign';\n  maps?: readonly string[];\n  cleanMaps?: readonly string[];\n  ladder?: string;\n  time?: { calendar?: string; calendarData?: string; lenses?: string; lensesData?: string };\n  kinds?: Readonly<Record<string, { labelRu: string }>>;\n  layers: readonly PackageLayerIndexEntry[];\n  layerPaths: readonly string[];\n}\n\nexport const PACKAGE_INDEX: readonly PackageIndexEntry[] = ${JSON.stringify(index, null, 2)};\n`;

const contentFiles = (await filesBelow(path.join(root, 'content')))
  .filter(file => path.basename(file) !== '.DS_Store')
  .map(file => toPosix(path.relative(root, file)));
const missing = contentFiles.filter(file => !contentOwners.has(file));
const duplicate = [...contentOwners.entries()].filter(([, owners]) => owners.length !== 1);
if (missing.length || duplicate.length) {
  const details = [
    ...(missing.length ? [`без слоя: ${missing.join(', ')}`] : []),
    ...duplicate.map(([file, owners]) => [`несколько слоёв: ${file} (${owners.join(', ')})`]),
  ].flat();
  throw new Error(details.join('\n'));
}

await writeFile(path.join(root, 'src/packages/index.generated.ts'), generated);

console.log(`Манифесты: ${packages.size}; файлов content/: ${contentFiles.length}; каждый файл назначен ровно одному слою.`);
