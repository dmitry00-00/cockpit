// Тела карточки стола: обзор персонажа и монстра, действия монстра, вкладка DM, обзор места и державы,
// мелкая разметка секций. Тупые: всё — пропсами, стор не читают.
import { useState, type ReactNode } from 'react';
import {
  abilityMod, actionOdds, sheetAttackOdds, sheetSpellOdds, eraOf, explain, explainText, harptos, poolLabel, resourcePoolsOf, sheetViewOf,
  type ExplainKey, type OddsTarget,
} from '../../campaign';
import {
  ConditionChip, ResourcePips, StatTile, SCALE_LABELS, chipsOf, exhaustionCommand, signedMod, toggleCommand, SKILL_LABEL, SheetAttacks, IconGrid,
  classIcon, featureIcon, raceIcon, traitIcon, AbilityScores, DataPassport, PcHeader, SkillList, type PassportData, type PcHeaderData, SheetChoices,
  SheetFeats, SheetSpells, GroupList, GOODS_LABEL, RELATION_LABEL, signed, OddsTable, type IconGridItem,
} from '../../components';
import { GOODS, plural, type Actor, type Command, type Faction, type JournalEntry, type Location, type State } from '../../engine';
import { ref, type EntityRef } from '../../entities';
import { useEntity } from '../../entities/useEntity';
import { useOpenEntity } from '../../components/openEntity';
import { SPELLS } from '../../rules/srd/spells';
import { useWikiPlace } from '../../world/useWikiPlace';
import { Icon } from '../../icons/Icon';
import { backgroundById, classById, raceById } from '../../rules/compendium';
import { ABILITIES, ABILITY_IDS, MONSTERS, type AbilityId, type ConditionId, type MonsterAction, type SkillId } from '../../rules/srd';
import { d20Formula, dmFactsAbout, playerFactsAbout, shortHarptos } from './helpers';
import { ROLL_MODES, ROLL_MODE_LABEL, type RollMode } from '../../rules/srd/odds';
import { BTN, OPT, OPT_OFF, OPT_ON } from './styles';

/** Текст умения класса по id из компендиума; у части умений он пуст — тогда имя без текста (ловушка импорта). */
/** Текст умения: у класса, затем у выбранного подкласса — id умений повторяются между подклассами (заклинания доменов), поэтому чужие подклассы не смотрим. */
function featureText(classId: string, featureId: string, subclassId?: string): string {
  const cls = classById(classId);
  if (!cls) return '';
  const own = cls.levels.flatMap(l => l.features).find(f => f.id === featureId);
  if (own) return own.text;
  return cls.subclasses.find(sc => sc.id === subclassId)?.features.find(f => f.id === featureId)?.text ?? '';
}

function raceTrait(raceId: string, subraceId: string | undefined, traitId: string) {
  const race = raceById(raceId);
  if (!race) return undefined;
  return [...race.traits, ...(race.subraces.find(s => s.id === subraceId)?.traits ?? [])].find(t => t.id === traitId);
}

/** Ссылка на умение: своё у класса — «класс.умение», из подкласса — «подкласс.умение» (ROADMAP 0.3). */
function featureRef(classId: string, featureId: string, subclassId?: string): EntityRef | undefined {
  const cls = classById(classId);
  if (!cls) return undefined;
  if (cls.levels.some(l => l.features.some(f => f.id === featureId))) return ref('feature', classId, featureId);
  return subclassId && cls.subclasses.find(sc => sc.id === subclassId)?.features.some(f => f.id === featureId) ? ref('feature', subclassId, featureId) : undefined;
}

/** Ссылка на черту расы: у расы — «раса.черта», у подрасы — «раса.подраса.черта». */
function traitRef(raceId: string, subraceId: string | undefined, traitId: string): EntityRef | undefined {
  const race = raceById(raceId);
  if (!race) return undefined;
  if (race.traits.some(t => t.id === traitId)) return ref('trait', raceId, traitId);
  return subraceId && race.subraces.find(s => s.id === subraceId)?.traits.some(t => t.id === traitId) ? ref('trait', raceId, subraceId, traitId) : undefined;
}

type Sheet = NonNullable<Actor['sheet']>;

/** Умения класса листа пунктами ряда иконок: имя, уровень, текст из компендиума, ссылка. Общие у «Листа» и карты персонажа. */
export function classFeatureItems(sheet: Sheet): IconGridItem[] {
  return sheet.features.map(f => {
    const text = featureText(sheet.classId, f.id, sheet.subclassId);
    const r = featureRef(sheet.classId, f.id, sheet.subclassId);
    return { key: `${f.level}:${f.id}`, icon: featureIcon(f.name, text), name: f.name, meta: `${f.level} ур.`, text, ...(r ? { ref: r } : {}) };
  });
}

