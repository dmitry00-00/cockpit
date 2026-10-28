// Великое древо — второй вид уровня «космология» (модель World Tree, 1372 DR). Материальный — ствол: ветви Astral
// ведут от него вверх к внешним планам и вниз, к корням, — к стихийным планам и планам энергии; между двумя
// внешними планами — только через Материальный или порталом. Небесные планы сидят на самом Древе (корни, ствол,
// ветви, вершина — по статье вики), дьявольские соединены River of Blood в порядке течения, нейтральные — только на
// ветвях Astral, Cynosure и Fugue Plane — вне Древа. Порталы выбранного плана — тонким штрихом. Линии различаются
// рисунком, не цветом. Тупой компонент: какой план — мир партии и что открывать ниже по лестнице, даёт страница.
import { useState, type ReactNode } from 'react';
import { PlaneInfo } from './PlaneInfo';
import { PLACE_LABEL, WORLD_TREE, portalsOf, riverOf, type Plane, type WorldTree as Tree } from './planes';
import type { RealmIndex } from './realms';
import { Label, RealmCount, nodeProps, toward } from './svg';

export interface WorldTreeProps {
  data?: Tree;
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

const W = 1000;
const H = 800;
/**
 * Кегль в единицах схемы: зона уровня — около 590 точек на 1000 единиц (по высоте — около 500 на 800), и 22 единицы
 * выходят в 13 точек на экране. Длинные имена переносятся по 15 знаков.
 */
const FS = 22;
const WRAP = 15;
/** Число уделов в узле — Plex Mono: 20 единиц — около 12 точек на экране. */
const MONO = 20;
const NODE = 14;
const TRUNK = 200;
const M = { x: 510, y: 620 };
/** Своя раскладка: небесные — Древо слева, нейтральные — столбцом посередине, дьявольские — River of Blood змейкой справа. */
const AT: Readonly<Record<string, { x: number; y: number }>> = {
  'gates-of-the-moon': { x: TRUNK, y: 70 },
  dweomerheart: { x: 70, y: 175 }, 'house-of-the-triad': { x: TRUNK, y: 175 }, 'green-fields': { x: 330, y: 175 },
  brightwater: { x: 70, y: 280 }, 'golden-hills': { x: TRUNK, y: 280 }, 'house-of-knowledge': { x: 330, y: 280 },
  arvandor: { x: 95, y: 385 }, dwarfhome: { x: 305, y: 385 },
  'dragon-eyrie': { x: 510, y: 70 }, heliopolis: { x: 510, y: 155 }, 'house-of-nature': { x: 510, y: 240 },
  jotunheim: { x: 510, y: 325 }, 'warriors-rest': { x: 510, y: 410 },
  abyss: { x: 730, y: 70 }, 'blood-rift': { x: 910, y: 70 }, 'nine-hells': { x: 910, y: 155 }, barrens: { x: 730, y: 155 },
  clangor: { x: 730, y: 240 }, 'furys-heart': { x: 910, y: 240 }, hammergrim: { x: 910, y: 325 }, nishrek: { x: 730, y: 325 },
  'deep-caverns': { x: 730, y: 410 }, 'fated-depths': { x: 910, y: 410 },
  'demonweb-pits': { x: 730, y: 495 }, 'supreme-throne': { x: 910, y: 495 },
  cynosure: { x: 425, y: 495 }, fugue: { x: 595, y: 495 },
  material: M, astral: { x: 340, y: 620 }, ethereal: { x: 660, y: 595 }, shadow: { x: 660, y: 655 },
  air: { x: 100, y: 730 }, earth: { x: 255, y: 730 }, fire: { x: 410, y: 730 }, water: { x: 565, y: 730 },
  positive: { x: 730, y: 730 }, negative: { x: 900, y: 730 },
};
/** Куда упирается ветвь Astral у каждой группы внешних планов — под нижней подписью группы. */
const BRANCH: readonly { x: number; y: number }[] = [{ x: TRUNK, y: 450 }, { x: 510, y: 470 }, { x: 820, y: 560 }];
const HEADS: readonly (readonly [string, number, 'tree' | 'neutral' | 'river'])[] = [
  ['Небесные · World Tree', TRUNK, 'tree'], ['Нейтральные', 510, 'neutral'], ['Дьявольские · River of Blood', 820, 'river'],
];
/** Подписи справа от узла — у планов, что стоят вплотную к Материальному. */
const RIGHT = new Set(['ethereal', 'shadow']);
const LEFT = new Set(['astral']);

const short = (p: Plane) => p.name.replace(/^Elemental /, '');

/** Отрезок реки: по строке — прямо, на поворот змейки — дугой наружу, мимо подписи. */
function riverPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  if (a.y === b.y) {
    const l = toward(a, b, NODE + 2, NODE + 4);
    return `M${l.x1},${l.y1} L${l.x2},${l.y2}`;
  }
  const out = a.x === b.x ? (a.x > 820 ? 70 : -70) : 0;
  return `M${a.x + Math.sign(out) * NODE},${a.y} C${a.x + out},${a.y} ${b.x + out},${b.y} ${b.x + Math.sign(out) * (NODE + 4)},${b.y}`;
}

