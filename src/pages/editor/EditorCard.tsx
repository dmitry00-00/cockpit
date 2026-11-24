// Редактор-карточка (TASKS Д9, образец владельца design/reference/dnd-character-editor.jsx, 30.10.2026): тот же
// черновик, что у шагов слева, но правится прямо на карте. Сверху вниз, как в образце: корешок — имя полем, раса и
// класс иконками с выпадающим списком; полоса чисел (КД, хиты, кость хитов, владение) — из мягкого вывода; point buy
// с «−» и «+», бонусом расы, итогом и модификатором; предыстория строкой со списком; черты расы ярлыками; навыки
// иконками рядами по характеристике с отметкой, откуда владение (предыстория, класс, раса), и «выбрать ещё N»; итог.
// Глубокие выборы (подраса, уровень, подкласс, божество, умения, заклинания, снаряжение) — шаги слева. Правила —
// draft.ts и deriveDraft: карта не знает ничего своего, только показывает и зовёт те же функции.
import { useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { abilityMod, type DerivedCharacter } from '../../campaign';
import { PortraitImage } from '../../art/portrait';
import { BUILT_IN_PORTRAITS, BUILT_IN_PORTRAIT_LABELS } from '../../art/portraitIds';
import { MaterialArtwork } from '../../art/MaterialArtwork';
import { prepareUserPortrait } from '../../art/userPortrait';
import { ABILITY_LABEL, SKILL_LABEL, classIcon, raceIcon, signedMod } from '../../components';
import { AbilityMark, SkillMark } from '../../art/RuleMark';
import { ClassEmblem } from '../../art/ClassEmblem';
import { RaceMark } from '../../art/RaceMark';
import { Icon } from '../../icons/Icon';
import './EditorCard.css';
import { ABILITIES, ABILITY_IDS, SKILLS, SKILL_IDS, type AbilityId, type SkillId } from '../../rules/srd';
import type { Background, CharacterClass, Race } from '../../rules/compendium';
import {
  POINT_BUY_TOTAL, STANDARD_ARRAY, assignArray, canDecrease, canIncrease, pointsLeft, toggleSkill, withBackground, withClass, withRace, type Draft,
} from './draft';

/** Ряд навыков характеристики: кромка слева и подпись её цветом. Строки полные — Tailwind ищет их в исходнике. */
const ROW_EDGE: Readonly<Record<AbilityId, string>> = {
  str: 'shadow-[inset_2px_0_0_var(--ab-str)]', dex: 'shadow-[inset_2px_0_0_var(--ab-dex)]', con: 'shadow-[inset_2px_0_0_var(--ab-con)]',
  int: 'shadow-[inset_2px_0_0_var(--ab-int)]', wis: 'shadow-[inset_2px_0_0_var(--ab-wis)]', cha: 'shadow-[inset_2px_0_0_var(--ab-cha)]',
};
const ROW_TEXT: Readonly<Record<AbilityId, string>> = {
  str: 'text-ab-str-hi', dex: 'text-ab-dex-hi', con: 'text-ab-con-hi', int: 'text-ab-int-hi', wis: 'text-ab-wis-hi', cha: 'text-ab-cha-hi',
};
const CELL_EDGE: Readonly<Record<AbilityId, string>> = {
  str: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-str)]', dex: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-dex)]', con: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-con)]',
  int: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-int)]', wis: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-wis)]', cha: 'shadow-[var(--bevel),inset_0_3px_0_var(--ab-cha)]',
};
const TIER = 'shadow-[inset_0_-2px_0_var(--br)]';
const SEC = 'flex items-center justify-between gap-2 px-2 pt-1.5 pb-1 type-key uppercase text-t3 shadow-[inset_0_-1px_0_var(--lo)]';
const PICK = 'relative size-8 flex-none grid place-items-center bg-wl shadow-bevel-in cursor-pointer hover:shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)] aria-expanded:shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)] focus-visible:shadow-[var(--glow-gold)]';
const STEP = 'size-5 grid place-items-center type-num-12 bg-cd shadow-bevel text-t2 cursor-pointer enabled:hover:text-tx enabled:active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)] disabled:cursor-default disabled:opacity-(--op-disabled)';
const MENU = 'z-30 w-64 max-h-80 overflow-y-auto flex flex-col gap-px p-px bg-lo shadow-float outline-none';
/** Откуда владение навыком: метка в углу плитки и цвет рамки — форма, а не только цвет. */
const ORIGIN = {
  bg: { tag: 'П', word: 'предыстория', frame: 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--fx-buff-hi)]', text: 'text-fx-buff-hi' },
  cls: { tag: 'К', word: 'класс', frame: 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)]', text: 'text-gd' },
  race: { tag: 'Р', word: 'раса', frame: 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--t2)]', text: 'text-tx' },
} as const;

