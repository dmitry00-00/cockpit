#!/usr/bin/env node
// Десять действий в бою из узла Actions in Combat и его детей в иерархии правил SRD 5.1.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const API = getSrdImportDefinition('action').apiBase;
const EXPECTED_IDS = ['attack', 'cast-a-spell', 'dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'search', 'use-an-object'];
async function get(id) {
  const response = await fetch(`${API}/${id}`);
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  return response.json();
}

const parent = await get('actions-in-combat');
const ids = (parent.children ?? []).map(row => row.index);
if (parent.index !== 'actions-in-combat' || JSON.stringify(ids) !== JSON.stringify(EXPECTED_IDS)) {
  throw new Error(`Список Actions in Combat изменился: ${ids.join(', ')}`);
}
const actions = [];
for (const id of ids) {
  const row = await get(id);
  if (row.index !== id || typeof row.name !== 'string' || !row.name.trim()
    || typeof row.desc !== 'string' || !row.desc.trim()) {
    throw new Error(`${id}: неверные поля действия`);
  }
  actions.push({ id, name: row.name, description: row.desc });
}
process.stdout.write(`${actions.length} действий\n`);
await writeSrdImport('action', { actions });
