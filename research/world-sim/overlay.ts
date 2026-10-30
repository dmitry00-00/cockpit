// И7, прототипы для сверки с ядром С1 (src/ не правится; это предложения, а не код стола).
//
// 1. compactBatch — составной патч, в котором у каждого поля остаётся последняя запись. Такт пишет запас каждый день,
//    а принятию нужно только «стало»; «было» снимет readPatch. Структурные патчи (новое место, фракция, нить) не
//    сжимаются и стоят на своих местах, поэтому «завести и сразу править» не ломается.
// 2. StepWorld — рабочая копия шага: копирование при первой записи только тронутых записей, без immer на каждый патч.
//    Одна копия на весь шаг, процессы идут по порядку и видят последствия друг друга.
import type { Location, Process, State, WorldPatch } from '../../src/engine/state';

/** Ключ поля, которое пишет патч; undefined — патч структурный, не сжимается. */
export function fieldKey(p: WorldPatch): string | undefined {
  switch (p.kind) {
    case 'faction': return `f|${p.id}|${p.field}`;
    case 'location': return `l|${p.id}|${p.field}`;
    case 'thread': return `t|${p.id}`;
    case 'relation': return `r|${[p.id, p.other].sort().join('|')}`;
    case 'price': return `p|${p.id}|${p.goods}`;
    case 'stock': return `s|${p.id}|${p.goods}`;
    case 'encounter': return `e|${p.id}|${p.key}`;
    case 'process': return `P|${p.process.id}`;
    default: return undefined;
  }
}

/** Последняя запись на поле — на месте последней записи; структурные — как были. */
export function compactBatch(b: Extract<WorldPatch, { kind: 'batch' }>): Extract<WorldPatch, { kind: 'batch' }> {
  const last = new Map<string, number>();
  b.patches.forEach((p, i) => { const k = fieldKey(p); if (k) last.set(k, i); });
  return { kind: 'batch', patches: b.patches.filter((p, i) => { const k = fieldKey(p); return !k || last.get(k) === i; }) };
}

/** Рабочая копия шага: читает базу, пишет в копии тронутых мест и процессов. */
export class StepWorld {
  private readonly locs = new Map<string, Location>();
  private readonly procs = new Map<string, Process>();
  readonly written: WorldPatch[] = [];
  constructor(readonly base: State) {}
  location(id: string): Location | undefined { return this.locs.get(id) ?? this.base.world.locations[id]; }
  process(id: string): Process | undefined { return this.procs.get(id) ?? this.base.world.processes?.[id]; }
  private own(id: string): Location {
    let l = this.locs.get(id);
    if (!l) {
      const b = this.base.world.locations[id];
      if (!b) throw new Error(`нет места ${id}`);
      l = { ...b, ...(b.stock ? { stock: { ...b.stock } } : {}), ...(b.prices ? { prices: { ...b.prices } } : {}) };
      this.locs.set(id, l);
    }
    return l;
  }
  apply(p: WorldPatch): void {
    switch (p.kind) {
      case 'stock': {
        if (p.value !== null && !Number.isFinite(p.value)) throw new Error(`запас: число, получено ${p.value}`);
        const l = this.own(p.id);
        const s = l.stock ?? (l.stock = {});
        if (p.value === null) delete s[p.goods]; else s[p.goods] = p.value;
        break;
      }
      case 'price': {
        const l = this.own(p.id);
        const s = l.prices ?? (l.prices = {});
        if (p.value === 0) delete s[p.goods]; else s[p.goods] = p.value;
        break;
      }
      case 'process': this.procs.set(p.process.id, p.process); break;
      case 'batch': for (const x of p.patches) this.apply(x); return;
      default: throw new Error(`прототип: патч ${p.kind} не ведётся`);
    }
    this.written.push(p);
  }
}
