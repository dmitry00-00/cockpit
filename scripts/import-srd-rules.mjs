#!/usr/bin/env node
// Заголовки и описания правил SRD 5.1 из иерархического реестра dnd5eapi.
// Снимок сохраняет родителя, порядок дочерних ссылок и верхний раздел книги; текст не переписывается.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const DEFINITION = getSrdImportDefinition('rule');
const API = DEFINITION.apiBase;
const EXPECTED_COUNT = 137;
const EXPECTED_ROOT_COUNTS = {
  'Using Ability Scores': 18,
  Combat: 44,
  Equipment: 18,
  Adventuring: 26,
  Appendix: 13,
  Spellcasting: 18,
};

async function get(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function pool(items, concurrency, callback) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const index = next++;
      result[index] = await callback(items[index]);
    }
  }));
  return result;
}

const list = await get('');
if (list.count !== EXPECTED_COUNT || !Array.isArray(list.results) || list.results.length !== EXPECTED_COUNT) {
  throw new Error(`Список правил SRD изменился: ожидалось ${EXPECTED_COUNT}, получено ${list.count}`);
}

const rawRules = await pool(list.results, 8, async reference => {
  const rule = await get(`/${reference.index}`);
  if (rule.index !== reference.index || typeof rule.name !== 'string' || !rule.name.trim()) {
    throw new Error(`${reference.index}: API вернул неверный id или пустое имя`);
  }
  if (rule.desc != null && typeof rule.desc !== 'string') throw new Error(`${reference.index}: desc должен быть строкой`);
  return rule;
});

const byId = new Map(rawRules.map(rule => [rule.index, rule]));
if (byId.size !== EXPECTED_COUNT) throw new Error('Список правил содержит повторяющиеся id');

function rootOf(rule) {
  let current = rule;
  const seen = new Set();
  while (current.parent?.index) {
    if (seen.has(current.index)) throw new Error(`${rule.index}: цикл в родительских ссылках`);
    seen.add(current.index);
    current = byId.get(current.parent.index);
    if (!current) throw new Error(`${rule.index}: родитель отсутствует в списке SRD`);
  }
  return current;
}

const rootCounts = new Map();
for (const rule of rawRules) {
  const root = rootOf(rule);
  rootCounts.set(root.name, (rootCounts.get(root.name) ?? 0) + 1);
  for (const child of rule.children ?? []) {
    if (!byId.has(child.index)) throw new Error(`${rule.index}: дочернее правило ${child.index} отсутствует в списке`);
  }
}
if (JSON.stringify(Object.fromEntries([...rootCounts].sort(([a], [b]) => a < b ? -1 : 1)))
  !== JSON.stringify(Object.fromEntries(Object.entries(EXPECTED_ROOT_COUNTS).sort(([a], [b]) => a < b ? -1 : 1)))) {
  throw new Error(`Состав корневых разделов правил изменился: ${JSON.stringify(Object.fromEntries(rootCounts))}`);
}

const rules = rawRules.map(rule => ({
  id: rule.index,
  name: rule.name,
  bookSection: rootOf(rule).name,
  parentId: rule.parent?.index ?? null,
  childIds: (rule.children ?? []).map(child => child.index),
  ...(rule.desc ? { description: rule.desc } : {}),
})).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

process.stdout.write(`${rules.length} заголовков правил; разделы ${JSON.stringify(Object.fromEntries(rootCounts))}\n`);
await writeSrdImport('rule', { rules });