/** Черты расы листа пунктами ряда иконок. */
export function raceTraitItems(sheet: Sheet): IconGridItem[] {
  return sheet.traits.map(t => {
    const trait = raceTrait(sheet.raceId, sheet.subraceId, t.id);
    const r = traitRef(sheet.raceId, sheet.subraceId, t.id);
    return { key: t.id, icon: trait ? traitIcon(trait.kind, trait.name, trait.text) : 'kind-other', name: t.name, text: trait?.text ?? '', ...(r ? { ref: r } : {}) };
  });
}

/** Вкладка «Заклинания» карты персонажа: та же секция, что в «Листе», с подсказками вывода Сл и атаки. */
export function PcSpells({ actor }: { actor: Actor }) {
  const sheet = actor.sheet;
  if (!sheet?.spellcasting) return null;
  return <SheetSpells sheet={sheet} hint={`Сл ${hintOf(actor, 'spellDc')}\nатака ${hintOf(actor, 'spellAttack')}`} />;
}

/** Хроника персонажа — записи журнала, где он назван: последние сверху, не больше max. */
export function chronicleOf(actor: Actor, entries: readonly JournalEntry[], max = 12): JournalEntry[] {
  return entries.filter(e => !e.undone && !e.compensation && e.text.includes(actor.name)).slice(-max).reverse();
}

/**
 * Вкладка «История» карты персонажа (образец владельца, 30.10.2026): предыстория листа с её навыками и хроника —
 * записи журнала о нём. Черт характера на листе нет — их и здесь нет; пустая секция не показывается.
 */
export function PcLore({ actor, entries }: { actor: Actor; entries: readonly JournalEntry[] }) {
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
                <span className="flex-none w-16 type-num-12 text-gd">{shortHarptos(e.worldSec)}</span>
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
  worldSec: number;
  onRoll: (formula: string, label: string) => void;
  onCommand: (cmd: Command) => void;
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
      onRoll={s => onRoll(d20Formula(s.mod), `${SKILL_LABEL[s.id]} · ${actor.name}`)}
    />
  );
}