export function WorldTree({ data = WORLD_TREE, current = 'material', canOpen, onOpen, tools, realms, children, className = '' }: WorldTreeProps) {
  const [picked, setPicked] = useState(current);
  const byId = new Map(data.planes.map(p => [p.id, p]));
  const plane = byId.get(picked) ?? data.planes[0];
  const name = (id: string) => byId.get(id)?.name ?? id;
  const hot = (id: string) => id === plane.id;
  const stroke = (p: Plane) => (p.id === current ? 'var(--gd)' : hot(p.id) ? 'var(--tx)' : 'var(--t3)');
  const width = (p: Plane) => (p.id === current || hot(p.id) ? 3 : 1.5);
  const portals = portalsOf(plane.id, data);
  const river = riverOf(plane.id, data);
  const note = (q: { quote: string; ref: string | null }) => `${q.quote} — ${q.ref ?? 'вики'}`;
  const role = plane.place
    ? { text: PLACE_LABEL[plane.place], q: data.tree }
    : plane.kind === 'neutral' ? { text: 'только ветвь Astral: ни Древа, ни River of Blood', q: data.notes.neutral }
      : plane.kind === 'outside' ? { text: 'вне Древа: ветви Astral сюда не ведут', q: data.notes.outside }
        : plane.id === 'astral' ? { text: 'все ветви ведут к Материальному или от него', q: data.notes.astral }
          : plane.id === 'ethereal' ? { text: 'сосуществует с Материальным', q: data.notes.ethereal }
            : plane.id === 'shadow' ? { text: 'сосуществует с Материальным, быстрый путь между его точками', q: data.notes.shadow }
              : plane.kind === 'inner' || plane.kind === 'energy' ? { text: 'корни: от Материального через Astral', q: data.notes.inner }
                : undefined;

  return (
    <div className={`relative flex min-h-0 bg-wl ${className}`} data-part="world-tree">
      {children ? <div className="flex-none p-4 flex items-start gap-4 min-h-0 max-h-full">{children}</div> : null}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-4">
        {tools ? <div className="flex items-center gap-1 self-end" role="toolbar" aria-label="Модель космологии">{tools}</div> : null}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Великое древо: Материальный — ствол, ветви Astral к внешним планам, корни — внутренние планы" className="flex-1 min-h-0 w-full" style={{ fontFamily: 'var(--font-display)', fontSize: FS }}>
          <defs>
            <marker id="tree-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--t2)" />
            </marker>
          </defs>

          {/* Ветви Astral: от Материального к трём группам внешних планов и к корням. */}
          {[...BRANCH, ...['air', 'earth', 'fire', 'water', 'positive', 'negative'].map(id => AT[id])].map((to, i) => (
            <line key={i} data-link="astral" {...toward(M, to, 22, i < BRANCH.length ? 0 : NODE + 2)} stroke="var(--t3)" strokeWidth={2} strokeDasharray="8 5" />
          ))}
          {(['ethereal', 'shadow'] as const).map(id => (
            <line key={id} data-link="coexist" {...toward(M, AT[id], 22, NODE + 2)} stroke="var(--t2)" strokeWidth={1.5} strokeDasharray="1 4" />
          ))}

          {/* Само Древо: ствол, ярусы ветвей, корни — к небесным планам. */}
          <g data-part="tree" stroke="var(--t3)" fill="none">
            <title>{note(data.tree)}</title>
            <line x1={TRUNK} y1={345} x2={TRUNK} y2={70 + NODE} strokeWidth={6} />
            <line x1={70} y1={175} x2={330} y2={175} strokeWidth={3} />
            <line x1={70} y1={280} x2={330} y2={280} strokeWidth={3} />
            <line x1={TRUNK} y1={345} x2={95} y2={385 - NODE} strokeWidth={4} />
            <line x1={TRUNK} y1={345} x2={305} y2={385 - NODE} strokeWidth={4} />
          </g>

          {/* River of Blood в порядке течения. */}
          <g data-part="river" fill="none" stroke="var(--t2)" strokeWidth={3}>
            <title>{note(data.river)}</title>
            {data.river.order.slice(1).map((id, i) => {
              const a = AT[data.river.order[i]], b = AT[id];
              return a && b ? <path key={id} data-river={`${data.river.order[i]}-${id}`} d={riverPath(a, b)} markerEnd="url(#tree-arrow)" /> : null;
            })}
          </g>

          {/* Порталы выбранного плана. */}
          {portals.map(({ other, link }) => {
            const a = AT[plane.id], b = AT[other];
            if (!a || !b) return null;
            return (
              <line key={other} data-portal={other} {...toward(a, b, NODE + 2, NODE + 2)} stroke="var(--tx)" strokeWidth={1.5} strokeDasharray={link.kind === 'intermittent' ? '1 6' : '3 4'}>
                <title>{`${name(link.from)} — ${name(link.to)}: ${note(link)}`}</title>
              </line>
            );
          })}

          {HEADS.map(([t, x, k]) => (
            <g key={k}>
              <title>{k === 'neutral' ? note(data.notes.neutral) : k === 'tree' ? note(data.tree) : note(data.river)}</title>
              <Label fs={FS} x={x} y={30} text={t} dim />
            </g>
          ))}

          {data.planes.map(p => {
            const pt = AT[p.id];
            if (!pt) return null;
            const big = p.id === 'material';
            const r = big ? 20 : NODE;
            const side = RIGHT.has(p.id) ? 'start' : LEFT.has(p.id) ? 'end' : 'middle';
            const lx = side === 'start' ? pt.x + r + 8 : side === 'end' ? pt.x - r - 8 : pt.x;
            const ly = side === 'middle' ? pt.y + r + FS : pt.y + 7;
            return (
              <g key={p.id} {...nodeProps(p.id, p.name, hot(p.id), setPicked)}>
                <title>{`${p.name}${realms?.(p.id).length ? ` · уделов богов: ${realms(p.id).length}` : ''}`}</title>
                {/* Вне Древа — ромб, остальные — круг. */}
                {p.kind === 'outside'
                  ? <rect x={pt.x - r * 0.8} y={pt.y - r * 0.8} width={1.6 * r} height={1.6 * r} transform={`rotate(45 ${pt.x} ${pt.y})`} fill="var(--pn)" stroke={stroke(p)} strokeWidth={width(p)} />
                  : <circle cx={pt.x} cy={pt.y} r={r} fill="var(--pn)" stroke={stroke(p)} strokeWidth={width(p)} />}
                <RealmCount x={pt.x} y={pt.y} n={realms?.(p.id).length ?? 0} fs={MONO} hot={hot(p.id)} />
                <Label fs={FS} x={lx} y={ly} text={short(p)} anchor={side} strong={hot(p.id)} wrap={side === 'middle' && !big ? (p.kind === 'celestial' ? 10 : WRAP) : undefined} />
              </g>
            );
          })}
        </svg>

        <div className="flex flex-wrap items-center gap-4 px-3 py-2 bg-pn shadow-bevel max-w-full type-body-sm text-t2" data-part="tree-legend">
          <span title={note(data.tree)}>┃ World Tree</span>
          <span title={note(data.river)}>━▶ River of Blood</span>
          <span title={note(data.notes.astral)}>╌ ветви Astral — через Материальный</span>
          <span title={note(data.notes.ethereal)}>┈ сосуществуют</span>
          <span className="text-t3">⋯ порталы выбранного плана</span>
        </div>
        <PlaneInfo plane={plane} canOpen={canOpen} onOpen={onOpen} realms={realms?.(plane.id)}>
          {role ? <p className="type-body-sm text-t2" data-part="tree-role" title={note(role.q)}>{role.text}</p> : null}
          {river ? (
            <p className="type-body-sm text-t2" data-part="tree-river" title={note(data.river)}>
              {`River of Blood: ${river.from ? `из ${name(river.from)}` : 'исток'} → ${river.to ? `в ${name(river.to)}` : 'устье'}`}
            </p>
          ) : null}
          {portals.length > 0 ? (
            <p className="type-body-sm text-t2" data-part="tree-portals">
              {'Порталы: '}
              {portals.map(({ other, link }, i) => (
                <span key={other} title={note(link)}>
                  {i > 0 ? ', ' : ''}
                  {name(other)}
                  {link.kind === 'intermittent' ? ' (непостоянный)' : ''}
                </span>
              ))}
            </p>
          ) : null}
        </PlaneInfo>
      </div>
    </div>
  );
}

export default WorldTree;
