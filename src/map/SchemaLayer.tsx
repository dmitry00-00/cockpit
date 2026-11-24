// Режим «Схема» карты мира (TASKS M16): вместо растра — вода, суша цветом равнины, регионы местности, реки, береговая
// линия, дороги и подписи канвасом, легенда — плашкой. Пути строятся один раз на схему в пикселях исходника, кадр — только
// смена преобразования, поэтому схема одинаково чёткая на любом приближении. Подписи (map/schemaLabels.ts) — отдельным
// куском по требованию, отбор — на каждый кадр в пикселях экрана; подписи держав (`kingdom.label`) щелчковые — кадр
// отдаёт их плашки наверх (`onHits`), карта открывает карточку. Цвета — токены местности (terrain-*, как у маски
// глобуса). Отдельным куском (lazyParts): на столе без схемы он не нужен.
// С 30.10 (M18) подложку рисует WebGL2 (map/schemaGl.ts) на своём канвасе, подписи — Canvas2D поверх; нет WebGL2 или
// контекст потерян — всё на Canvas2D, как раньше. `?renderer=canvas` в адресе — принудительно Canvas2D (сравнение).
import { useEffect, useMemo, useRef, useState } from 'react';
import { toScreen, type MapPoint, type MapView, type Viewport } from './projection';
import type { EntityRef } from '../entities';
import { loadKingdoms } from '../world/kingdoms';
import type { MapSchema } from './schema';
import { schemaLegend } from './schemaLegend';
import { fold } from './gazetteer';
import { labelHits, loadLabels, loadRasterFeatureLabels, loadRasterIcons, placeLabels, unlinkedRasterIcons, type LabelHit, type RasterMapIcon, type SchemaLabel } from './schemaLabels';
import { drawLabels, fillSchema, labelMeasure, occupiedBoxes, riverWidth, schemaPaths, useFontsReady } from './schemaDraw';
import { createSchemaGl, type SchemaGl } from './schemaGl';
import { mapPixelRatio } from './renderer';

const forceCanvas = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('renderer') === 'canvas';

function drawRasterIcon(ctx: CanvasRenderingContext2D, icon: RasterMapIcon, p: MapPoint) {
  const x = p.x, y = p.y, s = Math.max(3.5, Math.min(7, 4.5 * icon.size));
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(29, 20, 30, .96)';
  ctx.fillStyle = 'rgba(221, 182, 96, .98)';
  ctx.beginPath();
  switch (icon.kind) {
    case 'city': ctx.arc(0, 0, s, 0, Math.PI * 2); break;
    case 'capital':
      ctx.moveTo(0, -s - 1); ctx.lineTo(s + 1, 0); ctx.lineTo(0, s + 1); ctx.lineTo(-s - 1, 0); ctx.closePath(); break;
    case 'keep': ctx.rect(-s, -s, 2 * s, 2 * s); break;
    case 'temple':
    case 'peak':
      ctx.moveTo(-s, s); ctx.lineTo(0, -s); ctx.lineTo(s, s); ctx.closePath(); break;
    case 'mine':
      ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); break;
    case 'well': ctx.arc(0, 0, s, 0, Math.PI * 2); break;
    case 'ruins':
      ctx.moveTo(-s, -s); ctx.lineTo(0, -s); ctx.moveTo(s, -s); ctx.lineTo(s, 0); ctx.moveTo(s, s); ctx.lineTo(0, s); ctx.moveTo(-s, s); ctx.lineTo(-s, 0); break;
    default:
      ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (icon.kind === 'keep' || icon.kind === 'well') {
    ctx.beginPath(); ctx.arc(0, 0, s * .35, 0, Math.PI * 2); ctx.fillStyle = 'rgba(29, 20, 30, .96)'; ctx.fill();
  }
  ctx.restore();
}

