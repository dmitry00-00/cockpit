#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTIFACT_ID = /^[A-Za-z][A-Za-z0-9]*$/;
const DISTRIBUTIONS = new Set(['open', 'table', 'internal']);

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}: ожидается непустая строка`);
}

function requireStringList(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${label}: ожидается список непустых строк`);
  }
}

function requireRelativeOutputPath(value, label, root) {
  requireString(value, label);
  const portable = value.replaceAll('\\', '/');
  const parts = portable.split('/');
  if (portable.startsWith('/') || /^[A-Za-z]:/.test(portable) || parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`${label}: ожидается относительный путь внутри проекта`);
  }
  const resolved = resolve(root, portable);
  const withinRoot = relative(root, resolved);
  if (withinRoot === '..' || withinRoot.startsWith(`..${sep}`) || isAbsolute(withinRoot)) {
    throw new Error(`${label}: ожидается относительный путь внутри проекта`);
  }
  return portable;
}

function requireArtifactPath(value, label, id, kind, root) {
  if (['external-input', 'temporary-output'].includes(kind)) {
    if (value !== `{${id}}`) throw new Error(`${label}: внешний путь должен быть параметром {${id}}`);
    return null;
  }
  if (/\{[^{}]*\}/.test(value)) throw new Error(`${label}: путь внутреннего артефакта не может содержать параметр`);
  return requireRelativeOutputPath(value, label, root);
}

function requireProfilePathReference(value, label, artifacts, root) {
  requireString(value, label);
  const match = /^\{([A-Za-z][A-Za-z0-9]*)\}$/.exec(value);
  if (match) {
    const artifact = artifacts[match[1]];
    if (!artifact || artifact.path !== value || !['external-input', 'temporary-output'].includes(artifact.kind)) {
      throw new Error(`${label}: неизвестный или несовместимый параметр ${value}`);
    }
    return value;
  }
  if (/\{[^{}]*\}/.test(value)) throw new Error(`${label}: допустим только отдельный параметр {artifactId}`);
  return requireRelativeOutputPath(value, label, root);
}

