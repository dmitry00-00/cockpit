import { describe, expect, it } from 'vitest';
import { ICONS } from '../icons/icons.generated';
import { CLASSES, FEATS, RACES, featById } from '../rules/compendium';
import { ABILITY_IDS } from '../rules/srd/abilities';
import { SPELLS } from '../rules/srd/spells';
import { TRAIT_ICON, abilityIcon, classIcon, featIcon, featureIcon, raceIcon, schoolIcon, traitIcon } from './sheetIcons';

describe('иконки листа (решение владельца 27.10.2026)', () => {
  it('своя иконка у каждой характеристики, класса и расы компендиума, у каждой школы заклинаний SRD', () => {
    for (const id of ABILITY_IDS) expect(ICONS[abilityIcon(id)], id).toBeDefined();
    for (const c of CLASSES) expect(classIcon(c.id), c.id).toBe(`cls-${c.id}`);
    for (const r of RACES) expect(raceIcon(r.id), r.id).toBe(`race-${r.id}`);
    for (const s of Object.values(SPELLS)) expect(ICONS[schoolIcon(s.school)], s.id).toBeDefined();
    expect(classIcon('homebrew')).toBe('ent-pc');
  });

  it('вид особенности расы и черта — существующая иконка набора', () => {
    for (const icon of Object.values(TRAIT_ICON)) expect(ICONS[icon], icon).toBeDefined();
    for (const f of FEATS) expect(ICONS[featIcon(f)], f.id).toBeDefined();
    expect(featIcon(undefined)).toBe('kind-other');
    // «Прочее» таблицы — по словам: «Везучий» перебрасывает 1.
    expect(traitIcon('other', 'Везучий', 'Если при броске атаки выпало «1», вы можете перебросить кость')).toBe('reroll');
    expect(traitIcon('save', 'Храбрый')).toBe('kind-save');
  });

  it('умение класса — вид по словам имени, затем текста: от узкого к широкому', () => {
    expect(featureIcon('Второе дыхание')).toBe('hp');
    expect(featureIcon('Дополнительная атака')).toBe('attack');
    expect(featureIcon('Аура защиты')).toBe('kind-aura');
    expect(featureIcon('Дикий облик')).toBe('kind-shape');
    expect(featureIcon('Ярость')).toBe('kind-claw');
    expect(featureIcon('Увеличение характеристик')).toBe('kind-bonus');
    expect(featureIcon('Боевой стиль', 'Вы получаете бонус к броскам атаки дальнобойным оружием')).toBe('attack');
    expect(featureIcon('Нечто', '')).toBe('kind-other');
  });

  // Остаток «прочего» (27.10.2026 — 16 %) — названия заклинаний из списков подклассов без текста («Волна грома»,
  // «Убежище») и виды гениев: по имени без текста их не отличить от умения.
  it('у умений классов «прочее» — меньшинство', () => {
    const all = CLASSES.flatMap(c => [...c.levels.flatMap(l => l.features), ...c.subclasses.flatMap(s => s.features)]);
    const other = all.filter(f => featureIcon(f.name, f.text) === 'kind-other');
    expect(other.length / all.length).toBeLessThan(0.2);
    expect(featById(FEATS[0].id)).toBeDefined();
  });
});
