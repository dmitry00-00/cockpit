// Лист сравнения (макет «сравнение как шит поверх списка»): тот же субъект — партия, — другой вопрос: кто из
// выбранных сильнее в чём. Шит поверх главной зоны, партия и полоса часов не накрыты; Esc возвращает к столу
// без потери выбора. Строки — показатели, характеристики, спасброски, навыки, ресурсы; лучший в строке — на золотой плите
// и меткой «лучший» (форма, а не только цвет). Клик по ячейке навыка или характеристики — бросок за этого персонажа.
// Тупой: колонки готовит страница из sheetView, паспорт — из passportOf.
import type { ReactNode } from 'react';
import { ABILITIES } from '../rules/srd/abilities';
import { SKILL_LABEL } from './labels';
import { DataPassport, ProficiencyMark, bySkillLabel, type AbilityCell, type PassportData, type SkillCell } from './PcSheet';
import { signedMod } from './StatTile';

export interface CompareColumn {
  id: string;
  name: string;
  /** «Следопыт · 5 ур.» */
  subtitle: string;
  hp: { current: number; max: number };
  ac: number;
  pp: number;
  initiative: number;
  speed?: number;
  hitDice?: { available: number; total: number; die: number };
  abilities: readonly AbilityCell[];
  skills: readonly SkillCell[];
  /** Ресурсы листа: «Ячейки 1-го круга 3/4». */
  resources: readonly { id: string; label: string; available: number; max: number }[];
  passport?: PassportData;
}

export interface CompareSheetProps {
  columns: readonly CompareColumn[];
  /** Бросок d20 + модификатор за персонажа: подпись «Скрытность · Bo Tambernack». */
  onRoll?: (actorId: string, mod: number, label: string) => void;
  onClose: () => void;
  /** Паспорта — только мастеру. */
  dmView?: boolean;
}

/** Индексы лучших в строке; ничья — все равные; все равны — никого (выделять нечего). */
export function bestOf(values: readonly (number | undefined)[]): Set<number> {
  const nums = values.filter((v): v is number => v !== undefined);
  if (nums.length < 2) return new Set();
  const max = Math.max(...nums);
  if (nums.every(v => v === max)) return new Set();
  return new Set(values.flatMap((v, i) => (v === max ? [i] : [])));
}

const CELL = 'px-2 py-1 text-center';

function Row({ label, title, values, render, onCell }: {
  label: string;
  title?: string;
  values: readonly (number | undefined)[];
  render: (i: number) => ReactNode;
  onCell?: (i: number) => void;
}) {
  const best = bestOf(values);
  return (
    <tr className="even:bg-cd">
      <th scope="row" className="type-body-sm text-t2 text-left font-normal px-2 py-1 whitespace-nowrap" title={title ?? label}>{label}</th>
      {values.map((v, i) => {
        const isBest = best.has(i);
        // Лучший — плитой с золотой нижней гранью (форма), а не только цветом: квадраты в ячейке уже заняты владением.
        const inner = (
          <span className={`inline-flex items-center gap-1 px-1.5 type-num-15 ${isBest ? 'text-gd-hi bg-pl shadow-[var(--bevel),inset_0_-2px_0_var(--gd)]' : v === undefined ? 'text-t3' : 'text-tx'}`}>
            {render(i)}
            {isBest ? <span role="img" aria-label="лучший" title="лучший в строке" /> : null}
          </span>
        );
        return (
          <td key={i} className={CELL}>
            {onCell && v !== undefined ? (
              <button type="button" onClick={() => onCell(i)} className="cursor-pointer px-1 hover:bg-pl focus-visible:shadow-[var(--glow-gold)]" title={`${label}: бросок d20`}>{inner}</button>
            ) : inner}
          </td>
        );
      })}
    </tr>
  );
}

function Group({ title, span }: { title: string; span: number }) {
  return (
    <tr>
      <th colSpan={span} scope="colgroup" className="type-h-15 uppercase text-t2 text-left px-2 pt-3 pb-1 font-normal">{title}</th>
    </tr>
  );
}

