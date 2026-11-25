#!/usr/bin/env node
// Общая реализация повторяемой выгрузки ресурса API. Каждый каталоговый тип запускает её отдельным импортёром.
import { createHash } from 'node:crypto';
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).filter(key => !['url', 'updated_at'].includes(key)).sort()
    .map(key => [key, normalize(value[key])]));
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

export async function fetchSrdCollection(type) {
  const definition = getSrdImportDefinition(type);
  if (!definition.expectedCount || !definition.expectedIndexSha256 || !definition.collectionKey) {
    throw new Error(`${type}: в реестре нет зафиксированных границ коллекции`);
  }
  const get = async path => {
    const response = await fetch(`${definition.apiBase}${path}`);
    if (!response.ok) throw new Error(`${type}${path}: HTTP ${response.status}`);
    return response.json();
  };
  const list = await get('');
  const ids = (list.results ?? []).map(row => row.index).sort();
  const digest = createHash('sha256').update(ids.join('\n')).digest('hex');
  if (list.count !== definition.expectedCount || ids.length !== definition.expectedCount || digest !== definition.expectedIndexSha256) {
    throw new Error(`${type}: состав SRD-коллекции изменился (count=${list.count}, ids sha256=${digest})`);
  }
  const records = await pool(ids, 8, async id => {
    const raw = await get(`/${id}`);
    if (raw.index !== id || typeof raw.name !== 'string' || !raw.name.trim()) throw new Error(`${type}/${id}: API вернул неверный id или пустое имя`);
    const { index: _index, name, ...fields } = raw;
    if (fields.desc != null && !(typeof fields.desc === 'string' || (Array.isArray(fields.desc) && fields.desc.every(part => typeof part === 'string')))) {
      throw new Error(`${type}/${id}: неверный тип desc`);
    }
    return { id, name, ...normalize(fields) };
  });
  return { definition, records };
}

export async function importSrdCollection(type) {
  const { definition, records } = await fetchSrdCollection(type);
  process.stdout.write(`${records.length} ${definition.label}\n`);
  await writeSrdImport(type, { [definition.collectionKey]: records });
}
