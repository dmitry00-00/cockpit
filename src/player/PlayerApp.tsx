import { useRef, useState, type KeyboardEvent } from 'react';
import { Dialog } from 'radix-ui';
import { CharacterCard } from '../components/CharacterCard';
import { ABILITIES } from '../rules/srd/abilities';
import { SKILL_LABEL } from '../components/labels';
import { parseFormula, roll as rollDice } from '../engine/dice';
import type { CharacterCardData } from '../campaign/characterCard';
import type { PlayerConnectionStatus, PlayerFeature, PlayerHero, PlayerProjection } from './types';
import { FeedbackSettings } from '../feedback/FeedbackSettings';
import { emitFeedback } from '../feedback/feedback';
import { useFeedbackInteractions } from '../feedback/useFeedbackInteractions';
import './player.css';

export interface PlayerAppProps {
  projection: PlayerProjection | null;
  status: PlayerConnectionStatus;
  lastUpdatedAt?: number;
  onDisconnect: () => void;
}

type PlayerTab = 'overview' | 'equipment' | 'features' | 'spells' | 'updates' | 'notes' | 'rumors';
type PlayerMode = 'sheet' | 'rolls' | 'party';
type RollMode = 'normal' | 'advantage' | 'disadvantage';
interface PlayerRoll {
  id: number;
  label: string;
  formula: string;
  dice: readonly number[];
  mod: number;
  total: number;
  alternatives?: readonly number[];
}

function hasSecureRandom(): boolean {
  return typeof globalThis.crypto?.getRandomValues === 'function';
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}

function canRoll(formula: string): boolean {
  try { parseFormula(formula); return true; } catch { return false; }
}

