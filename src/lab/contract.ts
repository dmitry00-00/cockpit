/**
 * Read-only contract for reproducible mechanic/entity experiments.
 * This module intentionally has no dependency on campaign state, events, or stores.
 */

export const LAB_RUN_FORMAT = 'dm-cockpit.isolated-lab-run' as const;
export const LAB_REPORT_FORMAT = 'dm-cockpit.isolated-lab-report' as const;
export const LAB_CONTRACT_VERSION = 1 as const;

export type LabJsonPrimitive = null | boolean | number | string;
export type LabJsonValue = LabJsonPrimitive | readonly LabJsonValue[] | { readonly [key: string]: LabJsonValue };

export interface LabScenarioRef {
  id: string;
  version: string;
  kind: 'mechanic' | 'entity' | 'encounter' | 'world-process' | 'other';
  title: string;
  sourceRef: string;
}

export interface LabEngineRef {
  id: string;
  version: string;
  sourceRef: string;
  contentDigest: string;
}

export interface LabRulesetRef {
  id: string;
  system: string;
  edition: string;
  version: string;
  /** Exact enabled layer, such as `rules`, `a5e-srd`, or `HB`. */
  layer: string;
  sourceRef: string;
  contentDigest: string;
  license: string;
}

export interface LabPackageRef {
  id: string;
  version: string;
  manifestRef: string;
  contentDigest: string;
}

export type LabNumericFactValue = number | { readonly kind: 'expression'; readonly expression: string };

export type LabNumericOrigin =
  | { kind: 'rules'; rulesetId: string; locator: string }
  | { kind: 'derived'; rulesetId: string; formula: string; sourceFactIds: readonly string[] }
  | { kind: 'homebrew'; rulesetId: string; note: string }
  /** A frozen value supplied by the scenario/author, not a claim about a game rule. */
  | { kind: 'input'; sourceRef: string; note: string };

export interface LabNumericFact {
  id: string;
  /** JSON Pointer into the containing block's payload. */
  path: string;
  value: LabNumericFactValue;
  origin: LabNumericOrigin;
}

export interface LabDataBlock {
  id: string;
  version: string;
  sourceRef: string;
  payload: { readonly [key: string]: LabJsonValue };
  numericFacts: readonly LabNumericFact[];
}

export interface LabInputSnapshot extends LabDataBlock {
  kind: 'character' | 'monster' | 'item' | 'scene' | 'location' | 'party' | 'world' | 'mechanic' | 'other';
}

export interface LabAssumption {
  id: string;
  status: 'confirmed' | 'assumed' | 'unresolved';
  statement: string;
  sourceRef?: string;
}

export type LabRandomness =
  | { mode: 'none' }
  | { mode: 'seeded'; seed: string; algorithm: 'mulberry32-v1' };

export interface LabRunDefinition {
  format: typeof LAB_RUN_FORMAT;
  schemaVersion: typeof LAB_CONTRACT_VERSION;
  scenario: LabScenarioRef;
  engine: LabEngineRef;
  rulesets: readonly LabRulesetRef[];
  packages: readonly LabPackageRef[];
  inputs: readonly LabInputSnapshot[];
  parameters: LabDataBlock;
  assumptions: readonly LabAssumption[];
  randomness: LabRandomness;
}

export interface LabRandomSource {
  readonly algorithm: 'mulberry32-v1';
  next(): number;
  die(sides: number): number;
}

export interface LabExecutionContext {
  scenario: LabScenarioRef;
  engine: LabEngineRef;
  rulesets: readonly LabRulesetRef[];
  packages: readonly LabPackageRef[];
  inputs: readonly LabInputSnapshot[];
  parameters: LabDataBlock;
  assumptions: readonly LabAssumption[];
  randomness: LabRandomness;
  random: LabRandomSource | null;
}

export interface LabFinding {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  relatedFactIds: readonly string[];
}

export interface LabChange {
  id: string;
  targetRef: string;
  description: string;
  beforeFactIds: readonly string[];
  afterFactIds: readonly string[];
}

