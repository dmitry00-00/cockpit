// Слой карты по регионам A5E (ROADMAP 6.4): подкраска видимого окна регионами и легенда. «Опасность» — какая таблица
// встреч где действует, уровень опасности партии и DC занятий, «встреча» — d100 по таблице региона; «Погода» — d20
// региона на этот день из лога, не брошено — так и написано. Линза, не событие: бросает страница. Отдельным куском
// (lazyParts): основному куску слой не нужен, пока его не включили.
import { useEffect, useMemo, useRef } from 'react';
import type { RegionWeather } from '../campaign/mapLayers';
import { JOURNEY_REGIONS, activityDc, type RegionTier } from '../rules/a5e/journey';
import type { Explored } from './fog';
import type { MapView, Viewport } from './projection';
import { REGION_TINT, sampleRegions } from './regionSample';
import type { RouteOverlay, TerrainGrid } from './terrain';

export interface DangerLayer {
  tier: RegionTier;
  /** d100 по таблице встреч региона — бросает страница (DICE_ROLLED и строка журнала). */
  onEncounter?: (regionId: string) => void;
}

export interface WeatherLayer {
  /** Погода регионов на сегодня — броски из лога (campaign/mapLayers.ts). */
  today: ReadonlyMap<string, RegionWeather>;
  /** Бросить d20 погоды региона — мастеру; игрокам кнопки нет. */
  onRoll?: (regionId: string) => void;
}

export interface RegionLayerProps {
  kind: 'danger' | 'weather';
  grid: TerrainGrid;
  overlay: RouteOverlay;
  vp: Viewport;
  view: MapView;
  /** Стол игроков: только открытое туманом. */
  explored?: Explored;
  danger?: DangerLayer;
  weather?: WeatherLayer;
}

const BTN = 'type-num-12 uppercase whitespace-nowrap px-2 py-0.5 bg-cd shadow-bevel text-t2 cursor-pointer hover:text-tx active:shadow-bevel-in focus-visible:shadow-[var(--bevel),var(--glow-gold)]';
/** Строк в легенде: регионы окна по доле на экране. */
const LEGEND_ROWS = 8;

export function RegionLayer({ kind, grid, overlay, vp, view, explored, danger, weather }: RegionLayerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sample = useMemo(() => sampleRegions(grid, overlay, vp, view, explored), [grid, overlay, vp, view, explored]);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.('2d');
    if (!cv || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(vp.w * dpr);
    cv.height = Math.round(vp.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vp.w, vp.h);
    const css = getComputedStyle(cv);
    const color = new Map(Object.entries(REGION_TINT).map(([id, v]) => [id, css.getPropertyValue(v).trim() || '#888']));
    ctx.globalAlpha = 0.4;
    const { cols, rows, step, ids } = sample;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = ids[r * cols + c];
        if (!id) continue;
        ctx.fillStyle = color.get(id) ?? '#888';
        ctx.fillRect(c * step, r * step, step, step);
      }
    }
  }, [sample, vp]);

  const rows = sample.shares.slice(0, LEGEND_ROWS).filter(s => JOURNEY_REGIONS[s.id]);
  const label = kind === 'danger' ? 'Опасность' : 'Погода';
  return (
    <>
      <canvas ref={ref} aria-hidden="true" data-part={`layer-${kind}`} className="absolute inset-0 size-full pointer-events-none" />
      <div data-part="layer-legend" role="group" aria-label={label} className="absolute z-10 right-3 bottom-3 flex flex-col gap-1 px-2 py-1.5 bg-cd shadow-float type-body-sm text-tx max-w-96 cursor-default">
        <span className="type-key text-t2">
          {kind === 'danger' && danger
            ? `Опасность · уровень ${danger.tier} · DC занятий ${activityDc(danger.tier)}`
            : 'Погода дня · d20 по региону (A5E), зимой +5'}
        </span>
        {rows.length === 0 ? <span className="text-t3">В окне нет нанесённых регионов</span> : null}
        {rows.map(({ id }) => {
          const region = JOURNEY_REGIONS[id];
          const w = weather?.today.get(id);
          return (
            <span key={id} data-region={id} className="flex items-center gap-2">
              <span aria-hidden="true" className="flex-none size-3 shadow-[0_0_0_1px_var(--lo)]" style={{ background: `var(${REGION_TINT[id] ?? '--t4'})` }} />
              <span className="truncate" title={`${region.description}${region.fields.Tiers ? `\n\nTiers: ${region.fields.Tiers}` : ''}`}>{region.name}</span>
              {kind === 'danger' && danger?.onEncounter ? (
                <button type="button" title={`Бросить d100 по таблице встреч ${region.name}, уровень ${danger.tier}`} onClick={() => danger.onEncounter!(id)} className={`${BTN} ml-auto`}>встреча</button>
              ) : null}
              {kind === 'weather' ? (
                w ? (
                  <span className="ml-auto text-tx whitespace-nowrap" title={`d20 = ${w.roll}${w.winter ? ' +5 (зима)' : ''}${w.hidden ? ' · скрытый бросок' : ''}`}>{w.weather}</span>
                ) : weather?.onRoll ? (
                  <button type="button" title={`Roll a d20 for weather once for each region — бросок в журнал`} onClick={() => weather.onRoll!(id)} className={`${BTN} ml-auto`}>бросить</button>
                ) : (
                  <span className="ml-auto text-t3 whitespace-nowrap">не брошено</span>
                )
              ) : null}
            </span>
          );
        })}
      </div>
    </>
  );
}
