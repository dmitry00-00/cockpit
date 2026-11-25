// Реальная карточка участника раскладки: действия привязаны к переданному actor,
// а не к текущему выбранному персонажу страницы. Выбранное заклинание передаётся от панели действий к обороту карты.
import { useEffect, useState, type ReactNode } from 'react';
import type { Actor, InventoryContainer, InventoryOwner, InventoryStack, InventoryStorage } from '../../engine';
import { characterCardProps } from '../../campaign/characterCard';
import { CharacterCard, PcSpells } from '../../lazyParts';
import { ABILITIES } from '../../rules/srd/abilities';
import { SKILL_LABEL } from '../../components/labels';
import { SKILLS } from '../../rules/srd/abilities';
import { combineRollModes, mentalStressRollMode, resolveRollModes, strifeRollMode, type StrifeRollIntent } from '../../campaign/strife';
import { A5E_STRESS_EFFECT_REMINDERS, A5E_STRIFE_LEVEL_REMINDERS, activeA5eStressEffect, a5eStressEffectName, type A5eStressEffectId } from '../../rules/a5e/strife';
import { d20Formula, deskDollItems } from './helpers';
import { Paperdoll, dollExtrasOf } from '../../components';
import { InventoryPanel } from '../../components/InventoryPanel';
import { pcHeaderData } from './characterBodyData';
import { withPlayerVisibleInventory } from '../../engine/inventory';
import type { RollMode } from '../../rules/srd/odds';
import type { EntityRef } from '../../entities/ref';
import type { SkillId } from '../../rules/srd/abilities';

export interface PartyMemberCardProps {
  actor: Actor;
  worldSec: number;
  dmView: boolean;
  stressEnabled?: boolean;
  inventory: readonly InventoryStack[];
  inventoryContainers?: readonly InventoryContainer[];
  onGainItem?: (stack: InventoryStack) => void;
  onExchangeCoins?: (stackId: string, qty: number, toCoinId: string, toQty: number, receiveStackId: string) => void;
  onMoveItem?: (stackId: string, qty: number, to: InventoryStorage, splitStackId?: string) => void;
  onTransferItem?: (stackId: string, qty: number, owner: InventoryOwner, to: InventoryStorage, splitStackId?: string) => void;
  onLoseItem?: (stackId: string, qty: number) => void;
  onAttuneItem?: (stackId: string, actorId?: string) => void;
  onEquipItem?: (stackId: string, actorId: string, wornAs: 'armor' | 'shield') => void;
  onUnequipItem?: (stackId: string, actorId: string) => void;
  conditions?: ReactNode;
  /** Compact 63:88 party card, sized by its grid cell. */
  compact?: boolean;
  inCombat?: boolean;
  activeActorId?: string;
  combatRound?: number;
  onHp?: () => void;
  onCollapse?: () => void;
  onDamage: (actorId: string, amount: number) => void;
  onHeal: (actorId: string, amount: number) => void;
  onRoll: (formula: string, label: string, intent?: StrifeRollIntent, actorId?: string, baseMode?: RollMode, baseModeLabel?: string) => number | void;
  keyKnowledgeSubjects?: readonly { ref: EntityRef; name: string; amount: number }[];
  onSpendKeyKnowledge?: (spend: { actorId: string; subjectRef: EntityRef; subjectName: string; kind: 'check' | 'attack'; label: string; skill?: SkillId; ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; total: number }) => void;
  onStressOutcome?: (text: string) => void;
  onSheet: (actorId: string) => void;
}

type StressRollContext = 'recall-knowledge' | 'resist-grapple-or-restraint' | 'end-combat' | 'murderous-first-attack' | 'superstitious-distance' | 'find-lucky-charm';
const STRESS_CONTEXT_LABEL: Readonly<Record<StressRollContext, string>> = {
  'recall-knowledge': 'A5E Memory Wipe · вспомнить знания',
  'resist-grapple-or-restraint': 'A5E Inimical · сопротивление захвату/опутыванию',
  'end-combat': 'A5E Peacekeeping · первая проверка завершить бой',
  'murderous-first-attack': 'A5E Murderous · первая атака этого хода',
  'superstitious-distance': 'A5E Superstitious · дальше 30 футов от талисмана',
  'find-lucky-charm': 'A5E Superstitious · найти талисман',
};

