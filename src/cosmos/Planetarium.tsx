// Планетарий уровня «звёздная система» (HANDOFF §3, F4.3): вид сверху, кольца орбит по порядку от солнца, тела на
// своих углах в день часов стола, ползунок прокручивает дни вперёд и показывает ближайшее сближение выбранного тела.
// Цвет тела — стихия из карточки вики через токены местности (вода — море, земля — пустыня, воздух — лёд), солнце —
// золото. Тупой компонент: день и что можно открыть ниже по лестнице даёт страница.
import { useState, type ReactNode } from 'react';
import {
  BODY_TYPE_LABEL, ELEMENT_LABEL, REALMSPACE, milesLabel, moonsOf, nearestApproach, orbitAngle, planetsOf, sunOf,
  type CelestialBody, type StarSystem,
} from './realmspace';
import { daysLabel } from './phlogiston';

export interface PlanetariumProps {
  system?: StarSystem;
  /** День часов стола от 1 Hammer 1492 DR. */
  day: number;
  /** Тело, выбранное на старте (обычно мир партии). */
  focus?: string;
  /** Есть ли у тела место на лестнице ниже — тогда в панели кнопка «Спуститься». */
  canOpen?: (body: CelestialBody) => boolean;
  onOpen?: (body: CelestialBody) => void;
  children?: ReactNode;
  className?: string;
}

const ELEMENT_COLOR: Readonly<Record<string, string>> = {
  earth: 'var(--terrain-d)', water: 'var(--terrain-o)', air: 'var(--terrain-i)', fire: 'var(--gd)',
};
const colorOf = (b: CelestialBody) => ELEMENT_COLOR[(b.element ?? '').toLowerCase()] ?? 'var(--t2)';
/** Сторона квадрата тела по классу размера A–J (Spelljammer): от песчинки до солнца. */
const sideOf = (b: CelestialBody) => (b.type === 'Sun' ? 18 : 4 + Math.max(0, 'ABCDEFGHIJ'.indexOf(b.size ?? 'C')));

const R0 = 46, STEP = 30, SHELL = R0 + STEP * 8 + 6;
const SPAN = 730;

