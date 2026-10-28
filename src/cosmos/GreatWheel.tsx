// Великое колесо — вид уровня «космология» (HANDOFF §3): «граф планов кольцом по мировоззрению». Сверху — шестнадцать
// внешних планов на кольце (добро сверху, хаос справа, зло снизу, закон слева — по сетке мировоззрения из вики),
// в середине Outlands с Sigil, спицы — города-врата Outlands к каждому плану. Снизу — Материальный: в кольце
// Ethereal, за ним четыре стихийных плана и два плана энергии, рядом планы-отражения; Astral ведёт от
// Материального к кольцу. Раскладка вертикальная: зона уровня стоит рядом с корешками и карточкой и выше, чем
// шире. Линии различаются рисунком, не цветом. Тупой компонент: какой план — мир партии и что открывать ниже по
// лестнице, даёт страница.
import { useState, type ReactNode } from 'react';
import { GREAT_WHEEL, planeById, ringAngle, ringPlanes, gateOf, type GreatWheel as Wheel, type Plane } from './planes';
import { PlaneInfo } from './PlaneInfo';
import type { RealmIndex } from './realms';
import { Label, RealmCount, nodeProps, toward } from './svg';

export interface GreatWheelProps {
  data?: Wheel;
  /** План партии — золотой обводкой, выбран на старте. */
  current?: string;
  canOpen?: (plane: Plane) => boolean;
  onOpen?: (plane: Plane) => void;
  /** Кнопки страницы над схемой (переключатель «Колесо / Древо»). */
  tools?: ReactNode;
  /** Уделы богов по плану (E3): число в узле, список в карточке плана; нет — данные богов ещё грузятся. */
  realms?: RealmIndex;
  children?: ReactNode;
  className?: string;
}

const W = 680;
const H = 880;
const C = { x: 340, y: 290 };
const R = 200;
const NODE = 14;
const M = { x: 340, y: 700 };
const ETHER_R = 58;
/** Внутренние планы вокруг Материального: стихии по диагоналям, энергия по бокам, отражения рядом с ним. */
const AROUND: Readonly<Record<string, { x: number; y: number; above?: boolean }>> = {
  air: { x: 220, y: 600, above: true }, fire: { x: 460, y: 600, above: true }, water: { x: 220, y: 800 }, earth: { x: 460, y: 800 },
  positive: { x: 110, y: 700 }, negative: { x: 570, y: 700 }, feywild: { x: 262, y: 700, above: true }, shadowfell: { x: 418, y: 700, above: true },
};
const ASTRAL = { x: 620, y: 560 };
/** Astral упирается в кольцо между узлами (Abyss и Carceri), чтобы не читаться как путь к одному плану. */
const ASTRAL_TO = (() => {
  const a = (56.25 * Math.PI) / 180;
  return { x: C.x + R * Math.cos(a), y: C.y + R * Math.sin(a) };
})();
/** Короткая подпись на схеме: «Elemental Plane of Air» → «Plane of Air»; полное имя — в карточке и подсказке. */
const short = (p: Plane) => p.name.replace(/^Elemental /, '');
/** Кегль в единицах схемы: зона уровня рядом с корешками — около 460 точек на 680 единиц, 19 единиц — 13 точек. */
const FS = 19;
/** Число уделов в узле — Plex Mono, 18 единиц: около 12 точек на экране. */
const MONO = 18;

