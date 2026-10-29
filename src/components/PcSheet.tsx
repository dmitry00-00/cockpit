// Лист персонажа по бумажной карточке владельца (пиксельная карточка Bo Tambernack): портрет с уровнем,
// характеристики «очко крупно — модификатор в утопленной ячейке — спасбросок», навыки списком в две колонки
// с меткой владения и характеристикой в скобках, «Владение +N» в шапке навыков. И паспорт данных: откуда лист
// и чего в нём нет — одной моноширинной строкой, чтобы мастер видел, можно ли верить записи, до первого скролла.
// Тупые: числа считает campaign/sheetView.ts, страница передаёт их пропсами; клик — бросок через onRoll.
import type { ReactNode } from 'react';
import type { EntityRef } from '../entities/ref';
import { Icon, type IconName } from '../icons/Icon';
import { useOpenEntity } from './openEntity';
import { abilityIcon } from './sheetIcons';
import { ABILITIES, type AbilityId, type SkillId } from '../rules/srd/abilities';
import { SKILL_LABEL } from './labels';
import { signedMod, tileEdge } from './StatTile';

export interface AbilityCell {
  id: AbilityId;
  score: number;
  mod: number;
  save: number;
  saveProficient: boolean;
  /** Из чего спасбросок — строка дерева вывода (ROADMAP 5.4) в подсказку. */
  hint?: string;
}

export type SkillProficiency = 'none' | 'proficient' | 'expert';

export interface SkillCell {
  id: SkillId;
  ability: AbilityId;
  mod: number;
  proficiency: SkillProficiency;
  /** Из чего модификатор — строка дерева вывода (ROADMAP 5.4) в подсказку. */
  hint?: string;
}

const ROLL_HOVER = 'cursor-pointer enabled:hover:from-pl enabled:hover:to-pl focus-visible:shadow-[var(--bevel),var(--glow-gold)]';

/**
 * Шесть характеристик плитками: код, очко крупно (как на карточке), модификатор — в утопленной ячейке под ним,
 * спасбросок — строкой с золотой меткой владения. Клик — проверка характеристики d20 + модификатор.
 */
