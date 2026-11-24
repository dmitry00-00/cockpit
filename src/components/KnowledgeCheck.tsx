// «Проверка знаний» на строке паспорта карточки (Д6): кто из партии, навык (История, Религия, Магия, Природа), Сл из
// таблицы типичных DC SRD и итог броска. Итог не ниже Сл — факт открыт (KNOWLEDGE_REVEALED с проверкой); ниже —
// строка «не вышло», в лог ничего. «Волей мастера» — без проверки. Навык по виду сущности и Сл — правило стола, форма
// так и подписана. Тупой: партия, навык по умолчанию и колбэки — пропсами; черновик — состояние формы, не событие.
import { Popover } from 'radix-ui';
import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { SKILLS, type SkillId } from '../rules/srd/abilities';
import { DIFFICULTY_CLASSES } from '../rules/srd/checks';
import { SKILL_LABEL } from './labels';

export interface KnowledgeMember { id: string; name: string; mods: Partial<Record<SkillId, number>>; keyKnowledge?: number }

export interface KnowledgeCheckProps {
  fact: { label: string; value: string };
  members: readonly KnowledgeMember[];
  skills: readonly SkillId[];
  skill: SkillId;
  dc: number;
  /** Подпись правила стола под формой. */
  rule: string;
  onReveal: (p: { by?: string; check?: { skill: SkillId; dc: number; total: number } }) => void;
  /** Бросок системой: d20 + модификатор навыка, DICE_ROLLED; вернуть итог. Нет — итог только вводом. */
  onRoll?: (formula: string, label: string) => number;
  /** A5E: один личный Key Knowledge по этой сущности даёт преимущество на этот связанный бросок. */
  onRollWithKeyKnowledge?: (actorId: string, skill: SkillId, dc: number, modifier: number) => number | null;
}

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const BTN_MAIN = 'type-num-12 uppercase whitespace-nowrap px-3 py-1 bg-linear-to-b from-pl to-cd shadow-[var(--bevel),inset_0_-2px_0_var(--gd)] text-gd-hi cursor-pointer enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),inset_0_-2px_0_var(--gd),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const FIELD = 'h-7 px-1 type-body-sm text-tx bg-wl shadow-bevel-in focus-visible:shadow-[var(--bevel-in),var(--glow-gold)]';
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