export function GreatWheel({ data = GREAT_WHEEL, current = 'material', canOpen, onOpen, tools, realms, children, className = '' }: GreatWheelProps) {
  const [picked, setPicked] = useState(current);
  const plane = planeById(picked, data) ?? data.planes[0];
  const ring = ringPlanes(data);
  const at = (p: Plane) => {
    const a = ringAngle(p);
    return { x: C.x + R * Math.cos(a), y: C.y + R * Math.sin(a), a };
  };
  const node = (p: Plane) => nodeProps(p.id, p.name, p.id === plane.id, setPicked);
  const stroke = (p: Plane) => (p.id === current ? 'var(--gd)' : p.id === plane.id ? 'var(--tx)' : 'var(--t3)');
  const width = (p: Plane) => (p.id === current || p.id === plane.id ? 3 : 1.5);
  const link = (kind: string) => data.links.find(l => l.kind === kind);
  const astral = planeById('astral', data);
  const ethereal = planeById('ethereal', data);
  const outlands = planeById('outlands', data);
  const sigil = planeById('sigil', data);
  const material = planeById('material', data);
  const hot = (id: string) => id === plane.id;
  const count = (p: Plane) => realms?.(p.id).length ?? 0;
  const realmNote = (p: Plane) => (count(p) ? ` · уделов богов: ${count(p)}` : '');

  return (
    <div className={`relative flex min-h-0 bg-wl ${className}`} data-part="great-wheel">
      {children ? <div className="flex-none p-4 flex items-start gap-4 min-h-0 max-h-full">{children}</div> : null}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-4">
        {tools ? <div className="flex items-center gap-1 self-end" role="toolbar" aria-label="Модель космологии">{tools}</div> : null}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Великое колесо: внешние планы кольцом по мировоззрению, Материальный и внутренние планы" className="flex-1 min-h-0 w-full" style={{ fontFamily: 'var(--font-display)', fontSize: FS }}>
          <defs>
            <marker id="wheel-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={8} markerHeight={8} orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--t2)" />
            </marker>
          </defs>

          {/* Кольцо и оси мировоззрения внутри него. */}
          <circle cx={C.x} cy={C.y} r={R} fill="none" stroke="var(--t4)" />
          {/* Оси — после спиц: подпись на подложке поверх линий. */}

          {/* Спицы: город-врата Outlands к каждому внешнему плану. */}
          {data.outlands.gates.map(g => {
            const p = planeById(g.plane, data);
            if (!p) return null;
            const l = toward(C, at(p), 34, NODE + 2);
            return (
              <line key={g.town} data-gate={g.plane} {...l} stroke={hot(p.id) || hot('outlands') ? 'var(--t2)' : 'var(--t4)'} strokeWidth={1.5}>
                <title>{`${g.town} — врата из Outlands в ${p.name}. ${data.outlands.ref ?? 'вики'}`}</title>
              </line>
            );
          })}

          {([['Добро', 0, -1], ['Зло', 0, 1], ['Закон', -1, 0], ['Хаос', 1, 0]] as const).map(([t, dx, dy]) => (
            <Label fs={FS} key={t} x={C.x + dx * 118} y={C.y + dy * 118 + 4} text={t} dim />
          ))}

          {ring.map(p => {
            const { x, y, a } = at(p);
            const c = Math.cos(a), s = Math.sin(a);
            const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
            const lx = x + c * (NODE + 8);
            const ly = y + s * (NODE + 10) + (Math.abs(c) <= 0.3 ? (s < 0 ? -2 : 10) : 4);
            return (
              <g key={p.id} {...node(p)}>
                <title>{`${p.name}: ${p.alignment.join(' / ')}${gateOf(p.id, data) ? ` · врата ${gateOf(p.id, data)!.town}` : ''}${realmNote(p)}`}</title>
                <circle cx={x} cy={y} r={NODE} fill="var(--pn)" stroke={stroke(p)} strokeWidth={width(p)} />
                <RealmCount x={x} y={y} n={count(p)} fs={MONO} hot={hot(p.id)} />
                <Label fs={FS} x={lx} y={ly} text={p.name} anchor={anchor} strong={hot(p.id)} />
              </g>
            );
          })}

          {outlands ? (
            <g {...node(outlands)}>
              <title>{`${outlands.name} — в середине кольца, врата ко всем внешним планам${realmNote(outlands)}`}</title>
              <circle cx={C.x} cy={C.y} r={32} fill="var(--pn)" stroke={stroke(outlands)} strokeWidth={width(outlands)} />
              <RealmCount x={C.x} y={C.y + 19} n={count(outlands)} fs={MONO} hot={hot(outlands.id)} />
              <Label fs={FS} x={C.x} y={C.y + 52} text={outlands.name} strong={hot(outlands.id)} />
            </g>
          ) : null}
          {sigil ? (
            <g {...node(sigil)}>
              <title>{`${sigil.name} — над шпилем Outlands`}</title>
              <circle cx={C.x} cy={C.y} r={9} fill="none" stroke={hot(sigil.id) ? 'var(--tx)' : 'var(--t2)'} strokeWidth={4} />
              <rect x={C.x - 22} y={C.y - 34} width={44} height={FS + 2} fill="var(--pn)" />
              <text x={C.x} y={C.y - 18} textAnchor="middle" fill={hot(sigil.id) ? 'var(--tx)' : 'var(--t2)'}>{sigil.name}</text>
            </g>
          ) : null}

          {/* Astral: от Материального к первым слоям всех внешних планов. */}
          {astral && material ? (
            <>
              <line data-link="astral" {...toward(M, ASTRAL, NODE + 4, 12)} stroke="var(--t2)" strokeWidth={1.5} strokeDasharray="8 5" />
              <line data-link="astral-ring" x1={ASTRAL.x} y1={ASTRAL.y} x2={ASTRAL_TO.x} y2={ASTRAL_TO.y} stroke="var(--t2)" strokeWidth={1.5} strokeDasharray="8 5" markerEnd="url(#wheel-arrow)">
                <title>{`${link('astral')?.quote ?? ''} — ${link('astral')?.ref ?? 'вики'}`}</title>
              </line>
              <g {...node(astral)}>
                <title>{`${astral.name}: ${link('astral')?.quote ?? ''}${realmNote(astral)}`}</title>
                <circle cx={ASTRAL.x} cy={ASTRAL.y} r={NODE} fill="var(--pn)" stroke={stroke(astral)} strokeWidth={width(astral)} />
                <RealmCount x={ASTRAL.x} y={ASTRAL.y} n={count(astral)} fs={MONO} hot={hot(astral.id)} />
                <Label fs={FS} x={ASTRAL.x} y={ASTRAL.y + NODE + 16} text={astral.name} strong={hot(astral.id)} />
              </g>
            </>
          ) : null}

          {/* Ethereal — кольцо вокруг Материального, от него — к стихиям и энергии. */}
          {ethereal ? (
            <g {...node(ethereal)}>
              <title>{`${ethereal.name}: ${link('ethereal')?.quote ?? ''} — ${link('ethereal')?.ref ?? 'вики'}`}</title>
              <circle cx={M.x} cy={M.y} r={ETHER_R} fill="none" stroke={hot(ethereal.id) ? 'var(--tx)' : 'var(--t3)'} strokeWidth={hot(ethereal.id) ? 3 : 1.5} strokeDasharray="2 4" />
            </g>
          ) : null}
          {Object.entries(AROUND).map(([id, pt]) => {
            const p = planeById(id, data);
            if (!p) return null;
            const echo = p.kind === 'parallel';
            const l = echo ? toward(M, pt, 20, NODE + 2) : toward(M, pt, ETHER_R, NODE + 2);
            const below = !pt.above;
            return (
              <g key={id}>
                <line data-link={echo ? 'echo' : 'ethereal'} {...l} stroke="var(--t2)" strokeWidth={1.5} strokeDasharray={echo ? '1 4' : '4 4'} />
                <g {...node(p)}>
                  <title>{`${p.name}${realmNote(p)}`}</title>
                  <circle cx={pt.x} cy={pt.y} r={NODE} fill="var(--pn)" stroke={stroke(p)} strokeWidth={width(p)} />
                  <RealmCount x={pt.x} y={pt.y} n={count(p)} fs={MONO} hot={hot(p.id)} />
                  <Label fs={FS} x={pt.x} y={below ? pt.y + NODE + 16 : pt.y - NODE - 8} text={short(p)} strong={hot(p.id)} />
                </g>
              </g>
            );
          })}
          {material ? (
            <g {...node(material)}>
              <title>{`${material.name}${realmNote(material)}`}</title>
              <circle cx={M.x} cy={M.y} r={18} fill="var(--pn)" stroke={stroke(material)} strokeWidth={width(material)} />
              <RealmCount x={M.x} y={M.y} n={count(material)} fs={MONO} hot={hot(material.id)} />
              <Label fs={FS} x={M.x} y={M.y + 44} text={material.name} strong={hot(material.id)} />
            </g>
          ) : null}
        </svg>

        <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-pn shadow-bevel max-w-full type-body-sm text-t2" data-part="wheel-legend">
          <span title={`${data.outlands.quote} — ${data.outlands.ref ?? 'вики'}`}>━ город-врата Outlands</span>
          <span title={`${link('astral')?.quote} — ${link('astral')?.ref ?? 'вики'}`}>╌▶ Astral — к внешним планам</span>
          <span title={`${link('ethereal')?.quote} — ${link('ethereal')?.ref ?? 'вики'}`}>┄ Ethereal — к внутренним</span>
          <span>┈ отражение Материального</span>
          <span className="text-t3" title={`${data.outlands.travelQuote} — ${data.outlands.travelRef ?? 'вики'}`}>
            {`между соседними вратами — ${data.outlands.travelDays[0]}–${data.outlands.travelDays[1]} дней пути`}
          </span>
        </div>
        <PlaneInfo plane={plane} gate={gateOf(plane.id, data)} canOpen={canOpen} onOpen={onOpen} realms={realms?.(plane.id)} />
      </div>
    </div>
  );
}

export default GreatWheel;