export function CompareSheet({ columns, onRoll, onClose, dmView = true }: CompareSheetProps) {
  const span = columns.length + 1;
  const roll = (i: number, mod: number, label: string) => onRoll?.(columns[i].id, mod, `${label} · ${columns[i].name}`);
  const skillIds = [...(columns[0]?.skills ?? [])].sort(bySkillLabel).map(s => s.id);
  const resourceIds = [...new Map(columns.flatMap(c => c.resources.map(r => [r.id, r.label] as const))).entries()];
  return (
    <section aria-label="Сравнение персонажей" className="flex flex-col min-h-0 max-h-full bg-pn shadow-[var(--bevel),var(--frame)]" data-part="compare-sheet">
      <div className="flex items-center gap-3 px-4 py-2 flex-none bg-linear-to-b from-pl to-cd shadow-plate">
        <h2 className="type-h-20 text-tx">Сравнение</h2>
        <span className="type-key text-t2">персонажей: {columns.length} · лучший в строке — на золотой плите</span>
        <button type="button" onClick={onClose} className="ml-auto type-key uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]" title="Назад к столу · Esc">Esc · к столу</button>
      </div>
      <div className="min-h-0 overflow-auto p-2">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-pn shadow-plate z-10">
            <tr>
              <th className="w-44" />
              {columns.map(c => (
                <th key={c.id} scope="col" className="px-2 py-1.5 text-center font-normal">
                  <span className="block type-h-17 text-tx truncate max-w-40 mx-auto" title={c.name}>{c.name}</span>
                  <span className="block type-key text-t2 truncate">{c.subtitle}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Group title="Показатели" span={span} />
            <Row label="HP" title="Хиты сейчас из максимума" values={columns.map(c => c.hp.current)} render={i => `${columns[i].hp.current}/${columns[i].hp.max}`} />
            <Row label="AC" title="Класс доспеха" values={columns.map(c => c.ac)} render={i => columns[i].ac} />
            <Row label="Инициатива" values={columns.map(c => c.initiative)} render={i => signedMod(columns[i].initiative)} onCell={i => roll(i, columns[i].initiative, 'Инициатива')} />
            <Row label="PP" title="Пассивная внимательность" values={columns.map(c => c.pp)} render={i => columns[i].pp} />
            <Row label="Скорость" values={columns.map(c => c.speed)} render={i => (columns[i].speed === undefined ? '—' : `${columns[i].speed} фт`)} />
            <Row
              label="Кости хитов"
              values={columns.map(c => c.hitDice?.available)}
              render={i => { const h = columns[i].hitDice; return h ? `${h.available}/${h.total} d${h.die}` : '—'; }}
            />
            <Group title="Характеристики · спасброски" span={span} />
            {(columns[0]?.abilities ?? []).map(({ id }) => {
              const cell = (i: number) => columns[i].abilities.find(a => a.id === id)!;
              return (
                <Row
                  key={id}
                  label={`${ABILITIES[id].code} · спас`}
                  title={`${ABILITIES[id].name}: очко (модификатор) · спасбросок`}
                  values={columns.map((_, i) => cell(i).save)}
                  render={i => (
                    <>
                      <span className="text-t2">{cell(i).score}</span>
                      <span>{signedMod(cell(i).save)}</span>
                      {cell(i).saveProficient ? <span role="img" aria-label="владение спасброском" title="владение спасброском" className="size-1.5 bg-t2" /> : null}
                    </>
                  )}
                  onCell={i => roll(i, cell(i).save, `Спасбросок ${ABILITIES[id].code}`)}
                />
              );
            })}
            <Group title="Навыки" span={span} />
            {skillIds.map(id => {
              const cell = (i: number) => columns[i].skills.find(s => s.id === id)!;
              return (
                <Row
                  key={id}
                  label={SKILL_LABEL[id]}
                  values={columns.map((_, i) => cell(i).mod)}
                  render={i => (
                    <>
                      <ProficiencyMark proficiency={cell(i).proficiency} />
                      <span>{signedMod(cell(i).mod)}</span>
                    </>
                  )}
                  onCell={i => roll(i, cell(i).mod, SKILL_LABEL[id])}
                />
              );
            })}
            {resourceIds.length > 0 ? <Group title="Ресурсы" span={span} /> : null}
            {resourceIds.map(([rid, label]) => (
              <Row
                key={rid}
                label={label}
                values={columns.map(c => c.resources.find(r => r.id === rid)?.available)}
                render={i => { const r = columns[i].resources.find(x => x.id === rid); return r ? `${r.available}/${r.max}` : '—'; }}
              />
            ))}
          </tbody>
        </table>
        {dmView && columns.some(c => c.passport) ? (
          <section aria-label="Паспорта данных" className="flex flex-col gap-1 px-2 pt-3">
            <h3 className="type-h-15 uppercase text-t2">Паспорта данных</h3>
            {columns.map(c => (c.passport ? (
              <div key={c.id} className="flex items-baseline gap-2">
                <span className="type-body-sm text-tx w-40 flex-none truncate" title={c.name}>{c.name}</span>
                <DataPassport passport={c.passport} />
              </div>
            ) : null))}
          </section>
        ) : null}
      </div>
    </section>
  );
}

export default CompareSheet;
