// Карта персонажа (TASKS Д9) — React-версия приложенного Bo-шаблона: ширина 400 px, пропорции 63 × 88.
// Сверху вниз: корешок со статусами, боевые показатели и хиты; на лицевой стороне — броски и панель действий.
// Числа — из проекции листа; кнопки вызывают переданные действия страницы. Механика и данные примера HTML не копируются.
// Лицевая сторона — короткий обзор и панель боевых действий; на обороте — снаряжение и заклинания.
// Черты доступны в полном листе; статусы на корешке показаны без подписей. Вкладки прокручиваются.
// Тупой компонент: числа — campaign/characterCard.ts,
// броски, хиты и состояния — колбэками страницы. Отдельным куском (lazyParts).
import { useId, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import type { IconGridItem } from './IconGrid';
import { CARD_RATIO, CARD_WIDTH, type CharacterCardData } from '../campaign/characterCard';
import type { AbilityView, SkillView } from '../campaign/sheetView';
import { ABILITIES } from '../rules/srd/abilities';
import { hpLevel, type HpLevel } from './HpBar';
import { SKILL_LABEL } from './labels';
import { bySkillLabel } from './PcSheet';
import { AbilityMark, SkillMark } from '../art/RuleMark';
import { MaterialArtwork } from '../art/MaterialArtwork';
import { signedMod, tileEdge } from './StatTile';
import { CharacterCardSpine } from './CharacterCardSpine';
import './CharacterCard.css';

const HP_FILL: Readonly<Record<HpLevel, string>> = { high: 'bg-hp-high', mid: 'bg-hp-mid', low: 'bg-hp-low' };
const HP_WORD: Readonly<Record<HpLevel, string>> = { high: 'выше половины', mid: 'ниже половины', low: 'ниже четверти' };
const BTN = 'type-num-12 uppercase whitespace-nowrap px-1.5 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const ROLL = 'enabled:cursor-pointer enabled:hover:bg-pl focus-visible:shadow-[var(--glow-gold)] disabled:cursor-default';
/** Полоса между ярусами карты: бронза, как под корешком образца. */
const TIER = 'shadow-[inset_0_-2px_0_var(--br)]';
const TAB_ON = 'text-gd-hi bg-cd shadow-[inset_0_-2px_0_var(--gd)]';
const TAB_OFF = 'text-t2 hover:text-tx';
const SKILL_ABILITIES = ['str', 'dex', 'int', 'wis', 'cha'] as const;

export type CardFaceTab = 'overview' | 'back';
const TAB_LABEL: Readonly<Record<CardFaceTab, string>> = { overview: 'Лицевая', back: 'Оборот' };
const TAB_ICON: Readonly<Record<CardFaceTab, IconName>> = { overview: 'ent-pc', back: 'ent-item' };

export interface CharacterCardProps {
  card: CharacterCardData;
  /** Щелчок по хитам — попап хитов страницы; нет — хиты только показываются. */
  onHp?: () => void;
  /** Урон и лечение числом из поля ряда хитов (образец); нет — поля и кнопок нет. */
  onDamage?: (amount: number) => void;
  onHeal?: (amount: number) => void;
  onRollAbility?: (a: AbilityView) => void;
  onRollSave?: (a: AbilityView) => void;
  onRollSkill?: (s: SkillView) => void;
  /** Быстрый бросок одной из атак с лицевой стороны. */
  onRollAttack?: (attackId: string) => void;
  /** Показать выбранное заклинание на обороте; не расходует ячейку и не разрешает эффект. */
  onOpenSpell?: (spellId: string) => void;
  /** Бросок инициативы d20 + модификатор — щелчок по ней в полосе боя. */
  onInitiative?: () => void;
  /** Полная карточка листа: атаки, заклинания, умения, снаряжение, путь. */
  onSheet?: () => void;
  onCollapse?: () => void;
  /** Fit the physical card into a party grid cell while keeping its 63:88 proportions. */
  compact?: boolean;
  /** Use the same card template as a tall, full-width character sheet on a phone. */
  fluid?: boolean;
  /** Show every skill by name in a readable two-column list instead of icon-only columns. */
  expandedSkills?: boolean;
  /** @deprecated Feats and class features are shown in the full character sheet. */
  features?: readonly IconGridItem[];
  /** Сетка состояний страницы — открывается «…» в строке хитов; нет — кнопки нет. */
  conditions?: ReactNode;
  /** Вкладки, которые рисует страница: пусто — вкладки нет. */
  gear?: ReactNode;
  spells?: ReactNode;
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
  card, onHp, onDamage, onHeal, onRollAbility, onRollSave, onRollSkill, onRollAttack, onOpenSpell, onInitiative, onSheet, onCollapse, conditions, gear, spells,
  width = CARD_WIDTH, className = '', compact = false, fluid = false, expandedSkills = false,
}: CharacterCardProps) {
  const [tab, setTab] = useState<CardFaceTab>('overview');
  const [backTab, setBackTab] = useState<'gear' | 'spells'>('gear');
  const [amount, setAmount] = useState('');
  const [condOpen, setCondOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const skillsId = useId();
  const { hp } = card;
  const level = hpLevel(hp.current, hp.max);
  const share = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  const skills = [...card.skills].sort(bySkillLabel);
  const skillsByAbility = SKILL_ABILITIES.map(ability => ({
    ability,
    skills: skills.filter(skill => skill.ability === ability),
  }));
  const hpTitle = `Хиты ${hp.current} из ${hp.max}${hp.temp ? `, временные ${hp.temp}` : ''} — ${HP_WORD[level]}${onHp ? ' · щелчок — попап хитов' : ''}`;
  // Party cards share one face/turn rail even when a character has no back-side content.
  const tabs: CardFaceTab[] = compact ? ['overview', 'back'] : gear || spells ? ['overview', 'back'] : ['overview'];
  const shown = tabs.includes(tab) ? tab : 'overview';
  const shownBack = backTab === 'gear' && gear ? 'gear' : backTab === 'spells' && spells ? 'spells' : gear ? 'gear' : 'spells';
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
      className={`character-card relative isolate flex flex-col flex-none ${compact ? 'overflow-x-hidden overflow-y-auto' : 'overflow-hidden'} bg-cd shadow-[var(--bevel),var(--frame)] ${compact ? 'character-card--compact' : ''} ${fluid ? 'character-card--player' : ''} ${className}`}
      style={{ width: compact || fluid ? '100%' : width, maxWidth: fluid ? '100%' : undefined, aspectRatio: fluid ? 'auto' : `${CARD_RATIO}` }}
    >
      {compact ? <>
        <MaterialArtwork asset="kimi-material-material-plum-leather-v1" width={512} className="character-card__leather" style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', maxWidth: 'none', height: '100%', objectFit: 'cover', mixBlendMode: 'soft-light', pointerEvents: 'none' }} />
        <MaterialArtwork asset="kimi-material-material-warm-paper-v1" width={512} className="character-card__paper" style={{ position: 'absolute', inset: 0, zIndex: -1, width: '100%', maxWidth: 'none', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: .18, pointerEvents: 'none' }} />
      </> : null}
      {/* Корешок — верхняя кромка: видна, когда карта лежит под другой со сдвигом вниз. */}
      <CharacterCardSpine card={card} onSheet={onSheet} onCollapse={onCollapse} fit={compact} hero={!compact} />

      {/* Краткие числа листа; инициатива тоже бросается отсюда, чтобы освободить место лицевой стороне. */}
      <div data-part="combat" aria-label="Полоса боя" role="group" className={`flex-none flex bg-pn ${TIER}`}>
        <CombatCell label="КД" value={String(card.ac)} title={`Класс доспеха ${card.ac}`} />
        {card.hitDice ? (
          <CombatCell label={`К${card.hitDice.die}`} value={`${card.hitDice.available}/${card.hitDice.total}`} title={`Кости хитов d${card.hitDice.die}: осталось ${card.hitDice.available} из ${card.hitDice.total}`} />
        ) : compact ? <CombatCell label="Кость" value="—" title="Кости хитов не заданы" /> : null}
        <CombatCell label="Влад" value={signedMod(card.proficiencyBonus)} title="Бонус мастерства: прибавляется к навыкам и спасброскам с владением" />
        <CombatCell label="Вним" value={String(card.passivePerception)} title={`Пассивная внимательность ${card.passivePerception}`} />
        {onInitiative ? <CombatCell label="Иниц" value={signedMod(card.initiative)} title={`Инициатива: бросить d20 ${signedMod(card.initiative)}`} onClick={onInitiative} /> : compact ? <CombatCell label="Иниц" value="—" title="Бросок инициативы недоступен" /> : null}
      </div>

      {/* Ряд хитов: полоса с числом и, у мастера, урон и лечение числом прямо здесь. */}
      <div data-part="hp-row" className={`relative flex-none flex items-center gap-1 px-2 py-1 bg-wl shadow-[inset_0_-1px_0_var(--lo)]${compact ? ' character-card__hp-grid' : ''}`}>
        <button type="button" data-part="card-hp" onClick={onHp} disabled={!onHp} title={hpTitle} aria-label={`Хиты ${hp.current} из ${hp.max}`} className={`flex-1 min-w-0 flex flex-col gap-0.5 px-0.5 ${ROLL}`}>
          <span className="flex items-baseline justify-between">
            <span className="type-key uppercase text-t3">Хиты</span>
            <span className="type-num-12 text-tx">{hp.current}/{hp.max}{hp.temp ? <span className="text-[var(--fx-temp)]" title={`Временные хиты ${hp.temp}`}> +{hp.temp}</span> : null}</span>
          </span>
          <span aria-hidden="true" className="h-1.5 bg-hp-track shadow-bevel-in"><span className={`block h-full ${HP_FILL[level]}`} style={{ width: `${share * 100}%` }} /></span>
        </button>
        {compact || onDamage || onHeal ? (
          <>
            {onDamage || onHeal ? <input
              type="number"
              data-part="hp-amount"
              min={1}
              inputMode="numeric"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') apply(onDamage); }}
              aria-label="Сколько хитов"
              placeholder="±"
              className="w-12 flex-none type-num-12 text-tx bg-wl shadow-bevel-in px-1 py-1 outline-none focus-visible:shadow-[var(--bevel-in),var(--glow-gold)] placeholder:text-t3"
            /> : <span data-part="hp-amount" aria-hidden="true" className="character-card__empty-slot" />}
            {onDamage ? <button type="button" data-part="hp-damage" disabled={!valid} onClick={() => apply(onDamage)} title="Урон: сначала снимает временные хиты · Enter" className={`${BTN} enabled:hover:text-[var(--fx-damage-hi)]`}>Урон</button> : compact ? <span data-part="hp-damage" aria-hidden="true" className="character-card__empty-slot" /> : null}
            {onHeal ? <button type="button" data-part="hp-heal" disabled={!valid} onClick={() => apply(onHeal)} title="Лечение: не выше максимума" className={`${BTN} enabled:hover:text-[var(--fx-heal-hi)]`}>Леч</button> : compact ? <span data-part="hp-heal" aria-hidden="true" className="character-card__empty-slot" /> : null}
          </>
        ) : null}
        {conditions ? (
          <button
            type="button"
            data-part="conditions-toggle"
            aria-expanded={condOpen}
            aria-label="Состояния"
            aria-haspopup="true"
            onClick={() => setCondOpen(o => !o)}
            title={condOpen ? 'Закрыть состояния' : `Состояния${activeConditions ? `: наложено ${activeConditions}` : ''}`}
            className={`flex-none ${BTN}`}
          >
            {condOpen ? '×' : activeConditions ? `… ${activeConditions}` : '…'}
          </button>
        ) : compact ? <span data-part="conditions-toggle" aria-hidden="true" className="character-card__empty-slot" /> : null}
        {condOpen && conditions ? (
          <div data-part="conditions" className="absolute right-0 top-full z-10 max-h-80 max-w-[min(100%,20rem)] overflow-y-auto p-2 bg-pn shadow-float">{conditions}</div>
        ) : null}
      </div>

      {/* Только классовые ресурсы остаются на карте; состояния теперь находятся в корешке. */}
      {compact || card.pools.some(pool => pool.kind !== 'slots') ? (
        <div data-part="resources" data-empty={card.pools.some(pool => pool.kind !== 'slots') ? undefined : 'true'} className="relative flex-none flex flex-wrap items-center gap-0.5 px-2 py-1 shadow-[inset_0_-1px_0_var(--lo)]">
          <span className="flex items-center gap-1.5 ml-1 pl-1.5 shadow-[inset_1px_0_0_var(--lo)]" data-part="pools" aria-hidden={card.pools.some(pool => pool.kind !== 'slots') ? undefined : true}>
            {card.pools.filter(p => p.kind !== 'slots').map(p => (
              <span key={p.id} role="img" aria-label={`${p.label}: ${p.max - p.spent} из ${p.max}`} title={`${p.label}: осталось ${p.max - p.spent} из ${p.max}`} className="grid grid-flow-col grid-rows-2 gap-px">
                {Array.from({ length: p.max }, (_, i) => (
                  <span key={i} className={`size-2 ${i < p.max - p.spent ? 'bg-gd' : 'bg-lo shadow-bevel-in'}`} />
                ))}
              </span>
            ))}
          </span>
        </div>
      ) : null}

      {tabs.length > 1 ? (
        <div data-part="card-sides" role="tablist" aria-label="Стороны карты" className={`flex-none grid bg-bg ${TIER}`} style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={shown === t}
              aria-label={t === 'back' ? 'Оборот: снаряжение и заклинания' : TAB_LABEL[t]}
              onClick={() => setTab(t)}
              className={`flex items-center justify-center gap-1 py-1 type-key uppercase cursor-pointer shadow-[inset_-1px_0_0_var(--lo)] last:shadow-none focus-visible:shadow-[var(--glow-gold)] ${shown === t ? TAB_ON : TAB_OFF}`}
            >
              <Icon name={TAB_ICON[t]} size={16} color={shown === t ? 'var(--gd)' : 'var(--t2)'} title={TAB_LABEL[t]} />
              <span className="truncate">{TAB_LABEL[t]}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div data-part="face" data-side={shown} role={tabs.length > 1 ? 'tabpanel' : undefined} aria-label={TAB_LABEL[shown]} className={`flex-1 min-h-0 flex flex-col gap-1 p-2 ${compact ? `character-card__compact-face${shown === 'overview' ? ' character-card__compact-front' : ''}` : 'overflow-y-auto'}`}>
        {shown === 'overview' ? (
          <>
            {compact || card.attacks.length > 0 || card.spellActions?.length ? (
              <section aria-label="Быстрые действия" className="flex-none flex flex-col gap-0.5" data-part="attacks" data-quick-actions>
                <span className="type-key uppercase text-t3">Атаки · заклинания</span>
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto" data-part="action-icons" role="group" aria-label="Атаки и заклинания персонажа">
                  {card.attacks.map(a => (
                    <button key={`attack:${a.id}`} type="button" data-part="attack-action" aria-label={`Атака: ${a.name} · ${signedMod(a.toHit)} · ${a.damage}`} title={`${a.name} · бросить d20 ${signedMod(a.toHit)} · ${a.damage}`} onClick={onRollAttack ? () => onRollAttack(a.id) : undefined} disabled={!onRollAttack} className="flex-none grid place-items-center size-7 bg-cd shadow-bevel text-[var(--fx-heal-hi)] hover:bg-pl focus-visible:shadow-[var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)">
                      <Icon name="attack" size={24} color="currentColor" title={`Атака ${a.name}`} />
                    </button>
                  ))}
                  {card.spellActions?.map(spell => (
                    <button key={`spell:${spell.id}`} type="button" data-part="spell-action" aria-label={`Открыть заклинание: ${spell.name} · ${spell.meta}`} title={`${spell.name} · ${spell.meta} · открыть на обороте`} onClick={() => { setTab('back'); setBackTab('spells'); onOpenSpell?.(spell.id); }} disabled={!spells || !onOpenSpell} className="flex-none grid place-items-center size-7 bg-cd shadow-bevel text-gd hover:bg-pl focus-visible:shadow-[var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)">
                      <Icon name={spell.icon} size={24} color="currentColor" title={spell.name} />
                    </button>
                  ))}
                  {!card.attacks.length && !card.spellActions?.length ? <span data-part="actions-empty-slot" aria-hidden="true" className="character-card__empty-slot" /> : null}
                </div>
              </section>
            ) : null}

            {/* Навыки находятся сразу под строкой характеристик в едином блоке. */}
            <section aria-label="Характеристики и навыки" data-part="abilities-skills" className="flex-none flex flex-col gap-1">
              <div className="grid grid-cols-6 gap-0.5 items-start" data-part="abilities">
                {card.abilities.map(a => (
                  <div key={a.id} data-ability={a.id} className={`min-w-0 flex flex-col items-stretch bg-linear-to-b from-pl to-cd ${tileEdge(a.id, false)}`}>
                    <button
                      type="button"
                      aria-label={`${ABILITIES[a.id].code} ${a.score}`}
                      onClick={onRollAbility ? () => onRollAbility(a) : undefined}
                      disabled={!onRollAbility}
                      className={`flex flex-col items-center gap-0.5 py-0.5 ${ROLL}`}
                    >
                      <AbilityMark ability={a.id} title="" />
                      <span data-part="ability-mod" className="type-num-15 text-tx leading-tight">{signedMod(a.mod)}</span>
                      <span data-part="ability-score" className="type-num-12 text-t2 bg-wl shadow-bevel-in px-0.5">{a.score}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Спасбросок ${ABILITIES[a.id].code} ${signedMod(a.save)}`}
                      onClick={onRollSave ? () => onRollSave(a) : undefined}
                      disabled={!onRollSave}
                      className={`flex items-center justify-center gap-0.5 border-t border-lo py-px type-num-12 ${a.saveProficient ? 'text-gd' : 'text-t2'} enabled:hover:bg-cd focus-visible:shadow-[var(--glow-gold)] disabled:cursor-default`}
                      data-part="save"
                    >
                      <span aria-hidden className={`size-1.5 ${a.saveProficient ? 'bg-gd' : 'bg-wl shadow-bevel-in'}`} />{signedMod(a.save)}
                    </button>
                  </div>
                ))}
              </div>

              {compact || card.skills.length ? (
                <div aria-label="Навыки" data-part="skills" className="flex-none flex flex-col gap-1">
                  {!expandedSkills && !compact && !fluid ? <button
                    type="button"
                    data-part="skills-toggle"
                    aria-expanded={skillsOpen}
                    aria-controls={skillsId}
                    onClick={() => setSkillsOpen(open => !open)}
                    className={`self-start px-1.5 py-1 type-key uppercase focus-visible:shadow-[var(--glow-gold)] ${skillsOpen ? 'bg-pl text-gd-hi shadow-bevel-in' : 'bg-wl text-t2 hover:bg-pl'}`}
                  >
                    {skillsOpen ? `Скрыть названия · ${skills.length}` : `Все навыки · ${skills.length}`}
                  </button> : null}
                  {expandedSkills || skillsOpen ? <div id={skillsId} data-part="skill-groups" role="group" aria-label="Все навыки" className="grid grid-cols-2 gap-1">
                    {skills.map(skill => {
                      const proficiency = skill.proficiency === 'expert' ? 'компетентность' : skill.proficiency === 'proficient' ? 'владение' : '';
                      const label = `${SKILL_LABEL[skill.id]} (${ABILITIES[skill.ability].code}) ${signedMod(skill.mod)}${proficiency ? ` · ${proficiency}` : ''}`;
                      return <button key={skill.id} type="button" data-part="skill-tile" data-skill={skill.id}
                        aria-label={label} onClick={onRollSkill ? () => onRollSkill(skill) : undefined} disabled={!onRollSkill}
                        className={`relative flex items-center gap-1 min-w-0 min-h-9 px-1 bg-cd ${skill.proficiency === 'none' ? 'shadow-bevel-in' : 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)]'} ${ROLL}`}>
                        <SkillMark skill={skill.id} title="" />
                        <span className="min-w-0 flex-1 truncate text-left type-body-xs text-tx">{SKILL_LABEL[skill.id]} <span className="text-t3">{ABILITIES[skill.ability].code}</span></span>
                        <span className={`flex-none type-num-12 ${skill.proficiency === 'none' ? 'text-t2' : 'text-gd'}`}>{signedMod(skill.mod)}</span>
                        {skill.proficiency !== 'none' ? <span data-part="proficiency" aria-label={proficiency} className="flex-none type-key text-gd">{skill.proficiency === 'expert' ? 'К' : 'В'}</span> : null}
                      </button>;
                    })}
                  </div> : <div id={skillsId} data-part="skill-groups" role="group" aria-label="Навыки по характеристикам" className="grid grid-cols-5 gap-0.5">
                    {skillsByAbility.map(({ ability, skills: group }) => (
                      <section key={ability} data-ability={ability} aria-label={`${ABILITIES[ability].name}: ${group.length} навыков`} className={`min-w-0 flex flex-col bg-linear-to-b from-pl to-cd ${tileEdge(ability, false)}`}>
                        <div className="flex items-center justify-center gap-0.5 py-0.5 bg-wl shadow-bevel-in">
                          <AbilityMark ability={ability} title="" />
                          <span className="type-key text-t2 uppercase">{ABILITIES[ability].code}</span>
                        </div>
                        <div data-part="skill-list" className="flex flex-col gap-px p-px">
                          {group.map(skill => {
                            const proficiency = skill.proficiency === 'expert' ? 'компетентность' : skill.proficiency === 'proficient' ? 'владение' : '';
                            const label = `${SKILL_LABEL[skill.id]} (${ABILITIES[ability].code}) ${signedMod(skill.mod)}${proficiency ? ` · ${proficiency}` : ''}`;
                            return (
                              <button
                                key={skill.id}
                                type="button"
                                data-part="skill-tile"
                                data-skill={skill.id}
                                aria-label={label}
                                onClick={onRollSkill ? () => onRollSkill(skill) : undefined}
                                disabled={!onRollSkill}
                                className={`relative flex items-center justify-center gap-px min-w-0 h-6 px-px bg-cd ${skill.proficiency === 'none' ? 'shadow-bevel-in' : 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)]'} ${ROLL}`}
                              >
                                <SkillMark skill={skill.id} title="" />
                                <span className={`type-num-12 leading-none ${skill.proficiency === 'none' ? 'text-t2' : 'text-gd'}`}>{signedMod(skill.mod)}</span>
                                {skill.proficiency !== 'none' ? <span data-part="proficiency" aria-hidden="true" className="absolute top-0 right-0 type-key text-gd leading-none bg-cd">{skill.proficiency === 'expert' ? 'К' : 'В'}</span> : null}
                                <span className="sr-only">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>}
                </div>
              ) : null}
            </section>

          </>
        ) : shown === 'back' ? (
          <>
            {gear && spells || compact ? (
              <div data-part="back-tabs" role="tablist" aria-label="Содержимое оборота" className={`flex-none grid grid-cols-2 bg-bg ${TIER}`}>
                {(['gear', 'spells'] as const).map(section => (
                  <button key={section} type="button" role="tab" aria-selected={shownBack === section} disabled={section === 'gear' ? !gear : !spells} onClick={() => setBackTab(section)} className={`flex items-center justify-center gap-1 py-1 type-key uppercase cursor-pointer focus-visible:shadow-[var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled) ${shownBack === section ? TAB_ON : TAB_OFF}`}>
                    <Icon name={section === 'gear' ? 'ent-item' : 'school-evocation'} size={16} color={shownBack === section ? 'var(--gd)' : 'var(--t2)'} title={section === 'gear' ? 'Снаряжение' : 'Заклинания'} />
                    <span>{section === 'gear' ? 'Снаряжение' : 'Заклинания'}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div data-part="back-content" className="min-h-0 flex flex-col gap-2">
              {shownBack === 'gear' ? gear ?? (compact ? <p className="type-body-xs text-t3">Снаряжение не задано.</p> : null) : spells ?? (compact ? <p className="type-body-xs text-t3">Заклинания не заданы.</p> : null)}
            </div>
          </>
        ) : null}
      </div>

    </article>
  );
}