function stressContextsFor(effect: A5eStressEffectId, isActorTurn = false, withinFirstFiveRounds = false): StressRollContext[] {
  if (effect === 'memory-wipe') return ['recall-knowledge'];
  if (effect === 'inimical') return ['resist-grapple-or-restraint'];
  if (effect === 'peacekeeping') return isActorTurn ? ['end-combat'] : [];
  if (effect === 'murderous') return isActorTurn && withinFirstFiveRounds ? ['murderous-first-attack'] : [];
  if (effect === 'superstitious') return ['superstitious-distance', 'find-lucky-charm'];
  return [];
}

function withStressContext(intent: StrifeRollIntent | undefined, context: StressRollContext): StrifeRollIntent | undefined {
  if (!intent) return undefined;
  if (context === 'recall-knowledge' && intent.kind === 'check') return { ...intent, purpose: 'recall-knowledge' };
  if (context === 'resist-grapple-or-restraint' && (intent.kind === 'check' || intent.kind === 'save')) return { ...intent, purpose: 'resist-grapple-or-restraint' };
  if (context === 'end-combat' && intent.kind === 'check') return { ...intent, purpose: 'end-combat' };
  if (context === 'murderous-first-attack' && intent.kind === 'attack') return { ...intent, firstAttackOfTurn: true };
  if (context === 'superstitious-distance' && (intent.kind === 'attack' || intent.kind === 'save')) return { ...intent, charmMoreThan30Feet: true };
  if (context === 'find-lucky-charm' && intent.kind === 'check' && (intent.skill === 'investigation' || intent.skill === 'perception')) return { ...intent, purpose: 'find-lucky-charm' };
  return undefined;
}