function updatedLabel(projection: PlayerProjection | null, lastUpdatedAt?: number): string | null {
  const timestamp = lastUpdatedAt ?? (projection ? Date.parse(projection.updatedAt) : NaN);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

function characterCardData(hero: PlayerHero): CharacterCardData | null {
  const mobile = hero.card;
  if (!mobile) return null;
  return {
    id: 'player-character',
    name: hero.name,
    ...(mobile.portrait ? { portrait: mobile.portrait } : {}),
    header: { level: hero.level, title: mobile.title || `${hero.ancestry} · ${hero.className}`, emblems: mobile.emblems },
    hp: { current: hero.hp.current, max: hero.hp.maximum, temp: hero.hp.temporary },
    ac: hero.armorClass,
    initiative: mobile.initiative,
    passivePerception: mobile.passivePerception,
    ...(mobile.hitDice ? { hitDice: mobile.hitDice } : {}),
    abilities: mobile.abilities,
    skills: mobile.skills,
    proficiencyBonus: mobile.proficiencyBonus,
    pools: mobile.pools,
    chips: mobile.chips,
    attacks: mobile.attacks,
    ...(mobile.spells ? { spells: mobile.spells } : {}),
    spellActions: mobile.spellActions ?? hero.spells.map((spell, index) => ({
      id: `cached-spell-${index}`, name: spell.name, icon: 'school-evocation' as const,
      meta: `${spell.level === 0 ? 'заговор' : `${spell.level}-й круг`} · ${spell.kind === 'cantrip' ? 'заговор' : spell.kind === 'always prepared' ? 'всегда подготовлено' : spell.kind === 'prepared' ? 'подготовлено' : spell.kind === 'in spellbook' ? 'в книге' : 'известно'}`,
    })),
  };
}

function PlayerCharacterCard({ projection, available, onRoll, onSheet }: {
  projection: PlayerProjection;
  available: boolean;
  onRoll: (label: string, formula: string, withMode?: boolean) => void;
  onSheet: () => void;
}) {
  const { hero } = projection;
  const card = characterCardData(hero);
  const [selectedSpellId, setSelectedSpellId] = useState<string>();
  const selectedSpell = card?.spellActions?.find(spell => spell.id === selectedSpellId);
  if (!card) return <Overview projection={projection} />;
  return <CharacterCard
    card={card}
    fluid
    onSheet={onSheet}
    onInitiative={available ? () => onRoll('Инициатива', `1d20${card.initiative >= 0 ? '+' : ''}${card.initiative}`, true) : undefined}
    onRollAbility={available ? ability => onRoll(`${ABILITIES[ability.id].code} · проверка`, `1d20${ability.mod >= 0 ? '+' : ''}${ability.mod}`, true) : undefined}
    onRollSave={available ? ability => onRoll(`${ABILITIES[ability.id].code} · спасбросок`, `1d20${ability.save >= 0 ? '+' : ''}${ability.save}`, true) : undefined}
    onRollSkill={available ? skill => onRoll(SKILL_LABEL[skill.id], `1d20${skill.mod >= 0 ? '+' : ''}${skill.mod}`, true) : undefined}
    onRollAttack={available ? attackId => {
      const attack = card.attacks.find(item => item.id === attackId);
      if (attack) onRoll(`Атака · ${attack.name}`, `1d20${attack.toHit >= 0 ? '+' : ''}${attack.toHit}`, true);
    } : undefined}
    onOpenSpell={setSelectedSpellId}
    gear={<section className="player-card-tab" aria-label="Снаряжение">
      <h2>Снаряжение</h2>
      {hero.equipment.length ? <ul className="player-list">{hero.equipment.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><strong>× {item.quantity}</strong></li>)}</ul> : <p className="player-muted">Снаряжение не указано.</p>}
    </section>}
    spells={<div className="player-card-tab-stack">
      <section className="player-card-tab" aria-label="Заклинания">
        <h2>Заклинания</h2>
        {selectedSpell ? <p className="player-muted" data-part="selected-spell"><strong>{selectedSpell.name}</strong><br />{selectedSpell.meta}</p> : null}
        {hero.spells.length ? <ul className="player-list">{hero.spells.map((spell, index) => <li key={`${spell.name}-${index}`}>
          <span>{spell.name}<small>{spell.kind === 'cantrip' ? 'Заговор' : spell.kind === 'always prepared' ? 'Всегда подготовлено' : spell.kind === 'prepared' ? 'Подготовлено' : spell.kind === 'in spellbook' ? 'В книге' : 'Известно'}{spell.level > 0 ? ` · ${spell.level}-й круг` : ''}</small></span>
        </li>)}</ul> : <p className="player-muted">Заклинания не указаны.</p>}
      </section>
      {hero.resources.length || hero.favor?.length ? <section className="player-card-tab" aria-label="Ячейки и ресурсы">
        <h2>Ячейки и ресурсы</h2>
        <ul className="player-list">{hero.resources.map((resource, index) => <li key={`${resource.label}-${index}`}>
          <span>{resource.label}<small>{resource.restoresOn === 'short' ? 'Короткий отдых' : resource.restoresOn === 'long' ? 'Долгий отдых' : 'Начало хода'}</small></span>
          <strong>{resource.available} / {resource.maximum}</strong>
        </li>)}{hero.favor?.map((item, index) => <li key={`${item.deity}-${index}`}><span>A5E favor<small>{item.deity}</small></span><strong>{item.amount}</strong></li>)}</ul>
      </section> : null}
    </div>}
  />;
}

function FeatureList({ features }: { features: readonly PlayerFeature[] }) {
  const groups: readonly [PlayerFeature['kind'], string][] = [
    ['class', 'Умения класса'], ['ancestry', 'Черты происхождения'], ['feat', 'Черты'],
  ];
  return <div className="player-list-stack">
    {groups.map(([kind, label]) => {
      const rows = features.filter(feature => feature.kind === kind);
      if (!rows.length) return null;
      return <section className="player-section" key={kind} aria-label={label}>
        <h3>{label}</h3>
        <ul className="player-list">{rows.map((feature, index) => <li key={`${kind}-${index}`}>
          <span>{feature.name}</span>{feature.level !== undefined ? <small>Уровень {feature.level}</small> : null}
        </li>)}</ul>
      </section>;
    })}
  </div>;
}

