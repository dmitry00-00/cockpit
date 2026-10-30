// Карта персонажа (TASKS Д9) — по образцу владельца dnd-character-card.jsx (30.10.2026): физическая карта пропорций
// игральной, 63 × 88. Сверху вниз, как в образце: корешок (уровень, имя, раса и класс, «Лист»), полоса боя (КД,
// инициатива броском, внимательность, кости хитов, владение), ряд хитов (полоса, поле «сколько», «Урон» и «Лечение»),
// строка статуса (умения класса и черты расы иконками, пипки ресурсов, «…» — сетка состояний), вкладки и подвал.
// «Обзор» — характеристики (модификатор крупно) и навыки иконками рядами по своей характеристике с её цветной кромкой
// («на порядок читаемее» списка), атаки и строка заклинаний; «Снаряжение», «Заклинания» и «История» — то, что
// страница уже рисует в листе (кукла, снаряжение, заклинания, предыстория и хроника): карта их не пересобирает.
// Подвал — состояния и эффекты со сроком: это кромка, которая торчит из стопки. Обзор без прокрутки; длинное
// (снаряжение, заклинания, хроника) прокручивается внутри вкладки. Тупой компонент: числа — campaign/characterCard.ts,
// броски, хиты и состояния — колбэками страницы. Отдельным куском (lazyParts).
import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import type { IconGridItem } from './IconGrid';
import { CARD_RATIO, CARD_WIDTH, type CharacterCardData } from '../campaign/characterCard';
import type { AbilityView, SkillView } from '../campaign/sheetView';
import { ABILITIES, type AbilityId } from '../rules/srd/abilities';
import { hpLevel, type HpLevel } from './HpBar';
import { SKILL_LABEL } from './labels';
import { bySkillLabel } from './PcSheet';
import { abilityIcon, skillIcon } from './sheetIcons';
import { signedMod, tileEdge } from './StatTile';

const HP_FILL: Readonly<Record<HpLevel, string>> = { high: 'bg-hp-high', mid: 'bg-hp-mid', low: 'bg-hp-low' };
const HP_WORD: Readonly<Record<HpLevel, string>> = { high: 'выше половины', mid: 'ниже половины', low: 'ниже четверти' };
const BTN = 'type-num-12 uppercase whitespace-nowrap px-1.5 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const ROLL = 'enabled:cursor-pointer enabled:hover:bg-pl focus-visible:shadow-[var(--glow-gold)] disabled:cursor-default';
/** Ряд навыков характеристики: кромка слева и подпись её цветом. Строки полные — Tailwind ищет их в исходнике. */
const ROW_EDGE: Readonly<Record<AbilityId, string>> = {
  str: 'shadow-[inset_2px_0_0_var(--ab-str)]', dex: 'shadow-[inset_2px_0_0_var(--ab-dex)]', con: 'shadow-[inset_2px_0_0_var(--ab-con)]',
  int: 'shadow-[inset_2px_0_0_var(--ab-int)]', wis: 'shadow-[inset_2px_0_0_var(--ab-wis)]', cha: 'shadow-[inset_2px_0_0_var(--ab-cha)]',
};
const ROW_TEXT: Readonly<Record<AbilityId, string>> = {
  str: 'text-ab-str-hi', dex: 'text-ab-dex-hi', con: 'text-ab-con-hi', int: 'text-ab-int-hi', wis: 'text-ab-wis-hi', cha: 'text-ab-cha-hi',
};
/** Полоса между ярусами карты: бронза, как под корешком образца. */
const TIER = 'shadow-[inset_0_-2px_0_var(--br)]';
const TAB_ON = 'text-gd-hi bg-cd shadow-[inset_0_-2px_0_var(--gd)]';
const TAB_OFF = 'text-t2 hover:text-tx';

export type CardTab = 'overview' | 'gear' | 'spells' | 'lore';
const TAB_LABEL: Readonly<Record<CardTab, string>> = { overview: 'Обзор', gear: 'Снаряжение', spells: 'Заклинания', lore: 'История' };
const TAB_ICON: Readonly<Record<CardTab, IconName>> = { overview: 'ent-pc', gear: 'ent-item', spells: 'school-evocation', lore: 'journal' };

