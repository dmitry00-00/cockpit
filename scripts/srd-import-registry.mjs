#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COMMON = {
  edition: 'D&D 5e / 2014',
  license: 'CC-BY-4.0',
  document: 'System Reference Document 5.1',
  sourceLabel: 'SRD 5.1',
  policyReference: 'SOURCES.md §1',
};

/**
 * Operational registry for the SRD importers. Source permission decisions remain in SOURCES.md.
 * Each entry binds one catalog type to its source, importer and generated file.
 */
export const SRD_IMPORT_REGISTRY = Object.freeze({
  monster: Object.freeze({
    ...COMMON,
    label: 'Монстры',
    id: 'srd-5.1-monsters',
    apiBase: 'https://www.dnd5eapi.co/api/2014/monsters',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/monsters',
    supplementarySources: Object.freeze([
      Object.freeze({
        id: 'open5e-wotc-srd',
        url: 'https://api.open5e.com/v1/monsters/?document__slug=wotc-srd&limit=400&format=json',
        purpose: 'Вводные абзацы легендарных действий; сверять по основному источнику SRD.',
      }),
    ]),
    output: 'content/srd/monsters.json',
    importer: 'scripts/import-srd-monsters.mjs',
    indent: 2,
  }),
  spell: Object.freeze({
    ...COMMON,
    label: 'Заклинания',
    id: 'srd-5.1-spells',
    apiBase: 'https://www.dnd5eapi.co/api/2014',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/spells',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/spells.json',
    importer: 'scripts/import-srd-spells.mjs',
    indent: 1,
  }),
  equipment: Object.freeze({
    ...COMMON,
    label: 'Снаряжение',
    id: 'srd-5.1-equipment',
    apiBase: 'https://www.dnd5eapi.co/api/2014',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/equipment.json',
    importer: 'scripts/import-srd-equipment.mjs',
    indent: 1,
  }),
  'magic-item': Object.freeze({
    ...COMMON,
    label: 'Магические предметы',
    id: 'srd-5.1-magic-items',
    apiBase: 'https://www.dnd5eapi.co/api/2014/magic-items',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/magic-items',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/magic-items.json',
    importer: 'scripts/import-srd-magic-items.mjs',
    indent: 2,
  }),
  language: Object.freeze({
    ...COMMON,
    label: 'Языки',
    id: 'srd-5.1-languages',
    apiBase: 'https://www.dnd5eapi.co/api/2014/languages',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/languages',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/languages.json',
    importer: 'scripts/import-srd-languages.mjs',
    indent: 2,
  }),
  rule: Object.freeze({
    ...COMMON,
    label: 'Разделы и заголовки правил',
    id: 'srd-5.1-rules',
    apiBase: 'https://www.dnd5eapi.co/api/2014/rules',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/rules',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/rules.json',
    importer: 'scripts/import-srd-rules.mjs',
    indent: 2,
  }),
  'ability-score': Object.freeze({
    ...COMMON,
    label: 'Характеристики',
    id: 'srd-5.1-ability-scores',
    apiBase: 'https://www.dnd5eapi.co/api/2014/ability-scores',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/ability-scores',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/ability-scores.json',
    importer: 'scripts/import-srd-ability-scores.mjs',
    indent: 2,
  }),
  skill: Object.freeze({
    ...COMMON,
    label: 'Навыки',
    id: 'srd-5.1-skills',
    apiBase: 'https://www.dnd5eapi.co/api/2014/skills',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/skills',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/skills.json',
    importer: 'scripts/import-srd-skills.mjs',
    indent: 2,
  }),
  alignment: Object.freeze({
    ...COMMON,
    label: 'Мировоззрения',
    id: 'srd-5.1-alignments',
    apiBase: 'https://www.dnd5eapi.co/api/2014/alignments',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/alignments',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/alignments.json',
    importer: 'scripts/import-srd-alignments.mjs',
    indent: 2,
  }),
  condition: Object.freeze({
    ...COMMON,
    label: 'Состояния',
    id: 'srd-5.1-conditions',
    apiBase: 'https://www.dnd5eapi.co/api/2014/conditions',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/conditions',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/conditions.json',
    importer: 'scripts/import-srd-conditions.mjs',
    indent: 2,
  }),
  action: Object.freeze({
    ...COMMON,
    label: 'Действия в бою',
    id: 'srd-5.1-combat-actions',
    apiBase: 'https://www.dnd5eapi.co/api/2014/rules',
    sourceUrl: 'https://www.dnd5eapi.co/api/2014/rules',
    supplementarySources: Object.freeze([]),
    output: 'content/srd/actions.json',
    importer: 'scripts/import-srd-actions.mjs',
    indent: 2,
  }),
  background: Object.freeze({
    ...COMMON,
    label: 'Предыстории', id: 'srd-5.1-backgrounds',
    apiBase: 'https://www.dnd5eapi.co/api/2014/backgrounds', sourceUrl: 'https://www.dnd5eapi.co/api/2014/backgrounds',
    expectedCount: 1, expectedIndexSha256: '79c088c55c438e31e93af6048c5e46dd967d87d3e7e86c0c27983916b813329b',
    collectionKey: 'backgrounds', supplementarySources: Object.freeze([]), output: 'content/srd/backgrounds.json', importer: 'scripts/import-srd-backgrounds.mjs', indent: 2,
  }),
  class: Object.freeze({
    ...COMMON,
    label: 'Классы', id: 'srd-5.1-classes',
    apiBase: 'https://www.dnd5eapi.co/api/2014/classes', sourceUrl: 'https://www.dnd5eapi.co/api/2014/classes',
    expectedCount: 12, expectedIndexSha256: 'ca64c7733dc801ea7ab30d47215f105eecef969c01cacba09e0ce57261168741',
    collectionKey: 'classes', supplementarySources: Object.freeze([]), output: 'content/srd/classes.json', importer: 'scripts/import-srd-classes.mjs', indent: 2,
  }),
  'class-option': Object.freeze({
    ...COMMON,
    label: 'Варианты класса', id: 'srd-5.1-class-options',
    apiBase: 'https://www.dnd5eapi.co/api/2014/features', sourceUrl: 'https://www.dnd5eapi.co/api/2014/features',
    expectedCount: 25, expectedIndexSha256: '8bb5fb6f804594a3de5c9b8dbe5501fc5526a97a1b41ec5888975014fed77e1d',
    collectionKey: 'classOptions', supplementarySources: Object.freeze([]), output: 'content/srd/class-options.json', importer: 'scripts/import-srd-class-options.mjs', indent: 2,
  }),
  feat: Object.freeze({
    ...COMMON,
    label: 'Черты', id: 'srd-5.1-feats',
    apiBase: 'https://www.dnd5eapi.co/api/2014/feats', sourceUrl: 'https://www.dnd5eapi.co/api/2014/feats',
    expectedCount: 1, expectedIndexSha256: '6feee9fb42b625bbde4b7bc1413a35550a07536f4e194600e30c66080da54c69',
    collectionKey: 'feats', supplementarySources: Object.freeze([]), output: 'content/srd/feats.json', importer: 'scripts/import-srd-feats.mjs', indent: 2,
  }),
  feature: Object.freeze({
    ...COMMON,
    label: 'Умения классов', id: 'srd-5.1-features',
    apiBase: 'https://www.dnd5eapi.co/api/2014/features', sourceUrl: 'https://www.dnd5eapi.co/api/2014/features',
    expectedCount: 407, expectedIndexSha256: '583aa4875c9d5678ad870ceeb2ed16e6b5b667f2b7cabf634171705f7a2dfbe7',
    collectionKey: 'features', supplementarySources: Object.freeze([]), output: 'content/srd/features.json', importer: 'scripts/import-srd-features.mjs', indent: 2,
  }),
  race: Object.freeze({
    ...COMMON,
    label: 'Расы', id: 'srd-5.1-races',
    apiBase: 'https://www.dnd5eapi.co/api/2014/races', sourceUrl: 'https://www.dnd5eapi.co/api/2014/races',
    expectedCount: 9, expectedIndexSha256: '706959d0985e54fb775b825f94badea962121af5a584c306b9108b7d8e67338f',
    collectionKey: 'races', supplementarySources: Object.freeze([]), output: 'content/srd/races.json', importer: 'scripts/import-srd-races.mjs', indent: 2,
  }),
  subclass: Object.freeze({
    ...COMMON,
    label: 'Подклассы', id: 'srd-5.1-subclasses',
    apiBase: 'https://www.dnd5eapi.co/api/2014/subclasses', sourceUrl: 'https://www.dnd5eapi.co/api/2014/subclasses',
    expectedCount: 12, expectedIndexSha256: '6573b6b501547c159bb5e04c314e53c9631925c8829896537e15ded5bb378c8a',
    collectionKey: 'subclasses', supplementarySources: Object.freeze([]), output: 'content/srd/subclasses.json', importer: 'scripts/import-srd-subclasses.mjs', indent: 2,
  }),
  subrace: Object.freeze({
    ...COMMON,
    label: 'Подрасы', id: 'srd-5.1-subraces',
    apiBase: 'https://www.dnd5eapi.co/api/2014/subraces', sourceUrl: 'https://www.dnd5eapi.co/api/2014/subraces',
    expectedCount: 4, expectedIndexSha256: 'b92466d4a2712173d05a87c674596012dbb59c412395fdb8cdecdfca5089a55a',
    collectionKey: 'subraces', supplementarySources: Object.freeze([]), output: 'content/srd/subraces.json', importer: 'scripts/import-srd-subraces.mjs', indent: 2,
  }),
  trait: Object.freeze({
    ...COMMON,
    label: 'Черты рас', id: 'srd-5.1-traits',
    apiBase: 'https://www.dnd5eapi.co/api/2014/traits', sourceUrl: 'https://www.dnd5eapi.co/api/2014/traits',
    expectedCount: 38, expectedIndexSha256: '529593d07f025b73eee4fc6cb72ea346ef78821daf4a7ddbeda4141c769028df',
    collectionKey: 'traits', supplementarySources: Object.freeze([]), output: 'content/srd/traits.json', importer: 'scripts/import-srd-traits.mjs', indent: 2,
  }),
});

