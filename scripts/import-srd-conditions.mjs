#!/usr/bin/env node
// Состояния SRD 5.1 из dnd5eapi.co; проверяются полный список 15 id и дословные абзацы.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const API = getSrdImportDefinition('condition').apiBase;
const EXPECTED_IDS = [
  'blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious',
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

const list = await get('');
const ids = (list.results ?? []).map(row => row.index).sort();
if (list.count !== EXPECTED_IDS.length || JSON.stringify(ids) !== JSON.stringify([...EXPECTED_IDS].sort())) {
  throw new Error(`Список состояний SRD изменился: ${ids.join(', ')}`);
}
const conditions = await pool(ids, 6, async id => {
  const row = await get(`/${id}`);
  if (row.index !== id || typeof row.name !== 'string' || !row.name.trim()
    || !Array.isArray(row.desc) || !row.desc.length || !row.desc.every(line => typeof line === 'string' && line.trim())) {
    throw new Error(`${id}: неверные поля состояния`);
  }
  return { id, name: row.name, description: row.desc };
});
process.stdout.write(`${conditions.length} состояний\n`);
await writeSrdImport('condition', { conditions });