export interface CharacterCardProps {
  card: CharacterCardData;
  /** Щелчок по хитам — попап хитов страницы; нет — хиты только показываются. */
  onHp?: () => void;
  /** Урон и лечение числом из поля ряда хитов (образец); нет — поля и кнопок нет. */
  onDamage?: (amount: number) => void;
  onHeal?: (amount: number) => void;
  onRollAbility?: (a: AbilityView) => void;
  onRollSkill?: (s: SkillView) => void;
  /** Бросок инициативы d20 + модификатор — щелчок по ней в полосе боя. */
  onInitiative?: () => void;
  /** Полная карточка листа: атаки, заклинания, умения, снаряжение, путь. */
  onSheet?: () => void;
  /** Умения класса и черты расы — иконками в строке статуса; имя, уровень и текст — в подсказке. Пусто — их нет. */
  features?: readonly IconGridItem[];
  /** Сетка состояний страницы — открывается «…» в строке статуса; нет — кнопки нет. */
  conditions?: ReactNode;
  /** Вкладки, которые рисует страница: пусто — вкладки нет. */
  gear?: ReactNode;
  spells?: ReactNode;
  lore?: ReactNode;
  width?: number;
  className?: string;
}

/** Клетка полосы боя: подпись мелко, число крупно; с onClick — кнопка броска. */
function CombatCell({ label, value, title, onClick }: { label: string; value: string; title: string; onClick?: () => void }) {
  const inner = (
    <>
      <span className="type-key uppercase text-t3">{label}</span>
      <span className="type-num-15 text-tx leading-none">{value}</span>
    </>
  );
  const cls = 'flex-1 min-w-0 flex flex-col items-center gap-1 py-1 shadow-[inset_-1px_0_0_var(--lo)] last:shadow-none';
  return onClick
    ? <button type="button" title={title} aria-label={title} onClick={onClick} className={`${cls} ${ROLL}`}>{inner}</button>
    : <span title={title} className={cls}>{inner}</span>;
}

