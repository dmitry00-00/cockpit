// Занятия в пути (A5E SRD, ROADMAP 6.3, M14): кто из партии чем занят в регионе похода. Проверка — в начале региона
// («the check is made at the start of the region»), DC — по уровню опасности, поправки — из поля региона дословно
// (преимущество, помеха, кость компетентности, «нельзя», автоисход). Исход — текст A5E дословно. Критический исход
// A5E SRD порогом не задаёт: при натуральных 20 и 1 форма предлагает его мастеру кнопкой, сама не выбирает.
// Компонент тупой: занятия, поправки и партия — пропсами; бросок делает страница (DICE_ROLLED), итог в журнал — тоже.
import { useState } from 'react';
import type { SkillId } from '../rules/srd/abilities';
import { activityResult, type ActivityMod, type ActivityModKind, type JourneyActivity } from '../rules/a5e/journey';
import { Icon } from '../icons/Icon';
import { SKILL_LABEL, signed } from './labels';

export interface ActivityMember {
  id: string;
  name: string;
  /** Модификатор навыка по листу; без листа — нет навыков, бросок голым d20. */
  skills: Readonly<Partial<Record<SkillId, number>>>;
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage';
/** Итог броска: засчитанная кость (лучшая при преимуществе, худшая при помехе) и сумма. */
export interface ActivityRoll { natural: number; total: number }
export type ActivityOutcome = 'criticalFailure' | 'failure' | 'success' | 'criticalSuccess';

export interface JourneyActivitiesProps {
  regionName: string;
  /** Поле региона «Journey Activities» дословно. */
  regionNote?: string;
  dc: number;
  activities: readonly JourneyActivity[];
  mods: Readonly<Record<string, ActivityMod>>;
  members: readonly ActivityMember[];
  /** Бросок проверки: страница бросает d20 с модификатором (при преимуществе и помехе — два), пишет DICE_ROLLED. */
  onRoll: (label: string, mod: number, mode: RollMode) => ActivityRoll;
  /** Исход — в журнал словами: кто, занятие, исход и текст A5E. */
  onOutcome: (memberName: string, activity: JourneyActivity, outcome: ActivityOutcome, line: string) => void;
  className?: string;
}

/** Подписи занятий за столом; имя A5E — в подсказке и в журнале (правила дословно по-английски). */
export const ACTIVITY_LABEL: Readonly<Record<string, string>> = {
  'befriend-animal': 'Подружиться со зверем', busk: 'Выступать за деньги', chronicle: 'Вести летопись', cook: 'Готовить',
  'cover-tracks': 'Заметать следы', entertain: 'Развлекать спутников', 'gather-components': 'Искать компоненты',
  gossip: 'Собирать слухи', harvest: 'Собирать травы', 'hunt-and-gather': 'Охотиться и собирать', pray: 'Молиться',
  rob: 'Грабить', scout: 'Разведка', track: 'Выслеживать',
};

const MOD_LABEL: Readonly<Record<ActivityModKind, string>> = {
  advantage: 'преимущество', disadvantage: 'помеха', expertise: 'кость компетентности', impossible: 'нельзя',
  'auto-success': 'всегда успех', 'auto-failure': 'всегда провал',
};

export const OUTCOME_LABEL: Readonly<Record<ActivityOutcome, string>> = {
  criticalFailure: 'критический провал', failure: 'провал', success: 'успех', criticalSuccess: 'критический успех',
};

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:hover:from-pl enabled:hover:to-pl enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const SELECT = 'h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';

/** Лучший навык участника для занятия: из навыков занятия — с наибольшим модификатором; без листа — первый, +0. */
export function bestSkill(member: ActivityMember, skills: readonly string[]): { skill: SkillId; mod: number } {
  const ids = skills as readonly SkillId[];
  return ids.map(skill => ({ skill, mod: member.skills[skill] ?? 0 })).sort((a, b) => b.mod - a.mod)[0] ?? { skill: ids[0], mod: 0 };
}

interface Rolled { member: string; skill: SkillId; roll: ActivityRoll; success: boolean; maybeCritical?: 'success' | 'failure'; recorded: boolean }

export function JourneyActivities({ regionName, regionNote, dc, activities, mods, members, onRoll, onOutcome, className = '' }: JourneyActivitiesProps) {
  const [who, setWho] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [rolled, setRolled] = useState<Record<string, Rolled>>({});
  // Сначала занятия, которые регион меняет; «нельзя» — в конце (условное «нельзя» — поправка, оно сверху).
  const order = (a: JourneyActivity) => (mods[a.id]?.kind === 'impossible' && !mods[a.id].conditional ? 2 : mods[a.id] ? 0 : 1);
  const list = [...activities].sort((a, b) => order(a) - order(b) || ACTIVITY_LABEL[a.id].localeCompare(ACTIVITY_LABEL[b.id]));

  const record = (a: JourneyActivity, memberName: string, outcome: ActivityOutcome) => {
    const text = a.outcomes[outcome] ?? '';
    onOutcome(memberName, a, outcome, text);
    setRolled(r => (r[a.id] ? { ...r, [a.id]: { ...r[a.id], recorded: true } } : r));
  };

  const run = (a: JourneyActivity) => {
    const member = members.find(m => m.id === (who[a.id] ?? members[0]?.id));
    if (!member) return;
    const mod = mods[a.id];
    if (mod?.kind === 'auto-success' || mod?.kind === 'auto-failure') {
      record(a, member.name, mod.kind === 'auto-success' ? 'success' : 'failure');
      return;
    }
    const { skill, mod: bonus } = bestSkill(member, a.skills);
    const mode: RollMode = mod?.kind === 'advantage' ? 'advantage' : mod?.kind === 'disadvantage' ? 'disadvantage' : 'normal';
    const roll = onRoll(`${a.name} · ${member.name} · ${SKILL_LABEL[skill]}`, bonus, mode);
    const res = activityResult(roll.natural, roll.total, dc);
    setRolled(r => ({ ...r, [a.id]: { member: member.name, skill, roll, ...res, recorded: false } }));
    setOpen(a.id);
    if (!res.maybeCritical) onOutcome(member.name, a, res.success ? 'success' : 'failure', a.outcomes[res.success ? 'success' : 'failure'] ?? '');
  };

  if (activities.length === 0) return null;
  return (
    <div data-part="journey-activities" className={`flex w-160 flex-col gap-2 bg-pn p-3 shadow-float ${className}`}>
      <div className="flex items-center gap-2">
        <Icon name="pin-road" size={16} color="var(--t2)" title="Занятия в пути" />
        <span className="type-h-17 text-tx">Занятия в пути · {regionName}</span>
        <span className="ml-auto type-key text-t2" title="DC занятия — по уровню опасности региона (A5E)">DC {dc}</span>
      </div>
      {regionNote ? <p className="type-body-sm text-t2 m-0" title="Поле региона Journey Activities, A5E SRD дословно">{regionNote}</p> : null}
      <ol aria-label="Занятия" className="flex flex-col gap-1 max-h-96 overflow-auto m-0 p-0 list-none">
        {list.map(a => {
          const mod = mods[a.id];
          const impossible = mod?.kind === 'impossible' && !mod.conditional;
          const r = rolled[a.id];
          const memberId = who[a.id] ?? members[0]?.id;
          const member = members.find(m => m.id === memberId);
          const skill = member ? bestSkill(member, a.skills) : null;
          return (
            <li key={a.id} data-activity={a.id} className={`flex flex-col gap-1 px-2 py-1 bg-cd shadow-bevel ${impossible ? 'opacity-(--op-disabled)' : ''}`}>
              <div className="flex items-center gap-2">
                <button type="button" aria-expanded={open === a.id} title={`${a.name} — текст и исходы A5E`} onClick={() => setOpen(open === a.id ? null : a.id)} className="flex-1 min-w-0 truncate text-left type-body text-tx cursor-pointer">
                  {ACTIVITY_LABEL[a.id] ?? a.name}
                </button>
                {mod ? <span className={`type-key flex-none ${mod.kind === 'advantage' || mod.kind === 'expertise' || mod.kind === 'auto-success' ? 'text-gd' : 'text-t2'}`} title={mod.text}>{MOD_LABEL[mod.kind]}{mod.conditional ? ' · условие' : ''}</span> : null}
                <span className="type-key flex-none text-t2" title="Навыки занятия; бросает лучший у выбранного">{a.skills.map(s => SKILL_LABEL[s as SkillId] ?? s).join(' / ')}</span>
                <select aria-label={`Кто: ${ACTIVITY_LABEL[a.id]}`} value={memberId} disabled={impossible} onChange={e => setWho(w => ({ ...w, [a.id]: e.target.value }))} className={SELECT}>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button type="button" disabled={impossible || !member} onClick={() => run(a)} title={skill ? `${member?.name}: ${SKILL_LABEL[skill.skill]} ${signed(skill.mod)} против DC ${dc}` : ''} className={BTN_MAIN}>
                  {mod?.kind === 'auto-success' || mod?.kind === 'auto-failure' ? 'Записать' : 'Бросить'}
                </button>
              </div>
              {r ? (
                <div data-part="result" className="flex flex-wrap items-center gap-2 type-body-sm">
                  <span className={r.success ? 'text-gd' : 'text-t2'}>
                    {r.member}: {SKILL_LABEL[r.skill]} {r.roll.natural} {r.roll.total === r.roll.natural ? '+0' : signed(r.roll.total - r.roll.natural)} = {r.roll.total} против DC {dc} — {r.success ? 'успех' : 'провал'}
                  </span>
                  {r.maybeCritical && !r.recorded ? (
                    <>
                      <span className="text-t2" title="A5E SRD не задаёт порог критического исхода проверки — решает мастер">натуральная {r.roll.natural}:</span>
                      <button type="button" onClick={() => record(a, r.member, r.maybeCritical === 'success' ? 'criticalSuccess' : 'criticalFailure')} className={BTN}>
                        {OUTCOME_LABEL[r.maybeCritical === 'success' ? 'criticalSuccess' : 'criticalFailure']}
                      </button>
                      <button type="button" onClick={() => record(a, r.member, r.success ? 'success' : 'failure')} className={BTN}>
                        {r.success ? 'обычный успех' : 'обычный провал'}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {open === a.id ? (
                <div className="flex flex-col gap-1 type-body-sm text-t2">
                  <p className="m-0">{a.text}</p>
                  {(['criticalFailure', 'failure', 'success', 'criticalSuccess'] as const).map(k => (a.outcomes[k] ? (
                    <p key={k} className="m-0"><span className="text-tx">{OUTCOME_LABEL[k]}.</span> {a.outcomes[k]}</p>
                  ) : null))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default JourneyActivities;