function Overview({ projection }: { projection: PlayerProjection }) {
  const { hero } = projection;
  return <div className="player-overview">
    <section className="player-section player-identity" aria-label="Персонаж">
      <p className="player-eyebrow">{hero.ancestry}</p>
      <h2>{hero.name}</h2>
      <p>{hero.className}{hero.subclassName ? ` · ${hero.subclassName}` : ''} · {hero.level}-й уровень</p>
    </section>

    <section className="player-section" aria-label="Состояние персонажа">
      <h3>Сейчас</h3>
      <div className="player-vitals">
        <div><span>Хиты</span><strong>{hero.hp.current} / {hero.hp.maximum}</strong>{hero.hp.temporary > 0 ? <small>Временные: {hero.hp.temporary}</small> : null}</div>
        <div><span>AC</span><strong>{hero.armorClass}</strong></div>
      </div>
      {hero.conditions.length ? <ul className="player-chips" aria-label="Состояния">
        {hero.conditions.map((condition, index) => <li key={`${condition.label}-${index}`}>{condition.label}{condition.level ? ` ${condition.level}` : ''}</li>)}
      </ul> : <p className="player-muted">Состояний нет</p>}
    </section>

    <section className="player-section" aria-label="Характеристики">
      <h3>Характеристики</h3>
      <div className="player-ability-grid">{hero.abilities.map(ability => <div className="player-ability" key={ability.label}>
        <span>{ability.label}</span><strong>{ability.score}</strong><small>{signed(ability.modifier)}</small>
      </div>)}</div>
    </section>

    <section className="player-section" aria-label="Навыки">
      <h3>Навыки</h3>
      <ul className="player-skill-list">{hero.skills.filter(skill => skill.proficiency !== 'none').map(skill => <li key={skill.label}>
        <span>{skill.label}</span><strong>{signed(skill.modifier)}</strong><small>{skill.proficiency === 'expert' ? 'Экспертность' : 'Владение'}</small>
      </li>)}</ul>
    </section>

    {hero.attacks.length ? <section className="player-section" aria-label="Атаки">
      <h3>Атаки</h3>
      <ul className="player-list">{hero.attacks.map((attack, index) => <li key={`${attack.name}-${index}`}>
        <span><strong>{attack.name}</strong><small>{attack.damage} {attack.damageType}{attack.range ? ` · ${attack.range}` : ''}</small></span>
        <b>{signed(attack.toHit)}</b>
      </li>)}</ul>
    </section> : null}

    {hero.resources.length || hero.favor?.length ? <section className="player-section" aria-label="Ресурсы">
      <h3>Ресурсы</h3>
      <ul className="player-list">{hero.resources.map((resource, index) => <li key={`${resource.label}-${index}`}>
        <span>{resource.label}<small>Восстанавливается: {resource.restoresOn === 'short' ? 'короткий отдых' : resource.restoresOn === 'long' ? 'долгий отдых' : 'начало хода'}</small></span>
        <strong>{resource.available} / {resource.maximum}</strong>
      </li>)}{hero.favor?.map((item, index) => <li key={`${item.deity}-${index}`}><span>A5E favor<small>{item.deity}</small></span><strong>{item.amount}</strong></li>)}</ul>
    </section> : null}

    <PartySummary projection={projection} />
  </div>;
}

function PartySummary({ projection }: { projection: PlayerProjection }) {
  const { party, encounter } = projection;
  return <section className="player-section" aria-label="Партия и ход">
    <div className="player-section-heading"><h3>Участники</h3>
      {encounter.active ? <span className="player-turn">Раунд {encounter.round} · {encounter.currentTurn === 'party' ? 'ход партии' : 'ход противников'}</span> : null}
    </div>
    {party.length ? <ul className="player-party-list">{party.map((member, index) => <li key={`${member.name}-${index}`} aria-current={member.currentTurn ? 'step' : undefined}>
      <span className="player-party-name">{member.name}{member.currentTurn ? <small>Сейчас ходит</small> : null}</span>
      <span className="player-party-hp">{member.hp.current}/{member.hp.maximum}</span>
      {member.conditions.length ? <span className="player-party-conditions">{member.conditions.map(c => c.label).join(', ')}</span> : null}
    </li>)}</ul> : <p className="player-muted">Состав партии пока не передан</p>}
  </section>;
}

