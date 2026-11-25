import type { AdventureBundle, AdventureNode } from './adventure';

export type PlanPoint = readonly [number, number];
export type RuntimePlanFeatureKind = 'wall' | 'cavern-edge' | 'door' | 'secret-door' | 'broken-door';
export interface RuntimePlanFeature {
  id: string;
  kind: RuntimePlanFeatureKind;
  points: readonly PlanPoint[];
  sourceLabel?: string;
}
export interface RuntimePlanTrace {
  sourcePdfPage: number;
  tracedOn: string;
  status: 'manual-grid-trace-v1';
  visibility: 'dm-only';
  note: string;
}
export interface RuntimePlanArea {
  id: string;
  number?: number;
  label: string;
  shape: { kind: 'polygon'; points: readonly PlanPoint[] } | { kind: 'marker'; at: PlanPoint; radius: number };
  targetNodeId?: string;
}
export interface RuntimePlanPath { id: string; points: readonly PlanPoint[]; kind: 'route' | 'water' }
export interface RuntimePlanGeometry {
  id: string;
  title: string;
  sourceReference: { label: string; url: string; inspectedOn: string; artCredit?: string; use: 'visual-reference-only' };
  width: number;
  height: number;
  coordinateUnit: 'grid-cell' | 'map-unit';
  feetPerCell?: number;
  scaleBar?: { feet: number; mapUnits: number };
  areas: readonly RuntimePlanArea[];
  paths: readonly RuntimePlanPath[];
  barriers?: readonly RuntimePlanFeature[];
  trace?: RuntimePlanTrace;
  accuracy: 'editorial-area-anchors';
  sourceArtworkImported: false;
}

const polygon = (id: string, number: number, x: number, y: number, w: number, h: number, targetNodeId?: string): RuntimePlanArea => ({
  id, number, label: `Область ${number}`, targetNodeId,
  shape: { kind: 'polygon', points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] },
});
const marker = (id: string, number: number, label: string, x: number, y: number, targetNodeId: string): RuntimePlanArea => ({
  id, number, label, targetNodeId, shape: { kind: 'marker', at: [x, y], radius: 25 },
});
const path = (id: string, kind: RuntimePlanPath['kind'], ...points: PlanPoint[]): RuntimePlanPath => ({ id, kind, points });
const feature = (id: string, kind: RuntimePlanFeatureKind, ...points: PlanPoint[]): RuntimePlanFeature => ({ id, kind, points });
const labeledFeature = (id: string, kind: RuntimePlanFeatureKind, sourceLabel: string, ...points: PlanPoint[]): RuntimePlanFeature => ({ ...feature(id, kind, ...points), sourceLabel });
const mapSourceReference = (mapName: string, section: string) => ({
  label: `5e.tools · ${mapName}`,
  url: `https://5e.tools/adventure.html#lmop,-1,${encodeURIComponent(section.toLowerCase())},0`,
  inspectedOn: '2026-11-14',
  artCredit: 'Mike Schley',
  use: 'visual-reference-only' as const,
});

