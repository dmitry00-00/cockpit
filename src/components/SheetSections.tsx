// Секции листа персонажа, которые пришли с редактором: выборы умений, атаки, заклинания, снаряжение. Одни и те же
// на карточке стола и в живой карточке редактора — факт рисуется в одном виде. Тупые: читают только переданный лист
// и справочники SRD по id (тексты заклинаний и предметов). Пустая секция не рисуется вовсе.
import type { ReactNode } from 'react';
import type { CharacterSheet } from '../engine/state';
import { ABILITIES } from '../rules/srd/abilities';
import { DAMAGE_LABEL, ITEMS, armorIdOfItem } from '../rules/srd/equipment';
import { SCHOOL_LABEL, SPELLS, spellLevelLabel } from '../rules/srd/spells';
import { featById } from '../rules/compendium';
import { SKILL_LABEL } from './labels';
import { IconGrid } from './IconGrid';
import { featIcon, schoolIcon } from './sheetIcons';
import type { InventoryItem, SlotId, SlotItem, Weapon } from './Paperdoll';
import { signedMod } from './StatTile';

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2 truncate">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Подпись варианта выбора: навык — по-русски, воровские инструменты — словами, остальное — как пришло. */
export function choiceValueLabel(id: string, name: string): string {
  if (id === 'thieves-tools') return 'Воровские инструменты';
  return (SKILL_LABEL as Record<string, string>)[id] ?? name;
}

