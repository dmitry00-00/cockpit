// Экран «Правила кампании» (Д7, DESIGN): манифест — какая механика стола из какого источника; расхождения таблиц
// владельца с SRD (лист считает по таблице); замечания импорта компендиума дословно из отчёта импортёра. Служебная
// страница мастера: таблицы владельца — только для его стола, вовне экран не уходит. Сменить слой механики здесь
// нельзя — второго слоя для механики в данных нет; манифест говорит, что есть.
import report from '../../content/compendium/report.md?raw';
import { COMPENDIUM_META } from '../rules/compendium';
import { CAMPAIGN_RULES, LAYERS, raceDivergences, type LayerId } from '../rules/layers';

/** Строки «- …» под «замечания (N):» отчёта импорта. */
export function importNotes(text: string): string[] {
  const at = text.search(/^замечания \(\d+\):/m);
  if (at < 0) return [];
  return text.slice(at).split('\n').slice(1).filter(l => l.startsWith('- ')).map(l => l.slice(2).trim());
}

const TH = 'text-left px-2 py-1 type-key text-t2 font-normal';
const TD = 'px-2 py-1 type-body-sm align-top';
const ROW = { boxShadow: 'inset 0 -1px 0 var(--lo)' };

const Tag = ({ id }: { id: LayerId }) => (
  <span data-layer={id} title={LAYERS[id].cite} className={`type-key whitespace-nowrap px-1.5 py-0.5 shadow-bevel-in ${LAYERS[id].public ? 'text-tx' : 'text-gd'}`}>{LAYERS[id].label}</span>
);

export function RulesPage() {
  const divergences = raceDivergences();
  const notes = importNotes(report);
  return (
    <main className="min-h-full p-6 flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="type-h-28 text-gd">Правила кампании</h1>
        <span className="type-num-12 text-t2">механик {CAMPAIGN_RULES.length} · расхождений с SRD {divergences.length} · замечаний импорта {notes.length}</span>
        <span className="type-body-xs text-t3">для стола мастера: таблицы владельца вовне не показываются</span>
      </header>

      <section aria-label="Манифест" className="flex flex-col gap-2">
        <h2 className="type-h-20 text-tx">Что откуда</h2>
        <table aria-label="Механики и слои" className="border-separate border-spacing-0 max-w-5xl">
          <thead><tr><th className={TH}>Механика</th><th className={TH}>Слои</th><th className={TH}>Что из какого</th></tr></thead>
          <tbody>
            {CAMPAIGN_RULES.map(m => (
              <tr key={m.id} data-mechanic={m.id}>
                <th scope="row" className={`${TD} text-left font-normal text-tx whitespace-nowrap`} style={ROW}>{m.label}</th>
                <td className={TD} style={ROW}><span className="flex flex-wrap gap-1">{m.layers.map(l => <Tag key={l} id={l} />)}</span></td>
                <td className={`${TD} text-t2`} style={ROW}>{m.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul aria-label="Слои" className="flex flex-col gap-0.5 type-body-sm text-t2">
          {(Object.keys(LAYERS) as LayerId[]).map(id => <li key={id} className="flex items-baseline gap-2"><Tag id={id} /> {LAYERS[id].cite}</li>)}
        </ul>
      </section>

      {divergences.length > 0 ? (
        <section aria-label="Расхождения с SRD" className="flex flex-col gap-2">
          <h2 className="type-h-20 text-tx">Расхождения с SRD</h2>
          <p className="type-body-sm text-t2">Лист персонажа считает по таблице владельца; SRD — для сверки.</p>
          <table aria-label="Расхождения таблиц владельца с SRD" className="border-separate border-spacing-0 max-w-3xl">
            <thead><tr><th className={TH}>Что</th><th className={TH}>Таблица владельца</th><th className={TH}>SRD 5.1</th></tr></thead>
            <tbody>
              {divergences.map(d => (
                <tr key={d.subject} data-divergence={d.subject}>
                  <th scope="row" className={`${TD} text-left font-normal text-tx`} style={ROW}>{d.subject} · бонусы характеристик</th>
                  <td className={`${TD} text-gd`} style={ROW}>{d.owner}</td>
                  <td className={`${TD} text-tx`} style={ROW}>{d.srd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section aria-label="Замечания импорта" className="flex flex-col gap-2">
          <h2 className="type-h-20 text-tx">Замечания импорта компендиума</h2>
          <p className="type-body-sm text-t2">Импорт {COMPENDIUM_META.importedAt}, {COMPENDIUM_META.importer}: что таблица держит иначе, чем код ждёт.</p>
          <ol aria-label="Замечания импорта компендиума" className="flex flex-col gap-0.5 pl-5 list-decimal type-body-sm text-tx max-w-5xl">
            {notes.map((n, i) => <li key={i}>{n}</li>)}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

export default RulesPage;