export const SRD_IMPORT_TYPES = Object.freeze(Object.keys(SRD_IMPORT_REGISTRY));

export function getSrdImportDefinition(type) {
  if (!Object.hasOwn(SRD_IMPORT_REGISTRY, type)) {
    throw new Error(`Неизвестный тип SRD «${type}». Доступны: ${SRD_IMPORT_TYPES.join(', ')}`);
  }
  return SRD_IMPORT_REGISTRY[type];
}

export function srdImportOutput(type) {
  return resolve(REPOSITORY_ROOT, getSrdImportDefinition(type).output);
}

export function srdImportAttribution(type) {
  const source = getSrdImportDefinition(type);
  return `${source.sourceLabel} (${source.license}) via ${source.sourceUrl}`;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function withoutFetchedAt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { fetchedAt: _fetchedAt, ...content } = value;
  return content;
}

/** Deterministic metadata: unchanged content keeps its first import date. */
export function buildSrdImportDocument(type, payload, { previous, today = new Date().toISOString().slice(0, 10) } = {}) {
  getSrdImportDefinition(type);
  if ('source' in payload || 'fetchedAt' in payload) {
    throw new Error(`${type}: source и fetchedAt назначаются общим реестром импорта`);
  }
  const content = { source: srdImportAttribution(type), ...payload };
  const unchanged = previous
    && JSON.stringify(canonical(withoutFetchedAt(previous))) === JSON.stringify(canonical(content));
  const fetchedAt = unchanged && typeof previous.fetchedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(previous.fetchedAt)
    ? previous.fetchedAt
    : today;
  return { source: content.source, fetchedAt, ...payload };
}

export async function writeSrdImport(type, payload, { outputPath = srdImportOutput(type), today } = {}) {
  const definition = getSrdImportDefinition(type);
  const defaultOutputPath = srdImportOutput(type);
  const pathLabel = outputPath === defaultOutputPath ? definition.output : outputPath;
  let previous;
  try {
    previous = JSON.parse(await readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }

  const document = buildSrdImportDocument(type, payload, { previous, today });
  const serialized = `${JSON.stringify(document, null, definition.indent)}\n`;
  if (previous && JSON.stringify(previous) === JSON.stringify(document)) {
    process.stdout.write(`UNCHANGED ${pathLabel} (fetchedAt ${document.fetchedAt})\n`);
    return { changed: false, path: outputPath };
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, serialized, 'utf8');
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  process.stdout.write(`WROTE ${pathLabel}\n`);
  return { changed: true, path: outputPath };
}