export function AbilityScores({ abilities, onRoll, right }: { abilities: readonly AbilityCell[]; onRoll?: (a: AbilityCell) => void; right?: ReactNode }) {
  return (
    <section aria-label="Характеристики" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2 truncate">Характеристики</h3>
        {right}
      </div>
      <div className="grid grid-cols-6 gap-1" data-part="abilities">
        {abilities.map(a => (
          <button
            key={a.id}
            type="button"
            title={`${ABILITIES[a.id].name}: ${signedMod(a.mod)} · спасбросок ${signedMod(a.save)}${a.saveProficient ? ' (владение)' : ''}${a.hint ? `\n${a.hint}` : ''}`}
            onClick={onRoll ? () => onRoll(a) : undefined}
            disabled={!onRoll}
            className={`relative flex flex-col items-center gap-0.5 pt-1.5 pb-1 bg-linear-to-b from-pl to-cd ${tileEdge(a.id, false)} ${ROLL_HOVER} disabled:cursor-default`}
          >
            {/* Код первым: по нему кнопку находят и читают («DEX …»), иконка — после. */}
            <span className="flex items-center gap-1 type-num-12 uppercase text-t2">
              {ABILITIES[a.id].code}
              <Icon name={abilityIcon(a.id)} size={16} title={ABILITIES[a.id].name} />
            </span>
            <span className="type-num-24 text-tx [text-shadow:0_1px_0_var(--lo)]">{a.score}</span>
            <span className="type-num-15 text-tx bg-wl shadow-bevel-in min-w-9 text-center" data-part="mod">{signedMod(a.mod)}</span>
            <span className={`flex items-center gap-1 type-num-12 ${a.saveProficient ? 'text-gd' : 'text-t2'}`} data-part="save">
              {a.saveProficient
                ? <span role="img" aria-label="владение спасброском" title="владение спасброском" className="size-2 bg-gd" />
                : <span aria-hidden className="size-2 bg-wl shadow-bevel-in" />}
              {signedMod(a.save)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Метка владения навыком: пустая утопленная, одна золотая — владение, две — компетентность. Форма, а не только цвет. */
export function ProficiencyMark({ proficiency }: { proficiency: SkillProficiency }) {
  if (proficiency === 'none') return <span aria-hidden className="size-2 flex-none bg-wl shadow-bevel-in" />;
  const label = proficiency === 'expert' ? 'компетентность' : 'владение';
  return (
    <span role="img" aria-label={label} title={label} className="flex-none flex gap-px">
      <span className="size-2 bg-gd" />
      {proficiency === 'expert' ? <span className="size-2 bg-gd" /> : null}
    </span>
  );
}

/** Русский алфавит, как на бумажной карточке (там — английский): навык ищут глазами по имени, а не по характеристике. */
export const bySkillLabel = (a: { id: SkillId }, b: { id: SkillId }) => SKILL_LABEL[a.id].localeCompare(SKILL_LABEL[b.id], 'ru');

/**
 * Навыки списком: метка владения, модификатор, имя, код характеристики. Две колонки в одиночной карточке и одна —
 * во второй колонке оверлея. Шапка — «Владение +N» справа, как «Proficiency: +2» на карточке.
 */
export function SkillList({ skills, proficiencyBonus, onRoll, columns = 2 }: {
  skills: readonly SkillCell[];
  proficiencyBonus: number;
  onRoll?: (s: SkillCell) => void;
  columns?: 1 | 2;
}) {
  const sorted = [...skills].sort(bySkillLabel);
  // Две колонки читаются сверху вниз, как на бумаге: первая половина алфавита слева.
  const rows = columns === 2 ? Math.ceil(sorted.length / 2) : sorted.length;
  return (
    <section aria-label="Навыки" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-h-15 uppercase text-t2 truncate">Навыки</h3>
        <span className="type-key text-gd whitespace-nowrap" title="Бонус мастерства: прибавляется к навыкам и спасброскам с владением">Владение {signedMod(proficiencyBonus)}</span>
      </div>
      <ul
        className={`grid gap-x-3 bg-wl shadow-bevel-in p-1 ${columns === 2 ? 'grid-cols-2 grid-flow-col' : 'grid-cols-1'}`}
        style={columns === 2 ? { gridTemplateRows: `repeat(${rows}, auto)` } : undefined}
        data-part="skills"
      >
        {sorted.map(s => {
          const label = SKILL_LABEL[s.id];
          const code = ABILITIES[s.ability].code;
          const prof = s.proficiency === 'expert' ? ' · компетентность' : s.proficiency === 'proficient' ? ' · владение' : '';
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                aria-label={`${label} ${signedMod(s.mod)}`}
                title={`${label} (${code}) ${signedMod(s.mod)}${prof} · бросок d20${s.hint ? `\n${s.hint}` : ''}`}
                onClick={onRoll ? () => onRoll(s) : undefined}
                disabled={!onRoll}
                className="w-full flex items-center gap-1.5 px-1 py-0.5 text-left enabled:cursor-pointer enabled:hover:bg-cd focus-visible:shadow-[var(--glow-gold)]"
              >
                <ProficiencyMark proficiency={s.proficiency} />
                <span className={`type-num-15 w-7 flex-none text-right ${s.proficiency === 'none' ? 'text-t2' : 'text-tx'}`}>{signedMod(s.mod)}</span>
                <span className="type-body-sm text-tx flex-1 min-w-0 truncate">{label}</span>
                <span className="type-key text-t3 flex-none">{code}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface PassportData {
  origin: string;
  parts: readonly string[];
  missing: readonly string[];
}

/**
 * Паспорт данных листа (только стол мастера): «сид кампании · раса книга · класс SRD · заклинаний 6» и тревога
 * «нет: мировоззрение» — словом «нет», а не одним цветом.
 */
export function DataPassport({ passport }: { passport: PassportData }) {
  const all = [passport.origin, ...passport.parts];
  return (
    <p aria-label="Паспорт данных" data-part="passport" className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 type-key text-t2">
      <Icon name="src-dm" size={16} color="var(--t2)" title="Откуда запись" />
      {all.map((p, i) => (
        <span key={p} className="whitespace-nowrap">{i > 0 ? <span aria-hidden className="text-t3">· </span> : null}{p}</span>
      ))}
      {passport.missing.length > 0 ? (
        <span className="whitespace-nowrap text-fx-debuff-hi" title="Чего нет на листе: заполняется в редакторе или со слов игрока">
          <span aria-hidden className="text-t3">· </span>нет: {passport.missing.join(', ')}
        </span>
      ) : null}
    </p>
  );
}

/** Строка бога в шапке листа: имя открывает карточку бога (если стол дал вход), символ — следом. */
function DeityLine({ deity }: { deity: NonNullable<PcHeaderData['deity']> }) {
  const openEntity = useOpenEntity();
  return (
    <span className="flex items-center gap-1 min-w-0" data-part="deity" title={deity.symbol ? `Божество · символ: ${deity.symbol}` : 'Божество'}>
      <Icon name="ent-deity" size={16} color="var(--ent-deity)" title="Божество" />
      {openEntity ? (
        <button type="button" title={`Открыть карточку: ${deity.name}`} onClick={() => openEntity(deity.ref)} className="flex-none text-tx underline decoration-t3 cursor-pointer hover:text-gd-hi focus-visible:shadow-[var(--glow-gold)]">
          {deity.name}
        </button>
      ) : <span className="flex-none text-tx">{deity.name}</span>}
      {deity.symbol ? <span className="min-w-0 truncate">· {deity.symbol}</span> : null}
    </span>
  );
}

export interface PcHeaderData {
  level: number;
  /** «Полурослик · Легконогий · Следопыт» — раса, подраса и класс одной строкой, как «Lightfoot Halfling Ranger». */
  title: string;
  /** Иконки расы и класса перед строкой; имя — в тултипе. */
  emblems?: readonly { icon: IconName; title: string }[];
  alignment?: string;
  /** Божество (E8): имя латиницей, символ — из карточки бога, когда справочник загружен. */
  deity?: { name: string; ref: EntityRef; symbol?: string };
  speed?: number;
  height?: string;
  weight?: string;
  age?: string;
}

/**
 * Шапка листа по карточке владельца: портрет (пока иконка на плите) с уровнем в углу, строка «раса · класс»,
 * мировоззрение и скорость с иконками, справа — рост, вес, возраст столбиком. Чего нет — строки нет.
 */
export function PcHeader({ data, name }: { data: PcHeaderData; name: string }) {
  const body = ([['Рост', data.height], ['Вес', data.weight], ['Возраст', data.age]] as [string, string | undefined][])
    .filter((r): r is [string, string] => Boolean(r[1]));
  return (
    <div className="flex items-stretch gap-3" data-part="pc-header">
      <div className="relative size-16 flex-none flex items-center justify-center bg-linear-to-b from-pl to-cd shadow-[var(--bevel),var(--frame)] m-1" data-part="portrait" title="Портрет: пока иконка персонажа">
        <Icon name="ent-pc" size={48} color="var(--gd)" title={name} />
        <span className="absolute -left-1 -bottom-1 type-num-15 text-gd-hi bg-pl shadow-bevel px-1" title="Уровень">{data.level}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        {/* Не имя, а описание: две строки вместо обрезки — «Полурослик · Легконогий · Следопыт» читается целиком. */}
        <div className="flex items-center gap-2 min-w-0">
          {data.emblems?.map(e => (
            <span key={e.title} className="flex-none" data-part="emblem">
              <Icon name={e.icon} size={32} title={e.title} />
            </span>
          ))}
          <span className="type-h-17 text-tx line-clamp-2 min-w-0" title={data.title}>{data.title}</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="flex-1 min-w-0 flex flex-col gap-0.5 type-body-sm text-t2">
            {data.alignment ? (
              <span className="flex items-center gap-1" title="Мировоззрение">
                <Icon name="src-canon" size={16} color="var(--t2)" title="Мировоззрение" />
                <span className="text-tx truncate">{data.alignment}</span>
              </span>
            ) : null}
            {data.deity ? <DeityLine deity={data.deity} /> : null}
            {data.speed !== undefined ? (
              <span className="flex items-center gap-1" title="Скорость ходьбы">
                <Icon name="move" size={16} color="var(--t2)" title="Скорость" />
                <span className="type-num-15 text-tx">{data.speed} фт</span>
              </span>
            ) : null}
          </span>
          {body.length > 0 ? (
            <dl className="flex-none grid grid-cols-[auto_auto] gap-x-2 content-center bg-wl shadow-bevel-in px-2 py-1" data-part="bio">
              {body.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="type-key uppercase text-t2">{k}</dt>
                  <dd className="type-num-12 text-tx text-right whitespace-nowrap">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}
