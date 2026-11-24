import type { Actor, ImportedContent, State } from '../engine';
import { pcActor } from '../campaign/seed';
import { generatedSrdCharacterData, generatedSrdCharacterSpec, generatedSrdCharacterTemplate, validateGeneratedSrdCharacter } from './generatedSrdCharacter';

/** Promote only an accepted, source-locked character draft; the caller separately dispatches ACTOR_SPAWNED. */
export function promoteGeneratedSrdCharacterImport(content: ImportedContent, state: State, rightsConfirmed: boolean): Actor {
  if (!rightsConfirmed) throw new Error('Сначала подтвердите право использовать этот шаблон в текущей кампании.');
  const template = generatedSrdCharacterTemplate(content);
  if (!template || validateGeneratedSrdCharacter(content, template)) throw new Error('Нужен проверенный черновик персонажа на локальном шаблоне SRD.');
  const id = `import-${content.id}`;
  if (state.actors[id]) throw new Error('Этот персонаж уже добавлен в кампанию.');
  const preserveUserDetails = generatedSrdCharacterData(content)?.buildKind === 'custom-srd-build';
  return pcActor(generatedSrdCharacterSpec(template, id, content.name.trim(), preserveUserDetails));
}