export interface LabUncertainty {
  id: string;
  level: 'low' | 'medium' | 'high' | 'unknown';
  description: string;
  affectedFactIds: readonly string[];
  assumptionIds: readonly string[];
}

/** A request for later GM review. It is deliberately not a campaign event or WorldDelta. */
export interface LabProposalCandidate {
  targetRef: string;
  title: string;
  summary: string;
  changeIds: readonly string[];
}

export interface LabKernelOutput {
  result: LabDataBlock;
  findings: readonly LabFinding[];
  changes: readonly LabChange[];
  uncertainty: readonly LabUncertainty[];
  proposalCandidates: readonly LabProposalCandidate[];
}

export interface LabKernel {
  id: string;
  version: string;
  sourceRef: string;
  contentDigest: string;
  run(context: LabExecutionContext): LabKernelOutput | Promise<LabKernelOutput>;
}

export interface LabProposalDraft extends LabProposalCandidate {
  id: string;
  status: 'draft';
  reviewAudience: 'gm';
  sourceRunFingerprint: string;
}

export interface LabRunReport {
  format: typeof LAB_REPORT_FORMAT;
  schemaVersion: typeof LAB_CONTRACT_VERSION;
  runFingerprint: string;
  outputFingerprint: string;
  /** Complete, replayable definition with the exact saved input values. */
  definition: LabRunDefinition;
  inputFingerprints: readonly { id: string; version: string; fingerprint: string }[];
  parameterFingerprint: string;
  result: LabDataBlock;
  findings: readonly LabFinding[];
  changes: readonly LabChange[];
  uncertainty: readonly LabUncertainty[];
  proposalDrafts: readonly LabProposalDraft[];
  executionBoundary: {
    mode: 'isolated-read-only';
    campaignStateCapabilityProvided: false;
    campaignWriteCapabilityProvided: false;
    campaignEventWrites: 0;
    activeCampaignWrites: 0;
  };
}

export class LabContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabContractError';
  }
}

function stableTextCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value: unknown, label: string): void {
  if (!isPlainObject(value)) throw new LabContractError(`${label} должен быть JSON-объектом.`);
}

function canonicalValue(value: unknown, active = new WeakSet<object>()): LabJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new LabContractError('В лабораторных данных нельзя сохранять NaN или бесконечность.');
    return value;
  }
  if (typeof value !== 'object') throw new LabContractError('В лабораторные данные допускаются только JSON-значения.');
  if (active.has(value)) throw new LabContractError('Циклические ссылки не поддерживаются в сохранённом запуске.');
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const allowedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
      if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowedKeys.has(key))) {
        throw new LabContractError('Массивы со своими дополнительными полями не поддерживаются.');
      }
      const result: LabJsonValue[] = [];
      for (let index = 0; index < value.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) throw new LabContractError('Разреженные массивы не поддерживаются.');
        result.push(canonicalValue(value[index], active));
      }
      return result;
    }
    if (!isPlainObject(value)) throw new LabContractError('Сохранённый запуск содержит объект неподдерживаемого типа.');
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) throw new LabContractError('Символьные ключи не поддерживаются в сохранённом запуске.');
    const result: Record<string, LabJsonValue> = Object.create(null) as Record<string, LabJsonValue>;
    for (const key of (keys as string[]).sort(stableTextCompare)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new LabContractError('Геттеры и вычисляемые поля не поддерживаются в сохранённом запуске.');
      result[key] = canonicalValue(descriptor.value, active);
    }
    return result;
  } finally {
    active.delete(value);
  }
}

/** Stable JSON used for saved run files and content fingerprints. */
export function canonicalLabJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function requiredText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new LabContractError(`${label}: требуется непустая строка.`);
}

function requireDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(value)) {
    throw new LabContractError(`${label}: требуется закреплённый SHA-256 источника.`);
  }
}

