// Легендарные действия блока монстра для полосы инициативы (Q13). Всё — из вводного абзаца блока дословно
// (Monster.legendaryIntro: у SRD 5.1 и Black Flag — legendary_desc Open5e, у A5E — абзац самого блока): сколько
// действий между своими ходами и когда потраченное возвращается («regains spent legendary actions at the start of
// its turn»). Стоимость варианта — из имени «(Costs 2 Actions)»; без пометки — одно действие, как печатает блок.
// Абзац, который числа не называет, пипок не даёт: варианты видны, считать нечего.
//
// Логова здесь нет. Правило SRD 5.1 есть (Legendary Creatures: Lair Actions — «On initiative count 20 (losing all
// initiative ties), it can use one of its lair action options»), но раздела lair actions нет ни у одного блока трёх
// библиотек в данных (SRD 5.1, Black Flag, A5E — сверено 29.10.2026): слот логова без данных не строится.
import type { Monster, MonsterAction } from './monsters';

export interface LegendaryOption extends MonsterAction {
  /** Сколько легендарных действий стоит вариант: «(Costs 2 Actions)» — 2, без пометки — 1. */
  cost: number;
}

export interface LegendaryActions {
  /** Сколько легендарных действий у существа; null — вводный абзац числа не называет. */
  count: number | null;
  /** Вводный абзац дословно. */
  intro: string;
  /** Абзац говорит, что потраченное возвращается в начале своего хода. */
  regainsAtTurnStart: boolean;
  options: readonly LegendaryOption[];
}

const WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
/** «The dragon can take 3 legendary actions», «The medusa queen has one legendary action». */
const COUNT = /\b(?:can take|has) (\d+|one|two|three|four|five) legendary actions?\b/i;
/** «regains spent legendary actions at the start of its turn», «regains its spent…», «regains the spent legendary action…». */
const REGAIN = /\bregains (?:its |the )?spent legendary actions? at the start of its turn\b/i;
const COST = /\(Costs (\d+) Actions\)/;

/** Стоимость варианта по имени блока. */
export function legendaryCost(name: string): number {
  const m = COST.exec(name);
  return m ? Number(m[1]) : 1;
}

/** Число легендарных действий из вводного абзаца; не названо — null. */
export function legendaryCount(intro: string): number | null {
  const m = COUNT.exec(intro);
  if (!m) return null;
  return WORDS[m[1].toLowerCase()] ?? Number(m[1]);
}

/** Легендарные действия блока; у блока их нет (или блок не загружен) — null. */
export function legendaryOf(m: Monster | undefined): LegendaryActions | null {
  if (!m?.legendary?.length) return null;
  const intro = m.legendaryIntro ?? '';
  return {
    count: legendaryCount(intro),
    intro,
    regainsAtTurnStart: REGAIN.test(intro),
    options: m.legendary.map(a => ({ ...a, cost: legendaryCost(a.name) })),
  };
}