function RollHistory({ rolls }: { rolls: readonly PlayerRoll[] }) {
  if (!rolls.length) return <p className="player-muted">Бросков пока нет. Выберите проверку, навык или атаку.</p>;
  return <ol className="player-roll-history" aria-label="Последние броски" aria-live="polite" aria-relevant="additions">
    {rolls.map(item => <li key={item.id}>
      <span><strong>{item.label}</strong><small>{item.formula}{item.alternatives ? ` · броски ${item.alternatives.join(' / ')}` : ` · ${item.dice.join(' + ')}${item.mod ? ` ${item.mod > 0 ? '+' : '−'} ${Math.abs(item.mod)}` : ''}`}</small></span>
      <b>{item.total}</b>
    </li>)}
  </ol>;
}

function RollWorkspace({
  projection, mode, onModeChange, onRoll, rolls, available,
}: {
  projection: PlayerProjection;
  mode: RollMode;
  onModeChange: (mode: RollMode) => void;
  onRoll: (label: string, formula: string, withMode?: boolean) => void;
  rolls: readonly PlayerRoll[];
  available: boolean;
}) {
  const { hero } = projection;
  const modeLabel = mode === 'advantage' ? 'Преимущество' : mode === 'disadvantage' ? 'Помеха' : 'Обычный';
  return <div className="player-roll-workspace">
    <section className="player-section player-roll-mode" aria-label="Режим броска">
      <div className="player-section-heading"><h2>Броски</h2><span className="player-roll-current-mode">{modeLabel}</span></div>
      <div className="player-roll-mode-buttons" role="group" aria-label="Выбрать режим d20">
        {([['normal', 'Обычный'], ['advantage', 'Преимущество'], ['disadvantage', 'Помеха']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => onModeChange(value)}>{label}</button>)}
      </div>
      {!available ? <p className="player-muted">Броски доступны при подключении и поддержке криптографических случайных чисел.</p> : null}
    </section>

    <section className="player-section" aria-label="Характеристики и спасброски">
      <h3>Характеристики и спасброски</h3>
      <ul className="player-roll-list">{hero.abilities.map(ability => <li key={ability.label}>
        <span><strong>{ability.label}</strong><small>{ability.score} · проверка {ability.modifier >= 0 ? '+' : '−'}{Math.abs(ability.modifier)} · спасбросок {ability.savingThrow >= 0 ? '+' : '−'}{Math.abs(ability.savingThrow)}</small></span>
        <div><button type="button" disabled={!available} onClick={() => onRoll(`${ability.label} · проверка`, `1d20${ability.modifier >= 0 ? '+' : ''}${ability.modifier}`, true)}>Проверка</button>
          <button type="button" disabled={!available} onClick={() => onRoll(`${ability.label} · спасбросок`, `1d20${ability.savingThrow >= 0 ? '+' : ''}${ability.savingThrow}`, true)}>Спасбросок</button></div>
      </li>)}</ul>
    </section>

    <section className="player-section" aria-label="Навыки">
      <h3>Навыки</h3>
      <ul className="player-roll-list player-roll-list--skills">{hero.skills.map(skill => <li key={skill.label}>
        <span><strong>{skill.label}</strong><small>{skill.proficiency === 'expert' ? 'Экспертность' : skill.proficiency === 'proficient' ? 'Владение' : 'Без владения'} · {skill.modifier >= 0 ? '+' : '−'}{Math.abs(skill.modifier)}</small></span>
        <button type="button" disabled={!available} onClick={() => onRoll(skill.label, `1d20${skill.modifier >= 0 ? '+' : ''}${skill.modifier}`, true)}>Бросить</button>
      </li>)}</ul>
    </section>

    {hero.attacks.length ? <section className="player-section" aria-label="Атаки и урон">
      <h3>Атаки</h3>
      <ul className="player-roll-list">{hero.attacks.map((attack, index) => <li key={`${attack.name}-${index}`}>
        <span><strong>{attack.name}</strong><small>Попадание {attack.toHit >= 0 ? '+' : '−'}{Math.abs(attack.toHit)} · урон {attack.damage} {attack.damageType}</small></span>
        <div><button type="button" disabled={!available} onClick={() => onRoll(`${attack.name} · атака`, `1d20${attack.toHit >= 0 ? '+' : ''}${attack.toHit}`, true)}>Атака</button>
          {canRoll(attack.damage) ? <button type="button" disabled={!available} onClick={() => onRoll(`${attack.name} · урон`, attack.damage)}>Урон</button> : null}</div>
      </li>)}</ul>
    </section> : null}

    <section className="player-section" aria-label="Кости">
      <h3>Кости</h3>
      <div className="player-die-buttons">{[4, 6, 8, 10, 12, 20, 100].map(sides => <button key={sides} type="button" disabled={!available} onClick={() => onRoll(`d${sides}`, `d${sides}`)}>d{sides}</button>)}</div>
    </section>

    <section className="player-section" aria-label="Последние броски">
      <div className="player-section-heading"><h3>История бросков</h3><span className="player-local-label">На этом устройстве</span></div>
      <RollHistory rolls={rolls} />
      <p className="player-roll-note">Результаты показываются только здесь и не попадают в журнал мастера.</p>
    </section>
  </div>;
}