function pointerEscape(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pointerUnescape(segment: string): string {
  if (/~(?![01])/.test(segment)) throw new LabContractError('Неверное экранирование JSON Pointer.');
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function getAtPointer(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return undefined;
  return pointer.slice(1).split('/').map(pointerUnescape).reduce<unknown>((value, segment) => {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return undefined;
      return value[Number(segment)];
    }
    if (isPlainObject(value)) return value[segment];
    return undefined;
  }, root);
}

function formulaMarker(value: unknown): string | undefined {
  if (!isPlainObject(value) || value.$lab !== 'formula' || typeof value.expression !== 'string') return undefined;
  const keys = Object.keys(value).sort(stableTextCompare);
  return keys.length === 2 && keys[0] === '$lab' && keys[1] === 'expression' ? value.expression : undefined;
}

function collectNumericPayloadPaths(value: unknown, path = ''): Map<string, number | { expression: string }> {
  const paths = new Map<string, number | { expression: string }>();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new LabContractError('Числовые данные должны быть конечными.');
    if (!path) throw new LabContractError('Корневое числовое значение оформите объектом с полем.');
    paths.set(path, value);
    return paths;
  }
  const expression = formulaMarker(value);
  if (expression !== undefined) {
    if (!expression.trim() || !path) throw new LabContractError('Формула должна быть непустой и находиться по адресу JSON Pointer.');
    paths.set(path, { expression });
    return paths;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      for (const [childPath, childValue] of collectNumericPayloadPaths(item, `${path}/${index}`)) paths.set(childPath, childValue);
    });
    return paths;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      for (const [childPath, childValue] of collectNumericPayloadPaths(item, `${path}/${pointerEscape(key)}`)) paths.set(childPath, childValue);
    }
  }
  return paths;
}

function factValueMatches(payloadValue: unknown, factValue: LabNumericFactValue): boolean {
  if (typeof factValue === 'number') return typeof payloadValue === 'number' && Object.is(payloadValue, factValue);
  return formulaMarker(payloadValue) === factValue.expression;
}

interface FactIndex {
  facts: Map<string, LabNumericFact>;
  rulesets: Map<string, LabRulesetRef>;
}

function validateDataBlock(block: LabDataBlock, label: string, index: FactIndex): void {
  requirePlainObject(block, label);
  if (!Array.isArray(block.numericFacts)) throw new LabContractError(`${label} должен содержать массив числовых атрибуций.`);
  requiredText(block.id, `${label}.id`);
  requiredText(block.version, `${label}.version`);
  requiredText(block.sourceRef, `${label}.sourceRef`);
  if (!isPlainObject(block.payload)) throw new LabContractError(`${label}.payload должен быть JSON-объектом.`);
  canonicalValue(block.payload);
  const expected = collectNumericPayloadPaths(block.payload);
  const claimed = new Map<string, LabNumericFact>();
  for (const fact of block.numericFacts) {
    requirePlainObject(fact, `${label}: числовая атрибуция`);
    requirePlainObject(fact.origin, `${label}: происхождение числовой атрибуции`);
    requiredText(fact.id, `${label}.numericFacts.id`);
    requiredText(fact.path, `${label}.numericFacts.path`);
    if (claimed.has(fact.path)) throw new LabContractError(`${label}: повторная атрибуция пути ${fact.path}.`);
    if (index.facts.has(fact.id)) throw new LabContractError(`Повторный ID числового факта: ${fact.id}.`);
    if (fact.origin.kind === 'input') {
      requiredText(fact.origin.sourceRef, `${fact.id}.origin.sourceRef`);
      requiredText(fact.origin.note, `${fact.id}.origin.note`);
    } else {
      if (!index.rulesets.has(fact.origin?.rulesetId)) throw new LabContractError(`Факт ${fact.id} ссылается на невыбранный набор правил.`);
      const ruleset = index.rulesets.get(fact.origin.rulesetId)!;
      if (fact.origin.kind === 'rules') {
        requiredText(fact.origin.locator, `${fact.id}.origin.locator`);
        if (ruleset.layer === 'HB') throw new LabContractError(`Для слоя HB факт ${fact.id} должен иметь явную HB-атрибуцию.`);
      } else if (fact.origin.kind === 'derived') {
        requiredText(fact.origin.formula, `${fact.id}.origin.formula`);
        if (!fact.origin.sourceFactIds.length) throw new LabContractError(`Расчётный факт ${fact.id} должен ссылаться на исходные факты.`);
      } else if (fact.origin.kind === 'homebrew') {
        requiredText(fact.origin.note, `${fact.id}.origin.note`);
        if (ruleset.layer !== 'HB') throw new LabContractError(`HB-факт ${fact.id} должен ссылаться на слой HB.`);
      } else throw new LabContractError(`У факта ${fact.id} не указано допустимое происхождение.`);
    }

    const payloadValue = getAtPointer(block.payload, fact.path);
    if (!expected.has(fact.path) || !factValueMatches(payloadValue, fact.value)) {
      throw new LabContractError(`Атрибуция ${fact.id} не совпадает со значением по ${fact.path}.`);
    }
    claimed.set(fact.path, fact);
    index.facts.set(fact.id, fact);
  }
  for (const path of expected.keys()) {
    if (!claimed.has(path)) throw new LabContractError(`${label}: числовое значение по ${path} не имеет источника.`);
  }
}

