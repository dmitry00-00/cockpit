// И5: песочница прототипов ПР1 и ПР9 над настоящим движком стола. Открывать с уже запущенного сервера разработки:
//   http://localhost:5180/research/instruments/index.html
// В сборку приложения не входит: vite build берёт только корневой index.html, tsconfig.app.json — только src/.
// Состояние — сид кампании в памяти (без localStorage): перезагрузка страницы возвращает сид.
// Шаг времени с прибора и с кнопок темпа идёт одной функцией stepTime — как DeskPage.onStep; Ctrl+Z — store.undo().
import '@fontsource/forum/400.css';
import '@fontsource/pt-sans/400.css';
import '@fontsource/pt-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import '../../src/styles/index.css';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { seedEngine } from '../../src/campaign/seed';
import { stepTime } from '../../src/campaign/simulation';
import { formatHarptos } from '../../src/campaign/calendar';
import { partyDeitiesOf } from '../../src/campaign/holyDays';
import { TimeTempo } from '../../src/components/TimeTempo';
import type { Tempo } from '../../src/engine/events';
import { useUndoKeys } from '../../src/engine/useEngine';
import { Astrolabe } from './Astrolabe';
import { HpOrb } from './HpOrb';

const store = seedEngine();

const H = { fontFamily: 'var(--font-display)', fontSize: 15, lineHeight: '19px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--tx)' };
const T = { fontFamily: 'var(--font-text)', fontSize: 14, lineHeight: '19px', color: 'var(--t2)' };
const BTN = { fontFamily: 'var(--font-text)', fontSize: 14, padding: '4px 10px', background: 'var(--pl)', color: 'var(--tx)', boxShadow: 'var(--bevel)', border: 0, cursor: 'pointer' };
const PANEL = { background: 'var(--pn)', boxShadow: 'var(--bevel)', padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12 };

function App() {
  const state = useStore(store, s => s.state);
  const events = useStore(store, s => s.events);
  const toast = useStore(store, s => s.toast);
  const [tempo, setTempo] = useState<Tempo>('hour');
  const [size, setSize] = useState(400);
  const partyKey = [...partyDeitiesOf(state).keys()].sort().join(',');
  const party = useMemo(() => new Set(partyKey ? partyKey.split(',') : []), [partyKey]);

  // Тот же путь, что DeskPage.onStep: шаг — stepTime, он пишет TIME_ADVANCED и предложения симуляции.
  const advance = (t: Tempo, steps: number) => { stepTime(store.getState(), t, steps); };

  // Ctrl+Z / Ctrl+Shift+Z — тот же хук, что у стола (по коду клавиши: русская раскладка не мешает).
  useUndoKeys(store);

  const times = events.filter(e => e.type === 'TIME_ADVANCED' || e.undoes || e.redoes).slice(-6).reverse();
  const bo = state.actors['bo'];
  const combat = state.encounter.active;

  return (
    <main style={{ padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', background: 'var(--bg)', minHeight: '100%' }}>
      <section style={PANEL} aria-label="Астролябия-часы">
        <h1 style={H}>ПР1 · астролябия-часы</h1>
        <Astrolabe sec={state.time.sec} tempo={tempo} disabled={combat} partyDeities={party} onAdvance={advance} size={size} announce={toast} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={T}>Сторона прибора:</span>
          {[240, 320, 400, 560].map(s => (
            <button key={s} type="button" style={{ ...BTN, color: s === size ? 'var(--gd-hi)' : 'var(--tx)' }} aria-pressed={s === size} onClick={() => setSize(s)}>{s}</button>
          ))}
        </div>
      </section>
      <section style={{ ...PANEL, maxWidth: 560 }} aria-label="Кнопки темпа и журнал шагов">
        <h2 style={H}>Кнопки темпа стола (src/components/TimeTempo)</h2>
        <TimeTempo value={tempo} onChange={setTempo} onStep={n => advance(tempo, n)} disabled={combat} />
        <p style={T}>Решётка щёлкает темпом стола, если он внутри суток (10 мин, час, день), иначе часом. Сутки поворотом — то же событие, что «День» и «Шаг». Ctrl+Z — отмена, Ctrl+Shift+Z — возврат.</p>
        <div role="status" aria-live="polite" style={{ ...T, color: 'var(--tx)', minHeight: 19 }}>{toast ?? ''}</div>
        <h2 style={H}>Последние шаги времени в логе</h2>
        <ol style={{ ...T, margin: 0, paddingLeft: 18, fontFamily: 'var(--font-mono)', fontSize: 13 }} data-part="log">
          {times.map(e => {
            const p = e.payload as { tempo?: Tempo; steps?: number; fromSec?: number; toSec?: number };
            return (
              <li key={e.id}>
                {e.undoes ? `отмена ${e.undoes}` : e.redoes ? `возврат ${e.redoes}` : `${e.id} ${e.type} tempo=${p.tempo} steps=${p.steps} → ${formatHarptos(p.toSec!)}`}
              </li>
            );
          })}
        </ol>
      </section>
      <section style={PANEL} aria-label="Шар хитов">
        <h2 style={H}>ПР9 · шар хитов</h2>
        {bo ? <HpOrb name={bo.name} current={bo.hp.current} max={bo.hp.max} temp={bo.hp.temp} size={120} /> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={BTN} onClick={() => store.getState().damage('bo', 5)}>Урон 5</button>
          <button type="button" style={BTN} onClick={() => store.getState().heal('bo', 5)}>Лечение 5</button>
          <button type="button" style={BTN} onClick={() => store.getState().tempHp('bo', 5)}>Временные 5</button>
        </div>
        <p style={{ ...T, maxWidth: 240 }}>Урон и лечение — события лога (DAMAGE_APPLIED, HEALING_APPLIED), шар — их проекция; Ctrl+Z возвращает уровень.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
