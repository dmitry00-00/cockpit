// Пипки спасбросков от смерти: три успеха, три провала. Показываются только при 0 HP —
// в корешке партии вместо полосы, в HpControl под ней. Источника в State пока нет
// (HANDOFF §7, вопрос владельцу): пропсы уже в форме будущего поля, компонент менять не придётся.

/** Число закрашенных пипок в триаде: 0–3. */
export type DeathSaveCount = 0 | 1 | 2 | 3;

export interface DeathSavesProps {
  saves: number;
  fails: number;
  className?: string;
}

/** Триада — ровно три пипки; всё вне 0..3 сжимается, дробь отбрасывается. */
export function clampSaves(n: number): DeathSaveCount {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.floor(n))) as DeathSaveCount;
}

const PIP_EMPTY = 'bg-wl shadow-bevel-in';
const PIP: Record<'save' | 'fail', string> = {
  save: 'bg-fx-heal shadow-bevel',
  fail: 'bg-fx-damage shadow-bevel',
};
const TITLE: Record<'save' | 'fail', string> = {
  save: 'Успех спасброска от смерти',
  fail: 'Провал спасброска от смерти',
};

/** Триада пипок: закрашенная — поднята фаской, пустая — утоплена; форма отличает их и без цвета. */
function Triad({ kind, count }: { kind: 'save' | 'fail'; count: DeathSaveCount }) {
  return (
    <span className="flex items-center gap-1" data-part={kind}>
      {[0, 1, 2].map(i => {
        const on = i < count;
        return (
          <span
            key={i}
            data-on={on ? 'true' : 'false'}
            title={on ? TITLE[kind] : `${TITLE[kind]}: нет`}
            className={`size-3 flex-none ${on ? PIP[kind] : PIP_EMPTY}`}
          />
        );
      })}
    </span>
  );
}

/** Строка высотой 16px — такая же, как у полосы HP, чтобы замена одного другим не дёргала корешок. */
export function DeathSaves({ saves, fails, className }: DeathSavesProps) {
  const s = clampSaves(saves);
  const f = clampSaves(fails);
  return (
    <div
      role="group"
      aria-label={`Спасброски от смерти: успехов ${s} из 3, провалов ${f} из 3`}
      className={`flex h-4 items-center gap-2${className ? ` ${className}` : ''}`}
    >
      <Triad kind="save" count={s} />
      <Triad kind="fail" count={f} />
    </div>
  );
}

export default DeathSaves;
