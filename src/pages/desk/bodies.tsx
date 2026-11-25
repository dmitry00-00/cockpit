// Тела карточки стола: обзор персонажа и монстра, действия монстра, вкладка DM, обзор места и державы,
// мелкая разметка секций. Тупые: всё — пропсами, стор не читают.
import { useEffect, useState, type ReactNode } from 'react';
import {
  abilityMod, actionOdds, sheetAttackOdds, sheetSpellOdds, calendarAdapterForSetting, eraOfSetting, explain, explainText, poolLabel, resourcePoolsOf, sheetViewOf,
  type ExplainKey, type OddsTarget,
} from '../../campaign';
import {
  ConditionChip, ResourcePips, StatTile, SCALE_LABELS, chipsOf, exhaustionCommand, signedMod, toggleCommand, SKILL_LABEL, SheetAttacks, IconGrid,
  AbilityScores, DataPassport, PcHeader, SkillList, type PassportData, SheetChoices,
  SheetFeats, SheetLanguages, SheetSpells, GroupList, GOODS_LABEL, RELATION_LABEL, signed, OddsTable,
} from '../../components';
import { GOODS, TEMPO_SECONDS, type Actor, type Command, type Faction, type InventoryStack, type JournalEntry, type Location, type NpcAttitude, type NpcRelationship, type NpcRelationshipType, type PersonGiftState, type State } from '../../engine';
import { ref, type EntityRef } from '../../entities';
import { useEntity } from '../../entities/useEntity';
import { useOpenEntity } from '../../components/openEntity';
import { SPELLS } from '../../rules/srd/spells';
import { useWikiPlace } from '../../world/useWikiPlace';
import { Icon } from '../../icons/Icon';
import { backgroundById, classById } from '../../rules/compendium';
import { ITEMS } from '../../rules/srd/equipment';
import { activeA5eStressEffect } from '../../rules/a5e/strife';
import { ABILITIES, ABILITY_IDS, INFLUENCE_RULE, MONSTERS, SKILLS, type AbilityId, type ConditionId, type MonsterAction, type SkillId } from '../../rules/srd';
import type { StrifeRollIntent } from '../../campaign/strife';
import { d20Formula, dmFactsAbout, playerFactsAbout } from './helpers';
import { ROLL_MODES, ROLL_MODE_LABEL, type RollMode } from '../../rules/srd/odds';
import type { CalendarAdapter } from '../../campaign/calendar';
import { BTN, OPT, OPT_OFF, OPT_ON } from './styles';
import { classFeatureItems, chronicleOf, pcHeaderData, raceTraitItems } from './characterBodyData';
import type { CardPool } from '../../campaign/characterCard';
import { DEFAULT_SETTING_PACKAGE } from '../../packages/registry';
export { classFeatureItems, chronicleOf, pcHeaderData, raceTraitItems } from './characterBodyData';

/** Вкладка «Заклинания» карты персонажа: та же секция, что в «Листе», с подсказками вывода Сл и атаки. */
export function PcSpells({ actor, onRollAttack, pools = [], selectedSpellId }: { actor: Actor; onRollAttack?: () => void; pools?: readonly CardPool[]; selectedSpellId?: string }) {
  const sheet = actor.sheet;
  const slots = pools.filter(pool => pool.kind === 'slots');
  if (!sheet?.spellcasting && slots.length === 0) return null;
  return (
    <>
      {slots.length ? (
        <Section title="Ячейки заклинаний">
          <div className="flex flex-col gap-1" data-part="spell-slots">
            {slots.map(pool => <ResourcePips key={pool.id} id={pool.id} label={pool.label} max={pool.max} spent={pool.spent} kind="slots" restoresOn={pool.restoresOn} />)}
          </div>
        </Section>
      ) : null}
      {sheet?.spellcasting ? <SheetSpells sheet={sheet} onRollAttack={onRollAttack} openSpellId={selectedSpellId} hint={`Сл ${hintOf(actor, 'spellDc')}\nатака ${hintOf(actor, 'spellAttack')}`} /> : null}
    </>
  );
}

/**
 * Вкладка «История» полного листа персонажа (образец владельца, 30.10.2026): предыстория с её навыками и хроника —
 * записи журнала о нём. Черт характера на листе нет — их и здесь нет; пустая секция не показывается.
 */