/** Сделанные выборы умений: «Боевой стиль — Оборона», «Компетентность — Скрытность, Воровские инструменты». */
export function SheetChoices({ sheet }: { sheet: Pick<CharacterSheet, 'choices'> }) {
  const list = sheet.choices ?? [];
  if (list.length === 0) return null;
  return (
    <Section title="Выборы умений">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-part="choices">
        {list.map(c => (
          <div key={c.id} className="contents">
            <dt className="type-key uppercase text-t2 whitespace-nowrap">{c.label}</dt>
            <dd className="type-body-sm text-tx min-w-0 truncate" title={c.values.map(v => choiceValueLabel(v.id, v.name)).join(', ')}>
              {c.values.map(v => choiceValueLabel(v.id, v.name)).join(', ')}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

/** Черты (feats) листа иконками вида: имя, где взяты и +1 к характеристике — в тултипе; щелчок — текст из таблицы владельца. */
export function SheetFeats({ sheet }: { sheet: Pick<CharacterSheet, 'feats'> }) {
  const list = sheet.feats ?? [];
  if (list.length === 0) return null;
  return (
    <Section title="Черты">
      <IconGrid
        label="Черты листа"
        items={list.map(f => {
          const feat = featById(f.id);
          return {
            key: `${f.at}:${f.id}`,
            icon: featIcon(feat),
            name: f.name,
            meta: [f.at === 'race' ? 'раса' : `${f.at} ур.`, f.asi ? `+1 ${ABILITIES[f.asi].code}` : ''].filter(Boolean).join(' · '),
            text: feat?.text ?? '',
            ...(feat ? { ref: `feat:${feat.id}` as const } : {}),
          };
        })}
      />
    </Section>
  );
}

/** «1d8 + 3 рубящий» — урон с типом по-русски. */
const damageText = (damage: string, type: string) => `${damage}${type ? ` ${DAMAGE_LABEL[type] ?? type}` : ''}`;

/** Атаки оружием из снаряжения: бонус и урон уже посчитаны листом. Без владения — подпись, а не цвет. */
export function SheetAttacks({ sheet, hints = {} }: { sheet: Pick<CharacterSheet, 'attacks'>; hints?: Readonly<Record<string, string>> }) {
  const list = sheet.attacks ?? [];
  if (list.length === 0) return null;
  return (
    <Section title="Атаки">
      <ul className="flex flex-col gap-0.5" aria-label="Атаки листа">
        {list.map(a => (
          <li key={a.id} className="flex items-baseline gap-2 type-body-sm" title={`${a.name}: ${signedMod(a.toHit)} к попаданию, ${damageText(a.damage, a.damageType)}${a.range ? `, дистанция ${a.range} фт` : ''}${a.proficient ? '' : ' · без владения'}${a.disadvantage ? ` · с помехой: ${a.disadvantage}` : ''}${hints[a.id] ? `\nпопадание ${hints[a.id]}` : ''}`}>
            <span className="type-num-12 text-gd w-7 flex-none">{signedMod(a.toHit)}</span>
            <span className="text-tx flex-1 min-w-0 truncate">{a.name}{a.proficient ? '' : <span className="type-key text-t3"> без владения</span>}{a.disadvantage ? <span className="type-key text-t3"> с помехой</span> : ''}</span>
            <span className="type-num-12 text-t2 flex-none whitespace-nowrap">{a.damage}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Тултип заклинания: круг, школа, время, дистанция, длительность — из SRD. */
export function spellTitle(id: string): string {
  const s = SPELLS[id];
  if (!s) return id;
  const marks = [s.concentration ? 'концентрация' : '', s.ritual ? 'ритуал' : ''].filter(Boolean).join(', ');
  return `${s.name} · ${spellLevelLabel(s.level)}, ${SCHOOL_LABEL[s.school]} · ${s.castingTime}, ${s.range}, ${s.duration}${marks ? ` · ${marks}` : ''}`;
}

/**
 * Заклинания листа: Сл спасброска и бонус атаки, заговоры, заклинания по кругам; «всегда подготовленные» (домен,
 * клятва) — с пометкой. Имена — английские, как в SRD (по ним ищут в книге).
 */
export function SheetSpells({ sheet, extra, hint }: { sheet: Pick<CharacterSheet, 'spellcasting'>; extra?: ReactNode; hint?: string }) {
  const sc = sheet.spellcasting;
  if (!sc) return null;
  const leveled = [...sc.spells.map(id => ({ id, always: false })), ...sc.always.map(id => ({ id, always: true }))]
    .filter(x => SPELLS[x.id])
    .sort((a, b) => SPELLS[a.id].level - SPELLS[b.id].level || SPELLS[a.id].name.localeCompare(SPELLS[b.id].name));
  const levels = [...new Set(leveled.map(x => SPELLS[x.id].level))];
  const kind = sc.kind === 'spellbook' ? 'в книге' : sc.kind === 'prepared' ? 'подготовлены' : 'известны';
  const item = (id: string, always = false) => ({
    key: id,
    icon: schoolIcon(SPELLS[id].school),
    name: SPELLS[id].name,
    meta: [SCHOOL_LABEL[SPELLS[id].school], SPELLS[id].concentration ? 'К' : '', always ? 'всегда' : ''].filter(Boolean).join(' · '),
    text: `${spellTitle(id)}\n\n${SPELLS[id].text}`,
    ref: `spell:${id}` as const,
  });
  return (
    <Section title="Заклинания" right={<span className="type-key text-t2 whitespace-nowrap" title={`Заклинательная характеристика ${ABILITIES[sc.ability].code}: Сл спасброска ${sc.saveDc}, бонус атаки ${signedMod(sc.attack)}${hint ? `\n${hint}` : ''}`}>{ABILITIES[sc.ability].code} · Сл {sc.saveDc} · атака {signedMod(sc.attack)}</span>}>
      <div className="flex flex-col gap-2" data-part="spells">
        {sc.cantrips.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="type-key uppercase text-t2">Заговоры</span>
            <IconGrid label="Заговоры" items={sc.cantrips.filter(id => SPELLS[id]).map(id => item(id))} />
          </div>
        ) : null}
        {levels.map(l => (
          <div key={l} className="flex flex-col gap-1">
            <span className="type-key uppercase text-t2">{l} круг · {kind}</span>
            <IconGrid label={`Заклинания ${l} круга`} items={leveled.filter(x => SPELLS[x.id].level === l).map(x => item(x.id, x.always))} />
          </div>
        ))}
        {extra}
      </div>
    </Section>
  );
}

/** Строка снаряжения: «Explorer's Pack», «Javelin ×4»; у набора — содержимое в тултипе. */
export function itemLabel(id: string, qty: number): string {
  const name = ITEMS[id]?.name ?? id;
  return qty > 1 ? `${name} ×${qty}` : name;
}

function itemTitle(id: string): string {
  const it = ITEMS[id];
  if (!it) return id;
  if (it.contents) return `${it.name}: ${it.contents.map(c => itemLabel(c.id, c.qty)).join(', ')}`;
  if (it.weapon) return `${it.name} · ${it.weapon.damage ?? '—'}${it.weapon.damageType ? ` ${DAMAGE_LABEL[it.weapon.damageType] ?? it.weapon.damageType}` : ''}${it.weapon.properties.length ? ` · ${it.weapon.properties.join(', ')}` : ''}`;
  if (it.armor) return `${it.name} · AC ${it.armor.baseAc}${it.armor.strength ? ` · STR ${it.armor.strength}` : ''}`;
  return it.name;
}

/** Снаряжение списком: надетое — пометкой «надет», наборы — с содержимым в тултипе. */
export function SheetEquipment({ sheet }: { sheet: Pick<CharacterSheet, 'equipment' | 'armor' | 'shield'> }) {
  const list = sheet.equipment ?? [];
  if (list.length === 0) return null;
  const worn = (id: string) => (sheet.armor && armorIdOfItem(id) === sheet.armor) || (id === 'shield' && sheet.shield);
  return (
    <Section title="Снаряжение">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5" aria-label="Снаряжение листа">
        {list.map(l => (
          <li key={l.id} className="type-body-sm text-tx truncate" title={itemTitle(l.id)}>
            {itemLabel(l.id, l.qty)}{worn(l.id) ? <span className="type-key text-t3"> надет</span> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Лист → пропсы куклы: оружие с попаданием и уроном, прочее — ячейками инвентаря. Доспех и щит — слотами, как прежде. */
export function dollExtrasOf(sheet: Pick<CharacterSheet, 'attacks' | 'equipment'> | undefined): { weapons?: Weapon[]; inventory?: InventoryItem[] } {
  if (!sheet) return {};
  const weapons = (sheet.attacks ?? []).map(a => ({ name: a.name, hit: signedMod(a.toHit), dmg: a.damage }));
  const inventory = (sheet.equipment ?? [])
    .filter(l => !ITEMS[l.id]?.weapon && !ITEMS[l.id]?.armor && l.id !== 'shield')
    .map(l => ({ name: itemLabel(l.id, l.qty), icon: 'ent-item' as const }));
  return { ...(weapons.length ? { weapons } : {}), ...(inventory.length ? { inventory } : {}) };
}

export type { SlotId, SlotItem };
