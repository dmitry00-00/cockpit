#!/usr/bin/env node
// Языки SRD 5.1 из dnd5eapi.co; список фиксирован по документации API и сверяется при каждом импорте.
// Руками не править — перезапустить: `npm run import:srd -- language`.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const DEFINITION = getSrdImportDefinition('language');
const API = DEFINITION.apiBase;
const EXPECTED_IDS = [
  'abyssal', 'celestial', 'common', 'deep-speech', 'draconic', 'dwarvish', 'elvish', 'giant',
  'gnomish', 'goblin', 'halfling', 'infernal', 'orc', 'primordial', 'sylvan', 'undercommon',
];

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

function languageOf(raw, expectedIndex) {
  if (raw.index !== expectedIndex) throw new Error(`${expectedIndex}: API вернул index=${raw.index}`);
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error(`${expectedIndex}: у языка нет имени`);
  if (!['Standard', 'Exotic'].includes(raw.type)) throw new Error(`${expectedIndex}: неизвестный тип ${raw.type}`);
  if (raw.script != null && typeof raw.script !== 'string') throw new Error(`${expectedIndex}: некорректная письменность`);
  if (raw.typical_speakers != null && !Array.isArray(raw.typical_speakers)) {
    throw new Error(`${expectedIndex}: typical_speakers должен быть списком`);
  }

  return {
    id: raw.index,
    name: raw.name,
    type: raw.type,
    ...(raw.script ? { script: raw.script } : {}),
    ...(raw.typical_speakers ? { typicalSpeakers: raw.typical_speakers } : {}),
  };
}

const list = await get('');
const actualIds = (list.results ?? []).map(record => record.index).sort();
if (list.count !== EXPECTED_IDS.length || JSON.stringify(actualIds) !== JSON.stringify(EXPECTED_IDS)) {
  throw new Error(`Список языков SRD изменился; ожидалось ${EXPECTED_IDS.join(', ')}, получено ${actualIds.join(', ')}`);
}

const languages = await pool(list.results, 8, record => get(`/${record.index}`).then(data => languageOf(data, record.index)));
languages.sort((a, b) => a.name.localeCompare(b.name));
process.stdout.write(`${languages.length} языков\n`);
await writeSrdImport('language', { languages });