export function CharacterCard({
  card, onHp, onDamage, onHeal, onRollAbility, onRollSkill, onInitiative, onSheet, features = [], conditions, gear, spells, lore,
  width = CARD_WIDTH, className = '',
}: CharacterCardProps) {
  const [tab, setTab] = useState<CardTab>('overview');
  const [amount, setAmount] = useState('');
  const [condOpen, setCondOpen] = useState(false);
  const { header, hp } = card;
  const level = hpLevel(hp.current, hp.max);
  const share = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  // Навыки характеристики — в алфавите подписи, как в «Листе»; у CON навыков нет — её ряда нет.
  const skillRows = card.abilities
    .map(a => ({ ability: a.id, skills: card.skills.filter(s => s.ability === a.id).sort(bySkillLabel) }))
    .filter(r => r.skills.length > 0);
  const hpTitle = `Хиты ${hp.current} из ${hp.max}${hp.temp ? `, временные ${hp.temp}` : ''} — ${HP_WORD[level]}${onHp ? ' · щелчок — попап хитов' : ''}`;
  const tabs = (['overview', 'gear', 'spells', 'lore'] as const).filter(t => t === 'overview' || (t === 'gear' ? gear : t === 'spells' ? spells : lore));
  const shown = tabs.includes(tab) ? tab : 'overview';
  const parsed = Number.parseInt(amount, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const apply = (fn?: (n: number) => void) => {
    if (!fn || !valid) return;
    fn(parsed);
    setAmount('');
  };
  const activeConditions = card.chips.filter(c => c.id !== 'concentration' && c.id !== 'effect').length;

  return (
    <article
      aria-label={`Карта персонажа: ${card.name}`}
      data-part="character-card"
      className={`relative flex flex-col flex-none overflow-hidden bg-cd shadow-[var(--bevel),var(--frame)] ${className}`}
      style={{ width, aspectRatio: `${CARD_RATIO}` }}
    >
      {/* Корешок — верхняя кромка: видна, когда карта лежит под другой со сдвигом вниз. */}
      <header data-part="edge-top" className={`flex-none h-10 flex items-center gap-2 pl-1.5 pr-1.5 bg-linear-to-br from-pl to-cd ${TIER}`}>
        <span className="relative flex-none size-8 grid place-items-center bg-linear-to-br from-pl to-wl shadow-[inset_0_0_0_2px_var(--bl)]" title="Портрет: пока иконка персонажа">
          <Icon name="ent-pc" size={16} color="var(--gd)" title={card.name} />
          <span className="absolute -right-1 -bottom-1 type-key text-bg bg-gd px-0.5 shadow-[0_0_0_1px_var(--bg)]" title="Уровень">{header.level}</span>
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="truncate type-h-17 text-gd-hi" title={card.name}>{card.name}</span>
          <span className="truncate type-body-xs text-t2" title={header.title}>{header.title}</span>
        </span>
        {header.emblems?.map(e => (
          <span key={e.title} className="flex-none size-6 grid place-items-center bg-wl shadow-bevel-in"><Icon name={e.icon} size={16} title={e.title} /></span>
        ))}
        {onSheet ? <button type="button" title="Лист целиком: атаки, заклинания, умения, снаряжение, путь" onClick={onSheet} className={BTN}>Лист</button> : null}
      </header>

      {/* Полоса боя: числа, к которым мастер возвращается каждый ход. */}
      <div data-part="combat" aria-label="Полоса боя" role="group" className={`flex-none flex bg-pn ${TIER}`}>
        <CombatCell label="КД" value={String(card.ac)} title={`Класс доспеха ${card.ac}`} />
        <CombatCell label="Иниц" value={signedMod(card.initiative)} title={`Инициатива ${signedMod(card.initiative)}${onInitiative ? ' · бросок d20' : ''}`} {...(onInitiative ? { onClick: onInitiative } : {})} />
        <CombatCell label="Вним" value={String(card.passivePerception)} title={`Пассивная внимательность ${card.passivePerception}`} />
        {card.hitDice ? (
          <CombatCell label={`К${card.hitDice.die}`} value={`${card.hitDice.available}/${card.hitDice.total}`} title={`Кости хитов d${card.hitDice.die}: осталось ${card.hitDice.available} из ${card.hitDice.total}`} />
        ) : null}
        <CombatCell label="Влад" value={signedMod(card.proficiencyBonus)} title="Бонус мастерства: прибавляется к навыкам и спасброскам с владением" />
      </div>

      {/* Ряд хитов: полоса с числом и, у мастера, урон и лечение числом прямо здесь. */}
      <div data-part="hp-row" className="flex-none flex items-center gap-1 px-2 py-1 bg-wl shadow-[inset_0_-1px_0_var(--lo)]">
        <button type="button" data-part="card-hp" onClick={onHp} disabled={!onHp} title={hpTitle} aria-label={`Хиты ${hp.current} из ${hp.max}`} className={`flex-1 min-w-0 flex flex-col gap-0.5 px-0.5 ${ROLL}`}>
          <span className="flex items-baseline justify-between">
            <span className="type-key uppercase text-t3">Хиты</span>
            <span className="type-num-12 text-tx">{hp.current}/{hp.max}{hp.temp ? <span className="text-[var(--fx-temp)]" title={`Временные хиты ${hp.temp}`}> +{hp.temp}</span> : null}</span>
          </span>
          <span aria-hidden="true" className="h-1.5 bg-lo shadow-bevel-in"><span className={`block h-full ${HP_FILL[level]}`} style={{ width: `${share * 100}%` }} /></span>
        </button>
        {onDamage || onHeal ? (
          <>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(onDamage); }}
              aria-label="Сколько хитов"
              placeholder="±"
              className="w-12 flex-none type-num-12 text-tx bg-lo shadow-bevel-in px-1 py-1 outline-none focus-visible:shadow-[var(--bevel-in),var(--glow-gold)] placeholder:text-t3"
            />
            {onDamage ? <button type="button" disabled={!valid} onClick={() => apply(onDamage)} title="Урон: сначала снимает временные хиты · Enter" className={`${BTN} enabled:hover:text-[var(--fx-damage-hi)]`}>Урон</button> : null}
            {onHeal ? <button type="button" disabled={!valid} onClick={() => apply(onHeal)} title="Лечение: не выше максимума" className={`${BTN} enabled:hover:text-[var(--fx-heal-hi)]`}>Леч</button> : null}
          </>
        ) : null}
      </div>

      {/* Строка статуса: что персонаж умеет всегда (иконки умений и черт), сколько ресурсов, «…» — состояния. */}
      {features.length > 0 || card.pools.length > 0 || conditions ? (
        <div data-part="status" className="relative flex-none flex flex-wrap items-center gap-0.5 px-2 py-1 shadow-[inset_0_-1px_0_var(--lo)]">
          {features.length > 0 ? (
            <span role="list" aria-label="Умения и черты" data-part="features" className="flex flex-wrap gap-0.5">
              {features.map(f => (
                <span
                  key={f.key}
                  role="listitem"
                  aria-label={f.name}
                  title={`${f.name}${f.meta ? ` · ${f.meta}` : ''}${f.text ? `\n${f.text}` : ''}`}
                  className="size-6 flex-none grid place-items-center bg-wl shadow-bevel-in hover:shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)]"
                >
                  <Icon name={f.icon} size={16} title={f.name} />
                </span>
              ))}
            </span>
          ) : null}
          {card.pools.length > 0 ? (
            <span className="flex items-center gap-1.5 ml-1 pl-1.5 shadow-[inset_1px_0_0_var(--lo)]" data-part="pools">
              {card.pools.map(p => (
                <span key={p.id} role="img" aria-label={`${p.label}: ${p.max - p.spent} из ${p.max}`} title={`${p.label}: осталось ${p.max - p.spent} из ${p.max}`} className="grid grid-flow-col grid-rows-2 gap-px">
                  {Array.from({ length: p.max }, (_, i) => (
                    <span key={i} className={`size-2 ${i < p.max - p.spent ? 'bg-gd' : 'bg-lo shadow-bevel-in'}`} />
                  ))}
                </span>
              ))}
            </span>
          ) : null}
          {conditions ? (
            <button
              type="button"
              aria-expanded={condOpen}
              aria-label="Состояния"
              onClick={() => setCondOpen(o => !o)}
              title={condOpen ? 'Закрыть сетку состояний' : `Состояния${activeConditions ? `: наложено ${activeConditions}` : ''} — сетка`}
              className={`ml-auto ${BTN}`}
            >
              {condOpen ? '×' : activeConditions ? `… ${activeConditions}` : '…'}
            </button>
          ) : null}
          {condOpen && conditions ? (
            <div data-part="conditions" className="absolute left-0 right-0 top-full z-10 max-h-80 overflow-y-auto p-2 bg-pn shadow-float">{conditions}</div>
          ) : null}
        </div>
      ) : null}

      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Стороны карты" className={`flex-none grid bg-bg ${TIER}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={shown === t}
              onClick={() => setTab(t)}
              className={`flex items-center justify-center gap-1 py-1 type-key uppercase cursor-pointer shadow-[inset_-1px_0_0_var(--lo)] last:shadow-none focus-visible:shadow-[var(--glow-gold)] ${shown === t ? TAB_ON : TAB_OFF}`}
            >
              <Icon name={TAB_ICON[t]} size={16} color={shown === t ? 'var(--gd)' : 'var(--t2)'} title={TAB_LABEL[t]} />
              <span className="truncate">{TAB_LABEL[t]}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div data-part="face" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-label={TAB_LABEL[shown]} className={`flex-1 min-h-0 flex flex-col gap-1 p-2 ${shown === 'overview' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {shown === 'overview' ? (
          <>
            {/* Характеристики — плитками (модификатор крупно, значение плашкой, спасбросок), под ними навыки иконками
                рядами по своей характеристике; имя — в подсказке. Владение — золотая рамка плитки, компетентность —
                ещё и квадрат в углу: форма, а не только цвет. */}
            <section aria-label="Характеристики и навыки" className="flex-none flex flex-col gap-1">
              <div className="grid grid-cols-6 gap-0.5 items-start" data-part="abilities">
                {card.abilities.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    aria-label={`${ABILITIES[a.id].code} ${a.score}`}
                    title={`${ABILITIES[a.id].name} (${ABILITIES[a.id].code}) ${a.score}: ${signedMod(a.mod)} · спасбросок ${signedMod(a.save)}${a.saveProficient ? ' (владение)' : ''} · бросок d20`}
                    onClick={onRollAbility ? () => onRollAbility(a) : undefined}
                    disabled={!onRollAbility}
                    className={`flex flex-col items-center gap-0.5 py-0.5 bg-linear-to-b from-pl to-cd ${tileEdge(a.id, false)} ${ROLL}`}
                  >
                    <Icon name={abilityIcon(a.id)} size={16} title={ABILITIES[a.id].name} />
                    <span className="type-num-15 text-tx leading-tight">{signedMod(a.mod)}</span>
                    <span className="flex items-center gap-1">
                      <span className="type-num-12 text-t2 bg-wl shadow-bevel-in px-0.5">{a.score}</span>
                      <span className={`flex items-center gap-0.5 type-num-12 ${a.saveProficient ? 'text-gd' : 'text-t2'}`} data-part="save" title={`Спасбросок ${signedMod(a.save)}${a.saveProficient ? ' · владение' : ''}`}>
                        <span aria-hidden className={`size-1.5 ${a.saveProficient ? 'bg-gd' : 'bg-wl shadow-bevel-in'}`} />
                        {signedMod(a.save)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-px" data-part="skills">
                {skillRows.map(r => (
                  <div key={r.ability} data-ability={r.ability} className={`flex items-center gap-0.5 pl-1 ${ROW_EDGE[r.ability]}`}>
                    <span className={`w-8 flex-none type-key ${ROW_TEXT[r.ability]}`} aria-hidden>{ABILITIES[r.ability].code}</span>
                    {r.skills.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        data-skill={s.id}
                        aria-label={`${SKILL_LABEL[s.id]} ${signedMod(s.mod)}`}
                        title={`${SKILL_LABEL[s.id]} (${ABILITIES[s.ability].code}) ${signedMod(s.mod)}${s.proficiency === 'expert' ? ' · компетентность' : s.proficiency === 'proficient' ? ' · владение' : ''} · бросок d20`}
                        onClick={onRollSkill ? () => onRollSkill(s) : undefined}
                        disabled={!onRollSkill}
                        className={`relative size-8 flex-none flex flex-col items-center justify-center gap-0.5 bg-wl ${s.proficiency === 'none' ? 'shadow-bevel-in' : 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)]'} ${ROLL}`}
                      >
                        {s.proficiency === 'expert' ? <span aria-hidden className="absolute left-0 top-0 size-1.5 bg-gd" /> : null}
                        <Icon name={skillIcon(s.id)} size={16} title={SKILL_LABEL[s.id]} />
                        <span className={`type-num-12 leading-none ${s.proficiency === 'none' ? 'text-t2' : 'text-gd'}`}>{signedMod(s.mod)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </section>

            {card.attacks.length > 0 || card.spells ? (
              <section aria-label="Атаки" className="flex-none flex flex-col gap-0.5" data-part="attacks">
                <span className="flex items-center justify-between type-key uppercase text-t3">
                  Атаки
                  {card.spells ? <span className="text-t2" title="Заклинания: Сл спасброска и бонус атаки заклинанием; список — во вкладке «Заклинания»">Сл <span className="text-tx">{card.spells.dc}</span> · атака <span className="text-tx">{signedMod(card.spells.attack)}</span></span> : null}
                </span>
                {card.attacks.slice(0, 3).map(a => (
                  <span key={a.id} className="flex items-baseline gap-1.5" title={`${a.name}: ${signedMod(a.toHit)} к попаданию, урон ${a.damage}`}>
                    <span className="type-num-12 text-[var(--fx-heal-hi)] w-7 flex-none text-right">{signedMod(a.toHit)}</span>
                    <span className="type-body-xs text-tx flex-1 min-w-0 truncate">{a.name}</span>
                    <span className="type-num-12 text-[var(--fx-damage-hi)] flex-none whitespace-nowrap">{a.damage}</span>
                  </span>
                ))}
              </section>
            ) : null}
          </>
        ) : shown === 'gear' ? gear : shown === 'spells' ? spells : lore}
      </div>

      {/* Подвал — нижняя кромка: видна, когда карта лежит под другой со сдвигом вверх, — что с персонажем сейчас. */}
      <footer data-part="edge-bottom" aria-label="Состояния" className="flex-none h-8 flex items-center gap-1 px-2 bg-linear-to-br from-pl to-cd shadow-[inset_0_2px_0_var(--br)] overflow-hidden">
        {card.chips.map(c => (
          <span key={`${c.label}:${c.timer ?? ''}`} data-part="edge-chip" title={c.tip ?? c.label} className="flex-none flex items-center gap-1 px-1 py-px bg-wl shadow-bevel-in type-body-xs text-tx whitespace-nowrap">
            {c.icon ? <Icon name={c.icon} size={16} title={c.label} /> : null}
            {c.label}{c.level ? ` ${c.level}` : ''}{c.timer ? <span className="type-num-12 text-t2">{c.timer}</span> : null}
          </span>
        ))}
      </footer>
    </article>
  );
}