export interface SchemaLayerProps {
  schema: MapSchema;
  vp: Viewport;
  view: MapView;
  /** Нарисовать только подписи поверх очищенного растра, без схемы местности и линий. */
  labelsOnly?: boolean;
  /** Локальные редакционно принятые OCR-подписи личного растра; не попадают в production/package. */
  supplementalRasterLabels?: boolean;
  /** Координаты уже каталогизированных мест, для исключения повторного значка. */
  rasterIconPlaces?: readonly MapPoint[];
  /** Карта — по ней подписи (content/maps/<id>-labels.json); нет файла — схема без подписей. */
  mapId?: string;
  /** Пины кампании: их имена схема не повторяет (плашки заняты — по DOM). */
  pins?: readonly { name: string }[];
  /** Легенда — пока у карты нет своей (слои «Опасность» и «Погода» кладут свою). */
  legend?: boolean;
  /** Щелчковые подписи кадра (державы): их плашки в пикселях экрана — на каждый кадр. */
  onHits?: (hits: readonly LabelHit[]) => void;
}

export function SchemaLayer({ schema, vp, view, mapId, pins = [], legend = true, labelsOnly = false, supplementalRasterLabels = false, rasterIconPlaces = [], onHits }: SchemaLayerProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  /** Чем рисуется подложка: ждём проверки WebGL2 → gl или canvas. */
  const [gpu, setGpu] = useState<SchemaGl | 'pending' | null>('pending');
  const [labels, setLabels] = useState<readonly SchemaLabel[]>([]);
  const [rasterLabels, setRasterLabels] = useState<readonly SchemaLabel[]>([]);
  const [rasterIcons, setRasterIcons] = useState<readonly RasterMapIcon[]>([]);
  /** Подпись → карточка державы: fold(`kingdom.label`) → `kingdom:id`. */
  const [refs, setRefs] = useState<ReadonlyMap<string, EntityRef>>(new Map());
  const hitsTo = useRef(onHits);
  hitsTo.current = onHits;
  // Легенда доступна по запросу и не занимает угол карты при каждом открытии схемы.
  const [legendOpen, setLegendOpen] = useState(false);
  const fonts = useFontsReady();
  // Path2D нет в jsdom — там схема не рисуется, а остальная карта живёт как есть. Пути Canvas2D — только без WebGL2.
  const paths = useMemo(() => (gpu === null ? schemaPaths(schema) : null), [schema, gpu]);

  useEffect(() => {
    if (labelsOnly) {
      setGpu(null);
      return;
    }
    const cv = glRef.current;
    const made = cv && !forceCanvas() ? createSchemaGl(cv, schema, () => setGpu(null)) : null;
    setGpu(made);
    return () => made?.dispose();
  }, [schema, labelsOnly]);
  const items = useMemo(() => schemaLegend(schema), [schema]);

  useEffect(() => {
    if (!mapId) return;
    let live = true;
    void loadLabels(mapId).then(l => { if (live) setLabels(l); });
    void loadKingdoms().then(all => {
      if (live) setRefs(new Map([...all.values()].flatMap(k => (k.label ? [[fold(k.label), `kingdom:${k.id}` as EntityRef] as const] : []))));
    });
    return () => { live = false; };
  }, [mapId]);

  useEffect(() => {
    if (!supplementalRasterLabels || !mapId) {
      setRasterLabels([]);
      setRasterIcons([]);
      return;
    }
    let live = true;
    void Promise.all([loadRasterFeatureLabels(mapId), loadRasterIcons(mapId)]).then(([labels, icons]) => {
      if (live) { setRasterLabels(labels); setRasterIcons(icons); }
    });
    return () => { live = false; };
  }, [mapId, supplementalRasterLabels]);

  const visibleLabels = useMemo(() => rasterLabels.length ? [...labels, ...rasterLabels] : labels, [labels, rasterLabels]);
  const visibleRasterIcons = useMemo(() => unlinkedRasterIcons(rasterIcons, rasterIconPlaces), [rasterIcons, rasterIconPlaces]);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.('2d');
    hitsTo.current?.([]);
    if (!cv || !ctx || gpu === 'pending' || (!labelsOnly && !gpu && !paths)) return;
    const dpr = mapPixelRatio();
    cv.width = Math.round(vp.w * dpr);
    cv.height = Math.round(vp.h * dpr);
    const css = getComputedStyle(cv);
    const color = (name: string) => css.getPropertyValue(`--${name}`).trim() || '#888';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vp.w, vp.h);
    const iconAvoid = view.scale >= 0.35 ? visibleRasterIcons.flatMap(icon => {
      const at = toScreen(view, vp, icon);
      if (at.x < -10 || at.y < -10 || at.x > vp.w + 10 || at.y > vp.h + 10) return [];
      drawRasterIcon(ctx, icon, at);
      return [{ x0: at.x - 6, y0: at.y - 6, x1: at.x + 6, y1: at.y + 6 }];
    }) : [];
    if (gpu) {
      gpu.draw(view, vp, dpr, color);
    } else if (!labelsOnly && paths) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = color('terrain-o');
      ctx.fillRect(0, 0, vp.w, vp.h);
      const k = view.scale * dpr;
      ctx.setTransform(k, 0, 0, k, dpr * (vp.w / 2 - view.x * view.scale), dpr * (vp.h / 2 - view.y * view.scale));
      // Линии — в пикселях экрана при любом приближении.
      fillSchema(ctx, paths, color, 1 / view.scale, riverWidth(view.scale) / view.scale);
      ctx.strokeStyle = color('gd');
      ctx.lineWidth = Math.max(1, Math.min(2.5, view.scale * 6)) / view.scale;
      ctx.stroke(paths.roads);
    }
    if (!visibleLabels.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const font = css.getPropertyValue('--font-display').trim() || 'serif';
    const placed = placeLabels(visibleLabels, {
      project: p => toScreen(view, vp, p),
      scale: view.scale,
      vp,
      measure: labelMeasure(ctx, font),
      // Занятое — по DOM: плашки пинов с их значками, партия, метки слоёв, панели стола и карты (под карточкой
      // подпись не видна — место отдаётся соседке).
      avoid: [...occupiedBoxes(cv.parentElement), ...iconAvoid],
      skip: new Set(pins.map(p => fold(p.name))),
    });
    drawLabels(ctx, placed, font, color);
    hitsTo.current?.(labelHits(placed, refs));
  }, [gpu, paths, vp, view, visibleLabels, visibleRasterIcons, refs, pins, fonts]);

  return (
    <>
      {!labelsOnly ? <canvas ref={glRef} aria-hidden="true" data-part="schema-gl" hidden={!gpu || gpu === 'pending'} className="absolute inset-0 size-full pointer-events-none" /> : null}
      <canvas ref={ref} aria-hidden="true" data-part="schema" data-renderer={gpu === 'pending' ? undefined : gpu ? 'webgl2' : 'canvas'} data-labels={visibleLabels.length || undefined} data-raster-labels={rasterLabels.length || undefined} data-raster-icons={view.scale >= 0.35 ? visibleRasterIcons.length || undefined : undefined} className="absolute inset-0 size-full pointer-events-none" />
      {legend && !labelsOnly && items.length ? (
        // Под панелью карты справа: снизу справа — карточка места справочника и легенда слоёв по регионам.
        <div data-part="map-ui" className="absolute z-10 right-3 bottom-3 max-h-[60%] overflow-auto flex flex-col bg-cd shadow-float cursor-default">
          <button
            type="button"
            aria-expanded={legendOpen}
            title={legendOpen ? 'Свернуть легенду схемы' : 'Легенда схемы: цвета местности и линии'}
            onClick={() => setLegendOpen(v => !v)}
            className="type-num-12 uppercase text-left px-2 py-1 text-t2 cursor-pointer hover:text-tx focus-visible:shadow-[var(--glow-gold)]"
          >
            Легенда
          </button>
          {legendOpen ? (
            <ul data-part="schema-legend" aria-label="Легенда схемы" className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-2 pb-1.5">
              {items.map(it => (
                <li key={it.key} title={it.title} className="flex items-center gap-2 type-body-sm text-tx">
                  {it.shape === 'fill'
                    ? <span aria-hidden="true" className="size-3 flex-none shadow-[0_0_0_1px_var(--lo)]" style={{ background: `var(--${it.token})` }} />
                    : it.shape === 'dash'
                      // Граница — штрих-пунктир на равнине: тот же рисунок, что на схеме, и виден на тёмной плашке.
                      ? <span aria-hidden="true" className="w-3 h-1.5 flex-none" style={{ background: `repeating-linear-gradient(90deg, var(--${it.token}) 0 5px, transparent 5px 7px, var(--${it.token}) 7px 8px, transparent 8px 10px) center / 100% 2px no-repeat, var(--terrain-g)` }} />
                      : <span aria-hidden="true" className="w-3 h-0.5 flex-none" style={{ background: `var(--${it.token})` }} />}
                  {it.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