/** Validate a declarative setting import profile and its dependency graph. This never runs importers. */
export function validateSettingImportProfile(profile, { root = REPOSITORY_ROOT } = {}) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('profile: ожидается объект');
  if (profile.format !== 1) throw new Error(`profile.format: неподдерживаемый формат ${String(profile.format)}`);
  requireString(profile.id, 'profile.id');
  if (!ID.test(profile.id)) throw new Error('profile.id: допустимы строчные латинские буквы, цифры и дефис');
  requireString(profile.title, 'profile.title');
  const packageManifestPath = requireRelativeOutputPath(profile.packageManifest, 'profile.packageManifest', root);
  const packageManifestFile = resolve(root, packageManifestPath);
  if (!existsSync(packageManifestFile)) throw new Error(`profile.packageManifest: файл не найден: ${packageManifestPath}`);
  const packageManifest = JSON.parse(readFileSync(packageManifestFile, 'utf8'));
  if (packageManifest.id !== profile.id || !Array.isArray(packageManifest.layers) || packageManifest.layers.length === 0) {
    throw new Error('profile.packageManifest: манифест должен иметь совпадающий id и непустой layers[]');
  }
  const packageLayerIds = new Set();
  const packageLayerPaths = new Set();
  for (const [index, layer] of packageManifest.layers.entries()) {
    const at = `profile.packageManifest.layers[${index}]`;
    requireString(layer?.id, `${at}.id`);
    if (packageLayerIds.has(layer.id)) throw new Error(`${at}.id: повторяется ${layer.id}`);
    packageLayerIds.add(layer.id);
    const path = requireRelativeOutputPath(layer.path, `${at}.path`, root);
    if (!path.startsWith('content/')) throw new Error(`${at}.path: слой пакета должен находиться внутри content/`);
    if (packageLayerPaths.has(path)) throw new Error(`${at}.path: повторяется ${path}`);
    packageLayerPaths.add(path);
  }

  const wiki = profile.sources?.wiki;
  if (!wiki || typeof wiki !== 'object') throw new Error('profile.sources.wiki: нужен паспорт источника');
  for (const key of ['id', 'url', 'dumpId', 'license', 'rightsHolder', 'attribution', 'policy']) {
    requireString(wiki[key], `profile.sources.wiki.${key}`);
  }
  if (!DISTRIBUTIONS.has(wiki.distribution)) throw new Error('profile.sources.wiki.distribution: недопустимое значение');
  if (typeof wiki.allowInternalExtraction !== 'boolean') throw new Error('profile.sources.wiki.allowInternalExtraction: ожидается boolean');

  const maps = profile.fieldMaps;
  if (!maps || typeof maps !== 'object' || Array.isArray(maps) || Object.keys(maps).length === 0) {
    throw new Error('profile.fieldMaps: нужна карта полей');
  }
  const fieldMapOutputs = [];
  for (const [name, map] of Object.entries(maps)) {
    requireString(map?.targetKind, `profile.fieldMaps.${name}.targetKind`);
    requireString(map?.importer, `profile.fieldMaps.${name}.importer`);
    requireStringList(map?.templates ?? (map?.yearArticle ? [map.yearArticle] : null), `profile.fieldMaps.${name}.templates/yearArticle`);
    if (map.fields !== undefined) requireStringList(map.fields, `profile.fieldMaps.${name}.fields`);
    if (map.relations !== undefined) requireStringList(map.relations, `profile.fieldMaps.${name}.relations`);
    const importerPath = requireRelativeOutputPath(map.importer, `profile.fieldMaps.${name}.importer`, root);
    if (!existsSync(resolve(root, importerPath))) throw new Error(`profile.fieldMaps.${name}.importer: файл не найден: ${map.importer}`);
  }
  const calendar = profile.calendar;
  if (!calendar || typeof calendar !== 'object') throw new Error('profile.calendar: нужна календарная привязка');
  for (const key of ['id', 'importer', 'sourceArticle', 'implementation']) requireString(calendar[key], `profile.calendar.${key}`);
  requireStringList(calendar.months, 'profile.calendar.months');
  requireStringList(calendar.intercalaryDays, 'profile.calendar.intercalaryDays');
  requireStringList(profile.limitations, 'profile.limitations');

  if (!profile.artifacts || typeof profile.artifacts !== 'object' || Array.isArray(profile.artifacts)) {
    throw new Error('profile.artifacts: ожидается реестр артефактов');
  }
  const normalizedArtifactPaths = new Map();
  for (const [id, artifact] of Object.entries(profile.artifacts)) {
    if (!ARTIFACT_ID.test(id)) throw new Error(`profile.artifacts.${id}: недопустимый идентификатор`);
    if (!['external-input', 'temporary-output', 'existing-layer', 'package-layer'].includes(artifact?.kind)) {
      throw new Error(`profile.artifacts.${id}.kind: неизвестный тип`);
    }
    requireString(artifact.path, `profile.artifacts.${id}.path`);
    if (artifact.optional !== undefined && typeof artifact.optional !== 'boolean') {
      throw new Error(`profile.artifacts.${id}.optional: ожидается boolean`);
    }
    if (artifact.outsideRepository !== undefined && typeof artifact.outsideRepository !== 'boolean') {
      throw new Error(`profile.artifacts.${id}.outsideRepository: ожидается boolean`);
    }
    if (artifact.optional && artifact.kind !== 'external-input') {
      throw new Error(`profile.artifacts.${id}.optional: допустимо только для external-input`);
    }
    if (artifact.outsideRepository && artifact.kind !== 'external-input') {
      throw new Error(`profile.artifacts.${id}.outsideRepository: допустимо только для external-input`);
    }
    normalizedArtifactPaths.set(id, requireArtifactPath(artifact.path, `profile.artifacts.${id}.path`, id, artifact.kind, root));
  }

  const artifactByPath = new Map();
  for (const [id, normalizedPath] of normalizedArtifactPaths) {
    if (normalizedPath === null) continue;
    const previous = artifactByPath.get(normalizedPath);
    if (previous) throw new Error(`profile.artifacts.${id}.path: путь уже назначен артефакту ${previous}`);
    artifactByPath.set(normalizedPath, id);
  }
  for (const [name, map] of Object.entries(maps)) {
    for (const field of ['output', 'outputs']) {
      const outputs = map[field] === undefined ? [] : Array.isArray(map[field]) ? map[field] : [map[field]];
      for (const [outputIndex, output] of outputs.entries()) {
        const label = `profile.fieldMaps.${name}.${field}[${outputIndex}]`;
        fieldMapOutputs.push({ path: requireProfilePathReference(output, label, profile.artifacts, root), label });
      }
    }
  }
  const dumpPathRef = requireProfilePathReference(wiki.dumpPath, 'profile.sources.wiki.dumpPath', profile.artifacts, root);
  const dumpPathParameter = /^\{([A-Za-z][A-Za-z0-9]*)\}$/.exec(dumpPathRef);
  const dumpArtifact = dumpPathParameter ? profile.artifacts[dumpPathParameter[1]] : null;
  if (dumpArtifact?.kind !== 'external-input' || dumpArtifact.outsideRepository !== true || dumpArtifact.optional === true) {
    throw new Error('profile.sources.wiki.dumpPath: нужен обязательный external-input с outsideRepository: true');
  }
  const requiredMapArtifactIds = new Set();
  if (profile.sources.mapData?.requiredArtifacts !== undefined) {
    requireStringList(profile.sources.mapData.requiredArtifacts, 'profile.sources.mapData.requiredArtifacts');
    for (const [index, path] of profile.sources.mapData.requiredArtifacts.entries()) {
      const normalizedPath = requireRelativeOutputPath(path, `profile.sources.mapData.requiredArtifacts[${index}]`, root);
      const artifactId = artifactByPath.get(normalizedPath);
      if (!artifactId || profile.artifacts[artifactId].kind !== 'existing-layer') {
        throw new Error(`profile.sources.mapData.requiredArtifacts[${index}]: путь должен быть зарегистрированным existing-layer артефактом (${normalizedPath})`);
      }
      requiredMapArtifactIds.add(artifactId);
    }
  }

  if (!Array.isArray(profile.pipeline) || profile.pipeline.length === 0) throw new Error('profile.pipeline: нужен список этапов');
  const stages = new Map();
  const normalizedAdditionalOutputPaths = new Map();
  for (const [index, stage] of profile.pipeline.entries()) {
    const at = `profile.pipeline[${index}]`;
    requireString(stage?.id, `${at}.id`);
    if (!ID.test(stage.id)) throw new Error(`${at}.id: недопустимый идентификатор`);
    if (stages.has(stage.id)) throw new Error(`${at}.id: повторяется ${stage.id}`);
    requireString(stage.script, `${at}.script`);
    const scriptPath = requireRelativeOutputPath(stage.script, `${at}.script`, root);
    if (!existsSync(resolve(root, scriptPath))) throw new Error(`${at}.script: файл не найден: ${stage.script}`);
    requireStringList(stage.args, `${at}.args`);
    requireStringList(stage.dependsOn, `${at}.dependsOn`);
    requireStringList(stage.reads, `${at}.reads`);
    requireStringList(stage.writes, `${at}.writes`);
    if (stage.contentRoot !== undefined && typeof stage.contentRoot !== 'boolean') {
      throw new Error(`${at}.contentRoot: ожидается boolean`);
    }
    if (stage.optionalInputs !== undefined) {
      if (!Array.isArray(stage.optionalInputs)) throw new Error(`${at}.optionalInputs: ожидается список`);
      const seenOptionalInputs = new Set();
      for (const [inputIndex, input] of stage.optionalInputs.entries()) {
        const inputAt = `${at}.optionalInputs[${inputIndex}]`;
        requireString(input?.artifact, `${inputAt}.artifact`);
        requireString(input?.flag, `${inputAt}.flag`);
        requireStringList(input?.fallback ?? [], `${inputAt}.fallback`);
        const artifact = profile.artifacts[input.artifact];
        if (!artifact || artifact.kind !== 'external-input' || artifact.optional !== true) {
          throw new Error(`${inputAt}.artifact: нужен зарегистрированный optional external-input`);
        }
        if (!stage.reads.includes(input.artifact)) throw new Error(`${inputAt}.artifact: артефакт должен быть объявлен во входах этапа`);
        if (!/^--[a-z][a-z0-9-]*$/.test(input.flag)) throw new Error(`${inputAt}.flag: ожидается флаг командной строки`);
        if (seenOptionalInputs.has(input.artifact)) throw new Error(`${inputAt}.artifact: повтор optional input`);
        seenOptionalInputs.add(input.artifact);
      }
    }
    if (stage.alsoWrites !== undefined) {
      requireStringList(stage.alsoWrites, `${at}.alsoWrites`);
      const normalizedPaths = [];
      for (const [outputIndex, outputPath] of stage.alsoWrites.entries()) {
        normalizedPaths.push(requireRelativeOutputPath(outputPath, `${at}.alsoWrites[${outputIndex}]`, root));
      }
      normalizedAdditionalOutputPaths.set(stage.id, normalizedPaths);
    }
    for (const artifactId of [...stage.reads, ...stage.writes]) {
      if (!Object.hasOwn(profile.artifacts, artifactId)) throw new Error(`${at}: неизвестный артефакт ${artifactId}`);
    }
    for (const [argIndex, argument] of stage.args.entries()) {
      const placeholders = [...argument.matchAll(/\{([^{}]+)\}/g)];
      const residue = argument.replaceAll(/\{[^{}]+\}/g, '');
      if (/[{}]/.test(residue)) throw new Error(`${at}.args[${argIndex}]: повреждённый параметр ${argument}`);
      for (const [, artifactId] of placeholders) {
        if (!Object.hasOwn(profile.artifacts, artifactId)) throw new Error(`${at}.args[${argIndex}]: неизвестный артефакт-параметр {${artifactId}}`);
        if (!stage.reads.includes(artifactId) && !stage.writes.includes(artifactId)) {
          throw new Error(`${at}.args[${argIndex}]: параметр {${artifactId}} не объявлен во входах или выходах этапа`);
        }
      }
    }
    stages.set(stage.id, stage);
  }
  for (const artifactId of requiredMapArtifactIds) {
    if (![...stages.values()].some(stage => stage.reads.includes(artifactId))) {
      throw new Error(`profile.sources.mapData.requiredArtifacts: ${artifactId} должен быть входом хотя бы одного этапа pipeline`);
    }
  }

  const ancestors = new Map();
  function visit(stageId, stack = []) {
    if (stack.includes(stageId)) throw new Error(`profile.pipeline: цикл зависимостей ${[...stack, stageId].join(' → ')}`);
    if (ancestors.has(stageId)) return ancestors.get(stageId);
    const stage = stages.get(stageId);
    if (!stage) throw new Error(`profile.pipeline: неизвестный этап ${stageId}`);
    const found = new Set();
    for (const dependency of stage.dependsOn) {
      if (!stages.has(dependency)) throw new Error(`${stage.id}: неизвестная зависимость ${dependency}`);
      found.add(dependency);
      for (const transitive of visit(dependency, [...stack, stageId])) found.add(transitive);
    }
    ancestors.set(stageId, found);
    return found;
  }
  for (const stage of stages.values()) visit(stage.id);

  const producers = new Map();
  const producersByPath = new Map();
  function addProducerByPath(path, stageId) {
    const previousOwners = producersByPath.get(path) ?? [];
    const unorderedOwner = previousOwners.find(previous =>
      previous !== stageId &&
      !ancestors.get(stageId).has(previous) &&
      !ancestors.get(previous).has(stageId));
    if (unorderedOwner) throw new Error(`${stageId}: выход ${path} не упорядочен относительно этапа ${unorderedOwner}`);
    if (!previousOwners.includes(stageId)) producersByPath.set(path, [...previousOwners, stageId]);
  }
  for (const stage of stages.values()) {
    for (const artifactId of stage.writes) {
      if (!producers.has(artifactId)) producers.set(artifactId, []);
      producers.get(artifactId).push(stage.id);
      addProducerByPath(normalizedArtifactPaths.get(artifactId) ?? profile.artifacts[artifactId].path, stage.id);
    }
    for (const outputPath of normalizedAdditionalOutputPaths.get(stage.id) ?? []) {
      if (artifactByPath.has(outputPath)) throw new Error(`${stage.id}: ${outputPath} уже объявлен как артефакт ${artifactByPath.get(outputPath)}`);
      addProducerByPath(outputPath, stage.id);
    }
  }
  for (const stage of stages.values()) {
    const reachable = ancestors.get(stage.id);
    for (const artifactId of stage.reads) {
      const artifact = profile.artifacts[artifactId];
      if (['external-input', 'existing-layer'].includes(artifact.kind)) continue;
      const candidates = new Set([
        ...(producers.get(artifactId) ?? []),
        ...(producersByPath.get(artifact.path) ?? []),
      ]);
      const available = [...candidates].some(producer => reachable.has(producer));
      if (!available) throw new Error(`${stage.id}: ${artifactId} не создаётся предшествующим этапом и не объявлен существующим входом`);
    }
  }

  const declaredOutputPaths = new Set();
  for (const stage of stages.values()) {
    for (const artifactId of stage.writes) {
      declaredOutputPaths.add(normalizedArtifactPaths.get(artifactId) ?? profile.artifacts[artifactId].path);
    }
    for (const outputPath of normalizedAdditionalOutputPaths.get(stage.id) ?? []) declaredOutputPaths.add(outputPath);
  }
  for (const output of fieldMapOutputs) {
    if (!declaredOutputPaths.has(output.path)) throw new Error(`${output.label}: выход не объявлен ни одним этапом pipeline (${output.path})`);
  }

  return profile;
}