export function PartyMemberCard({ actor, worldSec, dmView, stressEnabled = false, inventory, inventoryContainers = [], onGainItem, onExchangeCoins, onMoveItem, onTransferItem, onLoseItem, onAttuneItem, onEquipItem, onUnequipItem, conditions, onHp, onCollapse, onDamage, onHeal, onRoll, keyKnowledgeSubjects = [], onSpendKeyKnowledge, onStressOutcome, onSheet, compact = false, inCombat = false, activeActorId, combatRound }: PartyMemberCardProps) {
  const stress = stressEnabled ? activeA5eStressEffect(actor.a5eConditions?.mentalStress, worldSec) : undefined;
  const [stressRollContext, setStressRollContext] = useState<StressRollContext | null>(null);
  const [selectedSpellId, setSelectedSpellId] = useState<string>();
  const [selectedKeyKnowledgeRef, setSelectedKeyKnowledgeRef] = useState<EntityRef | ''>('');
  const keyKnowledgeSubjectRefs = keyKnowledgeSubjects.map(subject => subject.ref).join('|');
  const isActorTurn = inCombat && activeActorId === actor.id;
  const withinFirstFiveRounds = combatRound !== undefined && combatRound <= 5;
  const stressContexts = stress ? stressContextsFor(stress.id, isActorTurn, withinFirstFiveRounds) : [];
  useEffect(() => setStressRollContext(null), [stress?.id, activeActorId, combatRound, inCombat]);
  useEffect(() => {
    if (selectedKeyKnowledgeRef && !keyKnowledgeSubjects.some(subject => subject.ref === selectedKeyKnowledgeRef)) setSelectedKeyKnowledgeRef('');
  }, [keyKnowledgeSubjectRefs, selectedKeyKnowledgeRef]);
  const rollForActor = (formula: string, label: string, intent?: StrifeRollIntent, actorId = actor.id, baseMode: RollMode = 'normal'): number | void => {
    const selectedContext = stress && stressRollContext && stressContexts.includes(stressRollContext) ? stressRollContext : null;
    const contextual = selectedContext ? withStressContext(intent, selectedContext) : undefined;
    const activeIntent = contextual ?? intent;
    const subject = keyKnowledgeSubjects.find(item => item.ref === selectedKeyKnowledgeRef);
    const canUseKeyKnowledge = dmView && !!subject && !!onSpendKeyKnowledge && !!activeIntent
      && (activeIntent.kind === 'check' || activeIntent.kind === 'attack')
      && (actor.a5eKeyKnowledge?.[subject.ref] ?? 0) > 0;
    if (selectedContext) setStressRollContext(null);
    if (canUseKeyKnowledge && subject && activeIntent) {
      setSelectedKeyKnowledgeRef('');
      const strifeMode = strifeRollMode(stressEnabled, actor.a5eConditions?.strife ?? 0, activeIntent);
      const stressMode = mentalStressRollMode(stress, activeIntent);
      const withoutKnowledge = resolveRollModes(baseMode, strifeMode, stressMode);
      const requestedMode = combineRollModes(baseMode, 'advantage');
      const withKnowledge = resolveRollModes(baseMode, 'advantage', strifeMode, stressMode);
      if (withKnowledge !== 'advantage' || withoutKnowledge === 'advantage') {
        onStressOutcome?.(`${actor.name}: Key Knowledge по «${subject.name}» сохранён — преимущество уже есть или его нейтрализует помеха.`);
        return onRoll(formula, label, activeIntent, actorId, baseMode);
      }
      const total = onRoll(formula, `${label} · Key Knowledge: ${subject.name}`, activeIntent, actorId, requestedMode, 'Key Knowledge');
      if (typeof total === 'number') onSpendKeyKnowledge({
        actorId, subjectRef: subject.ref, subjectName: subject.name,
        kind: activeIntent.kind as 'check' | 'attack', label,
        ...(activeIntent.kind === 'check' && activeIntent.skill ? { skill: activeIntent.skill } : {}),
        ...(activeIntent.kind === 'check' || activeIntent.kind === 'attack' ? { ability: activeIntent.ability } : {}),
        total,
      });
      return total;
    }
    if (contextual && selectedContext) return onRoll(formula, `${label} · ${STRESS_CONTEXT_LABEL[selectedContext]}`, contextual, actorId, baseMode);
    return onRoll(formula, label, intent, actorId, baseMode);
  };
  if (!actor.sheet) return null;
  const inventoryById = Object.fromEntries(inventory.map(stack => [stack.id, stack]));
  const shownActor = dmView ? actor : withPlayerVisibleInventory(actor, inventoryById);
  const sheet = shownActor.sheet!;
  const card = characterCardProps(shownActor, pcHeaderData(sheet), worldSec, dmView);
  if (!card) return null;
  const wisdom = card.abilities.find(row => row.id === 'wis');
  const terrorizedEscape = dmView && stress?.id === 'terrorized' ? (
    <section className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label={`Проверка выхода из опасности: ${actor.name}`} data-part="terrorized-escape-checks">
      <span className="type-body-xs text-t2">Выход из боя или опасности · преимущество</span>
      {(['str', 'dex', 'con'] as const).map(id => {
        const ability = card.abilities.find(row => row.id === id);
        if (!ability) return null;
        return <button key={id} type="button" className="type-num-12 px-1.5 py-1 bg-cd shadow-bevel text-t2 hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]" aria-label={`Проверка выхода из опасности · ${ABILITIES[id].code} · ${actor.name}`} onClick={() => rollForActor(d20Formula(ability.mod), `Выход из боя или опасности · ${ABILITIES[id].code} · ${actor.name}`, { kind: 'check', ability: id, purpose: 'escape-combat-or-danger' }, actor.id)}>{ABILITIES[id].code}</button>;
      })}
      {wisdom ? <button type="button" className="type-num-12 px-1.5 py-1 bg-cd shadow-bevel text-t2 hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]" aria-label={`Спасбросок Мудрости Сл 15 · Terrorized · ${actor.name}`} title="A5E SRD: прежде чем подойти ближе 30 футов к незнакомцу или участвовать в ближнем бою. При провале персонаж отступает / совершает Dash, спасаясь от опасности." onClick={() => rollForActor(d20Formula(wisdom.save), `Terrorized · спасбросок Мудрости Сл 15 · ${actor.name}`, { kind: 'save', ability: 'wis' }, actor.id)}>WIS Сл 15</button> : null}
    </section>
  ) : null;
  const strife = stressEnabled ? actor.a5eConditions?.strife ?? 0 : 0;
  const stressGuidance = dmView && stressEnabled && (stress || strife >= 3) ? (
    <details data-part="a5e-stress-guidance" className="mt-2 bg-pn shadow-bevel p-2">
      <summary className="type-body-xs text-gd-hi cursor-pointer">A5E · последствия и ручные триггеры</summary>
      <ul className="mt-1 flex flex-col gap-1 type-body-xs text-t2">
        {strife >= 3 ? <li><strong className="text-tx">Strife 3:</strong> {A5E_STRIFE_LEVEL_REMINDERS[3]}</li> : null}
        {strife >= 6 ? <li><strong className="text-tx">Strife 6:</strong> {A5E_STRIFE_LEVEL_REMINDERS[6]}</li> : null}
        {strife >= 7 ? <li><strong className="text-tx">Strife 7:</strong> {A5E_STRIFE_LEVEL_REMINDERS[7]}</li> : null}
        {stress ? <li><strong className="text-tx">{a5eStressEffectName(stress.id)}:</strong> {A5E_STRESS_EFFECT_REMINDERS[stress.id]}</li> : null}
      </ul>
      {stressContexts.length && !compact ? (
        <label className="mt-2 flex flex-col gap-1 type-body-xs text-t2">
          Контекст следующего подходящего броска
          <select aria-label={`Контекст следующего броска A5E · ${actor.name}`} value={stressRollContext ?? ''} onChange={event => setStressRollContext(event.target.value ? event.target.value as StressRollContext : null)} className="h-8 bg-wl px-2 text-tx shadow-bevel-in">
            <option value="">Обычный бросок</option>
            {stressContexts.map(context => <option key={context} value={context}>{STRESS_CONTEXT_LABEL[context]}</option>)}
          </select>
          <span>Контекст применяется к следующему подходящему броску и записывается в его строке журнала.</span>
        </label>
      ) : null}
      {stress?.id === 'phobia' && wisdom && !compact ? (
        <button type="button" className="mt-2 type-num-12 px-1.5 py-1 bg-cd shadow-bevel text-t2 hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]" aria-label={`Спасбросок Мудрости Сл 18 · A5E Phobia · ${actor.name}`} onClick={() => {
          const total = onRoll(d20Formula(wisdom.save), `A5E Phobia · спасбросок Мудрости Сл 18 · ${actor.name}`, { kind: 'save', ability: 'wis' }, actor.id);
          if (typeof total === 'number' && total < 18) onStressOutcome?.(`${actor.name}: провал A5E Phobia. Испуган на 1 минуту; повторять спасбросок в конце каждого хода. По решению мастера возможна недееспособность.`);
        }}>Phobia · WIS Сл 18</button>
      ) : null}
      <p className="mt-2 type-body-xs text-t3">Контекстные последствия требуют подтверждения мастера: боевой трекер хранит порядок, хиты и состояния, но не разыгрывает движение, расход действий и реакции.</p>
    </details>
  ) : null;
  const keyKnowledgeCount = keyKnowledgeSubjects.reduce((sum, subject) => sum + Math.max(0, subject.amount), 0);
  const keyKnowledgePanel = dmView && onSpendKeyKnowledge && keyKnowledgeSubjects.length ? (
    <details data-part="a5e-key-knowledge-controls" className="mt-2 bg-pn shadow-bevel p-2">
      <summary className="type-body-xs text-gd-hi cursor-pointer">Key Knowledge · {keyKnowledgeCount}</summary>
      <p className="mt-1 type-body-xs text-t2">Выберите связанный субъект для следующей проверки или атаки. Очко расходуется только если итоговое преимущество сохраняется.</p>
      <label className="mt-1 flex flex-col gap-1 type-body-xs text-t2">Связанный субъект
        <select aria-label={`Субъект Key Knowledge: ${actor.name}`} value={selectedKeyKnowledgeRef} onChange={event => setSelectedKeyKnowledgeRef(event.target.value as EntityRef | '')} className="w-full h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]">
          <option value="">Не применять</option>
          {keyKnowledgeSubjects.filter(subject => (actor.a5eKeyKnowledge?.[subject.ref] ?? 0) > 0).map(subject => <option key={subject.ref} value={subject.ref}>{subject.name} · {actor.a5eKeyKnowledge?.[subject.ref] ?? subject.amount}</option>)}
        </select>
      </label>
      {selectedKeyKnowledgeRef ? <p className="mt-1 type-body-xs text-gd-hi">Будет применено к следующей проверке или атаке этого персонажа.</p> : null}
    </details>
  ) : null;
  const conditionPanel = conditions || terrorizedEscape || stressGuidance || keyKnowledgePanel ? <>{conditions}{terrorizedEscape}{stressGuidance}{keyKnowledgePanel}</> : undefined;
  return <CharacterCard
    card={card}
    compact={compact}
    {...(dmView ? { onHp, onDamage: (amount: number) => onDamage(actor.id, amount), onHeal: (amount: number) => onHeal(actor.id, amount), conditions: conditionPanel } : {})}
    onRollAbility={ability => rollForActor(d20Formula(ability.mod), `${ABILITIES[ability.id].code} · ${shownActor.name}`, { kind: 'check', ability: ability.id }, actor.id)}
    onRollSave={ability => rollForActor(d20Formula(ability.save), `Спасбросок ${ABILITIES[ability.id].code} · ${shownActor.name}`, { kind: 'save', ability: ability.id }, actor.id)}
    onRollSkill={skill => rollForActor(d20Formula(skill.mod), `${SKILL_LABEL[skill.id]} · ${shownActor.name}`, { kind: 'check', ability: SKILLS[skill.id].ability, skill: skill.id }, actor.id)}
    onRollAttack={attackId => {
      const attack = sheet.attacks?.find(item => item.id === attackId);
      if (!attack) return;
      rollForActor(d20Formula(attack.toHit), `Атака ${attack.name} · ${shownActor.name}`, { kind: 'attack', ...(attack.ability ? { ability: attack.ability } : {}) }, actor.id, attack.disadvantage ? 'disadvantage' : 'normal');
    }}
    onOpenSpell={setSelectedSpellId}
    onInitiative={() => rollForActor(d20Formula(card.initiative), `Инициатива · ${shownActor.name}`)}
    gear={<><Paperdoll items={deskDollItems(sheet)} {...dollExtrasOf(sheet)} /><InventoryPanel actor={shownActor} stacks={inventory} containers={inventoryContainers} dmView={dmView} onGain={onGainItem} onExchange={onExchangeCoins} onMove={onMoveItem} onTransfer={onTransferItem} onLose={onLoseItem} onAttune={onAttuneItem} onEquip={onEquipItem} onUnequip={onUnequipItem} /></>}
    {...(sheet.spellcasting || card.pools.some(pool => pool.kind === 'slots') ? { spells: <PcSpells key={selectedSpellId ?? 'spells'} actor={shownActor} pools={card.pools} selectedSpellId={selectedSpellId} onRollAttack={sheet.spellcasting ? () => rollForActor(d20Formula(sheet.spellcasting!.attack), `Атака заклинанием · ${shownActor.name}`, { kind: 'attack', ability: sheet.spellcasting!.ability }, actor.id) : undefined} /> } : {})}
    onSheet={() => onSheet(actor.id)}
    onCollapse={onCollapse}
  />;
}