/** Hand-authored navigation regions plus a source-grid wall/door trace. No book raster is bundled; no LoS mesh is calculated. */
const AUTHORED_RUNTIME_PLANS: Readonly<Record<string, RuntimePlanGeometry>> = {
  'hideout-plan': {
    id: 'phandelver-hideout-v1', title: 'Убежище Каменных Пастей', width: 28, height: 20,
    sourceReference: mapSourceReference('Cragmaw Hideout', 'Cragmaw Hideout'),
    coordinateUnit: 'grid-cell', feetPerCell: 5, accuracy: 'editorial-area-anchors', sourceArtworkImported: false,
    paths: [
      path('stream', 'water', [12, 3], [12, 8], [12, 13], [11, 18]),
      path('approach', 'route', [4, 16], [7, 13], [10, 12], [13, 10], [15, 7], [16, 4], [21, 5], [24, 8], [25, 12]),
    ],
    areas: [
      polygon('hideout-area-1', 1, 4.3, 13.3, 6, 5, 'cragmaw-hideout'),
      polygon('hideout-area-2', 2, 11.2, 12.3, 5, 5, 'cragmaw-hideout'),
      polygon('hideout-area-3', 3, 12.1, 8.1, 5, 5, 'cragmaw-hideout'),
      polygon('hideout-area-4', 4, 9.7, 3.1, 4, 4, 'cragmaw-hideout'),
      polygon('hideout-area-5', 5, 13, 0, 4, 4, 'cragmaw-hideout'),
      polygon('hideout-area-6', 6, .6, 2.9, 5, 5, 'cragmaw-hideout'),
      polygon('hideout-area-7', 7, 20.5, 5, 5, 5, 'cragmaw-hideout'),
      polygon('hideout-area-8', 8, 22.5, 10.2, 5, 5, 'cragmaw-hideout'),
    ],
  },
  'town-plan': {
    id: 'phandelver-town-v1', title: 'Фандалин', width: 1000, height: 620,
    sourceReference: mapSourceReference('Phandalin', 'Town Description'),
    coordinateUnit: 'map-unit', scaleBar: { feet: 500, mapUnits: 380 }, accuracy: 'editorial-area-anchors', sourceArtworkImported: false,
    paths: [
      path('west-road', 'route', [20, 430], [170, 395], [300, 355], [425, 330], [560, 320], [735, 260], [925, 250]),
      path('north-road', 'route', [240, 80], [350, 170], [450, 220], [570, 270], [715, 260], [800, 180]),
      path('south-road', 'route', [320, 370], [390, 470], [500, 520], [620, 480], [700, 390]),
    ],
    areas: [
      marker('phandalin-barthen', 1, 'Припасы Бартена', 715, 162, 'barthen'),
      marker('phandalin-stonehill', 2, 'Постоялый двор Стоунхилл', 555, 285, 'stonehill'),
      marker('phandalin-lionshield', 3, 'Магазин «Львиный Щит»', 315, 420, 'lionshield'),
      marker('phandalin-alderleaf', 4, 'Ферма Олдерлиф', 652, 448, 'alderleaf'),
      marker('phandalin-sleeping-giant', 5, '«Спящий Великан»', 680, 275, 'sleeping-giant'),
      marker('phandalin-tresendar', 6, 'Тресендарское поместье', 908, 255, 'tresendar'),
    ],
  },
  'cragmaw-castle-plan': {
    id: 'phandelver-cragmaw-castle-v1', title: 'Замок Каменной Пасти', width: 28, height: 20,
    sourceReference: mapSourceReference('Cragmaw Castle', 'Cragmaw Castle'),
    coordinateUnit: 'grid-cell', feetPerCell: 5, accuracy: 'editorial-area-anchors', sourceArtworkImported: false,
    paths: [
      path('castle-corridor-west', 'route', [3, 9], [7, 9], [10, 7], [14, 8], [18, 6], [23, 7], [27, 7]),
      path('castle-corridor-south', 'route', [8, 10], [11, 12], [15, 12], [18, 10], [22, 12], [25, 15]),
    ],
    areas: [
      polygon('castle-area-1', 1, .1, 8.2, 5, 5, 'cragmaw-castle'),
      polygon('castle-area-2', 2, 4.6, 6.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-3', 3, 1.6, 4.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-3-lower', 3, 2.85, 11.95, 3.5, 3.5, 'cragmaw-castle'),
      polygon('castle-area-4', 4, 4.1, 13.2, 3, 3, 'cragmaw-castle'),
      polygon('castle-area-5', 5, 4.5, 2.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-6', 6, 1.6, 2.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-7', 7, 8.5, 9.7, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-8', 8, 9.4, 5.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-9', 9, 9.4, 1.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-10', 10, 9, 15.1, 3, 3, 'cragmaw-castle'),
      polygon('castle-area-11', 11, 13.4, 2.8, 4, 4, 'cragmaw-castle'),
      polygon('castle-area-12', 12, 17.55, 8.95, 3.5, 3.5, 'cragmaw-castle'),
      polygon('castle-area-13', 13, 16.65, 12.95, 3.5, 3.5, 'cragmaw-castle'),
      polygon('castle-area-14', 14, 20.3, 2.8, 4, 4, 'cragmaw-castle'),
    ],
  },
  'wave-echo-cave-plan': {
    id: 'phandelver-wave-echo-cave-v1', title: 'Пещера Морского Эха', width: 28, height: 38,
    sourceReference: mapSourceReference('Wave Echo Cave', 'Keyed Encounters'),
    coordinateUnit: 'grid-cell', feetPerCell: 10, accuracy: 'editorial-area-anchors', sourceArtworkImported: false,
    paths: [
      path('mine-west-route', 'route', [5.7, 30.2], [6.5, 24.5], [9.5, 22.5], [12.5, 20], [15, 19], [18, 13], [22, 8]),
      path('mine-north-route', 'route', [9, 22], [9, 16], [11, 12], [13, 7], [14, 3]),
      path('mine-east-route', 'route', [18, 12.5], [21, 15], [24.5, 16], [26, 19], [26, 24]),
      path('mine-water', 'water', [12, 2], [12, 5], [11, 8], [8, 10]),
    ],
    areas: [
      polygon('cave-area-1', 1, 3.2, 27.7, 5, 5, 'cave-room-01'),
      polygon('cave-area-2', 2, 4, 21, 5, 5, 'cave-room-02'),
      polygon('cave-area-3', 3, 11.6, 27.8, 5, 5, 'cave-room-03'),
      polygon('cave-area-4', 4, 9.6, 31.7, 4, 4, 'cave-room-04'),
      polygon('cave-area-5', 5, 15.5, 30.8, 4, 4, 'cave-room-05'),
      polygon('cave-area-6', 6, 12.2, 21.8, 4, 5, 'cave-room-06'),
      polygon('cave-area-7', 7, 16.4, 22.3, 4, 4, 'cave-room-07'),
      polygon('cave-area-8', 8, 19.3, 24.9, 5, 4, 'cave-room-08'),
      polygon('cave-area-9', 9, 11.5, 16.3, 7, 6, 'cave-room-09'),
      polygon('cave-area-10', 10, .2, 7.8, 6, 6, 'cave-room-10'),
      polygon('cave-area-11', 11, 6.1, 8.3, 6, 5, 'cave-room-11'),
      polygon('cave-area-12', 12, 15.9, 10, 5, 5, 'cave-room-12'),
      polygon('cave-area-13', 13, 21.9, 16.7, 5, 5, 'cave-room-13'),
      polygon('cave-area-14', 14, 25.5, 19.4, 2.5, 3, 'cave-room-14'),
      polygon('cave-area-15', 15, 24.5, 13.8, 3, 4, 'cave-room-15'),
      polygon('cave-area-16', 16, 20.8, 3.65, 4, 4, 'cave-room-16'),
      polygon('cave-area-17', 17, 11.9, .55, 4, 2.5, 'cave-room-17'),
      polygon('cave-area-18', 18, 7.4, 4.1, 5, 5, 'cave-room-18'),
      polygon('cave-area-19', 19, .3, 1.1, 4, 4, 'cave-room-19'),
      polygon('cave-area-20', 20, 4.45, .05, 2.5, 2.7, 'cave-room-20'),
    ],
  },
};

/** Working map extents estimated against the printed grid; square source cells are preserved in the runtime view. */
const SOURCE_GRID_EXTENTS: Readonly<Record<string, { width: number; height: number }>> = {
  'hideout-plan': { width: 28, height: 20 },
  'cragmaw-castle-plan': { width: 28, height: 20 },
  'wave-echo-cave-plan': { width: 28, height: 38 },
};

const PLAN_BARRIERS: Readonly<Record<string, readonly RuntimePlanFeature[]>> = {
  // The hideout is natural cave, not a dungeon of constructed partitions; its irregular boundary is not a wall trace.
  'hideout-plan': [],
  'cragmaw-castle-plan': [
    feature('castle-wall-west-tower-outer', 'wall', [2.1, 2.2], [1.6, 3.5], [1.8, 5.4], [3.3, 7.0], [4.7, 7.7]),
    feature('castle-wall-west-tower-inner', 'wall', [3.5, 1.8], [5.0, 2.5], [6.1, 3.2], [6.1, 6.2]),
    feature('castle-wall-west-rooms', 'wall', [4.6, 2.1], [4.6, 6.7], [6.3, 6.8], [6.3, 9.4]),
    feature('castle-wall-north-hall', 'wall', [7.3, 1.0], [7.1, 2.1], [7.1, 4.2], [8.0, 4.8], [11.4, 4.8], [11.9, 3.6], [11.4, 1.5], [10.1, 0.7], [8.1, 0.8], [7.3, 1.0]),
    feature('castle-wall-central-hall', 'wall', [6.4, 5.7], [8.3, 5.7], [8.3, 9.1], [13.2, 9.1]),
    feature('castle-wall-central-store', 'wall', [6.8, 9.6], [12.8, 9.6], [12.8, 13.4], [7.1, 13.4]),
    feature('castle-wall-southwest-tower', 'wall', [3.2, 11.1], [4.4, 11.5], [5.7, 10.7], [6.0, 9.6]),
    feature('castle-wall-southwest-room', 'wall', [4.6, 12.5], [5.9, 12.5], [6.2, 14.2], [8.9, 14.2]),
    feature('castle-wall-south-corridor', 'wall', [8.9, 14.2], [13.6, 14.2], [14.4, 15.1], [14.4, 16.0]),
    feature('castle-wall-east-rooms', 'wall', [14.7, 3.1], [14.7, 7.3], [17.0, 7.3], [17.0, 10.5], [19.4, 10.5]),
    feature('castle-wall-east-tower-north', 'wall', [19.1, 2.0], [19.1, 6.2], [20.5, 6.2], [21.4, 4.5], [21.2, 2.7], [19.9, 1.8], [19.1, 2.0]),
    feature('castle-wall-east-tower-south', 'wall', [16.0, 11.1], [17.4, 11.1], [18.4, 12.0], [18.8, 14.1], [17.9, 16.3], [16.4, 17.0]),
    feature('castle-wall-secret-approach', 'wall', [14.0, 1.2], [13.9, 2.4], [14.4, 3.8]),
    feature('castle-wall-west-approach', 'wall', [0.5, 7.2], [4.8, 7.2], [4.8, 11.6], [0.5, 11.6]),
    feature('castle-wall-central-east', 'wall', [13.3, 4.7], [15.1, 4.7], [15.1, 7.8], [17.7, 7.8]),
    feature('castle-wall-east-south-chambers', 'wall', [17.1, 10.4], [17.1, 12.1], [16.5, 12.1], [16.5, 16.4]),
    feature('castle-wall-southeast-tower', 'wall', [16.3, 16.8], [17.7, 17.9], [19.3, 17.3], [20.0, 15.6], [19.3, 13.7]),
    feature('castle-wall-southwest-entry', 'wall', [3.0, 11.6], [4.3, 12.2], [4.3, 14.5], [5.8, 15.1]),
    feature('castle-door-room-9-west', 'door', [9.2, 3.45], [9.2, 4.2]),
    feature('castle-door-west-bedroom', 'door', [5.2, 4.1], [5.2, 4.85]),
    feature('castle-door-west-crosswall', 'door', [6.35, 6.25], [7.1, 6.25]),
    feature('castle-door-west-lower', 'door', [5.2, 6.55], [5.2, 7.25]),
    feature('castle-door-approach-to-room-7', 'door', [7.7, 10.35], [8.45, 10.35]),
    feature('castle-door-central-west', 'door', [9.2, 8.55], [9.2, 9.3]),
    feature('castle-door-central-east', 'door', [13.2, 7.7], [13.2, 8.45]),
    feature('castle-door-east-hall', 'door', [18.3, 7.05], [18.3, 7.8]),
    feature('castle-door-room-14-north', 'door', [21.2, 3.45], [21.2, 4.2]),
    feature('castle-door-room-14-south', 'door', [21.2, 5.05], [21.2, 5.8]),
    feature('castle-door-east-south', 'door', [18.7, 9.45], [18.7, 10.2]),
    feature('castle-door-southwest-room', 'door', [5.2, 13.0], [5.2, 13.75]),
    feature('castle-door-south-corridor', 'door', [14.8, 14.1], [15.55, 14.1]),
    feature('castle-door-southeast-tower', 'door', [17.7, 15.8], [17.7, 16.55]),
    labeledFeature('castle-secret-door-north', 'secret-door', 'C', [15.45, 1.45], [16.25, 1.45]),
  ],
  'wave-echo-cave-plan': [
    feature('cave-wall-room-19', 'wall', [0, 0], [4.2, 0], [4.2, 5.2], [0, 5.2], [0, 0]),
    feature('cave-wall-room-20', 'wall', [4.2, 0], [6.8, 0], [6.8, 3.1], [4.2, 3.1], [4.2, 0]),
    feature('cave-wall-room-11', 'wall', [6.5, 9.4], [11.6, 9.4], [11.6, 12.8], [6.5, 12.8], [6.5, 9.4]),
    feature('cave-wall-room-15', 'wall', [23.5, 12], [27.5, 12], [27.5, 16], [23.5, 16], [23.5, 12]),
    feature('cave-wall-room-14', 'wall', [24.5, 18.8], [27.8, 18.8], [27.8, 22.5], [24.5, 22.5], [24.5, 18.8]),
    feature('cave-wall-room-6', 'wall', [11.4, 21], [15.8, 21], [15.8, 26.5], [11.4, 26.5], [11.4, 21]),
    feature('cave-wall-barrel-chamber', 'wall', [17.1, 19.6], [20, 19.6], [20, 22.2], [17.1, 22.2], [17.1, 19.6]),
    feature('cave-wall-room-4', 'wall', [9, 30.5], [13, 30.5], [13, 35.5], [9, 35.5], [9, 30.5]),
    feature('cave-wall-room-5', 'wall', [15.5, 30.5], [18.8, 30.5], [18.8, 35.5], [15.5, 35.5], [15.5, 30.5]),
    feature('cave-door-room-19-south', 'door', [1.8, 5.2], [2.6, 5.2]),
    feature('cave-door-room-20-south', 'door', [5.2, 3.1], [6, 3.1]),
    feature('cave-door-room-11-west', 'door', [6.5, 10.1], [6.5, 10.9]),
    feature('cave-door-room-11-east', 'door', [11.6, 10.1], [11.6, 10.9]),
    feature('cave-door-room-15-west', 'door', [23.5, 14.5], [23.5, 15.3]),
    feature('cave-door-room-14-west', 'door', [24.5, 20], [24.5, 20.8]),
    feature('cave-door-room-14-south', 'door', [26, 22.5], [26.8, 22.5]),
    feature('cave-door-room-6-south', 'door', [13, 26.5], [13.8, 26.5]),
    feature('cave-door-room-4-east', 'door', [13, 33.5], [13, 34.3]),
    feature('cave-door-room-5-west', 'door', [15.5, 33.5], [15.5, 34.3]),
  ],
};

const PLAN_TRACE_NOTES: Readonly<Record<string, RuntimePlanTrace>> = {
  'hideout-plan': {
    sourcePdfPage: 9, tracedOn: '2026-11-15', status: 'manual-grid-trace-v1', visibility: 'dm-only',
    note: 'Это естественная пещера; её неровные границы пока не переведены в тактическую геометрию. Символов дверей на плане нет.',
  },
  'cragmaw-castle-plan': {
    sourcePdfPage: 37, tracedOn: '2026-11-15', status: 'manual-grid-trace-v1', visibility: 'dm-only',
    note: 'Первый ручной проход по центрам линий печатной сетки. Включены основные каменные перегородки и обозначенные двери; детали разрушенных секций требуют визуальной приёмки.',
  },
  'wave-echo-cave-plan': {
    sourcePdfPage: 42, tracedOn: '2026-11-15', status: 'manual-grid-trace-v1', visibility: 'dm-only',
    note: 'Первый ручной проход по сетке: прослежены прямоугольные каменные комнаты и видимые двери; естественные границы пещер и линия видимости пока не трассированы.',
  },
};

function remapPlanToSourceGrid(geometry: RuntimePlanGeometry, width: number, height: number): RuntimePlanGeometry {
  const scaleX = width / geometry.width;
  const scaleY = height / geometry.height;
  const scalePoint = ([x, y]: PlanPoint): PlanPoint => [x * scaleX, y * scaleY];
  return {
    ...geometry,
    width,
    height,
    areas: geometry.areas.map(area => area.shape.kind === 'marker'
      ? { ...area, shape: { ...area.shape, at: scalePoint(area.shape.at), radius: area.shape.radius * Math.min(scaleX, scaleY) } }
      : { ...area, shape: { ...area.shape, points: area.shape.points.map(scalePoint) } }),
    paths: geometry.paths.map(route => ({ ...route, points: route.points.map(scalePoint) })),
  };
}

export const PHANDELVER_RUNTIME_PLANS: Readonly<Record<string, RuntimePlanGeometry>> = Object.fromEntries(
  Object.entries(AUTHORED_RUNTIME_PLANS).map(([id, authored]) => {
    const extent = SOURCE_GRID_EXTENTS[id];
    const geometry = extent ? remapPlanToSourceGrid(authored, extent.width, extent.height) : authored;
    return [id, {
      ...geometry,
      barriers: PLAN_BARRIERS[id] ?? [],
      trace: PLAN_TRACE_NOTES[id],
    }];
  }),
);

export function getRuntimePlanGeometry(node: AdventureNode, bundle: AdventureBundle): RuntimePlanGeometry | undefined {
  const reference = node.planGeometry?.runtimeGeometry;
  if (!reference) return undefined;
  const geometry = PHANDELVER_RUNTIME_PLANS[node.id];
  if (!geometry || geometry.id !== reference.id || geometry.sourceArtworkImported !== false || geometry.accuracy !== 'editorial-area-anchors') {
    throw new Error(`runtime-геометрия плана ${node.id} не прошла сверку`);
  }
  const calibration = node.planGeometry?.calibration;
  if (geometry.coordinateUnit === 'grid-cell' && (!geometry.feetPerCell || calibration?.kind !== 'grid' || calibration.feetPerCell !== geometry.feetPerCell)) {
    throw new Error(`шаг сетки runtime-плана ${node.id} расходится с источником`);
  }
  if (geometry.coordinateUnit === 'map-unit' && (!geometry.scaleBar || calibration?.kind !== 'scale-bar' || geometry.scaleBar.feet !== calibration.feetMarks.at(-1))) {
    throw new Error(`шкала runtime-плана ${node.id} расходится с источником`);
  }
  const nodeIds = new Set(bundle.nodes.map(item => item.id));
  const areaIds = new Set<string>();
  for (const area of geometry.areas) {
    if (areaIds.has(area.id)) throw new Error(`повтор области плана ${area.id}`);
    areaIds.add(area.id);
    const points = area.shape.kind === 'marker' ? [area.shape.at] : area.shape.points;
    if (points.length < (area.shape.kind === 'marker' ? 1 : 3) || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > geometry.width || y > geometry.height)) {
      throw new Error(`координаты области ${area.id} вне плана`);
    }
    if (area.targetNodeId) {
      const target = bundle.nodes.find(item => item.id === area.targetNodeId);
      if (!nodeIds.has(area.targetNodeId) || target?.kind !== 'location') throw new Error(`область ${area.id} должна ссылаться на место графа`);
    }
  }
  for (const route of geometry.paths) if (route.points.length < 2 || route.points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > geometry.width || y > geometry.height)) {
    throw new Error(`некорректный путь ${route.id}`);
  }
  const barrierIds = new Set<string>();
  for (const barrier of geometry.barriers ?? []) {
    if (barrierIds.has(barrier.id)) throw new Error(`повтор элемента стены/двери ${barrier.id}`);
    barrierIds.add(barrier.id);
    if (barrier.points.length < 2 || barrier.points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > geometry.width || y > geometry.height)) {
      throw new Error(`координаты элемента стены/двери ${barrier.id} вне плана`);
    }
    if (barrier.kind.endsWith('door') && barrier.points.length !== 2) throw new Error(`дверной проём ${barrier.id} должен быть отрезком`);
  }
  if (geometry.trace && (!geometry.sourceReference || geometry.trace.visibility !== 'dm-only' || geometry.trace.status !== 'manual-grid-trace-v1')) {
    throw new Error(`неполная трассировка плана ${geometry.id}`);
  }
  return geometry;
}
