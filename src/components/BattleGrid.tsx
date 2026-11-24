// Боевая сетка (F2): клетки по 5 футов на провале wl с фаской внутрь, стены и укрытия, конус шаблона и
// токены-кнопки. Пока SVG под DOM-токенами — PixiJS придёт на шаге 11 (HANDOFF §9), контракт пропсов
// останется тем же. Сетка ничего не хранит и в стор не ходит: позиции, шаблон и «кого задело» приходят
// пропсами — кого задел конус, решает мастер, а не геометрия (цвет и фигура никогда не единственный носитель).
// Проекция battleTokenOf() из актёра лежит рядом.
//
// Состояния HANDOFF §8: активный — плита pl и кольцо token-active (без масштаба: клетка — это клетка);
// задетый шаблоном — внутреннее кольцо fx-buff-hi; лежащий (0 HP) — гаснет, остаётся; укрытие — клетка cd
// со штрихом br. Выбранный — золотое кольцо, как везде. Слой SVG скрыт от ассистивной технологии: всё, что
// в нём есть, повторено токенами (клетка в сводке) и title. Строки классов полные: Tailwind ищет их в исходнике.

import type { Actor } from '../engine';
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { CONDITIONS, type ConditionId } from '../rules/srd';
import { ConditionMark } from '../art/ConditionMark';
import { ENTITY, type EntityType } from './EntityCard';
import { hpText, hpWord, type HpTriple } from './HpBar';
import { TokenHpStrip } from './InitiativeToken';

export interface BattleToken {
  id: string;
  name: string;
  type: EntityType;
  x: number;
  y: number;
  /** Нет у монстра на столе игроков (Q1): вместо чисел — status словами. */
  hp?: HpTriple;
  status?: string;
  conditions: readonly ConditionId[];
  down: boolean;
}

/** Укрытие или стена — прямоугольник в клетках; без w/h — одна клетка. */
export interface BattleWall { x: number; y: number; w?: number; h?: number }

/** Конус 5e SRD: длина равна ширине дальнего края; вершина у грани клетки источника в сторону dir. */
export interface BattleCone { x: number; y: number; dir: 'e' | 'w' | 'n' | 's'; length: number }