function validateReferences(index: FactIndex): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new LabContractError(`Цикл происхождения чисел: ${id}.`);
    if (visited.has(id)) return;
    const fact = index.facts.get(id);
    if (!fact) throw new LabContractError(`Не найден исходный числовой факт: ${id}.`);
    visiting.add(id);
    if (fact.origin.kind === 'derived') {
      const uniqueSources = new Set(fact.origin.sourceFactIds);
      if (uniqueSources.size !== fact.origin.sourceFactIds.length) throw new LabContractError(`У факта ${id} повторяются исходные ссылки.`);
      fact.origin.sourceFactIds.forEach(visit);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of index.facts.keys()) visit(id);
}

/** Validates that every numeric or formula value is pinned to a selected, versioned rules layer. */
export function validateLabRunDefinition(definition: LabRunDefinition): void {
  if (!isPlainObject(definition)) throw new LabContractError('Определение лаборатории должно быть JSON-объектом.');
  if (definition.format !== LAB_RUN_FORMAT || definition.schemaVersion !== LAB_CONTRACT_VERSION) {
    throw new LabContractError('Неизвестный формат или версия запуска лаборатории.');
  }
  for (const [label, value] of Object.entries({
    'scenario.id': definition.scenario?.id,
    'scenario.version': definition.scenario?.version,
    'scenario.title': definition.scenario?.title,
    'scenario.sourceRef': definition.scenario?.sourceRef,
    'engine.id': definition.engine?.id,
    'engine.version': definition.engine?.version,
    'engine.sourceRef': definition.engine?.sourceRef,
  })) requiredText(value, label);
  requireDigest(definition.engine.contentDigest, 'engine.contentDigest');
  if (!['mechanic', 'entity', 'encounter', 'world-process', 'other'].includes(definition.scenario.kind)) throw new LabContractError('Неизвестный тип сценария лаборатории.');
  if (!Array.isArray(definition.rulesets) || !definition.rulesets.length) throw new LabContractError('Нужно выбрать хотя бы один набор правил с версией и слоем.');
  const rulesets = new Map<string, LabRulesetRef>();
  for (const ruleset of definition.rulesets) {
    requirePlainObject(ruleset, 'Набор правил лаборатории');
    for (const [label, value] of Object.entries({
      id: ruleset.id, system: ruleset.system, edition: ruleset.edition, version: ruleset.version,
      layer: ruleset.layer, sourceRef: ruleset.sourceRef, license: ruleset.license,
    })) requiredText(value, `ruleset.${label}`);
    requireDigest(ruleset.contentDigest, `ruleset:${ruleset.id}.contentDigest`);
    if (rulesets.has(ruleset.id)) throw new LabContractError(`Повторный ID набора правил: ${ruleset.id}.`);
    rulesets.set(ruleset.id, ruleset);
  }
  if (!Array.isArray(definition.packages) || !Array.isArray(definition.inputs) || !definition.inputs.length || !Array.isArray(definition.assumptions)) {
    throw new LabContractError('Запуск должен содержать пакеты, сохранённые входы и список допущений.');
  }
  const packageIds = new Set<string>();
  for (const pkg of definition.packages) {
    requirePlainObject(pkg, 'Ссылка на пакет');
    requiredText(pkg.id, 'package.id');
    requiredText(pkg.version, 'package.version');
    requiredText(pkg.manifestRef, 'package.manifestRef');
    requireDigest(pkg.contentDigest, `package:${pkg.id}.contentDigest`);
    if (packageIds.has(pkg.id)) throw new LabContractError(`Повторный пакет: ${pkg.id}.`);
    packageIds.add(pkg.id);
  }
  const inputIds = new Set<string>();
  const assumptionIds = new Set<string>();
  const index: FactIndex = { facts: new Map(), rulesets };
  for (const input of definition.inputs) {
    requirePlainObject(input, 'Снимок входа');
    if (!['character', 'monster', 'item', 'scene', 'location', 'party', 'world', 'mechanic', 'other'].includes(input.kind)) {
      throw new LabContractError(`Неизвестный тип сохранённого входа: ${input.kind}.`);
    }
    if (inputIds.has(input.id)) throw new LabContractError(`Повторный снимок входа: ${input.id}.`);
    inputIds.add(input.id);
    validateDataBlock(input, `input:${input.id}`, index);
  }
  validateDataBlock(definition.parameters, 'parameters', index);
  for (const assumption of definition.assumptions) {
    requirePlainObject(assumption, 'Допущение');
    requiredText(assumption.id, 'assumption.id');
    requiredText(assumption.statement, `assumption:${assumption.id}.statement`);
    if (!['confirmed', 'assumed', 'unresolved'].includes(assumption.status)) throw new LabContractError(`Неизвестный статус допущения ${assumption.id}.`);
    if (assumption.sourceRef !== undefined) requiredText(assumption.sourceRef, `assumption:${assumption.id}.sourceRef`);
    if (assumptionIds.has(assumption.id)) throw new LabContractError(`Повторное допущение: ${assumption.id}.`);
    assumptionIds.add(assumption.id);
  }
  if (!isPlainObject(definition.randomness)) throw new LabContractError('Нужно выбрать режим случайности.');
  if (definition.randomness.mode === 'seeded') {
    requiredText(definition.randomness.seed, 'randomness.seed');
    if (definition.randomness.algorithm !== 'mulberry32-v1') throw new LabContractError('Неизвестная версия генератора случайных чисел.');
  } else if (definition.randomness.mode !== 'none') throw new LabContractError('Неизвестный режим случайности.');
  validateReferences(index);
}

