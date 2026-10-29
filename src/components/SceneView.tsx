// Вкладка «Сейчас» места (Д2, ROADMAP 6.2): сцена секциями — каждая строка ссылкой на карточку, вторая сторона
// отношения — второй ссылкой, ждущее — рядом словом «ждёт». Длинные секции (жители, таблица встреч) свёрнуты после
// первых строк с числом остальных. Тупой: сцена и колбэк — пропсами; канон — по-английски, как в вики.
import { useState } from 'react';
import type { Scene, SceneRow, SceneSection } from '../campaign/scene';
import type { EntityRef } from '../entities';

/** Строк секции до «ещё N». */
export const SCENE_ROWS_SHOWN = 8;

const LINK = 'type-body text-tx underline decoration-t2 underline-offset-2 hover:text-gd-hi cursor-pointer text-left focus-visible:shadow-[var(--glow-gold)]';

function Name({ label, target, onOpen, en }: { label: string; target?: EntityRef; onOpen?: (r: EntityRef) => void; en?: boolean }) {
  if (target && onOpen) return <button type="button" title={`Открыть: ${label}`} onClick={() => onOpen(target)} className={LINK}>{label}</button>;
  return <span className="type-body text-tx" {...(en ? { lang: 'en' } : {})}>{label}</span>;
}

function Row({ row, onOpen }: { row: SceneRow; onOpen?: (r: EntityRef) => void }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-ref={row.ref}>
      <Name label={row.label} target={row.ref} onOpen={onOpen} en={row.en} />
      {row.with ? <><span className="type-body-sm text-t2">и</span><Name label={row.with.label} target={row.with.ref} onOpen={onOpen} /></> : null}
      {row.note ? <span className="type-body-sm text-t2">{row.note}</span> : null}
      {row.pending ? <span className="type-body-sm text-src-sim" data-part="pending">ждёт: {row.pending}</span> : null}
    </li>
  );
}

function Section({ section, onOpen }: { section: SceneSection; onOpen?: (r: EntityRef) => void }) {
  const [open, setOpen] = useState(false);
  const more = section.rows.length - SCENE_ROWS_SHOWN;
  const rows = open || more <= 0 ? section.rows : section.rows.slice(0, SCENE_ROWS_SHOWN);
  return (
    <section aria-label={section.title} data-scene={section.id} className="flex flex-col gap-1.5">
      <h3 className="type-h-15 uppercase text-t2">{section.title}</h3>
      <ul className="flex flex-col gap-1">
        {rows.map((r, i) => <Row key={`${r.ref ?? r.label}-${i}`} row={r} onOpen={onOpen} />)}
      </ul>
      {more > 0 ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="self-start type-body-sm text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--glow-gold)]">
          {open ? 'свернуть' : <>ещё <span className="type-num-12">{more}</span></>}
        </button>
      ) : null}
    </section>
  );
}

export interface SceneViewProps {
  scene: Scene;
  /** Открыть карточку строки; без колбэка — имена текстом. */
  onOpen?: (r: EntityRef) => void;
  /** Справочник места ещё грузится — подпись под календарём. */
  loading?: boolean;
}

export function SceneView({ scene, onOpen, loading }: SceneViewProps) {
  return (
    <div className="flex flex-col gap-4" data-part="scene">
      {scene.sections.map(s => <Section key={s.id} section={s} onOpen={onOpen} />)}
      {loading ? <p className="type-body-sm text-t2">Справочник места загружается…</p> : null}
    </div>
  );
}

export default SceneView;