function tabForKey(event: KeyboardEvent<HTMLDivElement>, active: PlayerTab, tabs: readonly { id: PlayerTab; label: string }[], setTab: (tab: PlayerTab) => void) {
  const index = tabs.findIndex(tab => tab.id === active);
  const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
    : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
  if (nextIndex < 0) return;
  event.preventDefault();
  const next = tabs[nextIndex];
  setTab(next.id);
  event.currentTarget.querySelector<HTMLButtonElement>(`[data-player-tab="${next.id}"]`)?.focus();
}

function TabContent({ tab, projection }: { tab: PlayerTab; projection: PlayerProjection }) {
  const { hero } = projection;
  if (tab === 'overview') return <Overview projection={projection} />;
  if (tab === 'notes') return <section className="player-section" aria-label="Зацепки и раздатки">
    <h2>Зацепки и раздатки</h2>
    {(projection.adventureNotes ?? []).length ? <div className="player-list-stack">{projection.adventureNotes!.map(note => <section className="player-section" key={note.id} aria-label={note.title}>
      <p className="player-eyebrow">{note.adventureTitle}</p><h3>{note.title}</h3><p>{note.summary}</p>
      {note.entries.length ? <ul className="player-list">{note.entries.map(entry => <li key={entry.id}><span><strong>{entry.name}</strong><small>{entry.summary}</small></span></li>)}</ul>
        : note.id.endsWith(':town-leads') ? <p className="player-muted">Пока нет раскрытых зацепок.</p> : null}
    </section>)}</div> : <p className="player-muted">Открытых зацепок пока нет.</p>}
  </section>;
  if (tab === 'rumors') return <section className="player-section" aria-label="Слухи поблизости">
    <h2>Слухи поблизости</h2>
    {(projection.rumors ?? []).length ? <ul className="player-list">{projection.rumors!.map((rumor, index) => <li key={`${rumor.location}-${index}`}>
      <span>{rumor.text}<small>{rumor.location}</small></span>
    </li>)}</ul> : <p className="player-muted">В этом месте пока не слышно слухов.</p>}
  </section>;
  if (tab === 'updates') return <section className="player-section" aria-label="Последние события">
    <h2>Последние события</h2>
    {(projection.updates ?? []).length ? <ol className="player-list">{projection.updates!.map(update => <li key={update.id}>
      <span>{update.text}</span>
    </li>)}</ol> : <p className="player-muted">Открытых записей пока нет.</p>}
  </section>;
  if (tab === 'equipment') return <section className="player-section" aria-label="Снаряжение">
    <h2>Снаряжение</h2>
    {hero.equipment.length ? <ul className="player-list">{hero.equipment.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><strong>× {item.quantity}</strong></li>)}</ul> : <p className="player-muted">Записанного снаряжения нет</p>}
  </section>;
  if (tab === 'features') return <section className="player-section" aria-label="Умения и черты">
    <h2>Умения и черты</h2>
    {hero.features.length ? <FeatureList features={hero.features} /> : <p className="player-muted">Записанных умений и черт нет</p>}
  </section>;
  return <section className="player-section" aria-label="Заклинания">
    <h2>Заклинания</h2>
    {hero.spells.length ? <ul className="player-list">{hero.spells.map((spell, index) => <li key={`${spell.name}-${index}`}>
      <span>{spell.name}<small>{spell.kind === 'cantrip' ? 'Заговор' : spell.kind === 'always prepared' ? 'Всегда подготовлено' : spell.kind === 'prepared' ? 'Подготовлено' : spell.kind === 'in spellbook' ? 'В книге' : 'Известно'}{spell.level > 0 ? ` · ${spell.level}-й круг` : ''}</small></span>
    </li>)}</ul> : <p className="player-muted">Заклинания не указаны</p>}
  </section>;
}