export function KnowledgeCheckForm({ fact, members, skills, skill: skill0, dc: dc0, rule, onReveal, onRoll, onRollWithKeyKnowledge }: KnowledgeCheckProps) {
  const [by, setBy] = useState(members[0]?.id ?? '');
  const [skill, setSkill] = useState<SkillId>(skill0);
  const [dc, setDc] = useState(dc0);
  const [total, setTotal] = useState('');
  const [miss, setMiss] = useState<string | null>(null);
  const member = members.find(m => m.id === by);
  const mod = member?.mods[skill] ?? 0;
  const n = Number(total);
  const ready = total.trim() !== '' && Number.isInteger(n);
  const check = () => {
    if (!ready) return;
    if (n < dc) { setMiss(`Не вышло: ${n} против Сл ${dc} — факт не открыт`); return; }
    onReveal({ ...(member ? { by: member.id } : {}), check: { skill, dc, total: n } });
  };
  return (
    <div className="flex w-80 flex-col gap-2 bg-pn p-3 shadow-float" data-part="knowledge-check">
      <div className="flex items-center gap-2">
        <Icon name="skill-history" size={16} color="var(--src-players)" title="Проверка знаний" />
        <span className="type-h-17 text-tx">Проверка знаний</span>
      </div>
      <p className="type-body-sm text-t2"><span className="text-tx">{fact.label}</span>: {fact.value}</p>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5 type-body-sm">
        {members.length > 0 ? (
          <>
            <label htmlFor="kc-by" className="text-t2">Кто</label>
            <select id="kc-by" value={by} onChange={e => { setBy(e.target.value); setMiss(null); }} className={FIELD}>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>
        ) : null}
        <label htmlFor="kc-skill" className="text-t2">Навык</label>
        <select id="kc-skill" value={skill} onChange={e => { setSkill(e.target.value as SkillId); setMiss(null); }} className={FIELD}>
          {skills.map(s => <option key={s} value={s}>{SKILLS[s].name}{member ? ` ${signed(member.mods[s] ?? 0)}` : ''}</option>)}
        </select>
        <label htmlFor="kc-dc" className="text-t2">Сл</label>
        <select id="kc-dc" value={dc} onChange={e => { setDc(Number(e.target.value)); setMiss(null); }} className={FIELD}>
          {DIFFICULTY_CLASSES.map(d => <option key={d.dc} value={d.dc}>{d.dc} — {d.labelRu}</option>)}
        </select>
        <label htmlFor="kc-total" className="text-t2">Итог</label>
        <span className="flex items-center gap-1">
          <input id="kc-total" inputMode="numeric" value={total} onChange={e => { setTotal(e.target.value.replace(/[^\d-]/g, '')); setMiss(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); check(); } }} className={`${FIELD} w-16`} />
          {member ? (
            <button type="button" className={BTN} title={`Пассивная проверка SRD: 10 ${signed(mod)} — без броска`} onClick={() => { setTotal(String(10 + mod)); setMiss(null); }}>
              пассивно {10 + mod}
            </button>
          ) : null}
          {onRoll && member ? (
            <button type="button" className={BTN} title={`Бросок системой: d20 ${signed(mod)}, в журнал`} onClick={() => { setTotal(String(onRoll(`1d20${mod ? signed(mod).replace('−', '-') : ''}`, `${member.name}: ${SKILLS[skill].name}`))); setMiss(null); }}>
              d20 {signed(mod)}
            </button>
          ) : null}
          {onRollWithKeyKnowledge && member && (member.keyKnowledge ?? 0) > 0 ? (
            <button type="button" className={BTN} title={`Потратить 1 Key Knowledge по этой сущности и бросить с преимуществом; запас: ${member.keyKnowledge}`} onClick={() => {
              const result = onRollWithKeyKnowledge(member.id, skill, dc, mod);
              if (result !== null) { setTotal(String(result)); setMiss(null); }
            }}>
              d20 + Key Knowledge ({member.keyKnowledge})
            </button>
          ) : null}
        </span>
      </div>
      {miss ? <p role="status" className="type-body-sm text-hp-low">{miss}</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" className={BTN_MAIN} disabled={!ready} onClick={check}>Проверить</button>
        <button type="button" className={BTN} onClick={() => onReveal(member ? { by: member.id } : {})} title="Открыть партии без проверки">Волей мастера</button>
      </div>
      <p className="type-body-xs text-t2">{rule}</p>
    </div>
  );
}

/**
 * Голоса навыков (Д13): строка мастеру над паспортом сущности мира — кто из партии знает без броска (пассивная
 * проверка SRD против Сл знаний); никто — лучший и его разрыв. Шепнуть игроку — дело мастера; открыть партии — «Узнать»
 * на строке паспорта, итог «пассивно» там же.
 */
export function SkillVoices({ skill, dc, knows, best, successLabel, noneLabel }: {
  skill: SkillId;
  dc: number;
  knows: readonly { id: string; name: string; score: number }[];
  best?: { name: string; score: number };
  successLabel?: string;
  noneLabel?: string;
}) {
  if (!knows.length && !best) return null;
  const name = SKILL_LABEL[skill];
  return (
    <p data-part="skill-voices" className="type-body-sm text-t2 flex items-start gap-2">
      <Icon name="skill-history" size={16} color="var(--src-players)" title="Голоса навыков: пассивная проверка SRD" />
      {knows.length ? (
        <span>{successLabel ?? `Знают без броска, ${name} против Сл ${dc}`}: <span className="text-tx">{knows.map(v => `${v.name} ${v.score}`).join(', ')}</span></span>
      ) : (
        <span>{noneLabel ?? 'Без броска никто'}: лучший — {best!.name}, {name} {best!.score} против Сл {dc}</span>
      )}
    </p>
  );
}

/** Кнопка на строке паспорта и форма во всплывающем окне; узнали — форма закрывается. */
export function KnowledgeCheck(props: KnowledgeCheckProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`Узнать: ${props.fact.label}`} title="Проверка знаний или волей мастера: строка уйдёт в тетрадь игроков" className="inline-flex align-middle ml-1 cursor-pointer opacity-60 hover:opacity-100 focus-visible:shadow-[var(--glow-gold)]">
          <Icon name="src-players" size={16} color="var(--t2)" title="Узнать" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={4} collisionPadding={8} aria-label={`Проверка знаний: ${props.fact.label}`} className="z-30 outline-none">
          <KnowledgeCheckForm {...props} onReveal={p => { props.onReveal(p); setOpen(false); }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default KnowledgeCheck;