export interface BattleGridProps {
  cols: number;
  rows: number;
  /** Сторона клетки в px, кратна 4; по умолчанию 48. */
  cell?: number;
  /** Уменьшает клетки под доступную ширину контейнера. */
  fitToWidth?: boolean;
  tokens: readonly BattleToken[];
  walls?: readonly BattleWall[];
  cone?: BattleCone;
  /** Кого задел шаблон — решает мастер, не сетка. */
  affected?: readonly string[];
  /** Текущий ход. */
  activeId?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export const BATTLE_CELL_DEFAULT = 48;

/** Клетка под доступную ширину; минимум 32px, округление вниз до кратных 4. */
export function fitBattleCell(availableWidth: number, cols: number, preferred: number, minimum = 32): number {
  if (availableWidth <= 0 || cols <= 0) return preferred;
  const fitting = Math.floor(availableWidth / cols / 4) * 4;
  return Math.max(minimum, Math.min(preferred, fitting));
}

/** Сколько иконок состояний помещается над токеном. */
export const TOKEN_CONDITIONS_MAX = 3;

const DIR: Readonly<Record<BattleCone['dir'], readonly [number, number]>> = {
  e: [1, 0],
  w: [-1, 0],
  n: [0, -1],
  s: [0, 1],
};

/**
 * Точки конуса для <polygon>: вершина — середина грани клетки источника в сторону dir, дальний край —
 * на length клеток дальше, шириной length клеток (SRD: ширина конуса равна его длине). Порядок: вершина,
 * два угла дальнего края.
 */
export function conePoints(cone: BattleCone, cell: number): string {
  const [dx, dy] = DIR[cone.dir];
  const ax = (cone.x + 0.5 + dx * 0.5) * cell;
  const ay = (cone.y + 0.5 + dy * 0.5) * cell;
  const len = cone.length * cell;
  const half = len / 2;
  // Перпендикуляр к направлению.
  const px = -dy;
  const py = dx;
  const fx = ax + dx * len;
  const fy = ay + dy * len;
  const pts: [number, number][] = [
    [ax, ay],
    [fx + px * half, fy + py * half],
    [fx - px * half, fy - py * half],
  ];
  return pts.map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Тень токена сетки по состоянию, вместе с кольцом фокуса: глобальное кольцо затирает фаску и кольца,
 * поэтому каждое из восьми сочетаний — своей строкой. Внутренние кольца: gd на 2px, fx-buff-hi на 2px —
 * или на 4px под золотом, когда оба; token-active — снаружи. Фокус всегда добавляет gd.
 */
export function battleTokenShadow(active: boolean, selected: boolean, affected: boolean): string {
  if (active) {
    if (selected && affected) return 'shadow-[var(--bevel),var(--glow-gold),inset_0_0_0_4px_var(--fx-buff-hi),var(--token-active)] focus-visible:shadow-[var(--bevel),var(--glow-gold),inset_0_0_0_4px_var(--fx-buff-hi),var(--token-active)]';
    if (selected) return 'shadow-[var(--bevel),var(--glow-gold),var(--token-active)] focus-visible:shadow-[var(--bevel),var(--glow-gold),var(--token-active)]';
    if (affected) return 'shadow-[var(--bevel),inset_0_0_0_2px_var(--fx-buff-hi),var(--token-active)] focus-visible:shadow-[var(--bevel),var(--glow-gold),inset_0_0_0_4px_var(--fx-buff-hi),var(--token-active)]';
    return 'shadow-[var(--bevel),var(--token-active)] focus-visible:shadow-[var(--bevel),var(--glow-gold),var(--token-active)]';
  }
  if (selected && affected) return 'shadow-[var(--bevel),var(--glow-gold),inset_0_0_0_4px_var(--fx-buff-hi)] focus-visible:shadow-[var(--bevel),var(--glow-gold),inset_0_0_0_4px_var(--fx-buff-hi)]';
  if (selected) return 'shadow-[var(--bevel),var(--glow-gold)] focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
  if (affected) return 'shadow-[var(--bevel),inset_0_0_0_2px_var(--fx-buff-hi)] focus-visible:shadow-[var(--bevel),var(--glow-gold),inset_0_0_0_4px_var(--fx-buff-hi)]';
  return 'shadow-bevel focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
}

/** Тултип: «Bandit Captain · 45/65 HP», задетый — «· в шаблоне». */
export function battleTokenTitle(t: Pick<BattleToken, 'name' | 'hp' | 'status'>, affected: boolean): string {
  return `${t.name} · ${t.hp ? `${hpText(t.hp)} HP` : t.status ?? ''}${affected ? ' · в шаблоне' : ''}`;
}

/** Сводка для скринридера — имя кнопки: имя, клетка, хиты словами, «лежит», «в шаблоне», состояния. */
export function battleTokenDescription(t: BattleToken, affected: boolean): string {
  const parts = [`${t.name}, клетка ${t.x}, ${t.y}`];
  if (t.hp) {
    parts.push(t.hp.current === 0
      ? `0 хитов из ${t.hp.max}`
      : `хиты ${t.hp.current} из ${t.hp.max}${t.hp.temp > 0 ? `, временные ${t.hp.temp}` : ''}`);
  } else if (t.status) parts.push(t.status);
  if (t.down) parts.push('лежит');
  if (affected) parts.push('в шаблоне');
  if (t.conditions.length > 0) parts.push(`состояния: ${t.conditions.map(id => CONDITIONS[id].label).join(', ')}`);
  return parts.join(', ');
}

/** Актёр на клетке → токен. Тип из kind; состояния — ключи actor.conditions; лежит — при 0 хитов. */
export function battleTokenOf(actor: Actor, pos: { x: number; y: number }, opts: { players?: boolean } = {}): BattleToken {
  const hidden = opts.players && actor.kind === 'monster';
  return {
    id: actor.id,
    name: actor.name,
    type: actor.kind,
    x: pos.x,
    y: pos.y,
    ...(hidden ? { status: hpWord(actor.hp) } : { hp: actor.hp }),
    conditions: Object.keys(actor.conditions) as ConditionId[],
    down: actor.hp.current === 0,
  };
}

export function BattleGrid({
  cols, rows, cell = BATTLE_CELL_DEFAULT, fitToWidth = false, tokens, walls = [], cone, affected = [], activeId, selectedId, onSelect, className = '',
}: BattleGridProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useLayoutEffect(() => {
    if (!fitToWidth) return;
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setAvailableWidth(frame.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fitToWidth]);
  const cellSize = fitToWidth ? fitBattleCell(availableWidth, cols, cell) : cell;
  const width = cols * cellSize;
  const height = rows * cellSize;
  const hit = new Set(affected);
  const lines: { key: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = 0; x <= cols; x++) lines.push({ key: `v${x}`, x1: x * cellSize, y1: 0, x2: x * cellSize, y2: height });
  for (let y = 0; y <= rows; y++) lines.push({ key: `h${y}`, x1: 0, y1: y * cellSize, x2: width, y2: y * cellSize });
  const grid = (
    <div
      role="group"
      aria-label="Боевая сетка"
      data-cols={cols}
      data-rows={rows}
      data-cell={cellSize}
      className={`relative flex-none bg-wl shadow-bevel-in ${className}`}
      style={{ width, height }}
    >
      {/* Слой геометрии: всё, что здесь, повторено токенами и title — скринридеру он не нужен. */}
      <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" className="absolute inset-0">
        {walls.map((w, i) => (
          <rect
            key={`w${i}`}
            data-part="wall"
            x={w.x * cellSize}
            y={w.y * cellSize}
            width={(w.w ?? 1) * cellSize}
            height={(w.h ?? 1) * cellSize}
            fill="var(--cd)"
            stroke="var(--br)"
            strokeWidth={2}
          />
        ))}
        {/* Линии сетки — t4: только декор, никогда текст. */}
        {lines.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--t4)" strokeWidth={1} />)}
        {cone ? (
          <polygon
            data-part="cone"
            points={conePoints(cone, cellSize)}
            fill="var(--fx-buff)"
            fillOpacity={0.28}
            stroke="var(--fx-buff-hi)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        ) : null}
      </svg>
      {tokens.map(t => {
        const ent = ENTITY[t.type];
        const active = t.id === activeId;
        const selected = t.id === selectedId;
        const inCone = hit.has(t.id);
        const conds = t.conditions.slice(0, TOKEN_CONDITIONS_MAX);
        return (
          <button
            key={t.id}
            type="button"
            data-actor={t.id}
            data-active={active ? 'true' : undefined}
            data-selected={selected ? 'true' : undefined}
            data-affected={inCone ? 'true' : undefined}
            data-down={t.down ? 'true' : undefined}
            aria-current={active ? 'true' : undefined}
            aria-pressed={selected}
            title={battleTokenTitle(t, inCone)}
            onClick={() => onSelect?.(t.id)}
            className={`absolute flex items-center justify-center cursor-pointer ${active ? 'bg-pl z-10' : 'bg-linear-to-b from-pl to-cd'} ${battleTokenShadow(active, selected, inCone)} ${t.down ? 'opacity-(--op-disabled)' : ''}`}
            style={{ left: t.x * cellSize + 2, top: t.y * cellSize + 2, width: cellSize - 4, height: cellSize - 4 }}
          >
            <span className="sr-only">{battleTokenDescription(t, inCone)}</span>
            <Icon name={ent.icon} size={24} color={t.down ? 'var(--t3)' : 'var(--tx)'} title={ent.label} />
            {t.hp ? <TokenHpStrip hp={t.hp} /> : null}
            {conds.length > 0 ? (
              <span data-part="conditions" className="absolute -top-2 -right-1 flex gap-px">
                {conds.map(id => {
                  const c = CONDITIONS[id];
                  return (
                    <ConditionMark
                      key={id}
                      condition={id}
                      size={16}
                      color={c.kind === 'buff' ? 'var(--fx-buff-hi)' : 'var(--fx-debuff-hi)'}
                      title={c.label}
                    />
                  );
                })}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
  return fitToWidth ? <div ref={frameRef} className="w-full min-w-0 overflow-x-auto">{grid}</div> : grid;
}

export default BattleGrid;