const STATUS_LABEL: Readonly<Record<PlayerConnectionStatus, string>> = {
  connecting: 'Подключаемся', online: 'Подключено', offline: 'Нет связи', revoked: 'Доступ отозван',
};

export function PlayerApp({ projection, status, lastUpdatedAt, onDisconnect }: PlayerAppProps) {
  useFeedbackInteractions('player');
  const [tab, setTab] = useState<PlayerTab>('overview');
  const [mode, setMode] = useState<PlayerMode>('sheet');
  const [rollMode, setRollMode] = useState<RollMode>('normal');
  const [rolls, setRolls] = useState<PlayerRoll[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const rollId = useRef(0);
  const safeProjection = status === 'revoked' ? null : projection;
  const tabs: { id: PlayerTab; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    ...(safeProjection?.hero.equipment.length ? [{ id: 'equipment' as const, label: 'Снаряжение' }] : []),
    ...(safeProjection?.hero.features.length ? [{ id: 'features' as const, label: 'Умения' }] : []),
    ...(safeProjection?.hero.spells.length ? [{ id: 'spells' as const, label: 'Заклинания' }] : []),
    ...(safeProjection?.updates?.length ? [{ id: 'updates' as const, label: 'События' }] : []),
    ...(safeProjection?.adventureNotes?.length ? [{ id: 'notes' as const, label: 'Зацепки' }] : []),
    ...(safeProjection?.rumors?.length ? [{ id: 'rumors' as const, label: 'Слухи' }] : []),
  ];
  const visibleTab = tabs.some(item => item.id === tab) ? tab : 'overview';
  const updated = updatedLabel(safeProjection, lastUpdatedAt);
  const noProjectionMessage = status === 'revoked' ? 'Мастер отозвал доступ к этому персонажу.'
    : status === 'offline' ? 'Нет связи. Подключитесь к столу, чтобы получить лист персонажа.'
      : 'Лист персонажа появится после безопасного подключения к столу мастера.';
  function playerRoll(label: string, formula: string, withMode = false) {
    if (status !== 'online' || !hasSecureRandom()) return;
    const parsed = parseFormula(formula);
    const useMode = withMode ? rollMode : 'normal';
    const attempts = useMode === 'normal' ? 1 : 2;
    const results = Array.from({ length: attempts }, () => rollDice(parsed.text, { label, rng: secureRandom }));
    const chosen = results.length === 1 ? results[0]! : results[useMode === 'advantage'
      ? results[0]!.total >= results[1]!.total ? 0 : 1
      : results[0]!.total <= results[1]!.total ? 0 : 1]!;
    setRolls(previous => [{
      id: ++rollId.current, label, formula: chosen.formula, dice: chosen.dice, mod: chosen.mod, total: chosen.total,
      ...(results.length > 1 ? { alternatives: results.map(result => result.total) } : {}),
    }, ...previous].slice(0, 8));
    emitFeedback('confirm', 'player');
  }
  return <main className="player-app" aria-label="Лист игрока">
    <header className="player-header">
      <div><p className="player-eyebrow">DM Cockpit · игрок</p><h1>{safeProjection ? 'Карта персонажа' : 'Лист персонажа'}</h1></div>
      <button className="player-disconnect" type="button" onClick={onDisconnect}>Отключиться</button>
    </header>
    <FeedbackSettings variant="player" scope="player" />
    <div className={`player-connection player-connection--${status}`} role="status" aria-live="polite">
      <span className="player-connection-dot" aria-hidden="true" />
      <strong>{STATUS_LABEL[status]}</strong>
      {updated ? <span>{status === 'online' ? 'Обновлено' : 'Последний снимок'}: {updated}</span> : null}
    </div>
    {status === 'offline' && safeProjection ? <p className="player-stale">Показан сохранённый снимок. Он может быть устаревшим; действия в приложении недоступны.</p> : null}
    {status === 'connecting' && safeProjection ? <p className="player-stale">Пока восстанавливается связь, показан последний полученный снимок.</p> : null}
    {safeProjection ? <>
      <section className="player-world-time" aria-label="Игровое время">
        <span>{safeProjection.worldTime.date}</span><strong>{safeProjection.worldTime.time}</strong><small>Темп: {safeProjection.worldTime.tempo}</small>
      </section>
      {mode === 'sheet' && rolls[0] ? <div className="player-last-roll" role="status" aria-live="polite">
        <span><small>Бросок · {rolls[0].label}</small><strong>{rolls[0].formula}{rolls[0].alternatives ? ` · ${rolls[0].alternatives.join(' / ')}` : ''}</strong></span>
        <b>{rolls[0].total}</b>
      </div> : null}
      {mode === 'sheet' ? safeProjection.hero.card ? <PlayerCharacterCard
        projection={safeProjection}
        available={status === 'online' && hasSecureRandom()}
        onRoll={playerRoll}
        onSheet={() => setSheetOpen(true)}
      /> : <>
        <div className="player-tabs" role="tablist" aria-label="Разделы листа" onKeyDown={event => tabForKey(event, visibleTab, tabs, setTab)}>
          {tabs.map(item => <button key={item.id} type="button" role="tab" id={`player-tab-${item.id}`} data-player-tab={item.id}
            aria-selected={visibleTab === item.id} aria-controls="player-tab-panel" tabIndex={visibleTab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>
        <div className="player-panel" role="tabpanel" id="player-tab-panel" aria-labelledby={`player-tab-${visibleTab}`}>
          <TabContent tab={visibleTab} projection={safeProjection} />
        </div>
      </> : mode === 'rolls' ? <RollWorkspace projection={safeProjection} mode={rollMode} onModeChange={setRollMode} onRoll={playerRoll} rolls={rolls} available={status === 'online' && hasSecureRandom()} />
        : <div className="player-party-view"><section className="player-section player-party-current" aria-label="Текущий ход">
          <div className="player-section-heading"><h2>Сейчас</h2>{safeProjection.encounter.active ? <span className="player-turn">Раунд {safeProjection.encounter.round}</span> : null}</div>
          <p>{safeProjection.encounter.active ? safeProjection.encounter.currentTurn === 'party' ? 'Ход партии' : 'Ход противников' : 'Сейчас нет активного боя'}</p>
        </section><PartySummary projection={safeProjection} /></div>}
    </> : <section className="player-empty" aria-label="Подключение"><p>{noProjectionMessage}</p></section>}
    {safeProjection ? <nav className="player-primary-nav" aria-label="Основные разделы">
      {([['sheet', 'Лист'], ['rolls', 'Броски'], ['party', 'Партия']] as const).map(([value, label]) =>
        <button key={value} type="button" aria-current={mode === value ? 'page' : undefined} onClick={() => setMode(value)}>{label}</button>)}
    </nav> : null}
    {safeProjection ? <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="player-sheet-overlay" />
        <Dialog.Content className="player-sheet-dialog" aria-label={`Лист персонажа: ${safeProjection.hero.name}`}>
          <header className="player-sheet-dialog-header"><Dialog.Title>Лист персонажа</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="player-sheet-close">Закрыть</button></Dialog.Close>
          </header>
          <div className="player-sheet-dialog-body">
            <section className="player-section" aria-label="Профиль персонажа">
              <h2>Профиль</h2>
              <p><strong>{safeProjection.hero.name}</strong></p>
              <p>{safeProjection.hero.ancestry} · {safeProjection.hero.className}{safeProjection.hero.subclassName ? ` · ${safeProjection.hero.subclassName}` : ''} · {safeProjection.hero.level}-й уровень</p>
              <p>Класс доспеха {safeProjection.hero.armorClass} · хиты {safeProjection.hero.hp.current}/{safeProjection.hero.hp.maximum}{safeProjection.hero.hp.temporary ? ` · временные ${safeProjection.hero.hp.temporary}` : ''}</p>
              {safeProjection.hero.conditions.length ? <ul className="player-chips" aria-label="Состояния">{safeProjection.hero.conditions.map((condition, index) => <li key={`${condition.label}-${index}`}>{condition.label}{condition.level ? ` ${condition.level}` : ''}</li>)}</ul> : <p className="player-muted">Состояний нет.</p>}
            </section>
            <section className="player-section" aria-label="Характеристики и спасброски">
              <h2>Характеристики и спасброски</h2>
              <div className="player-ability-grid">{safeProjection.hero.abilities.map(ability => <div className="player-ability" key={ability.label}>
                <span>{ability.label}</span><strong>{ability.score}</strong><small>{signed(ability.modifier)} · спасбросок {signed(ability.savingThrow)}</small>
              </div>)}</div>
              <ul className="player-sheet-skills">{safeProjection.hero.skills.map(skill => <li key={skill.label}>
                <span>{skill.label}</span><strong>{signed(skill.modifier)}</strong><small>{skill.proficiency === 'expert' ? 'Экспертность' : skill.proficiency === 'proficient' ? 'Владение' : 'Без владения'}</small>
              </li>)}</ul>
            </section>
            <section className="player-section" aria-label="Умения и черты">
              <h2>Умения и черты</h2>
              {safeProjection.hero.features.length ? <FeatureList features={safeProjection.hero.features} /> : <p className="player-muted">Не указаны.</p>}
            </section>
            {safeProjection.hero.spells.length ? <section className="player-section" aria-label="Заклинания">
              <h2>Заклинания</h2><ul className="player-list">{safeProjection.hero.spells.map((spell, index) => <li key={`${spell.name}-${index}`}>
                <span>{spell.name}<small>{spell.level > 0 ? `${spell.level}-й круг` : 'Заговор'}</small></span>
              </li>)}</ul>
            </section> : null}
            {(safeProjection.adventureNotes?.length || safeProjection.updates?.length) ? <section className="player-section" aria-label="История персонажа">
              <h2>История</h2>
              {safeProjection.adventureNotes?.map(note => <article className="player-section" key={note.id} aria-label={note.title}>
                <p className="player-eyebrow">{note.adventureTitle}</p><h3>{note.title}</h3><p>{note.summary}</p>
                {note.entries.length ? <ul className="player-list">{note.entries.map(entry => <li key={entry.id}><span><strong>{entry.name}</strong><small>{entry.summary}</small></span></li>)}</ul>
                  : note.id.endsWith(':town-leads') ? <p className="player-muted">Пока нет раскрытых зацепок.</p> : null}
              </article>)}
              {safeProjection.updates?.length ? <ol className="player-list">{safeProjection.updates.map(update => <li key={update.id}><span>{update.text}</span></li>)}</ol> : null}
            </section> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root> : null}
  </main>;
}

export default PlayerApp;
