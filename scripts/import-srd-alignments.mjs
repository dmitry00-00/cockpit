#!/usr/bin/env node
// Мировоззрения SRD 5.1 из dnd5eapi.co; точный список проверяется при каждом импорте.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const API = getSrdImportDefinition('alignment').apiBase;
const EXPECTED = {
  'chaotic-evil': ['Chaotic Evil', 'CE'], 'chaotic-good': ['Chaotic Good', 'CG'],
  'chaotic-neutral': ['Chaotic Neutral', 'CN'], 'lawful-evil': ['Lawful Evil', 'LE'],
  'lawful-good': ['Lawful Good', 'LG'], 'lawful-neutral': ['Lawful Neutral', 'LN'],
  neutral: ['Neutral', 'N'], 'neutral-evil': ['Neutral Evil', 'NE'], 'neutral-good': ['Neutral Good', 'NG'],
};
const DISPLAY_ORDER = ['lawful-good', 'neutral-good', 'chaotic-good', 'lawful-neutral', 'neutral', 'chaotic-neutral', 'lawful-evil', 'neutral-evil', 'chaotic-evil'];

async function get(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const list = await get('');
const ids = (list.results ?? []).map(row => row.index).sort();
if (list.count !== 9 || JSON.stringify(ids) !== JSON.stringify(Object.keys(EXPECTED).sort())) {
  throw new Error(`Список мировоззрений SRD изменился: ${ids.join(', ')}`);
}
const alignments = [];
for (const id of DISPLAY_ORDER) {
  const row = await get(`/${id}`);
  const [name, abbreviation] = EXPECTED[id];
  if (row.index !== id || row.name !== name || row.abbreviation !== abbreviation || typeof row.desc !== 'string' || !row.desc.trim()) {
    throw new Error(`${id}: неверные поля мировоззрения`);
  }
  alignments.push({ id, name, abbreviation, description: row.desc });
}
process.stdout.write(`${alignments.length} мировоззрений\n`);
await writeSrdImport('alignment', { alignments });
