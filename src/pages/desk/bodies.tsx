// Тела карточки стола: обзор персонажа и монстра, действия монстра, вкладка DM, обзор места и державы,
// мелкая разметка секций. Тупые: всё — пропсами, стор не читают.
import { type ReactNode } from 'react';
import { abilityMod, eraOf, harptos, poolLabel, resourcePoolsOf, sheetViewOf } from '../../campaign';
import {
  ConditionChip, ResourcePips, StatTile, SCALE_LABELS, chipsOf, exhaustionCommand, signedMod, toggleCommand, SKILL_LABEL, SheetAttacks, IconGrid,
  classIcon, featureIcon, raceIcon, traitIcon, AbilityScores, DataPassport, PcHeader, SkillList, type PassportData, type PcHeaderData, SheetChoices,
  SheetFeats, SheetSpells, GroupList,
} from '../../components';
import { plural, type Actor, type Command, type Faction, type Location, type State } from '../../engine';
import { ref, type EntityRef } from '../../entities';
import { useEntity } from '../../entities/useEntity';
import { useWikiPlace } from '../../world/useWikiPlace';
import { Icon } from '../../icons/Icon';
import { classById, raceById } from '../../rules/compendium';
import { ABILITIES, ABILITY_IDS, MONSTERS, type AbilityId, type ConditionId, type SkillId } from '../../rules/srd';
import { d20Formula, dmFactsAbout, playerFactsAbout } from './helpers';
import { BTN } from './styles';

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

function ChipsRow({ actor, worldSec, onCommand, dmView }: Pick<BodyProps, 'actor' | 'worldSec' | 'onCommand' | 'dmView'>) {
  const chips = chipsOf(actor, worldSec);
  if (chips.length === 0) return null;
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
          <ConditionChip key={key} {...chip} onRemove={id === 'effect' || !dmView ? undefined : removeOf(id)} />
        ))}
      </div>
    </Section>
  );
}

/** Навыки списком по карточке владельца — в одиночной карточке две колонки под характеристиками, в оверлее 720px — второй колонкой в одну. */
export function PcSkills({ actor, onRoll, columns = 2 }: Pick<BodyProps, 'actor' | 'onRoll'> & { columns?: 1 | 2 }) {
  const view = sheetViewOf(actor);
  if (!view) return null;
  return (
    <SkillList
      skills={view.skills}
      proficiencyBonus={view.proficiencyBonus}
      columns={columns}
      onRoll={s => onRoll(d20Formula(s.mod), `${SKILL_LABEL[s.id]} · ${actor.name}`)}
    />
  );
}

/** Данные шапки листа: «Полурослик · Легконогий · Следопыт», мировоззрение, скорость, рост · вес · возраст. Чего нет — поля нет. */
function pcHeaderData(sheet: NonNullable<Actor['sheet']>, deitySymbol?: string): PcHeaderData {
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

export function PcOverview({ actor, worldSec, onRoll, onCommand, tools, dmView, skills = true, passport }: BodyProps & { skills?: boolean; passport?: PassportData }) {
  const sheet = actor.sheet!;
  const cls = classById(sheet.classId);
  const view = sheetViewOf(actor)!;
  // Символ бога — из его карточки по эпохе года мира: справочник богов грузится отдельным куском, до того — только имя.
  const deity = useEntity(sheet.deity ? ref('deity', sheet.deity.id) : null, undefined, eraOf(harptos(worldSec).year));
  const symbol = deity && deity !== 'loading' ? deity.facts.find(f => f.label === 'Символ')?.value : undefined;
  return (
    <>
      <PcHeader data={pcHeaderData(sheet, symbol)} name={actor.name} />
      {dmView && passport ? <DataPassport passport={passport} /> : null}
      <AbilityScores
        abilities={view.abilities}
        right={tools}
        onRoll={a => onRoll(d20Formula(a.mod), `${ABILITIES[a.id].code} · ${actor.name}`)}
      />
      <PcResources actor={actor} onCommand={onCommand} dmView={dmView} />
      {skills ? <PcSkills actor={actor} onRoll={onRoll} /> : null}
      <SheetAttacks sheet={sheet} />
      <SheetSpells sheet={sheet} />
      <ChipsRow actor={actor} worldSec={worldSec} onCommand={onCommand} dmView={dmView} />
      {sheet.features.length > 0 ? (
        <Section title={`Умения класса${cls ? ` · ${cls.nameRu}` : ''}`}>
          <IconGrid
            label="Умения класса"
            items={sheet.features.map(f => {
              const text = featureText(sheet.classId, f.id, sheet.subclassId);
              const r = featureRef(sheet.classId, f.id, sheet.subclassId);
              return { key: `${f.level}:${f.id}`, icon: featureIcon(f.name, text), name: f.name, meta: `${f.level} ур.`, text, ...(r ? { ref: r } : {}) };
            })}
          />
        </Section>
      ) : null}
      <SheetChoices sheet={sheet} />
      <SheetFeats sheet={sheet} />
      {sheet.traits.length > 0 ? (
        <Section title="Черты расы">
          <IconGrid
            label="Черты расы"
            items={sheet.traits.map(t => {
              const trait = raceTrait(sheet.raceId, sheet.subraceId, t.id);
              const r = traitRef(sheet.raceId, sheet.subraceId, t.id);
              return { key: t.id, icon: trait ? traitIcon(trait.kind, trait.name, trait.text) : 'kind-other', name: t.name, text: trait?.text ?? '', ...(r ? { ref: r } : {}) };
            })}
          />
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

export function MonsterActions({ actor }: { actor: Actor }) {
  const m = MONSTERS[actor.monsterId!];
  return (
    <>
      <Section title="Действия">
        <div className="flex flex-col gap-2">
          {m.actions.map(a => <Entry key={a.name} name={a.name} text={a.text} />)}
        </div>
      </Section>
      {m.bonusActions?.length ? (
        <Section title="Бонусные действия">
          <div className="flex flex-col gap-2">
            {m.bonusActions.map(a => <Entry key={a.name} name={a.name} text={a.text} />)}
          </div>
        </Section>
      ) : null}
      {m.reactions.length > 0 ? (
        <Section title="Реакции">
          <div className="flex flex-col gap-2">
            {m.reactions.map(a => <Entry key={a.name} name={a.name} text={a.text} />)}
          </div>
        </Section>
      ) : null}
      {m.legendary?.length ? (
        <Section title="Легендарные действия">
          <div className="flex flex-col gap-2">
            {m.legendary.map(a => <Entry key={a.name} name={a.name} text={a.text} />)}
          </div>
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
}

/** Обзор места: внутри чего лежит, что о нём известно игрокам, что ждёт решения. Уровень — бейдж, показатели — полоса карточки: здесь не повторяются. */
export function PlaceOverview({ place, parent, onOpenParent, pending, facts, onReveal, wikiYear, onOpenEntity }: PlaceOverviewProps) {
  const known = playerFactsAbout(place.id, facts);
  const wikiRef = useWikiPlace(place.name, wikiYear !== undefined);
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

/** Обзор фракции: цель словами и что ждёт решения; влияние, тренд и известность — в полосе карточки. */
export function FactionOverview({ faction, pending }: { faction: Faction; pending: readonly State['deltas'][string][] }) {
  return (
    <>
      {faction.goal ? <Pair label="Цель" value={faction.goal} /> : null}
      <PendingRows deltas={pending} />
    </>
  );
}