export function Planetarium({ system = REALMSPACE, day, focus = 'toril', canOpen, onOpen, children, className = '' }: PlanetariumProps) {
  const [ahead, setAhead] = useState(0);
  const [picked, setPicked] = useState(focus);
  const planets = planetsOf(system);
  const sun = sunOf(system);
  const t = day + ahead;
  const pos = (b: CelestialBody, r: number) => {
    const a = orbitAngle(b, t);
    return { x: r * Math.cos(a), y: -r * Math.sin(a) };
  };
  const ring = new Map(planets.map((p, i) => [p.id, R0 + STEP * i]));
  const at = new Map(planets.map(p => [p.id, pos(p, ring.get(p.id)!)]));
  const body = system.bodies.find(b => b.id === picked) ?? planets[0];
  const host = ring.has(body.id) ? body : planets.find(p => p.name === body.parent);
  const near = host ? nearestApproach(system, host, t, 365) : null;

  const info = [
    BODY_TYPE_LABEL[body.type] ?? body.type,
    body.element ? ELEMENT_LABEL[body.element.toLowerCase()] ?? body.element : null,
    body.distanceMi ? `${milesLabel(body.distanceMi)} от солнца` : body.parent && body.type !== 'Sun' ? `спутник ${body.parent}` : null,
    body.yearDays ? `год ${daysLabel(Math.round(body.yearDays))}` : null,
    body.day ? `сутки ${body.day}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`relative flex min-h-0 bg-wl ${className}`} data-part="planetarium">
      {children ? <div className="flex-none p-4 flex items-start gap-4 min-h-0 max-h-full">{children}</div> : null}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-4">
        <svg
          viewBox={`${-SHELL - 10} ${-SHELL - 10} ${2 * SHELL + 20} ${2 * SHELL + 20}`}
          role="img"
          aria-label={`Планетарий ${system.sphere.name}: щелчок по телу — сведения о нём`}
          className="flex-1 min-h-0 w-full"
          style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}
        >
          <circle r={SHELL} fill="none" stroke="var(--t4)" strokeDasharray="2 4" />
          <text x={0} y={-SHELL - 2} textAnchor="middle" fill="var(--t3)">
            {`${system.sphere.name} · сфера ${system.sphere.radiusMi ? milesLabel(system.sphere.radiusMi) : ''}`}
          </text>
          {planets.map(p => <circle key={p.id} r={ring.get(p.id)} fill="none" stroke="var(--t4)" />)}
          {near && host ? (
            <line
              data-part="approach"
              x1={at.get(host.id)!.x} y1={at.get(host.id)!.y} x2={at.get(near.body.id)!.x} y2={at.get(near.body.id)!.y}
              stroke="var(--t2)" strokeDasharray="1 3"
            />
          ) : null}
          {sun ? (
            <g data-body={sun.id} onClick={() => setPicked(sun.id)} className="cursor-pointer">
              <rect x={-9} y={-9} width={18} height={18} fill={colorOf(sun)} />
              <text y={-14} textAnchor="middle" fill="var(--t2)">{sun.name.replace(/^the /, '')}</text>
            </g>
          ) : null}
          {planets.map(p => {
            const { x, y } = at.get(p.id)!;
            const s = sideOf(p);
            const sel = p.id === body.id || (host?.id === p.id && body.id !== p.id);
            return (
              <g key={p.id} data-body={p.id} onClick={() => setPicked(p.id)} className="cursor-pointer">
                <rect x={x - 8} y={y - 8} width={16} height={16} fill="transparent" />
                {sel ? <rect x={x - s / 2 - 3} y={y - s / 2 - 3} width={s + 6} height={s + 6} fill="none" stroke="var(--gd)" /> : null}
                <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={colorOf(p)} />
                {moonsOf(system, p).map((m, i) => {
                  const a = orbitAngle(m, t);
                  const mr = s / 2 + 6 + i * 4;
                  return m.type === 'Moon'
                    ? <rect key={m.id} data-body={m.id} x={x + mr * Math.cos(a) - 1.5} y={y - mr * Math.sin(a) - 1.5} width={3} height={3} fill={colorOf(m)} onClick={e => { e.stopPropagation(); setPicked(m.id); }} />
                    : <circle key={m.id} data-body={m.id} cx={x} cy={y} r={mr} fill="none" stroke={colorOf(m)} strokeDasharray="1 2" onClick={e => { e.stopPropagation(); setPicked(m.id); }} />;
                })}
                <text x={x} y={y - s / 2 - 5} textAnchor="middle" fill={sel ? 'var(--tx)' : 'var(--t2)'}>{p.name}</text>
              </g>
            );
          })}
        </svg>
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-pn shadow-bevel max-w-full" data-part="planetarium-ui">
          <label className="flex items-center gap-2">
            <span className="type-num-12 uppercase text-t2">Вперёд</span>
            <input type="range" min={0} max={SPAN} step={1} value={ahead} aria-label="Дней вперёд от сегодняшнего" onChange={e => setAhead(Number(e.target.value))} className="w-48 accent-[var(--gd)]" />
            <span className="type-num-12 text-tx w-20 text-right">{ahead === 0 ? 'сегодня' : `+${daysLabel(ahead)}`}</span>
          </label>
          {near && host ? (
            <span className="type-body-sm text-t2" data-part="approach-label">
              {`Ближе всех к ${host.name}: ${near.body.name} ${near.inDays === 0 ? 'сейчас' : `через ${daysLabel(near.inDays)}`}, ${milesLabel(near.miles)}`}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-pn shadow-bevel max-w-full" data-part="body-info" aria-live="polite">
          <span className="type-body text-tx">{body.name}</span>
          <span className="type-body-sm text-t2">{info}</span>
          {body.population ? <span className="type-body-sm text-t3">{body.population}</span> : null}
          <a href={body.url} target="_blank" rel="noreferrer" title={`${system.attribution}. ${system.note}`} className="type-body-sm text-t3 underline hover:text-tx">
            {body.refs[0] ?? 'вики'}
          </a>
          {onOpen && canOpen?.(body) ? (
            <button type="button" onClick={() => onOpen(body)} className="type-num-12 uppercase px-2 py-1 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--bevel),var(--glow-gold)]">
              {`Спуститься: ${body.name}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Planetarium;