/** Stable JSON export; callers may save it as a separate lab file, never as a campaign event. */
export function serializeLabRunDefinition(definition: LabRunDefinition): string {
  validateLabRunDefinition(definition);
  return canonicalLabJson(definition);
}

export function parseLabRunDefinition(serialized: string): LabRunDefinition {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new LabContractError('Файл лаборатории содержит некорректный JSON.');
  }
  if (!isPlainObject(value)) throw new LabContractError('Определение лаборатории должно быть JSON-объектом.');
  validateLabRunDefinition(value as unknown as LabRunDefinition);
  return canonicalValue(value) as unknown as LabRunDefinition;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(canonicalLabJson(value)) as T;
}

function freezeJson<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeJson(child);
  }
  return value;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(seed)) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}

export function createLabRandomSource(seed: string): LabRandomSource {
  let state = hashSeed(seed) || 0x6d2b79f5;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return Object.freeze({
    algorithm: 'mulberry32-v1' as const,
    next,
    die(sides: number) {
      const range = 0x1_0000_0000;
      if (!Number.isSafeInteger(sides) || sides < 1 || sides > range) {
        throw new LabContractError('У кости должно быть положительное целое число граней не больше 2³².');
      }
      const acceptedRange = Math.floor(range / sides) * sides;
      let sample = Math.floor(next() * range);
      while (sample >= acceptedRange) sample = Math.floor(next() * range);
      return (sample % sides) + 1;
    },
  });
}

