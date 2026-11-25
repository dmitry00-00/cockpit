#!/usr/bin/env node
// Наборы выбираемых умений извлекаются из SRD features; детали 32 воззваний связываются по точному id.
import { createHash } from 'node:crypto';
import { fetchSrdCollection } from './import-srd-collection.mjs';
import { getSrdImportDefinition, writeSrdImport } from './srd-import-registry.mjs';

const definition = getSrdImportDefinition('class-option');
const { records } = await fetchSrdCollection('feature');
const featuresById = new Map(records.map(feature => [feature.id, feature]));
const options = records.filter(feature => feature.feature_specific).map(feature => {
  const { id, name, class: classRef, subclass, level, feature_specific } = feature;
  const option = {
    id,
    name,
    classId: classRef?.index ?? null,
    ...(subclass?.index ? { subclassId: subclass.index } : {}),
    ...(typeof level === 'number' ? { level } : {}),
    choices: feature_specific,
  };

  if (id !== 'eldritch-invocations' || classRef?.index !== 'warlock') return option;
  const invocations = feature_specific.invocations;
  if (!Array.isArray(invocations)) throw new Error('eldritch-invocations: ожидался список вариантов');

  return {
    ...option,
    choices: {
      ...feature_specific,
      invocations: invocations.map(reference => {
        const detail = featuresById.get(reference.index);
        if (!detail || detail.parent?.index !== id) {
          throw new Error(`eldritch-invocations: нет исходной записи для ${reference.index}`);
        }
        return {
          ...reference,
          ...(typeof detail.level === 'number' ? { level: detail.level } : {}),
          prerequisites: Array.isArray(detail.prerequisites) ? detail.prerequisites : [],
        };
      }),
    },
  };
});
const ids = options.map(row => row.id).sort();
const digest = createHash('sha256').update(ids.join('\n')).digest('hex');
if (options.length !== definition.expectedCount || digest !== definition.expectedIndexSha256) {
  throw new Error(`class-option: состав наборов вариантов изменился (count=${options.length}, ids sha256=${digest})`);
}
process.stdout.write(`${options.length} наборов вариантов\n`);
await writeSrdImport('class-option', { classOptions: options });
