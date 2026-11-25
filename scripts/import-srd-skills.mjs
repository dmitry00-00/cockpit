#!/usr/bin/env node
// Навыки SRD 5.1 из dnd5eapi.co; фиксированные 18 id и привязки к характеристикам проверяются при каждом импорте.
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const DEFINITION = getSrdImportDefinition('skill');
const API = DEFINITION.apiBase;
const EXPECTED = {
  acrobatics: ['Acrobatics', 'dex'], 'animal-handling': ['Animal Handling', 'wis'], arcana: ['Arcana', 'int'],
  athletics: ['Athletics', 'str'], deception: ['Deception', 'cha'], history: ['History', 'int'], insight: ['Insight', 'wis'],
  intimidation: ['Intimidation', 'cha'], investigation: ['Investigation', 'int'], medicine: ['Medicine', 'wis'],
  nature: ['Nature', 'int'], perception: ['Perception', 'wis'], performance: ['Performance', 'cha'],
  persuasion: ['Persuasion', 'cha'], religion: ['Religion', 'int'], 'sleight-of-hand': ['Sleight of Hand', 'dex'],
  stealth: ['Stealth', 'dex'], survival: ['Survival', 'wis'],
};

async function get(path) {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const list = await get('');
const ids = (list.results ?? []).map(record => record.index).sort();
const expectedIds = Object.keys(EXPECTED).sort();
if (list.count !== expectedIds.length || JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
  throw new Error(`Список навыков SRD изменился: ${ids.join(', ')}`);
}

const skills = [];
for (const id of expectedIds) {
  const raw = await get(`/${id}`);
  const [name, abilityId] = EXPECTED[id];
  if (raw.index !== id || raw.name !== name || raw.ability_score?.index !== abilityId) {
    throw new Error(`${id}: имя или характеристика не совпали с SRD 5.1`);
  }
  if (!Array.isArray(raw.desc) || !raw.desc.every(line => typeof line === 'string' && line.trim())) {
    throw new Error(`${id}: ожидалось непустое текстовое описание`);
  }
  skills.push({ id, name, abilityId, description: raw.desc });
}

process.stdout.write(`${skills.length} навыков\n`);
await writeSrdImport('skill', { skills });