async function sha256(value: unknown): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) throw new LabContractError('Для отпечатка запуска требуется Web Crypto SHA-256.');
  const bytes = new TextEncoder().encode(canonicalLabJson(value));
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function referencesExist(ids: readonly string[], valid: ReadonlySet<string>, label: string): void {
  for (const id of ids) if (!valid.has(id)) throw new LabContractError(`${label} ссылается на неизвестный числовой факт ${id}.`);
}

function validateKernelOutput(output: LabKernelOutput, definition: LabRunDefinition, inputIndex: FactIndex): void {
  if (!output || !output.result || !Array.isArray(output.findings) || !Array.isArray(output.changes) ||
      !Array.isArray(output.uncertainty) || !Array.isArray(output.proposalCandidates)) {
    throw new LabContractError('Ядро лаборатории вернуло ответ неверного формата.');
  }
  const allFacts: FactIndex = { facts: new Map(inputIndex.facts), rulesets: inputIndex.rulesets };
  validateDataBlock(output.result, 'result', allFacts);
  validateReferences(allFacts);
  const factIds = new Set(allFacts.facts.keys());
  const assumptionIds = new Set(definition.assumptions.map(item => item.id));
  const changeIds = new Set<string>();
  const findingIds = new Set<string>();
  for (const finding of output.findings) {
    requirePlainObject(finding, 'Finding результата лаборатории');
    if (!Array.isArray(finding.relatedFactIds)) throw new LabContractError('Finding результата лаборатории должен содержать список числовых фактов.');
    requiredText(finding.id, 'finding.id');
    requiredText(finding.message, `finding:${finding.id}.message`);
    if (!['info', 'warning', 'error'].includes(finding.severity) || findingIds.has(finding.id)) throw new LabContractError(`Finding ${finding.id} имеет неизвестный уровень или повторный ID.`);
    findingIds.add(finding.id);
    referencesExist(finding.relatedFactIds, factIds, `finding:${finding.id}`);
  }
  for (const change of output.changes) {
    requirePlainObject(change, 'Изменение результата лаборатории');
    if (!Array.isArray(change.beforeFactIds) || !Array.isArray(change.afterFactIds)) throw new LabContractError('Изменение результата лаборатории должно ссылаться на исходные и итоговые факты.');
    requiredText(change.id, 'change.id');
    requiredText(change.targetRef, `change:${change.id}.targetRef`);
    requiredText(change.description, `change:${change.id}.description`);
    if (changeIds.has(change.id)) throw new LabContractError(`Повторная запись об изменении ${change.id}.`);
    changeIds.add(change.id);
    referencesExist([...change.beforeFactIds, ...change.afterFactIds], factIds, `change:${change.id}`);
  }
  const uncertaintyIds = new Set<string>();
  for (const item of output.uncertainty) {
    requirePlainObject(item, 'Запись неопределённости');
    if (!Array.isArray(item.affectedFactIds) || !Array.isArray(item.assumptionIds)) throw new LabContractError('Запись неопределённости должна ссылаться на факты и допущения.');
    requiredText(item.id, 'uncertainty.id');
    requiredText(item.description, `uncertainty:${item.id}.description`);
    if (!['low', 'medium', 'high', 'unknown'].includes(item.level) || uncertaintyIds.has(item.id)) throw new LabContractError(`Неопределённость ${item.id} имеет неизвестный уровень или повторный ID.`);
    uncertaintyIds.add(item.id);
    referencesExist(item.affectedFactIds, factIds, `uncertainty:${item.id}`);
    referencesExist(item.assumptionIds, assumptionIds, `uncertainty:${item.id}`);
  }
  for (const proposal of output.proposalCandidates) {
    requirePlainObject(proposal, 'Черновик для мастера');
    if (!Array.isArray(proposal.changeIds) || !proposal.changeIds.length) throw new LabContractError('Черновик для мастера должен ссылаться минимум на одно изменение.');
    requiredText(proposal.targetRef, 'proposal.targetRef');
    requiredText(proposal.title, 'proposal.title');
    requiredText(proposal.summary, 'proposal.summary');
    referencesExist(proposal.changeIds, changeIds, `proposal:${proposal.targetRef}`);
  }
}

