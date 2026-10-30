// Вид «Путь» листа персонажа (Д8): 20 уровней класса дорогой — бонус мастерства, умения класса, умения выбранного
// подкласса (золотом), выбор подкласса, увеличение характеристик SRD, сколько подклассов дают умения на уровне. Нынешний
// уровень отмечен, следующий — подписан «даст». Тупой: дорога — пропсом из campaign/path.ts.
import type { CharacterPath } from '../campaign/path';

const ROW = { boxShadow: 'inset 0 -1px 0 var(--lo)' };

export function CharacterPathView({ path, next }: { path: CharacterPath; next?: string | null }) {
  return (
    <div className="flex flex-col gap-2" data-part="path">
      <p className="type-body-sm text-t2">
        {path.className}{path.subclassName ? ` · ${path.subclassName}` : ''} · уровень {path.level}
      </p>
      {next ? <p className="type-body-sm text-gd-hi" data-part="path-next">{next}</p> : null}
      <ol aria-label={`Путь: ${path.className}`} className="flex flex-col m-0 p-0 list-none">
        {path.steps.map(s => (
          <li
            key={s.level}
            data-level={s.level}
            data-state={s.state}
            aria-current={s.state === 'now' ? 'step' : undefined}
            className={`grid grid-cols-[2rem_2rem_1fr] gap-x-2 px-1 py-0.5 type-body-sm ${s.state === 'now' ? 'bg-pl shadow-[inset_3px_0_0_var(--gd)]' : ''} ${s.state === 'past' ? 'text-t3' : 'text-tx'}`}
            style={ROW}
          >
            <span className="type-num-12 text-right">{s.level}</span>
            <span className="type-num-12 text-t2" title="Бонус мастерства">{s.proficiencyBonus !== null ? `+${s.proficiencyBonus}` : ''}</span>
            <span className="flex flex-wrap gap-x-2 gap-y-0.5 min-w-0">
              {s.features.map(f => <span key={f.id}>{f.name}</span>)}
              {s.subclass.map(f => <span key={f.id} className="text-gd" title="Умение подкласса">{f.name}</span>)}
              {s.subclassPick ? <span className="text-gd-hi">выбор подкласса</span> : null}
              {s.asi ? <span className="text-t2" title="SRD: Ability Score Improvement — или черта">увеличение характеристик</span> : null}
              {s.others > 0 ? <span className="type-key text-t3" title="Другие подклассы дают умения на этом уровне">подклассов рядом: {s.others}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default CharacterPathView;