export function PcLore({ actor, entries, calendar }: { actor: Actor; entries: readonly JournalEntry[]; calendar: CalendarAdapter }) {
  const bg = actor.sheet?.backgroundId ? backgroundById(actor.sheet.backgroundId) : undefined;
  const chronicle = chronicleOf(actor, entries);
  if (!bg && chronicle.length === 0) return null;
  return (
    <>
      {bg ? (
        <Section title="Предыстория">
          <p className="type-body-sm text-gd">{bg.nameRu} <span className="text-t2">· {bg.name}</span></p>
          <p className="type-body-xs text-t2">Навыки: {bg.skills.map(s => SKILL_LABEL[s]).join(', ')}</p>
        </Section>
      ) : null}
      {chronicle.length > 0 ? (
        <Section title="Хроника">
          <ol className="flex flex-col gap-1" aria-label="Хроника персонажа">
            {chronicle.map(e => (
              <li key={e.id} className="flex gap-2">
                <span aria-hidden className="flex-none mt-1 size-1.5 bg-gd" />
                <span className="flex-none w-16 type-num-12 text-gd">{calendar.formatCompactDate(e.worldSec)}</span>
                <span className="type-body-xs text-t2 min-w-0">{e.text}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </>
  );
}

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

/** Имя и текст умения или черты; пустой текст — только имя, а не пустой абзац. */
function Entry({ name, meta, text }: { name: string; meta?: string; text: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="type-body-bold text-tx">{name}</span>
        {meta ? <span className="type-key text-t3 flex-none">{meta}</span> : null}
      </div>
      {text ? <p className="type-body-sm text-t2 whitespace-pre-line break-words [overflow-wrap:anywhere]">{text}</p> : null}
    </div>
  );
}

/* ---------- Тела вкладок ---------- */

export interface BodyProps {
  actor: Actor;
  settingPackageId?: string;
  party?: readonly Actor[];
  giftStacks?: readonly InventoryStack[];
  worldSec: number;
  a5eStrifeEnabled?: boolean;
  onRoll: (formula: string, label: string, intent?: StrifeRollIntent, actorId?: string, baseMode?: RollMode) => void;
  onCommand: (cmd: Command) => void;
  onInfluence: (npc: Actor, targetId: string, skill: SkillId, request: string, dc: number, modifier: number, attitude: NpcAttitude, requestKey: string, aidRequest?: boolean, socialPurpose?: 'avoid-combat' | 'dissuade-action' | 'deception-about-taken-item') => void;
  onRelationshipGrowth?: (npc: Actor, targetId: string, action: 'gift' | 'insult', description: string, roleplayModifier: number) => void;
  onRelationshipTransition?: (npc: Actor, targetId: string, transition: 'to-competition' | 'to-friendship', reason: string, roleplayModifier: number, applyNearMissReduction: boolean) => void;
  /** Инструменты мастера в теле: «Хиты» (попап, который страница держит вокруг карточки) и «Концентрация»; на столе игроков — нет. */
  tools: ReactNode;
  /** Стол мастера: у чипов есть крестик снятия. */
  dmView: boolean;
}

/** Заклинание SRD по имени на чипе (концентрация, эффект) — для карточки; не нашлось — чип без входа. */
const SPELL_BY_NAME: ReadonlyMap<string, string> = new Map(Object.values(SPELLS).map(s => [s.name.toLowerCase(), s.id]));

function ChipsRow({ actor, worldSec, onCommand, dmView }: Pick<BodyProps, 'actor' | 'worldSec' | 'onCommand' | 'dmView'>) {
  const openEntity = useOpenEntity();
  const chips = chipsOf(actor, worldSec);
  if (chips.length === 0) return null;
  // Чип — вход в общую карточку (ROADMAP 0.3): состояние SRD — его карточка, концентрация и эффект — заклинание по имени.
  const openOf = (id: ConditionId | 'concentration' | 'effect', label: string): (() => void) | undefined => {
    if (!openEntity) return undefined;
    if (id !== 'concentration' && id !== 'effect') return () => openEntity(ref('condition', id));
    const spell = SPELL_BY_NAME.get(label.toLowerCase());
    return spell ? () => openEntity(ref('spell', spell)) : undefined;
  };
  // Снять можно состояние SRD и концентрацию (CONCENTRATION_ENDED, решение мастера); у эффектов события нет — данные сида.
  const removeOf = (id: ConditionId | 'concentration'): (() => void) => () => onCommand(
    id === 'concentration'
      ? { type: 'CONCENTRATION_ENDED', payload: { actorId: actor.id, reason: 'dm' } }
      : id === 'exhaustion'
        ? exhaustionCommand(actor.id, (actor.conditions.exhaustion?.level ?? 1) - 1)
        : toggleCommand(actor.id, id, false),
  );
  return (
    <Section title="Состояния и эффекты">
      <div className="flex flex-wrap gap-1" data-part="chips">
        {chips.map(({ key, id, ...chip }) => (
          <ConditionChip key={key} {...chip} onRemove={id === 'effect' || !dmView ? undefined : removeOf(id)} onOpen={openOf(id, chip.label)} />
        ))}
      </div>
    </Section>
  );
}

/** Вывод числа листа строкой для подсказки (ROADMAP 5.4): «+6 = 3 (DEX 16) + 3 (владение навыком)»; Сл — без знака. */
function hintOf(actor: Actor, key: ExplainKey): string | undefined {
  const e = explain(actor, key);
  return e ? explainText(e, key !== 'spellDc') : undefined;
}

/** Навыки списком по карточке владельца — в одиночной карточке две колонки под характеристиками, в оверлее 720px — второй колонкой в одну. */
export function PcSkills({ actor, onRoll, columns = 2 }: Pick<BodyProps, 'actor' | 'onRoll'> & { columns?: 1 | 2 }) {
  const view = sheetViewOf(actor);
  if (!view) return null;
  return (
    <SkillList
      skills={view.skills.map(s => ({ ...s, hint: hintOf(actor, `skill:${s.id}`) }))}
      proficiencyBonus={view.proficiencyBonus}
      columns={columns}
      onRoll={s => onRoll(d20Formula(s.mod), `${SKILL_LABEL[s.id]} · ${actor.name}`, { kind: 'check', ability: SKILLS[s.id].ability, skill: s.id }, actor.id)}
    />
  );
}

/** Ресурсы листа (решение владельца 21.09.2026): ячейки, ярость, ци, применения умений — пипками; на столе игроков без кнопок. */
function PcResources({ actor, onCommand, dmView }: Pick<BodyProps, 'actor' | 'onCommand' | 'dmView'>) {
  const pools = resourcePoolsOf(actor);
  if (pools.length === 0) return null;
  return (
    <Section title="Ресурсы">
      <div className="flex flex-col gap-1" data-part="resources">
        {pools.map(p => (
          <ResourcePips
            key={p.id}
            id={p.id}
            label={poolLabel(p)}
            max={p.max}
            spent={p.spent}
            kind={p.kind}
            restoresOn={p.restoresOn}
            onSpend={dmView ? amount => onCommand({ type: 'RESOURCE_SPENT', payload: { actorId: actor.id, resourceId: p.id, amount, max: p.max } }) : undefined}
            onRestore={dmView ? amount => onCommand({ type: 'RESOURCE_RESTORED', payload: { actorId: actor.id, resourceId: p.id, amount, max: p.max } }) : undefined}
          />
        ))}
      </div>
    </Section>
  );
}

/**
 * Шансы листа по противникам на столе (ROADMAP 5.3): атаки оружием — попадание и средний урон, заклинания со спасброском —
 * кто провалит. Только мастеру: AC и спасброски монстров игрокам не видны (Q1).
 */
function PcOdds({ actor, targets }: { actor: Actor; targets: readonly OddsTarget[] }) {
  const [mode, setMode] = useState<RollMode>('normal');
  const odds = [...sheetAttackOdds(actor, targets, mode), ...sheetSpellOdds(actor, targets, mode)];
  if (!odds.length) return null;
  return (
    <Section title="Шансы по противникам" right={<RollModeLens mode={mode} onMode={setMode} />}>
      <div className="flex flex-col gap-2">
        {odds.map(o => (
          <div key={`${o.kind}:${o.name}`} className="flex flex-col gap-1">
            <span className="type-body-bold text-tx">{o.name}{o.kind === 'attack' ? <span className="type-num-12 text-t2"> {signedMod(o.toHit)}</span> : null}</span>
            <OddsTable odds={o} />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function PcOverview({ actor, settingPackageId, worldSec, onRoll, onCommand, tools, dmView, skills = true, passport, enemies = [], variant = 'all' }: BodyProps & { skills?: boolean; passport?: PassportData; enemies?: readonly OddsTarget[]; variant?: 'all' | 'summary' | 'actions' | 'skills' | 'features' }) {
  const sheet = actor.sheet!;
  const cls = classById(sheet.classId);
  const view = sheetViewOf(actor)!;
  // Символ бога — из его карточки по эпохе года мира: справочник богов грузится отдельным куском, до того — только имя.
  const packageId = settingPackageId ?? DEFAULT_SETTING_PACKAGE;
  const deityEra = eraOfSetting(calendarAdapterForSetting(packageId).yearAt(worldSec), packageId);
  const deity = useEntity(sheet.deity ? ref('deity', sheet.deity.id) : null, { era: deityEra, settingPackageId: packageId });
  const symbol = deity && deity !== 'loading' ? deity.facts.find(f => f.label === 'Символ')?.value : undefined;
  const homeland = useEntity(sheet.homeland ?? null, { settingPackageId: packageId });
  const homelandName = homeland && homeland !== 'loading' ? homeland.name : undefined;
  const showAll = variant === 'all';
  const showActions = showAll || variant === 'actions';
  const showSkills = showAll || variant === 'skills';
  const showFeatures = showAll || variant === 'features';
  const hasFeatures = sheet.features.length > 0 || (sheet.choices?.length ?? 0) > 0 || (sheet.feats?.length ?? 0) > 0 || sheet.traits.length > 0 || (sheet.trainedLanguages?.length ?? 0) > 0;
  const identity = (
    <div className="flex flex-col gap-3 min-w-0">
      <PcHeader data={pcHeaderData(sheet, symbol, homelandName)} name={actor.name} />
      {dmView && passport ? (
        <DataPassport
          passport={passport}
          onFill={(field, value, reason) => onCommand({
            type: 'SHEET_EDITED',
            payload: {
              actorId: actor.id, reason,
              patch: field === 'homeland' ? { homeland: ref('kingdom', value) }
                : field === 'alignment' ? { alignment: value }
                  : { bio: { ...sheet.bio, [field]: field === 'age' ? Number(value) : value } },
            },
          })}
        />
      ) : null}
    </div>
  );
  const abilities = (
    <AbilityScores
      abilities={view.abilities.map(a => ({ ...a, hint: `спасбросок ${hintOf(actor, `save:${a.id}`) ?? ''}` }))}
      right={tools}
      onRoll={a => onRoll(d20Formula(a.mod), `${ABILITIES[a.id].code} · ${actor.name}`, { kind: 'check', ability: a.id }, actor.id)}
      onRollSave={a => onRoll(d20Formula(a.save), `Спасбросок ${ABILITIES[a.id].code} · ${actor.name}`, { kind: 'save', ability: a.id }, actor.id)}
    />
  );
  const resources = <PcResources actor={actor} onCommand={onCommand} dmView={dmView} />;
  const effects = <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />;
  const summaryStatistics = <div className="flex flex-col gap-3 min-w-0">{abilities}{effects}</div>;
  const allStatistics = <div className="flex flex-col gap-3 min-w-0">{abilities}{resources}{effects}</div>;
  const summary = variant === 'summary' ? (
    <div className="pc-sheet-summary">
      {identity}
      {summaryStatistics}
    </div>
  ) : showAll ? <>{identity}{allStatistics}</> : null;
  return (
    <>
      {summary}
      {showSkills && skills ? <PcSkills actor={actor} onRoll={onRoll} /> : null}
      {showActions ? <SheetAttacks
        sheet={sheet}
        hints={Object.fromEntries((sheet.attacks ?? []).map(a => [a.id, hintOf(actor, `attack:${a.id}`) ?? '']))}
        onRoll={a => onRoll(d20Formula(a.toHit), `Атака ${a.name} · ${actor.name}`, { kind: 'attack', ...(a.ability ? { ability: a.ability } : {}) }, actor.id, a.disadvantage ? 'disadvantage' : 'normal')}
      /> : null}
      {showActions && !showAll ? resources : null}
      {showActions ? <SheetSpells sheet={sheet} onRollAttack={sheet.spellcasting ? () => onRoll(d20Formula(sheet.spellcasting!.attack), `Атака заклинанием · ${actor.name}`, { kind: 'attack', ability: sheet.spellcasting!.ability }, actor.id) : undefined} hint={sheet.spellcasting ? `Сл ${hintOf(actor, 'spellDc')}\nатака ${hintOf(actor, 'spellAttack')}` : undefined} /> : null}
      {showActions && dmView && enemies.length ? <PcOdds actor={actor} targets={enemies} /> : null}
      {showFeatures && sheet.features.length > 0 ? (
        <Section title={`Умения класса${cls ? ` · ${cls.nameRu}` : ''}`}>
          <IconGrid label="Умения класса" items={classFeatureItems(sheet)} />
        </Section>
      ) : null}
      {showFeatures ? <SheetChoices sheet={sheet} /> : null}
      {showFeatures ? <SheetFeats sheet={sheet} /> : null}
      {showFeatures ? <SheetLanguages sheet={sheet} /> : null}
      {showFeatures && sheet.traits.length > 0 ? (
        <Section title="Черты расы">
          <IconGrid label="Черты расы" items={raceTraitItems(sheet)} />
        </Section>
      ) : null}
      {showFeatures && !hasFeatures ? <p className="type-body-sm text-t2">Умения и черты пока не добавлены.</p> : null}
      {showActions && !sheet.attacks?.length && !sheet.spellcasting ? <p className="type-body-sm text-t2">Атаки и заклинания пока не добавлены.</p> : null}
    </>
  );
}

/** Пара «подпись — значение» блока монстра: как в F3 (СПАСБРОСКИ · STR +4, DEX +5). */
function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="type-num-12 uppercase text-t2 w-24 flex-none">{label}</span>
      <span className="type-body text-tx min-w-0">{value}</span>
    </div>
  );
}

export function MonsterOverview({ actor, worldSec, onRoll, onCommand, tools, dmView, party = [], onInfluence }: BodyProps) {
  const m = MONSTERS[actor.monsterId!];
  const saves = Object.entries(m.savingThrows).map(([ab, v]) => `${ABILITIES[ab as AbilityId].code} ${signedMod(v ?? 0)}`).join(', ');
  const skills = Object.entries(m.skills).map(([id, v]) => `${SKILL_LABEL[id as SkillId]} ${signedMod(v ?? 0)}`).join(', ');
  return (
    <>
      <Section title="Характеристики" right={tools}>
        <div className="grid grid-cols-6 gap-1">
          {ABILITY_IDS.map(id => {
            const mod = abilityMod(m.abilities[id]);
            return (
              <StatTile
                key={id}
                label={ABILITIES[id].code}
                mod={mod}
                score={m.abilities[id]}
                ability={id}
                onRoll={() => onRoll(d20Formula(mod), `${ABILITIES[id].code} · ${actor.name}`, { kind: 'check', ability: id }, actor.id)}
              />
            );
          })}
        </div>
      </Section>
      <div className="flex flex-col gap-1">
        {/* Скорость ходьбы — в полосе показателей (SPD); строка здесь — только когда есть полёт, плавание, лазание. */}
        {m.speedText !== `${m.speed} ft.` ? <Pair label="Скорость" value={m.speedText} /> : null}
        {saves ? (
          <div className="flex items-start gap-3">
            <span className="type-num-12 uppercase text-t2 w-24 flex-none">Спасброски</span>
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {Object.entries(m.savingThrows).map(([ability, modifier]) => {
                const id = ability as AbilityId;
                return <button key={id} type="button" className="type-body text-tx hover:text-gd focus-visible:shadow-[var(--glow-gold)]" aria-label={`Спасбросок ${ABILITIES[id].code} ${signedMod(modifier ?? 0)}`} title={`Бросок спасброска ${ABILITIES[id].name} · d20`} onClick={() => onRoll(d20Formula(modifier ?? 0), `Спасбросок ${ABILITIES[id].code} · ${actor.name}`, { kind: 'save', ability: id }, actor.id)}>{ABILITIES[id].code} {signedMod(modifier ?? 0)}</button>;
              })}
            </div>
          </div>
        ) : null}
        {skills ? <Pair label="Навыки" value={skills} /> : null}
        {m.damageVulnerabilities.length > 0 ? <Pair label="Уязвимость" value={m.damageVulnerabilities.join('; ')} /> : null}
        {m.damageResistances.length > 0 ? <Pair label="Сопротивление" value={m.damageResistances.join('; ')} /> : null}
        {m.damageImmunities.length > 0 ? <Pair label="Иммунитет" value={m.damageImmunities.join('; ')} /> : null}
        {m.conditionImmunities.length > 0 ? <Pair label="Не подвержен" value={m.conditionImmunities.join(', ')} /> : null}
        <Pair label="Чувства" value={m.senses} />
        <Pair label="Языки" value={m.languages} />
        <Pair label="CR" value={`${m.cr} (${m.xp} XP)`} />
      </div>
      <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />
      {dmView ? <NpcSocialPanel actor={actor} party={party} worldSec={worldSec} onCommand={onCommand} onInfluence={onInfluence} /> : null}
      {m.traits.length > 0 ? (
        <Section title="Особенности">
          <div className="flex flex-col gap-2">
            {m.traits.map(t => <Entry key={t.name} name={t.name} text={t.text} />)}
          </div>
        </Section>
      ) : null}
    </>
  );
}

const ATTITUDE_LABEL: Readonly<Record<NpcAttitude, string>> = { friendly: 'Дружелюбное', indifferent: 'Безразличное', hostile: 'Враждебное' };
const socialRequestKey = (actorId: string, skill: string, request: string) => `${actorId}:${skill}:${request.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ')}`;

export function NpcSocialPanel({ actor, party = [], giftStacks: allStacks = [], worldSec, a5eStrifeEnabled = false, onCommand, onInfluence, onRelationshipGrowth, onRelationshipTransition }: Pick<BodyProps, 'actor' | 'party' | 'giftStacks' | 'worldSec' | 'a5eStrifeEnabled' | 'onCommand' | 'onInfluence' | 'onRelationshipGrowth' | 'onRelationshipTransition'>) {
  const eligible = party.filter(a => !a.removed && a.kind === 'pc' && a.sheet);
  const [targetId, setTargetId] = useState(() => eligible[0]?.id ?? '');
  const [skill, setSkill] = useState<SkillId>('persuasion');
  const [request, setRequest] = useState('');
  const [aidRequest, setAidRequest] = useState(false);
  const [socialPurpose, setSocialPurpose] = useState<'ordinary' | 'avoid-combat' | 'dissuade-action' | 'deception-about-taken-item'>('ordinary');
  const [gift, setGift] = useState('');
  const [giftStackId, setGiftStackId] = useState('');
  const [giftQty, setGiftQty] = useState('1');
  const social = actor.social ?? { attitude: 'indifferent' as const };
  const canTrackRelationship = actor.kind !== 'pc';
  const target = eligible.find(a => a.id === targetId) ?? eligible[0];
  const relationship = target ? social.relationships?.[target.id] : undefined;
  const startingRelationshipScore = target?.sheet ? abilityMod(target.sheet.abilities.cha) : undefined;
  const [relationshipDraft, setRelationshipDraft] = useState(relationship?.score === undefined ? (startingRelationshipScore === undefined ? '' : String(startingRelationshipScore)) : String(relationship.score));
  const [relationshipTypeDraft, setRelationshipTypeDraft] = useState<NpcRelationshipType | ''>(relationship?.type ?? '');
  const [growthDescription, setGrowthDescription] = useState('');
  const [transitionDescription, setTransitionDescription] = useState('');
  const [roleplayModifier, setRoleplayModifier] = useState(0);
  const [applyNearMissReduction, setApplyNearMissReduction] = useState(false);
  useEffect(() => {
    setRelationshipDraft(relationship?.score === undefined ? (startingRelationshipScore === undefined ? '' : String(startingRelationshipScore)) : String(relationship.score));
    setRelationshipTypeDraft(relationship?.type ?? '');
    setGrowthDescription('');
    setTransitionDescription('');
    setRoleplayModifier(0);
    setApplyNearMissReduction(false);
  }, [actor.id, target?.id, relationship?.score, relationship?.type, startingRelationshipScore]);
  const targetStress = a5eStrifeEnabled ? activeA5eStressEffect(target?.a5eConditions?.mentalStress, worldSec) : undefined;
  const aidRequestEligible = targetStress?.id === 'distraught' && skill === 'persuasion' && social.attitude !== 'hostile';
  const canMarkAidRequest = aidRequestEligible && target?.a5eDistraughtAidUsed !== true;
  useEffect(() => { setAidRequest(false); setSocialPurpose('ordinary'); }, [actor.id, target?.id, skill, social.attitude]);
  const giftStacks = allStacks.filter(stack => stack.owner.kind === 'actor' && stack.owner.id === target?.id && !stack.attunedTo);
  const giftStack = giftStacks.find(stack => stack.id === giftStackId) ?? giftStacks[0];
  const giftStackKey = giftStacks.map(stack => `${stack.id}:${stack.qty}`).join('|');
  useEffect(() => { setGift(''); setGiftStackId(''); setGiftQty('1'); }, [actor.id, target?.id]);
  useEffect(() => { if (!giftStacks.some(stack => stack.id === giftStackId)) setGiftStackId(giftStacks[0]?.id ?? ''); }, [giftStackKey, giftStackId]);
  const stat = actor.sheet?.abilities.int ?? (actor.monsterId ? MONSTERS[actor.monsterId]?.abilities.int : undefined) ?? 10;
  const dc = INFLUENCE_RULE.defaultDc(stat);
  const skillMod = target ? sheetViewOf(target)?.skills.find(s => s.id === skill)?.mod ?? 0 : 0;
  const requestKey = target && request.trim() ? socialRequestKey(target.id, skill, request) : '';
  const failedAt = requestKey ? social.failedRequests?.[requestKey] : undefined;
  const waitSec = failedAt === undefined ? 0 : Math.max(0, failedAt + INFLUENCE_RULE.cooldownSec - worldSec);
  const giftWaitSec = social.giftAtSec === undefined ? 0 : Math.max(0, social.giftAtSec + TEMPO_SECONDS.tenday - worldSec);
  const animalAllowed = actor.monsterId ? INFLUENCE_RULE.animalTypes.some(type => MONSTERS[actor.monsterId!]?.type.includes(type)) : false;
  const skillIds = INFLUENCE_RULE.skills.filter(id => id !== 'animal-handling' || animalAllowed);
  const attitudeMode = INFLUENCE_RULE.attitude[social.attitude];
  const setAttitude = (value: NpcAttitude) => onCommand({
    type: 'NPC_SOCIAL_UPDATED', payload: {
      actorId: actor.id, kind: 'attitude', state: { ...social, attitude: value }, note: `отношение к партии: ${ATTITUDE_LABEL[value].toLowerCase()}`,
    },
  });
  const saveRelationship = () => {
    const trimmed = relationshipDraft.trim();
    if (trimmed && !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return;
    if (!target) return;
    const relationships = { ...(social.relationships ?? {}) };
    if (!trimmed) delete relationships[target.id];
    else relationships[target.id] = { score: Number(trimmed), ...(relationshipTypeDraft ? { type: relationshipTypeDraft } : {}), ...(relationship?.growthAtLevel !== undefined ? { growthAtLevel: relationship.growthAtLevel } : {}) };
    const state = { ...social, ...(Object.keys(relationships).length ? { relationships } : { relationships: undefined }) };
    onCommand({ type: 'NPC_SOCIAL_UPDATED', payload: {
      actorId: actor.id, kind: 'relationship', targetId: target.id, state,
      note: trimmed ? `PF1 Relationship спутника ${target.name}: ${trimmed}${relationshipTypeDraft ? ` · ${relationshipTypeDraft === 'friendship' ? 'дружба' : 'соперничество'}` : ''}` : `PF1 Relationship спутника ${target.name} снят`,
    } });
  };
  const giftCount = Number(giftQty);
  const canGift = Boolean(target && giftStack && Number.isSafeInteger(giftCount) && giftCount > 0 && giftCount <= giftStack.qty && giftWaitSec === 0);
  const transferGift = () => {
    if (!target || !giftStack || !canGift) return;
    const splitStackId = giftCount < giftStack.qty
      ? `item:${encodeURIComponent(target.id)}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
      : undefined;
    const note = gift.normalize('NFKC').trim();
    onCommand({ type: 'ITEM_GIFTED', payload: {
      stackId: giftStack.id, qty: giftCount, giverId: target.id, recipientId: actor.id,
      ...(splitStackId ? { splitStackId } : {}), ...(note ? { note } : {}),
    } });
    setGift('');
  };
  return (
    <Section title="Отношение к партии · Influence">
      <div className="flex flex-col gap-2">
        {canTrackRelationship ? <>
          <div className="flex items-center gap-2 type-body-sm text-t2" data-part="pf1-relationship">
            <label htmlFor={`pf1-relationship-${actor.id}`}>PF1 Relationship Score · {target?.name ?? 'персонаж'}</label>
            <input id={`pf1-relationship-${actor.id}`} aria-label={`PF1 Relationship Score · ${actor.name} · ${target?.name ?? 'персонаж'}`} type="number" step="any" value={relationshipDraft} onChange={e => setRelationshipDraft(e.target.value)} className="ml-auto h-7 w-20 bg-wl px-2 text-right text-tx shadow-bevel-in" />
            <button type="button" className={BTN} onClick={saveRelationship} disabled={!target || (relationshipDraft.trim() !== '' && (!/^-?\d+(?:\.\d+)?$/.test(relationshipDraft.trim()) || !Number.isFinite(Number(relationshipDraft)) || (Number(relationshipDraft) > 5 && relationshipTypeDraft === '')))} title="Записать связь выбранного персонажа; изменение попадёт в журнал и отменяется">{relationship ? 'Записать' : 'Создать связь'}</button>
          </div>
          {!relationship && target ? <p className="type-body-xs text-t3">Начальное значение по PF1 — модификатор Харизмы этого персонажа: {startingRelationshipScore}. Для связи из предыстории мастер может указать больше.</p> : null}
          <label className="flex items-center gap-2 type-body-sm text-t2">Тип PF1-связи
            <select aria-label={`Тип PF1-связи · ${target?.name ?? 'персонаж'}`} value={relationshipTypeDraft} onChange={event => setRelationshipTypeDraft(event.target.value as NpcRelationshipType | '')} className="ml-auto h-7 bg-wl px-2 text-tx shadow-bevel-in">
              <option value="">Не выбран</option><option value="friendship">Дружба</option><option value="competition">Соперничество</option>
            </select>
          </label>
          {relationship?.score !== undefined ? <p className="type-body-xs text-t2">{relationship.score <= 5 ? 'Association' : !relationship.type ? 'Выберите тип связи, чтобы показать уровень' : relationship.score <= 11 ? relationship.type === 'friendship' ? 'Friendship' : 'Competition' : relationship.score <= 30 ? relationship.type === 'friendship' ? 'Fellowship' : 'Rivalry' : relationship.type === 'friendship' ? 'Devotion' : 'Enmity'}</p> : null}
          <p className="type-body-xs text-t3">PF1 Ultimate Campaign · Relationships. Счёт ведётся отдельно для каждой пары персонаж–NPC; направление задаётся мастером. В проверке Diplomacy используется навык Persuasion листа 5e. Уровни PF1 сами не выдают XP или авторские черты.</p>
          {relationship?.score !== undefined && relationship.type && target?.sheet ? <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-1.5" data-part="pf1-relationship-growth">
            <label htmlFor={`pf1-growth-description-${actor.id}`} className="type-key uppercase text-t2">{relationship.type === 'friendship' ? 'Особый подарок' : 'Меткий выпад'} · PF1</label>
            <input id={`pf1-growth-description-${actor.id}`} aria-label={relationship.type === 'friendship' ? 'Описание особого подарка для роста PF1-связи' : 'Описание оскорбления для роста PF1-связи'} value={growthDescription} onChange={event => setGrowthDescription(event.target.value)} maxLength={160} placeholder={relationship.type === 'friendship' ? 'Подарок, значимый для этого NPC' : 'Оскорбление, значимое для этого NPC'} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
            <label className="flex items-center gap-2 type-body-xs text-t2">Поправка за отыгрыш · от −4 до +4
              <select aria-label="Поправка проверки PF1 за отыгрыш" value={roleplayModifier} onChange={event => setRoleplayModifier(Number(event.target.value))} className="ml-auto h-7 bg-wl px-2 text-tx shadow-bevel-in">
                {Array.from({ length: 9 }, (_, index) => index - 4).map(value => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
              </select>
            </label>
            <button type="button" className={BTN} disabled={!onRelationshipGrowth || !growthDescription.trim() || relationship.growthAtLevel === target.sheet.level} onClick={() => onRelationshipGrowth?.(actor, target.id, relationship.type === 'friendship' ? 'gift' : 'insult', growthDescription.trim(), roleplayModifier)} title="Одна проверка на пару за уровень персонажа; DC равна текущему PF1 Relationship Score">
              Проверить {relationship.type === 'friendship' ? 'подарок · Diplomacy' : 'оскорбление · Intimidate'} · Сл {relationship.score}
            </button>
            {relationship.growthAtLevel === target.sheet.level ? <p className="type-body-xs text-t3">Попытка на этом уровне уже использована.</p> : <p className="type-body-xs text-t3">Успех: +1 к счёту, при превышении Сл на 10: +2. Один шанс на уровень.</p>}
          </div> : null}
          {relationship?.score !== undefined && relationship.type && target ? <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-1.5" data-part="pf1-relationship-transition">
            <label htmlFor={`pf1-transition-reason-${actor.id}`} className="type-key uppercase text-t2">{relationship.type === 'friendship' ? 'Оскорбление или отказ' : 'Подарок для примирения'} · PF1</label>
            <input id={`pf1-transition-reason-${actor.id}`} aria-label={relationship.type === 'friendship' ? 'Описание оскорбления или отказа для смены PF1-связи' : 'Описание подарка для смены PF1-связи'} value={transitionDescription} onChange={event => setTransitionDescription(event.target.value)} maxLength={160} placeholder={relationship.type === 'friendship' ? 'Что разрушило дружбу' : 'Подарок, подходящий этому NPC'} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
            {relationship.type === 'friendship' ? <>
              <button type="button" className={BTN} disabled={!onRelationshipTransition || !transitionDescription.trim()} onClick={() => onRelationshipTransition?.(actor, target.id, 'to-competition', transitionDescription.trim(), roleplayModifier, false)} title="PF1: оскорбление или отказ переводит дружбу в соперничество; счёт уменьшается вдвое">
                Перевести в соперничество · {relationship.score} → {relationship.score / 2}
              </button>
              <p className="type-body-xs text-t3">Переход записывается как отдельное обратимое действие; проверка не требуется.</p>
            </> : <>
              <label className="flex items-center gap-2 type-body-xs text-t2"><input type="checkbox" checked={applyNearMissReduction} onChange={event => setApplyNearMissReduction(event.target.checked)} />При провале менее чем на 10 уменьшить счёт на 1</label>
              <button type="button" className={BTN} disabled={!onRelationshipTransition || !transitionDescription.trim()} onClick={() => onRelationshipTransition?.(actor, target.id, 'to-friendship', transitionDescription.trim(), roleplayModifier, applyNearMissReduction)} title={`PF1: Diplomacy проверка через Persuasion против Сл ${relationship.score + 10}; успех вдвое уменьшает счёт`}>
                Проверить примирение · Diplomacy · Сл {relationship.score + 10}
              </button>
              <p className="type-body-xs text-t3">При провале ровно на 10 источник не задаёт изменение счёта; останется без изменений.</p>
            </>}
          </div> : null}
          {social.relationshipScore !== undefined ? <p className="type-body-xs text-t3">Старая общая запись {social.relationshipScore} сохранена, но не привязана к конкретному персонажу.</p> : null}
        </> : null}
        <label className="flex items-center gap-2 type-body-sm text-t2">
          Отношение
          <select aria-label="Отношение NPC к партии" value={social.attitude} onChange={e => setAttitude(e.target.value as NpcAttitude)} className="ml-auto h-7 bg-wl px-2 text-tx shadow-bevel-in">
            {(['friendly', 'indifferent', 'hostile'] as const).map(value => <option key={value} value={value}>{ATTITUDE_LABEL[value]}</option>)}
          </select>
        </label>
        <div className="type-body-sm text-t2">{attitudeMode === 'advantage' ? 'Дружелюбное отношение даёт преимущество.' : attitudeMode === 'disadvantage' ? 'Враждебное отношение даёт помеху.' : 'Безразличное отношение не меняет бросок.'} Успех выполняет просьбу; провал той же просьбы и навыка блокирует повтор на 24 часа. Сл {dc}.</div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Персонаж для проверки Influence" value={target?.id ?? ''} onChange={e => setTargetId(e.target.value)} className="h-7 bg-wl px-2 text-tx shadow-bevel-in">
            {eligible.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select aria-label="Навык Influence" value={skill} onChange={e => setSkill(e.target.value as SkillId)} className="h-7 bg-wl px-2 text-tx shadow-bevel-in">
            {skillIds.map(id => <option key={id} value={id}>{SKILL_LABEL[id]}</option>)}
          </select>
        </div>
        <input aria-label="Просьба NPC" value={request} onChange={e => setRequest(e.target.value)} placeholder="Что просит персонаж" maxLength={160} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
        {canMarkAidRequest ? <label className="flex items-center gap-2 type-body-xs text-t2"><input type="checkbox" checked={aidRequest} onChange={e => setAidRequest(e.target.checked)} />Просьба о помощи · преимущество A5E Distraught (раз за долгий отдых)</label> : aidRequestEligible ? <p className="type-body-xs text-t3">Преимущество Distraught уже использовано; оно восстановится после долгого отдыха.</p> : null}
        {skill === 'persuasion' || skill === 'deception' ? <label className="flex items-center gap-2 type-body-xs text-t2">Контекст проверки
          <select aria-label="Контекст проверки Influence" value={socialPurpose} onChange={event => setSocialPurpose(event.target.value as typeof socialPurpose)} className="ml-auto h-7 bg-wl px-2 text-tx shadow-bevel-in">
            <option value="ordinary">Без особого контекста</option>
            {skill === 'persuasion' ? <>
              <option value="avoid-combat">Избежать боя · A5E Cowed</option>
              <option value="dissuade-action">Отговорить от действия · A5E Hopeless</option>
            </> : <option value="deception-about-taken-item">Ложь о присвоенной вещи · A5E Covetous</option>}
          </select>
        </label> : null}
        {failedAt !== undefined && waitSec > 0 ? <p className="type-body-sm text-t2">Повторить эту просьбу можно через {Math.ceil(waitSec / 3600)} ч.</p> : null}
        <button type="button" disabled={!target || !request.trim() || (failedAt !== undefined && waitSec > 0)} onClick={() => target && request.trim() && onInfluence(actor, target.id, skill, request.trim(), dc, skillMod, social.attitude, requestKey, aidRequest && canMarkAidRequest, socialPurpose === 'ordinary' ? undefined : socialPurpose)} className={BTN}>
          Проверить Influence
        </button>
        <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-1.5" data-part="npc-gift">
          <label htmlFor={`npc-gift-item-${actor.id}`} className="type-key uppercase text-t2">Подарок NPC · правило стола</label>
          {giftStacks.length ? <>
            <select id={`npc-gift-item-${actor.id}`} aria-label="Предмет для подарка NPC" value={giftStack?.id ?? ''} onChange={event => { setGiftStackId(event.target.value); setGiftQty('1'); }} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in">
              {giftStacks.map(stack => <option key={stack.id} value={stack.id}>{ITEMS[stack.itemId]?.name ?? stack.itemId} · {stack.qty} шт.</option>)}
            </select>
            <input aria-label="Количество подарка" type="number" min={1} max={giftStack?.qty ?? 1} step={1} value={giftQty} onChange={event => setGiftQty(event.target.value)} className="h-8 w-24 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
            <input aria-label="Примечание к подарку" value={gift} onChange={event => setGift(event.target.value)} maxLength={160} placeholder="Примечание · необязательно" className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
            <div className="flex items-center gap-2">
              <button type="button" className={BTN} disabled={!canGift} onClick={transferGift}>Передать подарок</button>
              {giftWaitSec > 0 ? <span className="type-body-xs text-t3">Можно снова через {Math.ceil(giftWaitSec / 86_400)} дн.</span> : null}
            </div>
          </> : <p className="type-body-xs text-t3">У выбранного персонажа нет предметов для подарка.</p>}
          <p className="type-body-xs text-t3">Предмет и запись передаются одним событием. Один подарок этому NPC за десятидневку; отношение автоматически не меняется.</p>
        </div>
      </div>
    </Section>
  );
}

/** Campaign-only relationship overlay for read-only canon people; never writes back to the setting package. */
export function PersonRelationshipPanel({ personId, personName, party, relationships, giftState, giftStacks = [], worldSec, onChange, onGrowth, onTransition, onGift }: {
  personId: string;
  personName: string;
  party: readonly Actor[];
  relationships?: Readonly<Record<string, NpcRelationship>>;
  giftState?: PersonGiftState;
  giftStacks?: readonly InventoryStack[];
  worldSec: number;
  onChange: (targetId: string, relationship?: NpcRelationship) => void;
  onGrowth?: (targetId: string, action: 'gift' | 'insult', description: string, roleplayModifier: number) => void;
  onTransition?: (targetId: string, transition: 'to-competition' | 'to-friendship', reason: string, roleplayModifier: number, applyNearMissReduction: boolean) => void;
  onGift?: (targetId: string, stackId: string, qty: number, note?: string) => void;
}) {
  const eligible = party.filter(actor => !actor.removed && actor.kind === 'pc' && actor.sheet);
  const [targetId, setTargetId] = useState(() => eligible[0]?.id ?? '');
  const target = eligible.find(actor => actor.id === targetId) ?? eligible[0];
  const relationship = target ? relationships?.[target.id] : undefined;
  const initialScore = target?.sheet ? abilityMod(target.sheet.abilities.cha) : undefined;
  const [score, setScore] = useState(relationship ? String(relationship.score) : initialScore === undefined ? '' : String(initialScore));
  const [type, setType] = useState<NpcRelationshipType | ''>(relationship?.type ?? '');
  const [growthDescription, setGrowthDescription] = useState('');
  const [transitionDescription, setTransitionDescription] = useState('');
  const [roleplayModifier, setRoleplayModifier] = useState(0);
  const [applyNearMissReduction, setApplyNearMissReduction] = useState(false);
  const [giftStackId, setGiftStackId] = useState('');
  const [giftQty, setGiftQty] = useState('1');
  const [giftNote, setGiftNote] = useState('');
  useEffect(() => {
    setScore(relationship ? String(relationship.score) : initialScore === undefined ? '' : String(initialScore));
    setType(relationship?.type ?? '');
    setGrowthDescription('');
    setTransitionDescription('');
    setRoleplayModifier(0);
    setApplyNearMissReduction(false);
  }, [target?.id, relationship?.score, relationship?.type, initialScore]);
  const availableGifts = giftStacks.filter(stack => stack.owner.kind === 'actor' && stack.owner.id === target?.id && !stack.wornAs && !stack.attunedTo);
  const giftStack = availableGifts.find(stack => stack.id === giftStackId) ?? availableGifts[0];
  const giftQtyNumber = Number(giftQty);
  const waitSec = giftState ? Math.max(0, giftState.giftAtSec + TEMPO_SECONDS.tenday - worldSec) : 0;
  const canGift = Boolean(target && giftStack && Number.isSafeInteger(giftQtyNumber) && giftQtyNumber > 0 && giftQtyNumber <= giftStack.qty && waitSec === 0);
  useEffect(() => { setGiftStackId(''); setGiftQty('1'); setGiftNote(''); }, [target?.id, personId]);
  useEffect(() => { if (!availableGifts.some(stack => stack.id === giftStackId)) setGiftStackId(availableGifts[0]?.id ?? ''); }, [availableGifts.map(stack => `${stack.id}:${stack.qty}`).join('|'), giftStackId]);
  if (!eligible.length) return null;
  const save = () => {
    if (!target) return;
    const raw = score.trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || (Number(raw) > 5 && !type)) return;
    onChange(target.id, { score: Number(raw), ...(type ? { type } : {}), ...(relationship?.growthAtLevel !== undefined ? { growthAtLevel: relationship.growthAtLevel } : {}) });
  };
  return <Section title="Связь персонажа с NPC · кампания">
    <div className="flex flex-col gap-2" data-part="person-relationship-overlay">
      <p className="type-body-xs text-t3">Справочник не меняется. Счёт хранится отдельно для каждой пары персонаж–NPC в журнале этой кампании.</p>
      <select aria-label={`Персонаж для связи с ${personName}`} value={target?.id ?? ''} onChange={event => setTargetId(event.target.value)} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in">
        {eligible.map(actor => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
      </select>
      <div className="flex items-center gap-2 type-body-sm text-t2">
        <label htmlFor={`canon-person-score-${personId}`}>PF1 Relationship Score</label>
        <input id={`canon-person-score-${personId}`} aria-label={`PF1 Relationship Score · ${personName} · ${target?.name ?? ''}`} type="number" step="any" value={score} onChange={event => setScore(event.target.value)} className="ml-auto h-7 w-20 bg-wl px-2 text-right text-tx shadow-bevel-in" />
        <button type="button" className={BTN} disabled={!target || !/^-?\d+(?:\.\d+)?$/.test(score.trim()) || !Number.isFinite(Number(score)) || (Number(score) > 5 && !type)} onClick={save} title="Записать кампанийную связь обратимым событием">{relationship ? 'Записать' : 'Создать'}</button>
      </div>
      {!relationship && target ? <p className="type-body-xs text-t3">Начальное значение — модификатор Харизмы {target.name}: {initialScore}. Для связи из предыстории можно указать больше.</p> : null}
      <label className="flex items-center gap-2 type-body-sm text-t2">Тип связи
        <select aria-label={`Тип PF1-связи с ${personName}`} value={type} onChange={event => setType(event.target.value as NpcRelationshipType | '')} className="ml-auto h-7 bg-wl px-2 text-tx shadow-bevel-in">
          <option value="">Не выбран</option><option value="friendship">Дружба</option><option value="competition">Соперничество</option>
        </select>
      </label>
      {relationship ? <div className="type-body-xs text-t2">{relationship.score <= 5 ? 'Association' : !relationship.type ? 'Выберите тип связи, чтобы показать уровень' : relationship.score <= 11 ? relationship.type === 'friendship' ? 'Friendship' : 'Competition' : relationship.score <= 30 ? relationship.type === 'friendship' ? 'Fellowship' : 'Rivalry' : relationship.type === 'friendship' ? 'Devotion' : 'Enmity'}</div> : null}
      {relationship?.type && target?.sheet ? <>
        <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-1.5" data-part="person-relationship-growth">
          <label htmlFor={`canon-growth-description-${personId}`} className="type-key uppercase text-t2">{relationship.type === 'friendship' ? 'Особый подарок' : 'Меткий выпад'} · PF1</label>
          <input id={`canon-growth-description-${personId}`} aria-label={relationship.type === 'friendship' ? 'Описание особого подарка для роста PF1-связи' : 'Описание оскорбления для роста PF1-связи'} value={growthDescription} onChange={event => setGrowthDescription(event.target.value)} maxLength={160} placeholder={relationship.type === 'friendship' ? 'Подарок, значимый для этого NPC' : 'Оскорбление, значимое для этого NPC'} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
          <label className="flex items-center gap-2 type-body-xs text-t2">Поправка за отыгрыш · от −4 до +4
            <select aria-label="Поправка проверки PF1 за отыгрыш" value={roleplayModifier} onChange={event => setRoleplayModifier(Number(event.target.value))} className="ml-auto h-7 bg-wl px-2 text-tx shadow-bevel-in">
              {Array.from({ length: 9 }, (_, index) => index - 4).map(value => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
            </select>
          </label>
          <button type="button" className={BTN} disabled={!onGrowth || !growthDescription.trim() || relationship.growthAtLevel === target.sheet.level} onClick={() => onGrowth?.(target.id, relationship.type === 'friendship' ? 'gift' : 'insult', growthDescription.trim(), roleplayModifier)} title="Одна проверка на пару за уровень персонажа; DC равна текущему PF1 Relationship Score">
            Проверить {relationship.type === 'friendship' ? 'подарок · Diplomacy' : 'оскорбление · Intimidate'} · Сл {relationship.score}
          </button>
          {relationship.growthAtLevel === target.sheet.level ? <p className="type-body-xs text-t3">Попытка на этом уровне уже использована.</p> : <p className="type-body-xs text-t3">Успех: +1 к счёту, при превышении Сл на 10: +2. Один шанс на уровень.</p>}
        </div>
        <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-1.5" data-part="person-relationship-transition">
          <label htmlFor={`canon-transition-reason-${personId}`} className="type-key uppercase text-t2">{relationship.type === 'friendship' ? 'Оскорбление или отказ' : 'Подарок для примирения'} · PF1</label>
          <input id={`canon-transition-reason-${personId}`} aria-label={relationship.type === 'friendship' ? 'Описание оскорбления или отказа для смены PF1-связи' : 'Описание подарка для смены PF1-связи'} value={transitionDescription} onChange={event => setTransitionDescription(event.target.value)} maxLength={160} placeholder={relationship.type === 'friendship' ? 'Что разрушило дружбу' : 'Подарок, подходящий этому NPC'} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
          {relationship.type === 'friendship' ? <>
            <button type="button" className={BTN} disabled={!onTransition || !transitionDescription.trim()} onClick={() => onTransition?.(target.id, 'to-competition', transitionDescription.trim(), roleplayModifier, false)} title="PF1: оскорбление или отказ переводит дружбу в соперничество; счёт уменьшается вдвое">Перевести в соперничество · {relationship.score} → {relationship.score / 2}</button>
            <p className="type-body-xs text-t3">Переход записывается как отдельное обратимое действие; проверка не требуется.</p>
          </> : <>
            <label className="flex items-center gap-2 type-body-xs text-t2"><input type="checkbox" checked={applyNearMissReduction} onChange={event => setApplyNearMissReduction(event.target.checked)} />При провале менее чем на 10 уменьшить счёт на 1</label>
            <button type="button" className={BTN} disabled={!onTransition || !transitionDescription.trim()} onClick={() => onTransition?.(target.id, 'to-friendship', transitionDescription.trim(), roleplayModifier, applyNearMissReduction)} title={`PF1: Diplomacy проверка через Persuasion против Сл ${relationship.score + 10}; успех вдвое уменьшает счёт`}>Проверить примирение · Diplomacy · Сл {relationship.score + 10}</button>
            <p className="type-body-xs text-t3">При провале ровно на 10 источник не задаёт изменение счёта; останется без изменений.</p>
          </>}
        </div>
      </> : null}
      {relationship ? <button type="button" className={BTN} onClick={() => target && onChange(target.id, undefined)} title="Удалить кампанийную связь обратимым событием">Удалить связь</button> : null}
      <div className="border-t border-[var(--line)] pt-2 flex flex-col gap-1.5" data-part="canon-person-gift">
        <h3 className="type-key uppercase text-t2">Подарок справочному NPC · правило стола</h3>
        <p className="type-body-xs text-t3">Вещь списывается у персонажа, а запись остаётся в кампании. Справочник не меняется, NPC не активируется.</p>
        {availableGifts.length ? <>
          <select aria-label={`Предмет для подарка ${personName}`} value={giftStack?.id ?? ''} onChange={event => { setGiftStackId(event.target.value); setGiftQty('1'); }} className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in">
            {availableGifts.map(stack => <option key={stack.id} value={stack.id}>{ITEMS[stack.itemId]?.name ?? stack.itemId} · {stack.qty} шт.</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <label className="type-body-xs text-t2">Количество <input aria-label="Количество предмета для подарка справочному NPC" type="number" min={1} max={giftStack?.qty ?? 1} step={1} value={giftQty} onChange={event => setGiftQty(event.target.value)} className="h-8 w-20 bg-wl px-2 text-right type-body-sm text-tx shadow-bevel-in" /></label>
            <button type="button" className={BTN} disabled={!canGift || !onGift} onClick={() => target && giftStack && onGift?.(target.id, giftStack.id, giftQtyNumber, giftNote.trim() || undefined)}>Передать подарок</button>
            {waitSec > 0 ? <span className="type-body-xs text-t3">Можно снова через {Math.ceil(waitSec / 86_400)} дн.</span> : null}
          </div>
          <input aria-label={`Примечание к подарку для ${personName}`} value={giftNote} onChange={event => setGiftNote(event.target.value)} maxLength={160} placeholder="Примечание · необязательно" className="h-8 bg-wl px-2 type-body-sm text-tx shadow-bevel-in" />
        </> : <p className="type-body-xs text-t3">У выбранного персонажа нет доступных предметов для подарка.</p>}
        {giftState?.history.length ? <ul className="flex flex-col gap-1 type-body-xs text-t2" aria-label={`История подарков ${personName}`}>
          {[...giftState.history].reverse().slice(0, 5).map(gift => <li key={gift.eventId}>{new Date(gift.sec * 1000).toLocaleString('ru-RU', { dateStyle: 'short' })} · {gift.giverName} → {gift.qty} × {ITEMS[gift.itemId]?.name ?? gift.itemId}{gift.note ? ` · ${gift.note}` : ''}</li>)}
        </ul> : null}
        <p className="type-body-xs text-t3">Один подарок этому NPC за десятидневку; передача и откат сохраняются в журнале кампании.</p>
      </div>
    </div>
  </Section>;
}

/** Монстр на столе игроков (Q1): размер и вид существа, состояния чипами — без блока и чисел. */
export function MonsterSeen({ actor, worldSec, onCommand, dmView }: BodyProps) {
  const m = MONSTERS[actor.monsterId!];
  return (
    <>
      <p className="type-body-sm text-t2">{m.size} {m.type}</p>
      <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />
    </>
  );
}

/** Линза шансов: как бросает монстр (атака) или цели (спасбросок). Не событие — как фильтр. */
function RollModeLens({ mode, onMode }: { mode: RollMode; onMode: (m: RollMode) => void }) {
  return (
    <div role="group" aria-label="Шансы: как бросают" className="flex items-center gap-px p-px bg-lo">
      {ROLL_MODES.map(m => (
        <button key={m} type="button" aria-pressed={m === mode} onClick={() => onMode(m)} title={m === 'normal' ? 'Один d20' : m === 'advantage' ? 'Лучший из двух d20' : 'Худший из двух d20'} className={`${OPT} ${m === mode ? OPT_ON : OPT_OFF}`}>
          {ROLL_MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

/**
 * Действия блока; у мастера под атакой и действием со спасброском — шансы по каждому из партии (ROADMAP 5.2):
 * попадание и средний урон или провал спасброска. Мультиатаку не складываем: её состав — текст.
 */
export function MonsterActions({ actor, targets = [] }: { actor: Actor; targets?: readonly OddsTarget[] }) {
  const m = MONSTERS[actor.monsterId!];
  const [mode, setMode] = useState<RollMode>('normal');
  const entries = (list: readonly MonsterAction[]) => list.map(a => {
    const odds = targets.length ? actionOdds(a, targets, mode) : null;
    return (
      <div key={a.name} className="flex flex-col gap-1">
        <Entry name={a.name} text={a.text} />
        {odds ? <OddsTable odds={odds} /> : null}
      </div>
    );
  });
  const hasOdds = targets.length > 0 && [...m.actions, ...(m.bonusActions ?? []), ...m.reactions, ...(m.legendary ?? [])].some(a => actionOdds(a, targets) !== null);
  return (
    <>
      <Section title="Действия" right={hasOdds ? <RollModeLens mode={mode} onMode={setMode} /> : undefined}>
        <div className="flex flex-col gap-2">{entries(m.actions)}</div>
      </Section>
      {m.bonusActions?.length ? (
        <Section title="Бонусные действия">
          <div className="flex flex-col gap-2">{entries(m.bonusActions)}</div>
        </Section>
      ) : null}
      {m.reactions.length > 0 ? (
        <Section title="Реакции">
          <div className="flex flex-col gap-2">{entries(m.reactions)}</div>
        </Section>
      ) : null}
      {m.legendary?.length ? (
        <Section title="Легендарные действия">
          <div className="flex flex-col gap-2">{entries(m.legendary)}</div>
        </Section>
      ) : null}
    </>
  );
}

export function DmTab({ subjectId, facts }: { subjectId: string; facts: State['facts'] }) {
  const own = dmFactsAbout(subjectId, facts);
  return (
    <ul className="flex flex-col gap-1">
      {own.map(f => (
        <li key={f.id} className="flex items-start gap-2 type-body-sm text-tx">
          <Icon name="hidden" size={16} color="var(--t2)" title="Скрыто от игроков" className="mt-0.5" />
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ссылка-текст на сущность (родитель места): кнопка без плиты, чтобы читалась строкой, а не действием. */
function TextLink({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className="type-body text-tx underline decoration-t2 underline-offset-2 hover:text-gd-hi cursor-pointer text-left">
      {children}
    </button>
  );
}

/**
 * «Ждёт решения» в карточке места или фракции: ждущие предложения, целящие в неё, — было → стало словами.
 * Только мастеру: игроки симуляции не видят. Решения — во входящих, здесь только знак, почему карточка пульсирует.
 */
function PendingRows({ deltas }: { deltas: readonly State['deltas'][string][] }) {
  if (deltas.length === 0) return null;
  return (
    <Section title="Ждёт решения">
      <ul className="flex flex-col gap-1">
        {deltas.map(d => (
          <li key={d.id} className="flex items-start gap-2 type-body-sm text-tx">
            <Icon name="src-sim" size={16} color="var(--src-sim)" title="Симуляция, ждёт решения" className="mt-0.5" />
            <span className="min-w-0">
              <span className="type-body-bold">{d.subject}</span>
              <span className="text-t2">{` · ${d.was} → ${d.now}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface PlaceOverviewProps {
  place: Location;
  parent?: Location;
  onOpenParent?: () => void;
  /** Ждущие предложения о месте — только мастеру. */
  pending: readonly State['deltas'][string][];
  facts: State['facts'];
  /** Открыть место игрокам на карте (PLACE_REVEALED) — только мастеру и только месту на карте. */
  onReveal?: () => void;
  /** Год кампании для мест по вики (E9, ROADMAP 3.4: жители, боги, церкви, организации) — только мастеру; нет — блока нет. */
  wikiYear?: number;
  settingPackageId?: string;
  /** Открыть карточку связи: бога, церкви, жителя. */
  onOpenEntity?: (ref: EntityRef) => void;
  /** Мастер: веса встреч — его кухня, игрокам не показываются. */
  dm?: boolean;
  /** Установить постоянный признак Haven через журналируемый patch места — только мастеру. */
  onSetHaven?: (haven: boolean) => void;
}

/** Обзор места: внутри чего лежит, что о нём известно игрокам, что ждёт решения. Уровень — бейдж, показатели — полоса карточки: здесь не повторяются. */
export function PlaceOverview({ place, parent, onOpenParent, pending, facts, onReveal, wikiYear, settingPackageId, onOpenEntity, dm, onSetHaven }: PlaceOverviewProps) {
  const known = playerFactsAbout(place.id, facts);
  const wikiRef = useWikiPlace(place, wikiYear !== undefined);
  // Цены товаров (ROADMAP 3.3) — в порядке списка товаров; базовые не пишутся.
  const prices = GOODS.flatMap(g => (place.prices?.[g] ? [`${GOODS_LABEL[g]} ${signed(place.prices[g]!, '%')}`] : []));
  const encounters = Object.entries(place.encounters ?? {}).map(([key, w]) => `${key} ×${w}`);
  const wiki = useEntity(wikiRef, { year: wikiYear, settingPackageId });
  return (
    <>
      {/* Уровень — бейдж корешка, здесь не повторяется (факт живёт в одном месте). */}
      <div className="flex flex-col gap-1">
        {parent ? (
          <div className="flex items-baseline gap-3">
            <span className="type-num-12 uppercase text-t2 w-24 flex-none">Внутри</span>
            {onOpenParent ? <TextLink title={`${SCALE_LABELS[parent.scale]} · ${parent.name}: подняться на уровень выше`} onClick={onOpenParent}>{parent.name}</TextLink> : <span className="type-body text-tx">{parent.name}</span>}
          </div>
        ) : null}
        {place.geo && place.revealed ? (
          <div className="flex items-center gap-2 type-body-sm text-tx" data-part="revealed">
            <Icon name="src-players" size={16} color="var(--src-players)" title="Туман знаний снят" />
            <span>Открыто игрокам на карте</span>
          </div>
        ) : onReveal ? (
          <div>
            <button type="button" title="Снять туман знаний вокруг места на столе игроков: PLACE_REVEALED, Ctrl+Z — обратно" onClick={onReveal} className={BTN}>Открыть игрокам на карте</button>
          </div>
        ) : null}
      </div>
      {known.length > 0 ? (
        <Section title="Известно игрокам">
          <ul className="flex flex-col gap-1">
            {known.map(f => (
              <li key={f.id} className="flex items-start gap-2 type-body-sm text-tx">
                <Icon name="src-players" size={16} color="var(--src-players)" title="Известно игрокам" className="mt-0.5" />
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {dm && onSetHaven ? (
        <Section title="Укрытие (A5E Haven)">
          <div className="flex items-center gap-2 type-body-sm text-tx">
            <span>{place.haven ? 'Это место — Haven' : 'Это место не отмечено как Haven'}</span>
            <button type="button" className={BTN} title="Изменение записывается в журнал места и отменяется вместе с ним" onClick={() => onSetHaven(!place.haven)}>
              {place.haven ? 'Снять признак' : 'Отметить Haven'}
            </button>
          </div>
        </Section>
      ) : null}
      {prices.length > 0 ? <Pair label="Товары" value={prices.join('; ')} /> : null}
      {dm && encounters.length > 0 ? <Pair label="Встречи" value={encounters.join('; ')} /> : null}
      <PendingRows deltas={pending} />
      {/* Боги, церкви, организации и жители — группы карточки места справочника: факт живёт в одном месте. */}
      {wiki && wiki !== 'loading' && wiki.groups?.length ? (
        <Section title="По вики">
          <div className="flex flex-col gap-1" data-part="wiki-place">
            {wiki.groups.map(g => <GroupList key={g.title} group={g} onOpen={onOpenEntity} />)}
          </div>
        </Section>
      ) : null}
    </>
  );
}

/**
 * Обзор фракции: цель словами, организация вики ссылкой, отношение к партии, отношения с другими фракциями (ROADMAP 3.3)
 * и что ждёт решения; влияние, тренд и известность — в полосе карточки.
 */
export function FactionOverview({ faction, factions, pending, onOpenEntity, onRenown, onStanding }: {
  faction: Faction;
  /** Все фракции мира — имена другой стороны отношения. */
  factions: State['world']['factions'];
  pending: readonly State['deltas'][string][];
  onOpenEntity?: (ref: EntityRef) => void;
  /** Мастер: предложить сдвиг известности партии (E10) — во входящие, не в мир. */
  onRenown?: (step: 1 | -1) => void;
  /** Мастер: предложить изменить standing фракции к партии (−3…+3). */
  onStanding?: (step: 1 | -1) => void;
}) {
  // Сдвиг известности уже ждёт решения — второй не предлагается: он считался бы от старого числа.
  const renownWaits = pending.some(d => d.patch?.kind === 'faction' && d.patch.field === 'renown');
  const standingWaits = pending.some(d => d.patch?.kind === 'faction' && d.patch.field === 'standing');
  const relations = Object.entries(faction.relations ?? {})
    .filter(([id]) => factions[id])
    .sort(([, a], [, b]) => b - a);
  return (
    <>
      {faction.goal ? <Pair label="Цель" value={faction.goal} /> : null}
      {onRenown ? (
        <div className="flex items-baseline gap-3" data-part="renown">
          <span className="type-num-12 uppercase text-t2 w-24 flex-none">Известность</span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={renownWaits} onClick={() => onRenown(1)} title="Предложить: известность партии +1 — во входящие, мир изменит «Принять»" className={BTN}>+1</button>
            <button type="button" disabled={renownWaits} onClick={() => onRenown(-1)} title="Предложить: известность партии −1 — во входящие, мир изменит «Принять»" className={BTN}>−1</button>
            {renownWaits ? <span className="type-body-sm text-src-sim">ждёт решения</span> : null}
          </span>
        </div>
      ) : null}
      {onStanding ? (
        <div className="flex items-baseline gap-3" data-part="standing">
          <span className="type-num-12 uppercase text-t2 w-24 flex-none">Отношение</span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={standingWaits || (faction.standing ?? 0) <= -3} onClick={() => onStanding(-1)} title="Предложить: отношение фракции к партии −1" className={BTN}>−1</button>
            <span className="type-num-15 text-tx" aria-label="Отношение фракции к партии">{faction.standing ?? 0}</span>
            <button type="button" disabled={standingWaits || (faction.standing ?? 0) >= 3} onClick={() => onStanding(1)} title="Предложить: отношение фракции к партии +1" className={BTN}>+1</button>
            {standingWaits ? <span className="type-body-sm text-src-sim">ждёт решения</span> : null}
          </span>
        </div>
      ) : faction.standing !== undefined ? <Pair label="Отношение к партии" value={String(faction.standing)} /> : null}
      {faction.ref && onOpenEntity ? (
        <div className="flex items-baseline gap-3">
          <span className="type-num-12 uppercase text-t2 w-24 flex-none">По вики</span>
          <TextLink title={faction.ref.startsWith('kingdom:') ? 'Карточка державы: столица, правитель, вера, связи' : 'Карточка организации: глава, база, боги, союзники и враги'} onClick={() => onOpenEntity(faction.ref!)}>{faction.name}</TextLink>
        </div>
      ) : null}
      {relations.length > 0 ? (
        <Section title="Отношения">
          <ul className="flex flex-col gap-1" data-part="relations">
            {relations.map(([id, v]) => (
              <li key={id} className="flex items-baseline gap-3 type-body-sm">
                <span className="type-num-15 text-tx w-8 flex-none text-right">{signed(v)}</span>
                {onOpenEntity
                  ? <TextLink title={`Карточка фракции ${factions[id].name}`} onClick={() => onOpenEntity(ref('faction', id))}>{factions[id].name}</TextLink>
                  : <span className="type-body text-tx">{factions[id].name}</span>}
                <span className="text-t2">{RELATION_LABEL[v]}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      <PendingRows deltas={pending} />
    </>
  );
}

/**
 * Организация или держава справочника и кампания (E10, TASKS К): уже фракция — её известность партии и ссылка на карточку фракции;
 * нет — мастеру кнопка «В кампанию фракцией» (предложение во входящие). Игрокам — только известность.
 */
export function OrgCampaignLine({ faction, dm, pendingAdd, onOpenFaction, onAdd }: {
  faction?: Faction;
  dm: boolean;
  /** Предложение добавить эту организацию уже ждёт решения. */
  pendingAdd: boolean;
  onOpenFaction: (id: string) => void;
  onAdd: () => void;
}) {
  if (faction) {
    return (
      <div className="flex items-baseline gap-3 type-body-sm" data-part="org-campaign">
        <span className="type-num-12 uppercase text-t2 flex-none">В кампании</span>
        <TextLink title={`Карточка фракции кампании: ${faction.name}`} onClick={() => onOpenFaction(faction.id)}>{faction.name}</TextLink>
        <span className="text-t2">известность партии <span className="type-num-15 text-tx">{faction.renown}</span></span>
      </div>
    );
  }
  if (!dm) return null;
  return (
    <div className="flex items-center gap-2" data-part="org-campaign">
      <button type="button" disabled={pendingAdd} onClick={onAdd} title="Предложить: становится фракцией кампании с известностью 0 — во входящие" className={BTN}>В кампанию фракцией</button>
      {pendingAdd ? <span className="type-body-sm text-src-sim">ждёт решения</span> : null}
    </div>
  );
}