export function settingImportPlan(profile) {
  validateSettingImportProfile(profile);
  const byId = new Map(profile.pipeline.map(stage => [stage.id, stage]));
  const ordered = [];
  const visited = new Set();
  function add(stage) {
    if (visited.has(stage.id)) return;
    for (const dependency of stage.dependsOn) add(byId.get(dependency));
    visited.add(stage.id);
    ordered.push(stage);
  }
  for (const stage of profile.pipeline) add(stage);
  return ordered.map(({ id, script, args, dependsOn, reads, writes, alsoWrites, optionalInputs, contentRoot }) => ({
    id, script, args, dependsOn, reads, writes, alsoWrites: alsoWrites ?? [], optionalInputs: optionalInputs ?? [], contentRoot,
  }));
}

export function renderSettingImportPlan(profile) {
  const plan = settingImportPlan(profile);
  const rows = plan.map((step, index) => {
    const outputs = `    входы: ${step.reads.join(', ')}; выходы: ${step.writes.join(', ')}`;
    const additionalOutputs = step.alsoWrites.length ? `\n    также создаёт: ${step.alsoWrites.join(', ')}` : '';
    const optionalInputs = step.optionalInputs.length ? `\n    необязательные входы: ${step.optionalInputs.map(input => `${input.artifact} (${input.flag}; если не задан — ${input.fallback.join(' ') || 'пропустить'})`).join(', ')}` : '';
    return `${String(index + 1).padStart(2, '0')}. ${step.id} — ${step.script} ${step.args.join(' ')}\n${outputs}${additionalOutputs}${optionalInputs}`;
  }).join('\n');
  return `План импорта ${profile.title} (${profile.id}) — только планирование, скрипты не запускаются.\n\n${rows}\n\nОграничения профиля:\n${profile.limitations.map(item => `- ${item}`).join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const profilePath = resolve(process.argv[2] ?? 'packages/fr/import-profile.json');
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
    validateSettingImportProfile(profile);
    process.stdout.write(renderSettingImportPlan(profile));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