/**
 * Executes a version-pinned kernel against a detached, frozen snapshot. No campaign
 * store or event writer is passed into this function or exposed to the kernel.
 */
export async function runIsolatedLab(definition: LabRunDefinition, kernel: LabKernel): Promise<LabRunReport> {
  validateLabRunDefinition(definition);
  if (kernel.id !== definition.engine.id || kernel.version !== definition.engine.version ||
      kernel.sourceRef !== definition.engine.sourceRef || kernel.contentDigest !== definition.engine.contentDigest) {
    throw new LabContractError('Исполнитель не совпадает с закреплённой версией ядра лаборатории.');
  }

  const detachedDefinition = cloneJson(definition);
  const runFingerprint = await sha256({ contractVersion: LAB_CONTRACT_VERSION, definition: detachedDefinition });
  const inputIndex: FactIndex = { facts: new Map(), rulesets: new Map(detachedDefinition.rulesets.map(item => [item.id, item])) };
  detachedDefinition.inputs.forEach(input => validateDataBlock(input, `input:${input.id}`, inputIndex));
  validateDataBlock(detachedDefinition.parameters, 'parameters', inputIndex);
  const context = freezeJson(cloneJson({
    scenario: detachedDefinition.scenario,
    engine: detachedDefinition.engine,
    rulesets: detachedDefinition.rulesets,
    packages: detachedDefinition.packages,
    inputs: detachedDefinition.inputs,
    parameters: detachedDefinition.parameters,
    assumptions: detachedDefinition.assumptions,
    randomness: detachedDefinition.randomness,
  })) as Omit<LabExecutionContext, 'random'>;
  const random = detachedDefinition.randomness.mode === 'seeded'
    ? createLabRandomSource(detachedDefinition.randomness.seed)
    : null;
  const rawOutput = await kernel.run({ ...context, random });
  const detachedOutput = cloneJson(rawOutput);
  validateKernelOutput(detachedOutput, detachedDefinition, inputIndex);
  const outputFingerprint = await sha256({ runFingerprint, output: detachedOutput });
  const allFactIds = new Set([
    ...inputIndex.facts.keys(),
    ...detachedOutput.result.numericFacts.map(fact => fact.id),
  ]);
  const proposalDrafts: LabProposalDraft[] = detachedOutput.proposalCandidates.map((proposal, index) => ({
    ...proposal,
    id: `lab-proposal:${runFingerprint}:${index + 1}`,
    status: 'draft',
    reviewAudience: 'gm',
    sourceRunFingerprint: runFingerprint,
  }));
  const report: LabRunReport = {
    format: LAB_REPORT_FORMAT,
    schemaVersion: LAB_CONTRACT_VERSION,
    runFingerprint,
    outputFingerprint,
    definition: detachedDefinition,
    inputFingerprints: await Promise.all(detachedDefinition.inputs.map(async input => ({
      id: input.id,
      version: input.version,
      fingerprint: await sha256(input),
    }))),
    parameterFingerprint: await sha256(detachedDefinition.parameters),
    result: detachedOutput.result,
    findings: detachedOutput.findings,
    changes: detachedOutput.changes,
    uncertainty: detachedOutput.uncertainty,
    proposalDrafts,
    executionBoundary: {
      mode: 'isolated-read-only',
      campaignStateCapabilityProvided: false,
      campaignWriteCapabilityProvided: false,
      campaignEventWrites: 0,
      activeCampaignWrites: 0,
    },
  };
  if (allFactIds.size !== inputIndex.facts.size + detachedOutput.result.numericFacts.length) {
    throw new LabContractError('Числовые факты результата конфликтуют с сохранёнными входами.');
  }
  return freezeJson(report);
}