export interface EditorCardProps {
  draft: Draft;
  setDraft: (fn: (d: Draft) => Draft) => void;
  /** Мягкий вывод черновика; нет — лист не собирается, числа берутся из основы. */
  derived: DerivedCharacter | null;
  races: readonly Race[];
  classes: readonly CharacterClass[];
  backgrounds: readonly Background[];
  /** Навыки класса: сколько выбрать и из чего (null — из любых). */
  skillChoice: { count: number; options: readonly SkillId[] | null };
  bgSkills: readonly SkillId[];
  /** Подпись бонусов расы для списка: «+2 DEX, +1 INT». */
  asiLabel: (r: Race) => string;
  /** Подвал: «осталось выбрать» и кнопка «В партию» страницы. */
  footer?: ReactNode;
  onDependencyChange?: (kind: 'race' | 'class', before: Draft, after: Draft) => void;
}

function Picker({ label, icon, title, children }: { label: string; icon: ReactNode; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={label} title={title} className={PICK}>{icon}</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label={label} className={MENU}>
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MenuItem({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex items-center gap-2 px-2 py-1 text-left cursor-pointer focus-visible:shadow-[var(--glow-gold)] ${on ? 'bg-pl shadow-plate' : 'bg-cd hover:bg-pl'}`}>
      {children}
    </button>
  );
}

export function EditorCard({ draft, setDraft, derived, races, classes, backgrounds, skillChoice, bgSkills, asiLabel, footer, onDependencyChange }: EditorCardProps) {
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const race = races.find(r => r.id === draft.raceId) ?? derived?.race;
  const cls = classes.find(c => c.id === draft.classId) ?? derived?.cls;
  const bg = backgrounds.find(b => b.id === draft.backgroundId);
  const left = pointsLeft(draft.base);
  const soft = derived?.abilities ?? draft.base;
  const pb = derived?.proficiencyBonus ?? 2;
  const expertise = new Set(derived?.expertise ?? []);
  const picked = draft.skills.length;
  const more = Math.max(0, skillChoice.count - picked);
  const name = draft.name.trim();
  const rows = ABILITY_IDS
    .map(ab => ({ ab, skills: SKILL_IDS.filter(id => SKILLS[id].ability === ab) }))
    .filter(r => r.skills.length > 0);

  return (
    <article aria-label="Карта персонажа: редактор" data-part="editor-card" className="editor-card flex flex-col flex-none w-card-single max-w-full bg-cd shadow-[var(--bevel),var(--frame)]">
      {/* Корешок: имя правится здесь, раса и класс — иконками со списком (образец). */}
      <header className={`editor-card__spine flex-none flex items-center gap-2 px-1.5 py-1.5 bg-linear-to-br from-pl to-cd ${TIER}`}>
        <span className="flex-none size-9 grid place-items-center bg-linear-to-br from-pl to-wl shadow-[inset_0_0_0_2px_var(--bl)]">
          <ClassEmblem icon={classIcon(draft.classId)} title={cls?.nameRu ?? 'Класс'} size={32} />
        </span>
        <input
          type="text"
          autoComplete="off"
          aria-label="Имя на карте"
          placeholder="Имя персонажа"
          maxLength={40}
          value={draft.name}
          onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, name: v })); }}
          className="flex-1 min-w-0 h-8 px-1 bg-transparent type-h-17 text-tx shadow-[inset_0_-1px_0_var(--t4)] outline-none focus-visible:shadow-[inset_0_-2px_0_var(--gd)] placeholder:text-t3"
        />
        <Picker label="Раса" title={`Раса: ${race?.nameRu ?? '—'} · сменить`} icon={<RaceMark raceId={draft.raceId} title={race?.nameRu ?? 'Раса'} size={24} fallback={<Icon name={raceIcon(draft.raceId)} size={16} title={race?.nameRu ?? 'Раса'} />} />}>
          {close => races.map(r => (
            <MenuItem key={r.id} on={r.id === draft.raceId} onClick={() => { const next = withRace(draft, r.id); onDependencyChange?.('race', draft, next); setDraft(() => next); close(); }}>
              <RaceMark raceId={r.id} title={r.nameRu} size={24} fallback={<Icon name={raceIcon(r.id)} size={16} title={r.nameRu} />} />
              <span className="flex-1 min-w-0 truncate type-body-sm text-tx">{r.nameRu}</span>
              <span className="type-key text-t3 truncate">{asiLabel(r)}</span>
            </MenuItem>
          ))}
        </Picker>
        <Picker label="Класс" title={`Класс: ${cls?.nameRu ?? '—'} · сменить`} icon={<ClassEmblem icon={classIcon(draft.classId)} title={cls?.nameRu ?? 'Класс'} />}>
          {close => classes.map(c => (
            <MenuItem key={c.id} on={c.id === draft.classId} onClick={() => { const next = withClass(draft, c.id); onDependencyChange?.('class', draft, next); setDraft(() => next); close(); }}>
              <ClassEmblem icon={classIcon(c.id)} title={c.nameRu} />
              <span className="flex-1 min-w-0 truncate type-body-sm text-tx">{c.nameRu}</span>
              <span className="type-key text-t3 truncate">{c.name}</span>
            </MenuItem>
          ))}
        </Picker>
      </header>

      <section aria-label="Портрет персонажа" className="flex flex-wrap items-center gap-2 px-2 py-2 shadow-[inset_0_-1px_0_var(--lo)]">
        <div className="relative isolate size-24 flex-none grid place-items-center overflow-hidden bg-wl shadow-bevel-in" data-part="portrait-preview">
          {draft.portrait ? (
            <PortraitImage portrait={draft.portrait} alt={`Портрет: ${draft.name.trim() || 'персонаж'}`} width={96} sizes="96px" className="size-24 object-cover" />
          ) : <span className="type-key text-t3 text-center px-2">Без портрета</span>}
          <MaterialArtwork asset="kimi-material-trim-bronze-corner-v1" width={96} className="portrait-preview-corner" style={{ position: 'absolute', insetBlockStart: 0, insetInlineStart: 0, width: 32, maxWidth: 'none', height: 32, objectFit: 'contain', pointerEvents: 'none' }} />
          <MaterialArtwork asset="kimi-material-trim-bronze-corner-v1" width={96} className="portrait-preview-corner" style={{ position: 'absolute', insetBlockEnd: 0, insetInlineEnd: 0, width: 32, maxWidth: 'none', height: 32, objectFit: 'contain', transform: 'rotate(180deg)', pointerEvents: 'none' }} />
        </div>
        <div role="group" aria-label="Выбрать портрет" className="flex min-w-0 flex-wrap gap-1">
          <button type="button" aria-pressed={!draft.portrait} onClick={() => setDraft(d => ({ ...d, portrait: undefined }))} className={`px-2 py-1 type-body-xs focus-visible:shadow-[var(--glow-gold)] ${!draft.portrait ? 'bg-pl text-gd-hi shadow-plate' : 'bg-wl text-t2 hover:bg-pl'}`}>
            Без портрета
          </button>
          {BUILT_IN_PORTRAITS.map(portrait => (
            <button key={portrait} type="button" data-portrait-option={portrait} aria-pressed={draft.portrait === portrait} onClick={() => setDraft(d => ({ ...d, portrait }))} className={`inline-flex items-center gap-1 px-2 py-1 type-body-xs focus-visible:shadow-[var(--glow-gold)] ${draft.portrait === portrait ? 'bg-pl text-gd-hi shadow-plate' : 'bg-wl text-t2 hover:bg-pl'}`}>
              <PortraitImage portrait={portrait} alt="" width={32} sizes="32px" className="size-6 object-cover" />
              <span>{BUILT_IN_PORTRAIT_LABELS[portrait]}</span>
            </button>
          ))}
          <label htmlFor="user-portrait-file" className="px-2 py-1 type-body-xs bg-wl text-t2 hover:bg-pl cursor-pointer focus-within:shadow-[var(--glow-gold)]">Загрузить свой портрет</label>
          <input id="user-portrait-file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setPortraitError(null);
            void prepareUserPortrait(file).then(portrait => setDraft(d => ({ ...d, portrait }))).catch(error => setPortraitError(error instanceof Error ? error.message : String(error)));
          }} />
        </div>
        <p className="w-full type-body-xs text-t3">Исходный файл не копируется в проект. В кампании сохраняется уменьшенный WebP-портрет до 128 КиБ.</p>
        {portraitError ? <p role="alert" className="w-full type-body-xs text-fx-damage-hi">{portraitError}</p> : null}
      </section>

      {/* Числа мягкого вывода: меняются после каждого щелчка. */}
      <div role="group" aria-label="Числа листа" className={`flex-none grid grid-cols-4 bg-pn ${TIER}`}>
        {([
          ['КД', derived ? String(derived.ac) : '—', 'Класс доспеха по надетому'],
          ['Хиты', derived ? String(derived.hpMax) : '—', 'Хиты на уровне черновика'],
          ['Кость', derived ? `d${derived.srdClass.hitDie}` : '—', 'Кость хитов класса'],
          ['Влад', signedMod(pb), 'Бонус мастерства уровня'],
        ] as const).map(([l, v, t]) => (
          <span key={l} title={t} className="flex flex-col items-center gap-1 py-1 shadow-[inset_-1px_0_0_var(--lo)] last:shadow-none">
            <span className="type-key uppercase text-t3">{l}</span>
            <span className={`type-num-15 leading-none ${l === 'Хиты' ? 'text-fx-heal-hi' : 'text-tx'}`}>{v}</span>
          </span>
        ))}
      </div>

      <div className={SEC}>
        <span>Характеристики · {draft.method === 'pointbuy' ? 'point buy' : 'набор'}</span>
        {draft.method === 'pointbuy' ? <span className={left < 0 ? 'text-fx-damage-hi' : 'text-gd'} title="Очки: 27 на всё, 8–15 до бонусов расы">осталось {left} из {POINT_BUY_TOTAL}</span> : null}
      </div>
      <div role="group" aria-label="Очки характеристик на карте" className="grid grid-cols-6 gap-0.5 p-1.5">
        {ABILITY_IDS.map(ab => {
          const final = soft[ab];
          const racial = final - draft.base[ab] - Object.values(draft.improvements).reduce((s, a) => s + (a[ab] ?? 0), 0);
          return (
            <div key={ab} className={`flex flex-col items-center gap-0.5 py-1 bg-linear-to-b from-pl to-cd ${CELL_EDGE[ab]}`} data-ability={ab}>
              <span data-part="ability-mark" className="flex items-center justify-center gap-1 type-key uppercase text-t2" title={ABILITY_LABEL[ab]}>
                <AbilityMark ability={ab} title={ABILITY_LABEL[ab]} />
                <span>{ABILITIES[ab].code}</span>
              </span>
              {draft.method === 'pointbuy' ? (
                <span className="flex items-center gap-px">
                  <button type="button" aria-label={`${ABILITY_LABEL[ab]} ниже на карте`} disabled={!canDecrease(draft.base, ab)} onClick={() => setDraft(d => ({ ...d, base: { ...d.base, [ab]: d.base[ab] - 1 } }))} className={STEP}>−</button>
                  <span className="type-num-12 text-tx w-6 text-center" data-part="base">{draft.base[ab]}</span>
                  <button type="button" aria-label={`${ABILITY_LABEL[ab]} выше на карте`} disabled={!canIncrease(draft.base, ab)} onClick={() => setDraft(d => ({ ...d, base: { ...d.base, [ab]: d.base[ab] + 1 } }))} className={STEP}>+</button>
                </span>
              ) : (
                <select aria-label={`${ABILITY_LABEL[ab]}: значение набора на карте`} value={draft.base[ab]} onChange={e => { const v = Number(e.target.value); setDraft(d => ({ ...d, base: assignArray(d.base, ab, v) })); }} className="w-full type-num-12 text-tx text-center bg-wl shadow-bevel-in">
                  {STANDARD_ARRAY.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              )}
              <span className="h-4 type-key text-gd" title="Бонус расы и увеличений">{racial ? signedMod(racial) : ''}</span>
              <span className="type-num-15 text-gd-hi bg-wl shadow-bevel-in px-1" data-part="final" title={`${ABILITY_LABEL[ab]} итогом`}>{final}</span>
              <span className="type-num-12 text-t2" data-part="mod">{signedMod(abilityMod(Math.max(1, Math.min(30, final))))}</span>
            </div>
          );
        })}
      </div>

      {/* Предыстория строкой: имя, её навыки; щелчок — список. */}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button type="button" aria-label="Предыстория" title="Предыстория даёт два навыка — сменить" className="flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer shadow-[inset_0_-1px_0_var(--lo),inset_0_1px_0_var(--lo)] hover:bg-pl focus-visible:shadow-[var(--glow-gold)]">
            <Icon name="journal" size={16} color="var(--gd)" title="Предыстория" />
            <span className="type-body-sm text-gd flex-none">{bg ? bg.nameRu : 'Без предыстории'}</span>
            <span className="flex-1 min-w-0 truncate type-body-xs text-t2">{bg ? bg.skills.map(s => SKILL_LABEL[s]).join(', ') : 'навыков не даёт'}</span>
            <span aria-hidden className="type-key text-t3">▾</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="start" sideOffset={2} collisionPadding={8} aria-label="Предыстории" className={MENU}>
            <Popover.Close asChild>
              <span><MenuItem on={!draft.backgroundId} onClick={() => setDraft(d => withBackground(d, undefined))}><span className="type-body-sm text-tx">Без предыстории</span></MenuItem></span>
            </Popover.Close>
            {backgrounds.map(b => (
              <Popover.Close key={b.id} asChild>
                <span>
                  <MenuItem on={b.id === draft.backgroundId} onClick={() => setDraft(d => withBackground(d, b.id))}>
                    <span className="flex-1 min-w-0 truncate type-body-sm text-tx">{b.nameRu}</span>
                    <span className="type-key text-t3 truncate">{b.skills.map(s => SKILL_LABEL[s]).join(', ')}</span>
                  </MenuItem>
                </span>
              </Popover.Close>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {derived && derived.traits.length > 0 ? (
        <div role="list" aria-label="Черты расы" className="flex flex-wrap gap-1 px-2 py-1.5 shadow-[inset_0_-1px_0_var(--lo)]">
          {derived.traits.map(t => <span key={t.id} role="listitem" className="px-1.5 py-px type-body-xs text-t2 bg-wl shadow-bevel-in">{t.name}</span>)}
        </div>
      ) : null}

      <div className={SEC}>
        <span>Навыки</span>
        <span className={more > 0 ? 'text-gd' : 'text-t2'} title="Навыки класса; предыстория и раса — сверх них">{more > 0 ? `выбрать ещё ${more}` : `класс: ${picked} из ${skillChoice.count}`}</span>
      </div>
      <div role="group" aria-label="Навыки на карте" className="flex flex-col gap-px p-1.5">
        {rows.map(r => (
          <div key={r.ab} data-ability={r.ab} className={`flex items-center gap-0.5 pl-1 ${ROW_EDGE[r.ab]}`}>
            <span className={`w-8 flex-none type-key ${ROW_TEXT[r.ab]}`} aria-hidden>{ABILITIES[r.ab].code}</span>
            {r.skills.map(sk => {
              const fromBg = bgSkills.includes(sk);
              const chosen = draft.skills.includes(sk) && !fromBg;
              const fromRace = Boolean(derived?.skills.includes(sk)) && !fromBg && !chosen;
              const offered = skillChoice.options === null || skillChoice.options.includes(sk);
              const proficient = chosen || fromBg || fromRace;
              const available = !proficient && offered && more > 0;
              const locked = !chosen && !available;
              const origin = fromBg ? ORIGIN.bg : chosen ? ORIGIN.cls : fromRace ? ORIGIN.race : null;
              const bonus = abilityMod(soft[SKILLS[sk].ability]) + (proficient ? pb * (expertise.has(sk) ? 2 : 1) : 0);
              const why = origin ? origin.word : available ? 'можно выбрать' : offered ? 'выбрано достаточно' : 'класс не предлагает';
              return (
                <button
                  key={sk}
                  type="button"
                  data-skill={sk}
                  aria-pressed={chosen}
                  aria-label={`${SKILL_LABEL[sk]} ${signedMod(bonus)}`}
                  title={`${SKILL_LABEL[sk]} (${ABILITIES[SKILLS[sk].ability].code}) ${signedMod(bonus)} · ${why}`}
                  disabled={locked}
                  onClick={() => setDraft(d => toggleSkill(d, sk, skillChoice.count))}
                  className={`relative size-8 flex-none flex flex-col items-center justify-center gap-0.5 bg-wl ${origin ? origin.frame : available ? 'shadow-[var(--bevel-in),inset_0_0_0_1px_var(--t4)] cursor-pointer hover:shadow-[var(--bevel-in),inset_0_0_0_1px_var(--gd)]' : 'shadow-bevel-in'} ${locked && !origin ? 'opacity-(--op-disabled)' : ''} ${chosen ? 'cursor-pointer' : ''} focus-visible:shadow-[var(--glow-gold)]`}
                >
                  {origin ? <span aria-hidden className={`absolute right-px top-px type-key leading-none ${origin.text}`}>{origin.tag}</span> : null}
                  <SkillMark skill={sk} title={SKILL_LABEL[sk]} />
                  <span className={`type-num-12 leading-none ${origin ? origin.text : 'text-t2'}`}>{signedMod(bonus)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Итог, как внизу образца: кто это и главные числа одной строкой. */}
      <footer className="flex-none flex flex-col items-center gap-1 px-2 py-2 bg-linear-to-br from-pl to-cd shadow-[inset_0_2px_0_var(--br)]" data-part="summary">
        <span className="type-h-17 text-tx truncate max-w-full">{name || 'Новый персонаж'}</span>
        <span className="type-body-xs text-t2 truncate max-w-full">{[race?.nameRu, cls?.nameRu, `${draft.level} ур.`].filter(Boolean).join(' · ')}{bg ? ` · ${bg.nameRu}` : ''}</span>
        {derived ? (
          <span className="flex gap-3 type-num-12">
            <span className="text-fx-heal-hi">Хиты {derived.hpMax}</span>
            <span className="text-fx-buff-hi">КД {derived.ac}</span>
            <span className="text-tx">d{derived.srdClass.hitDie}</span>
            {derived.speed !== undefined ? <span className="text-tx">{derived.speed} фт</span> : null}
          </span>
        ) : null}
        {footer}
      </footer>
    </article>
  );
}
