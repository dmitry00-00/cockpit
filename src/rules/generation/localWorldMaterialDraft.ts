import { containsMechanicNumberToken } from './localMechanicDraft';

export const WORLD_MATERIAL_PROMPT_VERSION = 'p7-world-material-draft-v1' as const;
export type WorldMaterialKind = 'dungeon' | 'location';
export type WorldMaterialEdition = '2014' | '2024';

export interface WorldMaterialInput {
  kind: WorldMaterialKind;
  concept: string;
  edition: WorldMaterialEdition;
}

export interface WorldNodeDraft {
  id: string;
  name: string;
  description: string;
  links: readonly string[];
}

export type WorldMaterialDraft =
  | { kind: 'dungeon'; name: string; summary: string; entrance: string; areas: readonly WorldNodeDraft[] }
  | { kind: 'location'; name: string; summary: string; features: readonly WorldNodeDraft[] };

export interface LocalWorldMaterialResult {
  draft: WorldMaterialDraft;
  model: string;
  generatedAt: string;
  parameters: Readonly<Record<string, string | number | boolean>>;
  rawOutput: string;
}

const MAX_TEXT = 900;
const SAFE_ID = /^[a-z][a-z-]{0,47}$/;
const CORE_FIELDS = ['name', 'summary'] as const;

function textValue(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || containsMechanicNumberToken(value)) {
    throw new Error(`Поле ${field} пустое, слишком длинное или содержит числа/частоту/длительность.`);
  }
  return value.trim();
}

function nodeList(value: unknown, field: string): WorldNodeDraft[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 12) throw new Error(`Для ${field} нужно от двух до двенадцати связанных узлов.`);
  const nodes = value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Неверная структура узла ${field}[${index}].`);
    const row = raw as Record<string, unknown>;
    if (Object.keys(row).some(key => !['id', 'name', 'description', 'links'].includes(key)) ||
        typeof row.id !== 'string' || !SAFE_ID.test(row.id) ||
        !Array.isArray(row.links) || row.links.length > 12 || row.links.some(link => typeof link !== 'string' || !SAFE_ID.test(link))) {
      throw new Error(`Неверные идентификатор или связи в ${field}[${index}].`);
    }
    return {
      id: row.id,
      name: textValue(row.name, `${field}[${index}].name`, 120),
      description: textValue(row.description, `${field}[${index}].description`),
      links: [...row.links] as string[],
    };
  });
  const ids = new Set(nodes.map(node => node.id));
  if (ids.size !== nodes.length) throw new Error(`Повторяется id узла в ${field}.`);
  for (const node of nodes) {
    if (new Set(node.links).size !== node.links.length || node.links.some(id => id === node.id || !ids.has(id))) {
      throw new Error(`Узел ${node.id} содержит повторную, самонаправленную или неизвестную связь.`);
    }
  }
  if (!nodes.some(node => node.links.length > 0)) throw new Error(`Связи между узлами ${field} не заданы.`);
  return nodes;
}

function assertReachable(nodes: readonly WorldNodeDraft[], startId: string): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const reached = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const id of byId.get(current)?.links ?? []) {
      if (reached.has(id)) continue;
      reached.add(id);
      queue.push(id);
    }
  }
  if (reached.size !== nodes.length) throw new Error('Связи оставляют недостижимые области; граф нужно пересоздать.');
}

function parseDraft(rawOutput: string, kind: WorldMaterialKind): WorldMaterialDraft {
  const unfenced = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed: unknown = JSON.parse(unfenced);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Модель должна вернуть JSON-объект места или подземелья.');
  const record = parsed as Record<string, unknown>;
  const common = { name: textValue(record.name, 'name', 120), summary: textValue(record.summary, 'summary') };
  if (kind === 'dungeon') {
    const expected = [...CORE_FIELDS, 'entrance', 'areas'];
    if (Object.keys(record).length !== expected.length || Object.keys(record).some(key => !expected.includes(key as typeof expected[number]))) throw new Error('У подземелья неожиданные поля.');
    const areas = nodeList(record.areas, 'areas');
    if (typeof record.entrance !== 'string' || !areas.some(area => area.id === record.entrance)) throw new Error('Точка входа должна ссылаться на существующую область.');
    assertReachable(areas, record.entrance);
    return { kind, ...common, entrance: record.entrance, areas };
  }
  const expected = [...CORE_FIELDS, 'features'];
  if (Object.keys(record).length !== expected.length || Object.keys(record).some(key => !expected.includes(key as typeof expected[number]))) throw new Error('У локации неожиданные поля.');
  const features = nodeList(record.features, 'features');
  assertReachable(features, features[0].id);
  return { kind, ...common, features };
}

/** Local model writes narrative and linked exploration nodes only; no canon or executable rules are generated. */
export async function generateLocalWorldMaterial(input: WorldMaterialInput): Promise<LocalWorldMaterialResult> {
  const response = await fetch('/vtt/generation/world-material', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) {
    const reason = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Локальный генератор мест недоступен.';
    throw new Error(reason);
  }
  const payload = result as Record<string, unknown>;
  if (typeof payload.rawOutput !== 'string' || typeof payload.model !== 'string' || !payload.model.trim() ||
      typeof payload.generatedAt !== 'string' || !Number.isFinite(Date.parse(payload.generatedAt)) ||
      !payload.parameters || typeof payload.parameters !== 'object' || Array.isArray(payload.parameters)) {
    throw new Error('Локальный шлюз вернул неполные метаданные генерации.');
  }
  return {
    draft: parseDraft(payload.rawOutput, input.kind),
    model: payload.model,
    generatedAt: payload.generatedAt,
    parameters: payload.parameters as Readonly<Record<string, string | number | boolean>>,
    rawOutput: payload.rawOutput,
  };
}
