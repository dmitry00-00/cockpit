import type { Actor, CharacterLeveled } from '../engine';
import { leveledSnapshot } from '../engine/characterLevel';
import { ABILITIES, ABILITY_IDS } from '../rules/srd/abilities';
import { SPELLS } from '../rules/srd/spells';
import { classById, featById } from '../rules/compendium';
import { levelUp, levelUpPlan, type LevelUpChoice } from './levelUp';
import { poolLabel, resourcePoolsOf } from './resources';
import { pathFeatureKind } from './path';
import { hitDiceOf } from './rest';
import { levelUpFeatEffectOf } from './featEffects';
import { ARCHERY_STYLE, DEFENSE_STYLE } from './derive';

export interface LevelPreviewLine { label: string; before: string; after: string }
export type LevelUpPreview =
  | { kind: 'invalid'; reason: string }
  | { kind: 'ready'; actor: Actor; change: CharacterLeveled; lines: readonly LevelPreviewLine[]; gained: readonly string[]; warnings: readonly string[] };

const SUPPORTED_FIGHTING_STYLES = new Set([ARCHERY_STYLE, DEFENSE_STYLE]);

/** Вычисляет ровно результат существующего повышения, без dispatch/сохранения/броска. */
export function previewLevelUp(actor: Actor, choice: LevelUpChoice): LevelUpPreview {
  try {
    const change = levelUp(actor, choice);
    const snap = leveledSnapshot(actor, change);
    const after: Actor = { ...actor, ...snap, hp: { ...actor.hp, ...snap.hp } };
    const before = actor.sheet!;
    const next = after.sheet!;
    const lines: LevelPreviewLine[] = [];
    const line = (label: string, a: string | number | undefined, b: string | number | undefined) => {
      const av = String(a ?? '—'), bv = String(b ?? '—');
      if (av !== bv) lines.push({ label, before: av, after: bv });
    };
    line('Уровень класса', before.level, next.level);
    line('Хиты', `${actor.hp.current}/${actor.hp.max}`, `${after.hp.current}/${after.hp.max}`);
    line('Класс доспеха', actor.ac, after.ac);
    line('Пассивная внимательность', actor.passivePerception, after.passivePerception);
    line('Бонус мастерства', before.proficiencyBonus, next.proficiencyBonus);
    for (const ab of ABILITY_IDS) line(ABILITIES[ab].code, before.abilities[ab], next.abilities[ab]);
    const cls = classById(next.classId)!;
    const subName = (id: string | undefined) => cls.subclasses.find(s => s.id === id)?.name;
    line('Подкласс', subName(before.subclassId), subName(next.subclassId));
    const pools = resourcePoolsOf(actor), futurePools = resourcePoolsOf(after);
    for (const id of new Set([...pools, ...futurePools].map(p => p.id))) {
      const a = pools.find(p => p.id === id), b = futurePools.find(p => p.id === id);
      line(poolLabel(b ?? a!), a ? `${a.available}/${a.max}` : undefined, b ? `${b.available}/${b.max}` : undefined);
    }
    const hitDie = (a: Actor) => { const pool = hitDiceOf(a); return pool ? `${pool.available}/${pool.total}` : undefined; };
    line('Кости хитов: осталось', hitDie(actor), hitDie(after));
    line('Сл заклинаний', before.spellcasting?.saveDc, next.spellcasting?.saveDc);
    line('Атака заклинанием', before.spellcasting?.attack, next.spellcasting?.attack);
    line('Высший круг', before.spellcasting?.maxLevel, next.spellcasting?.maxLevel);
    line('Лимит подготовки', before.spellcasting?.preparedLimit, next.spellcasting?.preparedLimit);
    const names = (ids: readonly string[] | undefined) => ids?.map(id => SPELLS[id]?.name ?? id).join(', ') || undefined;
    line('Заговоры', names(before.spellcasting?.cantrips), names(next.spellcasting?.cantrips));
    line(next.spellcasting?.kind === 'spellbook' ? 'Книга заклинаний' : 'Заклинания', names(before.spellcasting?.spells), names(next.spellcasting?.spells));
    for (const attack of next.attacks ?? []) {
      const old = before.attacks?.find(a => a.id === attack.id);
      line(attack.name, old ? `${old.toHit >= 0 ? '+' : ''}${old.toHit}; ${old.damage}` : undefined, `${attack.toHit >= 0 ? '+' : ''}${attack.toHit}; ${attack.damage}`);
    }
    const newFeatures = [
      ...(cls.levels.find(l => l.level === next.level)?.features ?? []),
      ...(cls.subclasses.find(s => s.id === next.subclassId)?.features.filter(f => f.level === next.level) ?? []),
    ];
    const activePlan = levelUpPlan(actor, choice.subclassId);
    const resolvedChoiceIds = new Set(activePlan.featureChoices
      .filter(fc => (choice.featureChoices?.[fc.id]?.length ?? 0) === fc.required && fc.required > 0)
      .map(fc => fc.id));
    const warnings = newFeatures.filter(f => {
      if (pathFeatureKind(f) === 'level') return false;
      const block = f.choice ? cls.options?.find(option => option.id === f.choice) : undefined;
      const label = (block?.name ?? f.name).toLocaleLowerCase('ru').replace(/[·\s]/g, '');
      const related = activePlan.featureChoices.find(fc => fc.label.toLocaleLowerCase('ru').replace(/[·\s]/g, '') === label);
      return !related || !resolvedChoiceIds.has(related.id);
    }).map(f => `«${f.name}»: требуется выбор по описанию; для него нет точной схемы и решения.`);
    if (choice.featId) {
      const feat = featById(choice.featId);
      if (feat) warnings.push(levelUpFeatEffectOf(feat)?.hp
        ? `«${feat.nameRu}»: эффект максимума хитов применён по импортированной строке; издание книги в таблице не указано.`
        : `«${feat.nameRu}»: источник и выбор сохраняются${feat.source === 'book' ? ', издание книги в таблице не указано' : ''}; прочие эффекты не рассчитываются.`);
    }
    for (const fc of activePlan.featureChoices) {
      const values = choice.featureChoices?.[fc.id] ?? [];
      const unsupported = fc.id === 'fighting-style'
        ? values.some(id => !SUPPORTED_FIGHTING_STYLES.has(id))
        : fc.mechanicalSupport === 'informational';
      if (unsupported && values.length) warnings.push(`«${fc.label}»: выбор записан с источником и уровнем, но его механический эффект здесь не рассчитывается.`);
      for (const note of fc.notes ?? []) warnings.push(`«${fc.label}»: ${note}`);
    }
    if (!next.subclassId && cls.subclasses.some(s => s.gainedAt !== null && s.gainedAt <= next.level)) {
      warnings.push('Подкласс в листе не выбран. Расчёт не учитывает его умения.');
    }
    return { kind: 'ready', actor: after, change, lines, gained: change.gained, warnings };
  } catch (err) {
    return { kind: 'invalid', reason: err instanceof Error ? err.message : String(err) };
  }
}
