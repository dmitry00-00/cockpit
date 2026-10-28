// Глобус уровня планеты (HANDOFF §3, §10, референс Globe.png): пиксельный диск по маске, ночная сторона —
// те же цвета местности, приглушённые, ползунок долготы, щелчок по суше — континент или класс местности.
// Тупой компонент: маску, солнце и метки даёт страница. Канвас — около двух тысяч клеток (§9); в jsdom он
// не рисует, поэтому всё, что проверяется, — в DOM: подпись, ползунок, метки, ответ на щелчок.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ENTITY, type EntityType } from '../components/EntityCard';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/icons.generated';
import { globeCells, globeHit, globeToLonLat, lonLatToGlobe, TERRAIN_CLASSES, TERRAIN_LABEL, type PlanetMask } from './planet';

export interface GlobeMarker {
  id: string;
  label: string;
  lon: number;
  lat: number;
  type: EntityType;
  icon?: IconName;
}

export interface GlobeProps {
  mask: PlanetMask;
  /** Долгота в центре на старте — обычно место партии; дальше мастер крутит ползунком. */
  rot: number;
  /** Подсолнечная долгота: дальше 90° от неё — ночь. */
  sun: number;
  markers?: readonly GlobeMarker[];
  /** Щелчок по суше: континент маски (region) или класс местности. */
  onPick?: (hit: { id: string; label: string; region: boolean }) => void;
  /** Клеток поперёк диска. */
  n?: number;
  /** Свои кнопки страницы в панели под глобусом (переключатель на плоскую карту). */
  tools?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Ночь — те же цвета, затемнённые (референс: «один мир при другом освещении, а не другая палитра»). */
const NIGHT_SHADE = 0.62;

export function Globe({ mask, rot: rot0, sun, markers = [], onPick, n = 44, tools, children, className = '' }: GlobeProps) {
  const [rot, setRot] = useState(Math.round(rot0));
  const [cellPx, setCellPx] = useState(14);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => setRot(Math.round(rot0)), [rot0]);

  // Клетка — целое число пикселей, диск — по меньшей стороне свободного места.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const side = Math.min(el.clientWidth, el.clientHeight) - 96;
      if (side > 0) setCellPx(Math.max(6, Math.floor(side / n)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n]);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext?.('2d');
    if (!cv || !ctx) return;
    const css = getComputedStyle(cv);
    const color = Object.fromEntries(TERRAIN_CLASSES.map(c => [c, css.getPropertyValue(`--terrain-${c}`).trim() || '#000']));
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const c of globeCells(mask, n, rot, sun)) {
      ctx.fillStyle = color[c.cls];
      ctx.fillRect(c.x * cellPx, c.y * cellPx, cellPx, cellPx);
      if (!c.lit) {
        ctx.fillStyle = `rgba(0,0,0,${NIGHT_SHADE})`;
        ctx.fillRect(c.x * cellPx, c.y * cellPx, cellPx, cellPx);
      }
    }
  });

  const at = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return globeToLonLat(n, rot, (e.clientX - r.left) / cellPx, (e.clientY - r.top) / cellPx);
  };
  const size = n * cellPx;

  return (
    <div className={`relative flex min-h-0 bg-wl ${className}`} data-part="globe">
      {children ? <div className="flex-none p-4 flex items-start gap-4 min-h-0 max-h-full">{children}</div> : null}
      <div ref={boxRef} className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-4">
        <div className="relative" style={{ width: size, height: size }}>
          <canvas
            ref={canvasRef}
            width={size}
            height={size}
            role="img"
            aria-label={`Глобус ${mask.label}: щелчок по суше — континент`}
            data-rot={rot}
            className="block cursor-pointer [image-rendering:pixelated]"
            onMouseMove={e => {
              const ll = at(e);
              const hit = ll ? globeHit(mask, ll.lon, ll.lat) : null;
              setHover(hit ? hit.label : ll ? TERRAIN_LABEL.o : null);
            }}
            onMouseLeave={() => setHover(null)}
            onClick={e => {
              const ll = at(e);
              const hit = ll ? globeHit(mask, ll.lon, ll.lat) : null;
              if (hit) onPick?.(hit);
            }}
          />
          {markers.map(m => {
            const p = lonLatToGlobe(n, rot, m.lon, m.lat);
            if (!p.visible) return null;
            const ent = ENTITY[m.type];
            return (
              <span
                key={m.id}
                data-marker={m.id}
                title={`${ent.label} · ${m.label}`}
                className="absolute flex items-center gap-1 px-1 py-0.5 bg-cd shadow-float pointer-events-none whitespace-nowrap"
                style={{ left: p.x * cellPx, top: p.y * cellPx, transform: 'translate(-50%, -50%)' }}
              >
                <Icon name={m.icon ?? ent.icon} size={16} color={ent.color} title={ent.label} />
                <span className="type-body-sm text-tx">{m.label}</span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-3 py-2 bg-pn shadow-bevel" data-part="globe-ui">
          {tools}
          <label className="flex items-center gap-2">
            <span className="type-num-12 uppercase text-t2">Долгота</span>
            <input type="range" min={0} max={359} step={1} value={rot} aria-label="Долгота в центре глобуса" onChange={e => setRot(Number(e.target.value))} className="w-48 accent-[var(--gd)]" />
            <span className="type-num-12 text-tx w-10 text-right">{rot}°</span>
          </label>
          <span className="type-body-sm text-t2 min-w-36" aria-live="polite">{hover ?? 'Щелчок по суше — континент'}</span>
        </div>
      </div>
    </div>
  );
}

export default Globe;
