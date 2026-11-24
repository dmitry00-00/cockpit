#!/usr/bin/env node
// Характеристики SRD 5.1 из dnd5eapi.co; фиксированный набор из шести характеристик проверяется при каждом импорте.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const DEFINITION = getSrdImportDefinition('ability-score');
const API = DEFINITION.apiBase;
const EXPECTED = [
  { id: 'str', code: 'STR', name: 'Strength' },
  { id: 'dex', code: 'DEX', name: 'Dexterity' },
  { id: 'con', code: 'CON', name: 'Constitution' },
  { id: 'int', code: 'INT', name: 'Intelligence' },
  { id: 'wis', code: 'WIS', name: 'Wisdom' },
  { id: 'cha', code: 'CHA', name: 'Charisma' },
];

async function get(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const list = await get('');
const ids = (list.results ?? []).map(record => record.index).sort();
if (list.count !== EXPECTED.length || JSON.stringify(ids) !== JSON.stringify(EXPECTED.map(row => row.id).sort())) {
  throw new Error(`Список характеристик SRD изменился: ${ids.join(', ')}`);
}

const abilityScores = [];
for (const expected of EXPECTED) {
  const raw = await get(`/${expected.id}`);
  if (raw.index !== expected.id || raw.name !== expected.code || raw.full_name !== expected.name) {
    throw new Error(`${expected.id}: API вернул неожиданные идентификатор или имя`);
  }
  if (!Array.isArray(raw.desc) || !raw.desc.every(line => typeof line === 'string' && line.trim())) {
    throw new Error(`${expected.id}: ожидалось непустое текстовое описание`);
  }
  const skillIds = (raw.skills ?? []).map(skill => skill.index);
  if (skillIds.some(id => typeof id !== 'string') || new Set(skillIds).size !== skillIds.length) {
    throw new Error(`${expected.id}: некорректный список навыков`);
  }
  abilityScores.push({ ...expected, description: raw.desc, skillIds });
}

process.stdout.write(`${abilityScores.length} характеристик\n`);
await writeSrdImport('ability-score', { abilityScores });
