import type { Actor, ImportedContent, State } from '../engine';
import { monsterActor } from '../campaign/seed';
import { MONSTER_LIST, monsterOrigin, type Monster } from '../rules/srd/monsters';
import { hasConfirmedSrdSourceMarker } from './sourceProvenance';
import { generatedSrdMonsterData, validateGeneratedSrdMonster } from './generatedSrdMonster';

const normalizeName = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function hasConfirmedSrdSource(content: ImportedContent): boolean {
  if (content.sourceFormat !== '5etools' || content.kind !== 'monster') return false;
  return hasConfirmedSrdSourceMarker(content.data.source, content.data.sourceMetadata);
}

/** Match imported 5etools SRD entries only to the same-name local SRD block, never to a similarly named third-party block. */
export function srdMonsterForImport(content: ImportedContent): Monster | undefined {
  if (content.kind === 'monster' && content.sourceFormat === 'json') {
    const generated = generatedSrdMonsterData(content);
    const base = generated ? MONSTER_LIST.find(monster => monster.id === generated.baseMonsterId) : undefined;
    return base && !validateGeneratedSrdMonster(content, base) ? base : undefined;
  }
  if (!hasConfirmedSrdSource(content)) return undefined;
  const name = normalizeName(content.name);
  return MONSTER_LIST.find(monster => monsterOrigin(monster) === 'srd' && normalizeName(monster.name) === name);
}

/**
 * Turn an accepted catalog entry into a live campaign actor. The caller still makes the GM confirm its use;
 * source markers establish provenance, not the importer's rights to a particular file or generated description.
 */
export function promoteSrdMonsterImport(content: ImportedContent, state: State, rightsConfirmed: boolean): Actor {
  if (!rightsConfirmed) throw new Error('Сначала подтвердите право использовать этот блок в текущей кампании.');
  const monster = srdMonsterForImport(content);
  if (!monster) throw new Error('Нужна запись 5etools с подтверждённым SRD-источником или проверенная вариация на локальном блоке SRD.');
  const id = `import-${content.id}`;
  if (state.actors[id]) throw new Error('Эта запись уже добавлена в кампанию.');
  return monsterActor(id, monster.id, content.name.trim());
}