/** Данные шапки листа: «Полурослик · Легконогий · Следопыт», мировоззрение, скорость, рост · вес · возраст. Чего нет — поля нет. */
export function pcHeaderData(sheet: NonNullable<Actor['sheet']>, deitySymbol?: string): PcHeaderData {
  const race = raceById(sheet.raceId);
  const sub = race?.subraces.find(x => x.id === sheet.subraceId);
  const cls = classById(sheet.classId);
  const age = sheet.bio?.age;
  return {
    level: sheet.level,
    title: [race?.nameRu ?? sheet.raceId, sub?.nameRu, cls?.nameRu ?? sheet.classId].filter(Boolean).join(' · '),
    emblems: [
      { icon: raceIcon(sheet.raceId), title: `Раса: ${race?.nameRu ?? sheet.raceId}${sub ? ` · ${sub.nameRu}` : ''}` },
      { icon: classIcon(sheet.classId), title: `Класс: ${cls?.nameRu ?? sheet.classId}` },
    ],
    ...(sheet.alignment ? { alignment: sheet.alignment } : {}),
    ...(sheet.deity ? { deity: { name: sheet.deity.name, ref: ref('deity', sheet.deity.id), ...(deitySymbol ? { symbol: deitySymbol } : {}) } } : {}),
    ...(sheet.speed !== undefined ? { speed: sheet.speed } : {}),
    ...(sheet.bio?.height ? { height: sheet.bio.height } : {}),
    ...(sheet.bio?.weight ? { weight: sheet.bio.weight } : {}),
    ...(age !== undefined ? { age: `${age} ${plural(age, ['год', 'года', 'лет'])}` } : {}),
  };
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

export function PcOverview({ actor, worldSec, onRoll, onCommand, tools, dmView, skills = true, passport, enemies = [] }: BodyProps & { skills?: boolean; passport?: PassportData; enemies?: readonly OddsTarget[] }) {
  const sheet = actor.sheet!;
  const cls = classById(sheet.classId);
  const view = sheetViewOf(actor)!;
  // Символ бога — из его карточки по эпохе года мира: справочник богов грузится отдельным куском, до того — только имя.
  const deity = useEntity(sheet.deity ? ref('deity', sheet.deity.id) : null, undefined, eraOf(harptos(worldSec).year));
  const symbol = deity && deity !== 'loading' ? deity.facts.find(f => f.label === 'Символ')?.value : undefined;
  return (
    <>
      <PcHeader data={pcHeaderData(sheet, symbol)} name={actor.name} />
      {dmView && passport ? (
        <DataPassport
          passport={passport}
          onFill={(field, value, reason) => onCommand({
            type: 'SHEET_EDITED',
            payload: { actorId: actor.id, reason, patch: field === 'alignment' ? { alignment: value } : { bio: { ...sheet.bio, [field]: field === 'age' ? Number(value) : value } } },
          })}
        />
      ) : null}
      <AbilityScores
        abilities={view.abilities.map(a => ({ ...a, hint: `спасбросок ${hintOf(actor, `save:${a.id}`) ?? ''}` }))}
        right={tools}
        onRoll={a => onRoll(d20Formula(a.mod), `${ABILITIES[a.id].code} · ${actor.name}`)}
      />
      <PcResources actor={actor} onCommand={onCommand} dmView={dmView} />
      {skills ? <PcSkills actor={actor} onRoll={onRoll} /> : null}
      <SheetAttacks sheet={sheet} hints={Object.fromEntries((sheet.attacks ?? []).map(a => [a.id, hintOf(actor, `attack:${a.id}`) ?? '']))} />
      <SheetSpells sheet={sheet} hint={sheet.spellcasting ? `Сл ${hintOf(actor, 'spellDc')}\nатака ${hintOf(actor, 'spellAttack')}` : undefined} />
      {dmView && enemies.length ? <PcOdds actor={actor} targets={enemies} /> : null}
      <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />
      {sheet.features.length > 0 ? (
        <Section title={`Умения класса${cls ? ` · ${cls.nameRu}` : ''}`}>
          <IconGrid label="Умения класса" items={classFeatureItems(sheet)} />
        </Section>
      ) : null}
      <SheetChoices sheet={sheet} />
      <SheetFeats sheet={sheet} />
      {sheet.traits.length > 0 ? (
        <Section title="Черты расы">
          <IconGrid label="Черты расы" items={raceTraitItems(sheet)} />
        </Section>
      ) : null}
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

export function MonsterOverview({ actor, worldSec, onRoll, onCommand, tools, dmView }: BodyProps) {
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
                onRoll={() => onRoll(d20Formula(mod), `${ABILITIES[id].code} · ${actor.name}`)}
              />
            );
          })}
        </div>
      </Section>
      <div className="flex flex-col gap-1">
        {/* Скорость ходьбы — в полосе показателей (SPD); строка здесь — только когда есть полёт, плавание, лазание. */}
        {m.speedText !== `${m.speed} ft.` ? <Pair label="Скорость" value={m.speedText} /> : null}
        {saves ? <Pair label="Спасброски" value={saves} /> : null}
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
  /** Открыть карточку связи: бога, церкви, жителя. */
  onOpenEntity?: (ref: EntityRef) => void;
  /** Мастер: веса встреч — его кухня, игрокам не показываются. */
  dm?: boolean;
}

/** Обзор места: внутри чего лежит, что о нём известно игрокам, что ждёт решения. Уровень — бейдж, показатели — полоса карточки: здесь не повторяются. */
export function PlaceOverview({ place, parent, onOpenParent, pending, facts, onReveal, wikiYear, onOpenEntity, dm }: PlaceOverviewProps) {
  const known = playerFactsAbout(place.id, facts);
  const wikiRef = useWikiPlace(place, wikiYear !== undefined);
  // Цены товаров (ROADMAP 3.3) — в порядке списка товаров; базовые не пишутся.
  const prices = GOODS.flatMap(g => (place.prices?.[g] ? [`${GOODS_LABEL[g]} ${signed(place.prices[g]!, '%')}`] : []));
  const encounters = Object.entries(place.encounters ?? {}).map(([key, w]) => `${key} ×${w}`);
  const wiki = useEntity(wikiRef, undefined, undefined, wikiYear);
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
 * Обзор фракции: цель словами, организация вики ссылкой, отношения с другими фракциями (−3…+3, ROADMAP 3.3) и что
 * ждёт решения; влияние, тренд и известность — в полосе карточки.
 */
export function FactionOverview({ faction, factions, pending, onOpenEntity, onRenown }: {
  faction: Faction;
  /** Все фракции мира — имена другой стороны отношения. */
  factions: State['world']['factions'];
  pending: readonly State['deltas'][string][];
  onOpenEntity?: (ref: EntityRef) => void;
  /** Мастер: предложить сдвиг известности партии (E10) — во входящие, не в мир. */
  onRenown?: (step: 1 | -1) => void;
}) {
  // Сдвиг известности уже ждёт решения — второй не предлагается: он считался бы от старого числа.
  const renownWaits = pending.some(d => d.patch?.kind === 'faction' && d.patch.field === 'renown');
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
