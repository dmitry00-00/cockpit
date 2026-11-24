import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { exteriorDoorGeometry, exteriorDoorSides, generateSettlementDraft, parseSettlementDraft, validateSettlementDraft, type DraftBridge, type DraftBuilding, type DraftPoint, type DraftReliefContour, type DraftWall, type ExteriorDoorSide, type SettlementDraft } from './settlementDraft';
import { settlementDraftToUvtt } from './settlementUvtt';
import { settlementPlanPng } from './settlementRender';
import { parseWatabouMfcgCity, type MfcgGeometry, type WatabouMfcgCity } from './watabouMfcg';

export interface SettlementPlanViewProps {
  readonly draft: SettlementDraft;
  readonly accepted: boolean;
  readonly onAccept?: (draft: SettlementDraft) => void;
  readonly onClose: () => void;
  readonly canonicalLabel?: string;
}

type BridgeForm = { id: string | null; waterFeatureId: string; ax: string; ay: string; bx: string; by: string; widthFeet: string };

function parsePointPolyline(raw: string): DraftPoint[] | null {
  const parsed = raw.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const match = part.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  });
  return parsed.length >= 2 && parsed.every(point => point !== null) ? parsed as DraftPoint[] : null;
}

function pointAtPolylineMidpoint(points: readonly DraftPoint[]): DraftPoint {
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const half = lengths.reduce((sum, length) => sum + length, 0) / 2;
  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    const length = lengths[index - 1];
    if (travelled + length >= half) {
      const t = length === 0 ? 0 : (half - travelled) / length;
      return { x: points[index - 1].x + (points[index].x - points[index - 1].x) * t, y: points[index - 1].y + (points[index].y - points[index - 1].y) * t };
    }
    travelled += length;
  }
  return points[0];
}

const styles = `
.settlement-plan{box-sizing:border-box;--settlement-ink:var(--tx,#e6dccb);--settlement-muted:var(--t2,#a89b86);--settlement-panel:var(--pn,#1e1626);--settlement-card:var(--cd,#2a2030);--settlement-plate:var(--pl,#3a2820);--settlement-bronze:var(--br,#8b6b3a);--settlement-gold:var(--gd,#d8a94a);color:var(--settlement-ink);background:var(--settlement-panel);border:1px solid var(--settlement-bronze);padding:clamp(12px,2vw,24px);font-family:var(--font-text,'PT Sans',sans-serif);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;height:100%;min-height:0;gap:14px;overflow:hidden;box-shadow:0 10px 28px #0008}
.settlement-plan__field{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--settlement-muted)}.settlement-plan__field input,.settlement-plan__field select,.settlement-plan__field textarea{width:100%;min-height:36px;padding:6px 8px;color:var(--settlement-ink);background:#171319;border:1px solid var(--settlement-bronze);font:inherit}.settlement-plan__field textarea{min-height:72px;resize:vertical}.settlement-plan__doors{display:flex;flex-direction:column;gap:7px;border:1px solid var(--settlement-bronze);padding:8px}.settlement-plan__doors legend{padding:0 5px;color:var(--settlement-muted);font-size:13px}.settlement-plan__doors label{display:flex;align-items:center;gap:8px;font-size:13px}.settlement-plan__doors input{accent-color:var(--settlement-gold)}
.settlement-plan__rooms{display:flex;flex-direction:column;gap:7px}.settlement-plan__rooms h4{margin:0;font-size:13px;font-weight:500;color:var(--settlement-muted)}
.settlement-plan__geometry{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;border:1px solid var(--settlement-bronze);padding:8px}.settlement-plan__geometry legend{padding:0 5px;color:var(--settlement-muted);font-size:13px}
.settlement-plan__generation{margin-top:8px}.settlement-plan__generation summary{color:var(--settlement-ink);cursor:pointer}.settlement-plan__generation-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(150px,1fr) minmax(150px,1fr);gap:8px;margin-top:8px;align-items:end}.settlement-plan__generation-note{font-size:12px;margin:6px 0}@media(min-width:761px){.settlement-plan__generation[open]{max-height:min(24vh,180px);overflow:auto;overscroll-behavior:contain}.settlement-plan__generation[open] summary{position:sticky;top:0;background:var(--settlement-panel);z-index:1;padding:3px 0}}@media(max-width:760px){.settlement-plan__generation-grid{grid-template-columns:1fr}}
.settlement-plan__mfcg-import{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0;color:var(--settlement-muted);font-size:12px}.settlement-plan__mfcg-import span{flex:1;min-width:160px;overflow-wrap:anywhere}.settlement-plan__mfcg-import button{font-size:12px;padding:6px 9px}
.settlement-plan *{box-sizing:border-box}.settlement-plan__head,.settlement-plan__controls,.settlement-plan__meta,.settlement-plan__footer{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.settlement-plan__head>div:first-child{min-width:0;flex:1}.settlement-plan__controls{font-size:13px}.settlement-plan__stamp span:last-child{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.settlement-plan__head{justify-content:space-between;border-bottom:1px solid var(--settlement-bronze);padding-bottom:10px}.settlement-plan h2,.settlement-plan h3{font-family:var(--font-display,Forum,serif);font-weight:500;margin:0}.settlement-plan h2{font-size:20px}.settlement-plan h3{font-size:20px}.settlement-plan__stamp{display:flex;gap:7px;flex-wrap:wrap;color:var(--settlement-muted);font-size:13px;overflow-wrap:anywhere;min-width:0}.settlement-plan__stamp span{border-left:2px solid var(--settlement-bronze);padding:3px 8px}.settlement-plan button,.settlement-plan a{font:inherit;color:var(--settlement-ink);background:linear-gradient(180deg,#ffffff0a,#0003),var(--settlement-plate);border:1px solid var(--settlement-bronze);border-radius:0;padding:8px 12px;cursor:pointer;text-decoration:none}.settlement-plan button:hover,.settlement-plan a:hover{border-color:var(--settlement-gold);filter:brightness(1.1)}.settlement-plan button:focus-visible,.settlement-plan a:focus-visible,.settlement-plan [role=button]:focus-visible{outline:3px solid var(--settlement-gold);outline-offset:2px}.settlement-plan button[aria-pressed=true]{box-shadow:inset 0 0 0 1px var(--settlement-gold);color:var(--settlement-gold)}.settlement-plan button:disabled{opacity:.55;cursor:default}.settlement-plan__stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,280px);gap:14px;min-height:0}.settlement-plan__map{width:100%;height:100%;min-height:0;background:#171319;border:1px solid #0d080c;box-shadow:inset 0 0 24px #0009}.settlement-plan__map svg{display:block;width:100%;height:100%}.settlement-plan__side{background:var(--settlement-card);padding:12px;display:flex;flex-direction:column;min-height:0;gap:9px;overflow:auto}.settlement-plan__building{width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center}.settlement-plan__building small{color:var(--settlement-muted)}.settlement-plan__notice{border-left:3px solid var(--settlement-gold);padding:8px 10px;background:#0002;color:var(--settlement-muted);line-height:1.4}.settlement-plan__footer{justify-content:space-between;border-top:1px solid #0d080c;padding-top:10px}.settlement-plan__error{color:#e6897a}.settlement-plan__status{border-left:3px solid var(--settlement-gold);padding:6px 9px;background:#0002;color:var(--settlement-ink)}.settlement-plan .plan-land{fill:#c7b58d}.settlement-plan .plan-water{fill:#477f98;stroke:#b5d0d3;stroke-width:2}.settlement-plan .plan-street{stroke:#857b65;stroke-width:34;fill:none;stroke-linecap:round}.settlement-plan .plan-block{fill:#8d7354;stroke:#30262d;stroke-width:4}.settlement-plan .plan-room{fill:#d8c9a8;stroke:#4a3839;stroke-width:3}.settlement-plan .plan-door{stroke:#d8a94a;stroke-width:6;stroke-linecap:round}.settlement-plan .plan-label{fill:#30262d;font:16px var(--font-text,'PT Sans',sans-serif);pointer-events:none}.settlement-plan .plan-room-label{fill:#47373a;font:3.5px var(--font-text,'PT Sans',sans-serif);pointer-events:none}.settlement-plan .plan-grid{fill:url(#settlement-grid)}.settlement-plan .plan-grid-line{stroke:#554845;stroke-width:.45;opacity:.55}.settlement-plan .plan-selected{filter:drop-shadow(0 0 7px #d8a94a)}@media(max-width:760px){.settlement-plan{height:auto;min-height:100%;grid-template-rows:auto auto auto auto;overflow:visible}.settlement-plan__stage{grid-template-columns:1fr;grid-template-rows:minmax(280px,48vh) minmax(180px,260px);min-height:0}.settlement-plan__map{height:48vh;min-height:280px}.settlement-plan__side{height:auto;min-height:180px;max-height:260px;overflow:auto}}@media(prefers-reduced-motion:reduce){.settlement-plan *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;

const points = (outline: readonly DraftPoint[]) => outline.map(p => `${p.x},${p.y}`).join(' ');
const mfcgPoints = (outline: readonly (readonly [number, number])[]) => outline.map(([x, y]) => `${x},${y}`).join(' ');
const mfcgPath = (geometry: Extract<MfcgGeometry, { type: 'Polygon' }>) => geometry.coordinates
  .map(ring => `${mfcgPoints(ring)} Z`).map(path => `M ${path}`).join(' ');
const MFCG_LAYER_LABEL: Record<string, string> = {
  earth: 'Суша', roads: 'Улицы', walls: 'Стены', rivers: 'Реки', planks: 'Мосты', buildings: 'Здания',
  prisms: 'Башни', squares: 'Площади', greens: 'Зелёные зоны', fields: 'Поля', trees: 'Деревья', districts: 'Районы', water: 'Вода',
};
const mfcgLayerColor = (id: string) => ({
  earth: '#776f4d', roads: '#d6bd8a', walls: '#382a32', rivers: '#7ab0bd', planks: '#9c7544', buildings: '#cfb78c',
  prisms: '#614747', squares: '#c4a872', greens: '#4d7552', fields: '#859052', trees: '#365b3b', districts: '#f0d69b', water: '#477f98',
}[id] ?? '#e6dccb');
function mfcgViewBox(city: WatabouMfcgCity) {
  const { minX, minY, maxX, maxY } = city.bounds;
  const width = Math.max(maxX - minX, 1); const height = Math.max(maxY - minY, 1);
  const pad = Math.max(width, height) * .025;
  return `${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`;
}
const patternLabel = (pattern?: string) => pattern === 'linear' ? 'линейная' : pattern === 'compact' ? 'компактная' : pattern === 'grid' ? 'сетка' : 'исходная';
function buildingBounds(building: DraftBuilding) {
  const xs = building.outline.map(p => p.x); const ys = building.outline.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function userFacingGeometryError(message: string): string {
  if (message === 'overlapping rooms') return 'Комнаты пересекаются.';
  if (message === 'overlapping buildings') return 'Здания пересекаются.';
  if (message === 'rooms must cover building interior') return 'Комнаты должны полностью покрывать внутреннюю площадь здания.';
  if (message === 'room doors must form a connected graph') return 'Внутренние двери должны соединять все комнаты.';
  if (message === 'each building must have at least one exterior door') return 'У здания должна остаться хотя бы одна наружная дверь.';
  if (message.includes('outside building')) return 'Комната выходит за границы здания.';
  if (message.includes('exterior door must join')) return 'Наружная дверь должна соединять комнату с внешней стеной здания.';
  if (message.includes('internal door must join')) return 'Внутренняя дверь должна соединять соседние комнаты.';
  if (message.includes('walls[') && message.includes('outside bounds')) return 'Точка авторской стены выходит за границы плана.';
  if (message.includes('walls[') && message.includes('non-zero length')) return 'Соседние точки стены должны отличаться.';
  if (message.includes('wall segment limit')) return 'Превышен предел числа сегментов авторских стен.';
  if (message.includes('reliefContours[') && message.includes('outside bounds')) return 'Точка горизонтали выходит за границы плана.';
  if (message.includes('reliefContours[') && message.includes('non-zero length')) return 'Соседние точки горизонтали должны отличаться.';
  if (message.includes('reliefContours[') && message.includes('elevation')) return 'Отметка горизонтали должна быть целым числом футов от −100 000 до 100 000.';
  if (message.includes('relief contour segment limit')) return 'Превышен предел числа сегментов горизонталей.';
  return 'Геометрия плана некорректна. Проверьте рельеф, стены, комнаты, двери и границы зданий.';
}
function outlineBounds(outline: readonly DraftPoint[]) {
  const xs = outline.map(p => p.x); const ys = outline.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
const rectPoints = (x: number, y: number, width: number, height: number): DraftPoint[] => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }, { x, y },
];
function roomsCanMerge(first: DraftPoint[], second: DraftPoint[]) {
  const a = outlineBounds(first); const b = outlineBounds(second);
  return (a.y === b.y && a.height === b.height && (a.x + a.width === b.x || b.x + b.width === a.x))
    || (a.x === b.x && a.width === b.width && (a.y + a.height === b.y || b.y + b.height === a.y));
}

export function SettlementPlanView({ draft: draftValue, accepted, onAccept, onClose, canonicalLabel }: SettlementPlanViewProps) {
  const draft = useMemo(() => parseSettlementDraft(draftValue), [draftValue]);
  const [editedDraft, setEditedDraft] = useState<SettlementDraft>(() => JSON.parse(JSON.stringify(draft)) as SettlementDraft);
  const [baseDraft, setBaseDraft] = useState<SettlementDraft>(draft as SettlementDraft);
  const [generationDescription, setGenerationDescription] = useState(draft.generationProfile?.description ?? '');
  const [generationPopulation, setGenerationPopulation] = useState(draft.generationProfile?.population == null ? '' : String(draft.generationProfile.population));
  const [generationPattern, setGenerationPattern] = useState<'auto' | 'grid' | 'linear' | 'compact'>('auto');
  const [generationOpen, setGenerationOpen] = useState(false);
  const [watabouCity, setWatabouCity] = useState<WatabouMfcgCity | null>(null);
  const [watabouFileName, setWatabouFileName] = useState('');
  const [watabouError, setWatabouError] = useState('');
  const [showWatabou, setShowWatabou] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [doorRoomAId, setDoorRoomAId] = useState('');
  const [doorRoomBId, setDoorRoomBId] = useState('');
  const [exteriorRoomId, setExteriorRoomId] = useState('');
  const [exteriorSide, setExteriorSide] = useState<ExteriorDoorSide>('south');
  const [mergeRoomId, setMergeRoomId] = useState('');
  const [mergeError, setMergeError] = useState('');
  const [streetDrafts, setStreetDrafts] = useState<Record<number, string>>({});
  const [streetError, setStreetError] = useState('');
  const [wallDrafts, setWallDrafts] = useState<Record<string, string>>({});
  const [newWallPoints, setNewWallPoints] = useState('');
  const [wallError, setWallError] = useState('');
  const [wallStatus, setWallStatus] = useState('');
  const [reliefDrafts, setReliefDrafts] = useState<Record<string, string>>({});
  const [reliefElevationDrafts, setReliefElevationDrafts] = useState<Record<string, string>>({});
  const [newReliefPoints, setNewReliefPoints] = useState('');
  const [newReliefElevation, setNewReliefElevation] = useState('100');
  const [reliefError, setReliefError] = useState('');
  const [reliefStatus, setReliefStatus] = useState('');
  const [bridgeForm, setBridgeForm] = useState<BridgeForm | null>(null);
  const [bridgeError, setBridgeError] = useState('');
  const [buildingError, setBuildingError] = useState('');
  const [landmarkName, setLandmarkName] = useState('');
  const [landmarkX, setLandmarkX] = useState('');
  const [landmarkY, setLandmarkY] = useState('');
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');
  const gridId = `settlement-grid-${useId().replace(/:/g, '')}`;
  const exportUrlRef = useRef<string | null>(null);
  const selected = selectedId ? editedDraft.buildings.find(building => building.id === selectedId) ?? null : null;
  const box = selected ? buildingBounds(selected) : null;
  const selectedRoom = selected?.rooms.find(room => room.id === selectedRoomId) ?? selected?.rooms[0] ?? null;
  const selectedDoor = selected?.doors.find(door => door.id === selectedDoorId) ?? selected?.doors[0] ?? null;
  const routeWaterFeatures = (editedDraft.waterFeatures ?? []).filter(feature => feature.kind === 'river' && feature.route && feature.route.length >= 2);
  const edgeWaterFeatures = (editedDraft.waterFeatures ?? []).filter(feature => !feature.route && feature.side !== null);
  const exteriorRooms = selected?.rooms.map(room => ({ room, sides: exteriorDoorSides(selected, room.id) })).filter(item => item.sides.length) ?? [];
  const selectedExteriorRoomId = exteriorRooms.some(item => item.room.id === exteriorRoomId) ? exteriorRoomId : exteriorRooms[0]?.room.id ?? '';
  const selectedExteriorRoom = selected?.rooms.find(room => room.id === selectedExteriorRoomId) ?? null;
  const selectedExteriorSides = selectedExteriorRoom && selected ? exteriorDoorSides(selected, selectedExteriorRoom.id) : [];
  const selectedExteriorSide = selectedExteriorSides.includes(exteriorSide) ? exteriorSide : selectedExteriorSides[0] ?? 'south';
  const selectedDoorRoomA = selected?.rooms.some(room => room.id === doorRoomAId) ? doorRoomAId : selected?.rooms[0]?.id ?? '';
  const selectedDoorRoomB = selected?.rooms.some(room => room.id === doorRoomBId) ? doorRoomBId : selected?.rooms[1]?.id ?? selected?.rooms[0]?.id ?? '';
  const mergeCandidates = selected && selectedRoom ? selected.rooms.filter(room => room.id !== selectedRoom.id && roomsCanMerge(selectedRoom.outline, room.outline)) : [];
  const selectedMergeRoomId = mergeCandidates.some(room => room.id === mergeRoomId) ? mergeRoomId : mergeCandidates[0]?.id ?? '';
  const editedDraftSnapshot = JSON.stringify(editedDraft);
  const hasEdits = JSON.stringify(baseDraft) !== editedDraftSnapshot;
  let draftValid = true;
  let validationMessage = '';
  try { validateSettlementDraft(editedDraft); } catch (error) {
    draftValid = false;
    validationMessage = userFacingGeometryError(error instanceof Error ? error.message : 'invalid draft');
  }

  useEffect(() => {
    setBaseDraft(draft as SettlementDraft);
    setEditedDraft(JSON.parse(JSON.stringify(draft)) as SettlementDraft);
    setGenerationDescription(draft.generationProfile?.description ?? '');
    setGenerationPopulation(draft.generationProfile?.population == null ? '' : String(draft.generationProfile.population));
    setGenerationPattern('auto');
    setWallDrafts({}); setNewWallPoints(''); setWallError('');
    setReliefDrafts({}); setReliefElevationDrafts({}); setNewReliefPoints(''); setNewReliefElevation('100'); setReliefError(''); setReliefStatus('');
  }, [draft]);

  const regenerate = () => {
    if (hasEdits && !window.confirm('Перегенерировать план и заменить текущие правки?')) return;
    const population = generationPopulation.trim() === '' ? null : Number(generationPopulation);
    try {
      const next = generateSettlementDraft({
        placeId: editedDraft.placeId, seed: editedDraft.seed, description: generationDescription.trim(), population, pattern: generationPattern,
      }) as SettlementDraft;
      setBaseDraft(next); setEditedDraft(JSON.parse(JSON.stringify(next)) as SettlementDraft);
      setSelectedId(null); setSelectedRoomId(null); setSelectedDoorId(null);
      setShowWatabou(false);
      setWallDrafts({}); setNewWallPoints(''); setWallError('');
      setReliefDrafts({}); setReliefElevationDrafts({}); setNewReliefPoints(''); setNewReliefElevation('100'); setReliefError(''); setReliefStatus('');
      setExportUrl(null); setExportError(''); setBuildingError('');
    } catch (error) {
      setBuildingError(error instanceof Error ? error.message : 'Проверьте описание и население.');
    }
  };

  const importWatabouFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setWatabouCity(null); setWatabouFileName(''); setShowWatabou(false); setWatabouError('Файл больше 2 МБ.');
      return;
    }
    try {
      const city = parseWatabouMfcgCity(await file.text());
      setWatabouCity(city); setWatabouFileName(file.name); setWatabouError(''); setShowWatabou(true);
      setGenerationOpen(false);
      setSelectedId(null);
    } catch (error) {
      setWatabouCity(null); setWatabouFileName(''); setShowWatabou(false);
      setWatabouError(error instanceof Error ? error.message : 'Не удалось прочитать JSON MFCG.');
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  useEffect(() => () => {
    if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
  }, []);

  const prepareExport = () => {
    try {
      const uvtt = settlementDraftToUvtt(editedDraft, settlementPlanPng(editedDraft));
      const url = URL.createObjectURL(new Blob([JSON.stringify(uvtt, null, 2)], { type: 'application/json' }));
      if (exportUrlRef.current) URL.revokeObjectURL(exportUrlRef.current);
      exportUrlRef.current = url; setExportUrl(url); setExportSnapshot(editedDraftSnapshot); setExportError('');
    } catch (error) {
      setExportSnapshot(null);
      setExportError(userFacingGeometryError(error instanceof Error ? error.message : 'invalid draft'));
    }
  };

  const renameBuilding = (buildingId: string, name: string) => {
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => building.id === buildingId ? { ...building, name } : building) }));
  };
  const addBuilding = () => {
    if (editedDraft.buildings.length >= 128) { setBuildingError('Достигнут предел в 128 зданий.'); return; }
    const template = draft.buildings[0];
    const size = buildingBounds(template);
    let spot: { x: number; y: number } | undefined;
    for (let y = 0; y + size.height <= editedDraft.bounds.height && !spot; y += 5) {
      for (let x = 0; x + size.width <= editedDraft.bounds.width; x += 5) {
        const overlaps = editedDraft.buildings.some(building => {
          const current = buildingBounds(building);
          return x < current.x + current.width && current.x < x + size.width && y < current.y + current.height && current.y < y + size.height;
        });
        if (!overlaps) { spot = { x, y }; break; }
      }
    }
    if (!spot) { setBuildingError('На плане нет свободного участка подходящего размера. Измените размер или положение существующих зданий.'); return; }
    let suffix = 1;
    while (editedDraft.buildings.some(building => building.id === `building-${String(suffix).padStart(2, '0')}`)) suffix++;
    const id = `building-${String(suffix).padStart(2, '0')}`;
    const roomIds = new Map(template.rooms.map((room, index) => [room.id, `${id}-room-${String(index + 1).padStart(2, '0')}`]));
    const move = (point: DraftPoint): DraftPoint => ({ x: point.x - size.x + spot!.x, y: point.y - size.y + spot!.y });
    const building: DraftBuilding = {
      id, name: `Новое здание ${String(suffix).padStart(2, '0')}`,
      outline: template.outline.map(move),
      rooms: template.rooms.map((room, index) => ({ ...room, id: roomIds.get(room.id)!, outline: room.outline.map(move), name: `Комната ${String(index + 1).padStart(2, '0')}` })),
      doors: template.doors.map((door, index) => ({
        ...door, id: `${id}-door-${String(index + 1).padStart(2, '0')}`, a: move(door.a), b: move(door.b),
        connects: door.connects.map(roomId => roomId === 'outside' ? roomId : roomIds.get(roomId) ?? roomId) as [string, string],
      })),
    };
    setEditedDraft(current => ({ ...current, buildings: [...current.buildings, building] }));
    setSelectedId(id); setSelectedRoomId(building.rooms[0]?.id ?? null); setSelectedDoorId(null); setBuildingError('');
  };
  const removeBuilding = (buildingId: string) => {
    if (editedDraft.buildings.length <= 1) return;
    setEditedDraft(current => ({ ...current, buildings: current.buildings.filter(building => building.id !== buildingId) }));
    setSelectedId(null); setBuildingError('');
  };
  const renameRoom = (buildingId: string, roomId: string, name: string) => {
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => building.id === buildingId
      ? { ...building, rooms: building.rooms.map(room => room.id === roomId ? { ...room, name } : room) }
      : building) }));
  };
  const splitRoom = (buildingId: string, roomId: string) => {
    const building = editedDraft.buildings.find(item => item.id === buildingId);
    const room = building?.rooms.find(item => item.id === roomId);
    if (!building || !room || building.rooms.length >= 64 || building.doors.length >= 128) return;
    const bounds = outlineBounds(room.outline);
    const splitVertically = bounds.width >= bounds.height && bounds.width >= 2;
    const splitHorizontally = !splitVertically && bounds.height >= 2;
    if (!splitVertically && !splitHorizontally) return;
    let suffix = 1;
    while (building.rooms.some(item => item.id === `${roomId}-split-${suffix}`)) suffix++;
    let doorSuffix = 1;
    while (building.doors.some(item => item.id === `${roomId}-split-door-${doorSuffix}`)) doorSuffix++;
    const newRoomId = `${roomId}-split-${suffix}`;
    let first: DraftPoint[]; let second: DraftPoint[]; let a: DraftPoint; let b: DraftPoint;
    if (splitVertically) {
      const leftWidth = Math.floor(bounds.width / 2);
      first = rectPoints(bounds.x, bounds.y, leftWidth, bounds.height);
      second = rectPoints(bounds.x + leftWidth, bounds.y, bounds.width - leftWidth, bounds.height);
      const span = Math.min(5, bounds.height); const start = bounds.y + (bounds.height - span) / 2;
      a = { x: bounds.x + leftWidth, y: start };
      b = { x: bounds.x + leftWidth, y: start + span };
    } else {
      const topHeight = Math.floor(bounds.height / 2);
      first = rectPoints(bounds.x, bounds.y, bounds.width, topHeight);
      second = rectPoints(bounds.x, bounds.y + topHeight, bounds.width, bounds.height - topHeight);
      const span = Math.min(5, bounds.width); const start = bounds.x + (bounds.width - span) / 2;
      a = { x: start, y: bounds.y + topHeight };
      b = { x: start + span, y: bounds.y + topHeight };
    }
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(item => item.id !== buildingId ? item : {
      ...item,
      rooms: item.rooms.flatMap(existing => existing.id === roomId
        ? [{ ...existing, outline: first }, { id: newRoomId, name: `Комната ${String(item.rooms.length + 1).padStart(2, '0')}`, outline: second }]
        : [existing]),
      doors: [...item.doors, { id: `${roomId}-split-door-${doorSuffix}`, a, b, open: false, connects: [roomId, newRoomId] as [string, string] }],
    }) }));
    setSelectedRoomId(newRoomId);
  };
  const mergeRooms = (buildingId: string, keepId: string, removeId: string) => {
    const building = editedDraft.buildings.find(item => item.id === buildingId);
    const keep = building?.rooms.find(room => room.id === keepId);
    const remove = building?.rooms.find(room => room.id === removeId);
    if (!building || !keep || !remove || !roomsCanMerge(keep.outline, remove.outline)) return;
    const a = outlineBounds(keep.outline); const b = outlineBounds(remove.outline);
    const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
    const width = Math.max(a.x + a.width, b.x + b.width) - x;
    const height = Math.max(a.y + a.height, b.y + b.height) - y;
    const outline = rectPoints(x, y, width, height);
    const onBoundary = (door: DraftBuilding['doors'][number]) => {
      const vertical = door.a.x === door.b.x && (door.a.x === x || door.a.x === x + width)
        && Math.min(door.a.y, door.b.y) >= y && Math.max(door.a.y, door.b.y) <= y + height;
      const horizontal = door.a.y === door.b.y && (door.a.y === y || door.a.y === y + height)
        && Math.min(door.a.x, door.b.x) >= x && Math.max(door.a.x, door.b.x) <= x + width;
      return vertical || horizontal;
    };
    const rooms = building.rooms.flatMap(room => room.id === removeId ? [] : room.id === keepId ? [{ ...room, outline }] : [room]);
    const doors = building.doors.flatMap(door => {
      if (door.connects.includes(keepId) && door.connects.includes(removeId)) return [];
      const connects = door.connects.map(id => id === removeId ? keepId : id) as [string, string];
      if (connects.includes(keepId) && !onBoundary(door)) return [];
      return [{ ...door, connects }];
    });
    const nextBuilding = { ...building, rooms, doors };
    const next: SettlementDraft = { ...editedDraft, buildings: editedDraft.buildings.map(item => item.id === buildingId ? nextBuilding : item) };
    try { validateSettlementDraft(next); }
    catch (error) {
      setMergeError(error instanceof Error ? `Комнаты нельзя объединить: ${error.message}` : 'Комнаты нельзя объединить: проверьте геометрию дверей.');
      return;
    }
    setEditedDraft(next); setSelectedRoomId(keepId); setSelectedDoorId(null); setMergeError('');
  };
  const roomLabel = (room: DraftBuilding['rooms'][number], index: number) => room.name?.trim() || `Комната ${String(index + 1).padStart(2, '0')}`;
  const transformBuilding = (buildingId: string, patch: { x?: number; y?: number; width?: number; height?: number }) => {
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => {
      if (building.id !== buildingId) return building;
      const old = buildingBounds(building);
      const width = Math.max(1, Math.min(current.bounds.width, Math.round(patch.width ?? old.width)));
      const height = Math.max(1, Math.min(current.bounds.height, Math.round(patch.height ?? old.height)));
      const x = Math.max(0, Math.min(current.bounds.width - width, Math.round(patch.x ?? old.x)));
      const y = Math.max(0, Math.min(current.bounds.height - height, Math.round(patch.y ?? old.y)));
      const mapPoint = (point: DraftPoint): DraftPoint => ({
        x: Math.round(x + ((point.x - old.x) / old.width) * width),
        y: Math.round(y + ((point.y - old.y) / old.height) * height),
      });
      return {
        ...building,
        outline: building.outline.map(mapPoint),
        rooms: building.rooms.map(room => ({ ...room, outline: room.outline.map(mapPoint) })),
        doors: building.doors.map(door => ({ ...door, a: mapPoint(door.a), b: mapPoint(door.b) })),
      };
    }) }));
  };
  const setGeometryField = (buildingId: string, key: 'x' | 'y' | 'width' | 'height', value: string) => {
    if (value === '') return;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) transformBuilding(buildingId, { [key]: numericValue });
  };
  const setDoorOpen = (buildingId: string, doorId: string, open: boolean) => {
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => building.id === buildingId
      ? { ...building, doors: building.doors.map(door => door.id === doorId ? { ...door, open } : door) }
      : building) }));
  };
  const setRoomGeometry = (buildingId: string, roomId: string, key: 'x' | 'y' | 'width' | 'height', value: string) => {
    if (value === '') return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => {
      if (building.id !== buildingId) return building;
      const room = building.rooms.find(item => item.id === roomId);
      if (!room) return building;
      const parent = buildingBounds(building);
      const old = outlineBounds(room.outline);
      const width = Math.max(1, Math.min(parent.width, Math.round(key === 'width' ? numeric : old.width)));
      const height = Math.max(1, Math.min(parent.height, Math.round(key === 'height' ? numeric : old.height)));
      const x = Math.max(parent.x, Math.min(parent.x + parent.width - width, Math.round(key === 'x' ? numeric : old.x)));
      const y = Math.max(parent.y, Math.min(parent.y + parent.height - height, Math.round(key === 'y' ? numeric : old.y)));
      return { ...building, rooms: building.rooms.map(item => item.id === roomId ? { ...item, outline: rectPoints(x, y, width, height) } : item) };
    }) }));
  };
  const setDoorPoint = (buildingId: string, doorId: string, end: 'a' | 'b', axis: 'x' | 'y', value: string) => {
    if (value === '') return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => building.id === buildingId
      ? { ...building, doors: building.doors.map(door => door.id === doorId ? { ...door, [end]: { ...door[end], [axis]: Math.round(numeric) } } : door) }
      : building) }));
  };
  const setDoorConnection = (buildingId: string, doorId: string, end: 0 | 1, roomId: string) => {
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(building => building.id === buildingId
      ? { ...building, doors: building.doors.map(door => {
        if (door.id !== doorId) return door;
        const connects: [string, string] = [...door.connects]; connects[end] = roomId;
        return { ...door, connects };
      }) }
      : building) }));
  };
  const moveExteriorDoor = (buildingId: string, roomId: string, side: ExteriorDoorSide) => {
    const building = editedDraft.buildings.find(item => item.id === buildingId);
    const exteriorDoor = building?.doors.find(door => door.connects.includes('outside'));
    const geometry = building && exteriorDoorGeometry(building, roomId, side);
    if (!building || !exteriorDoor || !geometry) return;
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(item => item.id === buildingId
      ? { ...item, doors: item.doors.map(door => door.id === exteriorDoor.id
        ? { ...door, ...geometry, connects: [roomId, 'outside'] }
        : door) }
      : item) }));
    setSelectedDoorId(exteriorDoor.id);
  };
  const addExteriorDoor = (buildingId: string, roomId: string, side: ExteriorDoorSide) => {
    const building = editedDraft.buildings.find(item => item.id === buildingId);
    const geometry = building && exteriorDoorGeometry(building, roomId, side);
    if (!building || !geometry || building.doors.length >= 128) return;
    let suffix = 1;
    while (building.doors.some(door => door.id === `${buildingId}-door-exterior-manual-${suffix}`)) suffix++;
    const door = { id: `${buildingId}-door-exterior-manual-${suffix}`, ...geometry, open: false, connects: [roomId, 'outside'] as [string, string] };
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(item => item.id === buildingId
      ? { ...item, doors: [...item.doors, door] }
      : item) }));
    setSelectedDoorId(door.id);
  };
  const addInteriorDoor = (buildingId: string, roomAId: string, roomBId: string) => {
    const building = editedDraft.buildings.find(item => item.id === buildingId);
    const roomA = building?.rooms.find(room => room.id === roomAId);
    const roomB = building?.rooms.find(room => room.id === roomBId);
    if (!building || !roomA || !roomB || roomAId === roomBId || building.doors.length >= 128) return;
    const aBox = outlineBounds(roomA.outline); const bBox = outlineBounds(roomB.outline);
    let a: DraftPoint; let b: DraftPoint;
    const verticalOverlap = Math.min(aBox.y + aBox.height, bBox.y + bBox.height) - Math.max(aBox.y, bBox.y);
    const horizontalOverlap = Math.min(aBox.x + aBox.width, bBox.x + bBox.width) - Math.max(aBox.x, bBox.x);
    if ((aBox.x + aBox.width === bBox.x || bBox.x + bBox.width === aBox.x) && verticalOverlap > 0) {
      const span = Math.min(5, verticalOverlap); const start = Math.max(aBox.y, bBox.y) + (verticalOverlap - span) / 2;
      const x = aBox.x + aBox.width === bBox.x ? bBox.x : aBox.x;
      a = { x, y: start }; b = { x, y: start + span };
    } else if ((aBox.y + aBox.height === bBox.y || bBox.y + bBox.height === aBox.y) && horizontalOverlap > 0) {
      const span = Math.min(5, horizontalOverlap); const start = Math.max(aBox.x, bBox.x) + (horizontalOverlap - span) / 2;
      const y = aBox.y + aBox.height === bBox.y ? bBox.y : aBox.y;
      a = { x: start, y }; b = { x: start + span, y };
    } else return;
    let suffix = 1;
    while (building.doors.some(door => door.id === `${buildingId}-door-manual-${suffix}`)) suffix++;
    const id = `${buildingId}-door-manual-${suffix}`;
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(item => item.id === buildingId
      ? { ...item, doors: [...item.doors, { id, a, b, open: false, connects: [roomAId, roomBId] as [string, string] }] }
      : item) }));
    setSelectedDoorId(id);
  };
  const removeDoor = (buildingId: string, doorId: string) => {
    const building = editedDraft.buildings.find(item => item.id === buildingId);
    const door = building?.doors.find(item => item.id === doorId);
    const exteriorCount = building?.doors.filter(item => item.connects.includes('outside')).length ?? 0;
    if (!building || !door || (door.connects.includes('outside') && exteriorCount <= 1)) return;
    setEditedDraft(current => ({ ...current, buildings: current.buildings.map(item => item.id === buildingId
      ? { ...item, doors: item.doors.filter(candidate => candidate.id !== doorId) }
      : item) }));
    setSelectedDoorId(null);
  };
  const applyStreet = (index: number) => {
    const raw = streetDrafts[index] ?? editedDraft.streets[index].map(point => `${point.x},${point.y}`).join('; ');
    const parsed = raw.split(';').map(part => part.trim()).filter(Boolean).map(part => {
      const match = part.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
      return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
    });
    if (parsed.length < 2 || parsed.some(point => point === null)) {
      setStreetError('Нужно не меньше двух точек в формате X,Y, разделённых точкой с запятой.'); return;
    }
    setEditedDraft(current => ({ ...current, streets: current.streets.map((street, currentIndex) => currentIndex === index ? parsed as DraftPoint[] : street) }));
    setStreetError('');
  };
  const addWall = () => {
    const points = parsePointPolyline(newWallPoints);
    if (!points) { setWallStatus(''); setWallError('Нужно не меньше двух точек в формате X,Y, разделённых точкой с запятой.'); return; }
    const walls = editedDraft.walls ?? [];
    if (walls.length >= 128) { setWallStatus(''); setWallError('Достигнут предел в 128 авторских стен.'); return; }
    let suffix = 1;
    while (walls.some(wall => wall.id === `wall-${String(suffix).padStart(2, '0')}`)) suffix++;
    const wall: DraftWall = { id: `wall-${String(suffix).padStart(2, '0')}`, points };
    const next = { ...editedDraft, walls: [...walls, wall] };
    try { validateSettlementDraft(next); }
    catch (error) { setWallStatus(''); setWallError(userFacingGeometryError(error instanceof Error ? error.message : 'invalid wall')); return; }
    setEditedDraft(next); setNewWallPoints(''); setWallError(''); setWallStatus('Стена добавлена в черновик.');
  };
  const applyWall = (wallId: string) => {
    const wall = editedDraft.walls?.find(item => item.id === wallId);
    if (!wall) return;
    const points = parsePointPolyline(wallDrafts[wallId] ?? wall.points.map(point => `${point.x},${point.y}`).join('; '));
    if (!points) { setWallStatus(''); setWallError('Нужно не меньше двух точек в формате X,Y, разделённых точкой с запятой.'); return; }
    const next = { ...editedDraft, walls: (editedDraft.walls ?? []).map(item => item.id === wallId ? { ...item, points } : item) };
    try { validateSettlementDraft(next); }
    catch (error) { setWallStatus(''); setWallError(userFacingGeometryError(error instanceof Error ? error.message : 'invalid wall')); return; }
    setEditedDraft(next); setWallDrafts(current => ({ ...current, [wallId]: points.map(point => `${point.x},${point.y}`).join('; ') })); setWallError(''); setWallStatus('Линия стены обновлена.');
  };
  const removeWall = (wallId: string) => {
    setEditedDraft(current => ({ ...current, walls: (current.walls ?? []).filter(wall => wall.id !== wallId) }));
    setWallDrafts(current => { const next = { ...current }; delete next[wallId]; return next; });
    setWallError(''); setWallStatus('Стена удалена из черновика.');
  };
  const addReliefContour = () => {
    const points = parsePointPolyline(newReliefPoints);
    const elevationFeet = Number(newReliefElevation);
    if (!points) { setReliefStatus(''); setReliefError('Нужно не меньше двух точек в формате X,Y, разделённых точкой с запятой.'); return; }
    if (!Number.isSafeInteger(elevationFeet) || elevationFeet < -100_000 || elevationFeet > 100_000) { setReliefStatus(''); setReliefError('Введите целую отметку в футах от −100 000 до 100 000.'); return; }
    const contours = editedDraft.reliefContours ?? [];
    if (contours.length >= 128) { setReliefStatus(''); setReliefError('Достигнут предел в 128 горизонталей.'); return; }
    let suffix = 1;
    while (contours.some(contour => contour.id === `contour-${String(suffix).padStart(2, '0')}`)) suffix++;
    const contour: DraftReliefContour = { id: `contour-${String(suffix).padStart(2, '0')}`, elevationFeet, points };
    const next = { ...editedDraft, reliefContours: [...contours, contour] };
    try { validateSettlementDraft(next); }
    catch (error) { setReliefStatus(''); setReliefError(userFacingGeometryError(error instanceof Error ? error.message : 'invalid contour')); return; }
    setEditedDraft(next); setNewReliefPoints(''); setReliefError(''); setReliefStatus(`Добавлена горизонталь ${elevationFeet} ft.`);
  };
  const applyReliefContour = (contourId: string) => {
    const contour = editedDraft.reliefContours?.find(item => item.id === contourId);
    if (!contour) return;
    const points = parsePointPolyline(reliefDrafts[contourId] ?? contour.points.map(point => `${point.x},${point.y}`).join('; '));
    const elevationFeet = Number(reliefElevationDrafts[contourId] ?? contour.elevationFeet);
    if (!points) { setReliefStatus(''); setReliefError('Нужно не меньше двух точек в формате X,Y, разделённых точкой с запятой.'); return; }
    if (!Number.isSafeInteger(elevationFeet) || elevationFeet < -100_000 || elevationFeet > 100_000) { setReliefStatus(''); setReliefError('Введите целую отметку в футах от −100 000 до 100 000.'); return; }
    const next = { ...editedDraft, reliefContours: (editedDraft.reliefContours ?? []).map(item => item.id === contourId ? { ...item, points, elevationFeet } : item) };
    try { validateSettlementDraft(next); }
    catch (error) { setReliefStatus(''); setReliefError(userFacingGeometryError(error instanceof Error ? error.message : 'invalid contour')); return; }
    setEditedDraft(next);
    setReliefDrafts(current => ({ ...current, [contourId]: points.map(point => `${point.x},${point.y}`).join('; ') }));
    setReliefElevationDrafts(current => ({ ...current, [contourId]: String(elevationFeet) }));
    setReliefError(''); setReliefStatus(`Горизонталь ${elevationFeet} ft применена.`);
  };
  const removeReliefContour = (contourId: string) => {
    setEditedDraft(current => ({ ...current, reliefContours: (current.reliefContours ?? []).filter(contour => contour.id !== contourId) }));
    setReliefDrafts(current => { const next = { ...current }; delete next[contourId]; return next; });
    setReliefElevationDrafts(current => { const next = { ...current }; delete next[contourId]; return next; });
    setReliefError(''); setReliefStatus('Горизонталь удалена из черновика.');
  };
  const editBridge = (bridge?: DraftBridge) => {
    const river = routeWaterFeatures[0];
    if (!bridge && !river) { setBridgeError('Для моста нужен явный маршрут русла реки.'); return; }
    setBridgeError('');
    setBridgeForm(bridge ? {
      id: bridge.id, waterFeatureId: bridge.waterFeatureId,
      ax: String(bridge.a.x), ay: String(bridge.a.y), bx: String(bridge.b.x), by: String(bridge.b.y), widthFeet: String(bridge.widthFeet),
    } : { id: null, waterFeatureId: river!.id, ax: '', ay: '', bx: '', by: '', widthFeet: '' });
  };
  const saveBridge = () => {
    if (!bridgeForm) return;
    if ([bridgeForm.ax, bridgeForm.ay, bridgeForm.bx, bridgeForm.by, bridgeForm.widthFeet].some(value => !value.trim())) {
      setBridgeError('Укажите обе точки пересечения и ширину настила в футах.'); return;
    }
    const bridge: DraftBridge = {
      id: bridgeForm.id ?? `bridge-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
      waterFeatureId: bridgeForm.waterFeatureId,
      a: { x: Number(bridgeForm.ax), y: Number(bridgeForm.ay) }, b: { x: Number(bridgeForm.bx), y: Number(bridgeForm.by) },
      widthFeet: Number(bridgeForm.widthFeet),
    };
    const bridges = (editedDraft.bridges ?? []).some(item => item.id === bridge.id)
      ? (editedDraft.bridges ?? []).map(item => item.id === bridge.id ? bridge : item)
      : [...(editedDraft.bridges ?? []), bridge];
    try {
      validateSettlementDraft({ ...editedDraft, bridges });
      setEditedDraft(current => ({ ...current, bridges })); setBridgeForm(null); setBridgeError('');
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : 'Проверьте геометрию моста.');
    }
  };
  const removeBridge = (id: string) => {
    setEditedDraft(current => ({ ...current, bridges: (current.bridges ?? []).filter(bridge => bridge.id !== id) }));
    if (bridgeForm?.id === id) setBridgeForm(null);
    setBridgeError('');
  };
  const addLandmark = () => {
    const name = landmarkName.trim(); const x = Number(landmarkX); const y = Number(landmarkY);
    if (!name || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const id = `landmark-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
    setEditedDraft(current => ({ ...current, landmarks: [...(current.landmarks ?? []), { id, name, position: { x: Math.round(x), y: Math.round(y) } }] }));
    setLandmarkName('');
  };

  return <section className="settlement-plan" aria-labelledby="settlement-plan-title">
    <style>{styles}</style>
    <header className="settlement-plan__head">
      <div><h2 id="settlement-plan-title">План поселения · черновик правила стола</h2>
        <div className="settlement-plan__stamp" aria-label="Источник и воспроизводимость">
          <span>Источник: {draft.provenance}</span><span>Версия таблицы: {draft.generatorVersion}</span><span title={draft.seed}>Зерно: {draft.seed}</span>
        </div>
      </div>
      <div className="settlement-plan__controls">
        {!accepted && onAccept && <button type="button" disabled={!draftValid || showWatabou} onClick={() => onAccept(editedDraft)}>Предложить закрепление</button>}
        {accepted && onAccept && hasEdits && <button type="button" disabled={!draftValid || showWatabou} onClick={() => onAccept(editedDraft)}>Предложить обновление</button>}
        <button type="button" disabled={!draftValid || showWatabou} aria-describedby={!draftValid ? 'settlement-plan-validation' : undefined} onClick={prepareExport}>Подготовить UVTT · 5 футов</button>
        <button type="button" onClick={onClose} aria-label="Закрыть план поселения">Закрыть</button>
      </div>
    </header>

    <div className="settlement-plan__notice">
      {canonicalLabel
        ? <>Канонический ориентир: <strong>{canonicalLabel}</strong>. Этот план — самостоятельная порождённая геометрия и не заменяет канон.</>
        : 'Порождённая геометрия не утверждает каноническую планировку. Проверяйте её по описанию места и правьте до закрепления.'}
      <details className="settlement-plan__generation" open={generationOpen} onToggle={event => setGenerationOpen(event.currentTarget.open)}>
        <summary>Параметры генерации · правило стола</summary>
        <label className="settlement-plan__field">Загрузить внешний макроплан Watabou · JSON
          <input aria-label="Загрузить JSON плана Watabou" type="file" accept=".json,application/json" onChange={event => { void importWatabouFile(event.currentTarget.files?.[0]); }} />
        </label>
        {watabouError && <p className="settlement-plan__error" role="alert">Импорт Watabou: {watabouError}</p>}
        {watabouCity && <div className="settlement-plan__mfcg-import" role="status">
          <span>{watabouFileName} · MFCG {watabouCity.version} · {watabouCity.layers.length} слоёв</span>
          <button type="button" aria-pressed={showWatabou} onClick={() => setShowWatabou(value => !value)}>
            {showWatabou ? 'Показать черновик поселения' : 'Показать внешний макроплан'}
          </button>
        </div>}
        <div className="settlement-plan__generation-grid">
          <label className="settlement-plan__field">Описание места
          <textarea aria-label="Описание поселения для генерации" maxLength={2_000} value={generationDescription} onChange={event => setGenerationDescription(event.target.value)} placeholder="Например: компактное поселение у реки" />
          </label>
          <label className="settlement-plan__field">Население
            <input aria-label="Население для генерации" type="number" min="0" max="1000000000000" step="1" value={generationPopulation} onChange={event => setGenerationPopulation(event.target.value)} placeholder="Не указано" />
          </label>
          <label className="settlement-plan__field">Форма плана
            <select aria-label="Форма плана поселения" value={generationPattern} onChange={event => setGenerationPattern(event.target.value as typeof generationPattern)}>
              <option value="auto">По описанию</option><option value="grid">Сетка</option><option value="linear">Линейная</option><option value="compact">Компактная</option>
            </select>
          </label>
        </div>
        <p className="settlement-plan__generation-note">Сейчас применяется форма: {patternLabel(editedDraft.generationProfile?.pattern)}; население меняет размер сетки и диапазон застройки. Явное «река протекает через город» создаёт русло шириной 60 футов и оставляет его свободным от зданий; «у реки» и «побережье» задают полосу у края, сторона определяется по словам «север», «восток», «юг», «запад» (по умолчанию: река — восток, побережье — юг) и настраивается ниже. Остальное описание сохраняется без догадок. Это авторское правило стола, не каноническая география или плотность.</p>
        {edgeWaterFeatures.length > 0 && (
          <fieldset className="settlement-plan__doors">
            <legend>Положение воды у края · авторская правка</legend>
            {edgeWaterFeatures.map((feature, index) => {
              const label = `${feature.kind === 'river' ? 'Сторона реки' : 'Сторона побережья'}${edgeWaterFeatures.length > 1 ? ` ${index + 1}` : ''}`;
              return <label className="settlement-plan__field" key={feature.id}>{label}
                <select aria-label={label} value={feature.side ?? (feature.kind === 'river' ? 'east' : 'south')} onChange={event => {
                  const side = event.target.value as ExteriorDoorSide;
                  setEditedDraft(current => ({
                    ...current,
                    waterFeatures: (current.waterFeatures ?? []).map(item => item.id === feature.id ? { ...item, side } : item),
                  }));
                }}>
                  <option value="north">Север</option><option value="east">Восток</option><option value="south">Юг</option><option value="west">Запад</option>
                </select>
              </label>;
            })}
            <p className="settlement-plan__generation-note">Изменение действует на текущий черновик; при перегенерации сторона снова определяется из описания.</p>
          </fieldset>
        )}
        <button type="button" onClick={regenerate}>Перегенерировать план</button>
      </details>
    </div>

    <div className="settlement-plan__stage">
      <div className="settlement-plan__map">
        {showWatabou && watabouCity ? <svg viewBox={mfcgViewBox(watabouCity)} aria-label="Внешний макроплан Watabou · масштаб не задан" role="img">
          {watabouCity.layers.flatMap(layer => layer.geometries.map((geometry, geometryIndex) => {
            const color = mfcgLayerColor(layer.id);
            const title = `${MFCG_LAYER_LABEL[layer.id] ?? layer.id} · внешний слой Watabou`;
            if (geometry.type === 'Point') return <circle key={`${layer.id}-${geometryIndex}`} cx={geometry.coordinates[0]} cy={geometry.coordinates[1]} r={3} fill={color}><title>{title}</title></circle>;
            if (geometry.type === 'LineString') return <polyline key={`${layer.id}-${geometryIndex}`} points={mfcgPoints(geometry.coordinates)} fill="none" stroke={color} strokeWidth={geometry.width ?? (layer.id === 'roads' ? 8 : 2)} strokeLinecap="round" strokeLinejoin="round"><title>{title}</title></polyline>;
            return <path key={`${layer.id}-${geometryIndex}`} d={mfcgPath(geometry)} fill={layer.id === 'districts' ? 'none' : color} fillRule="evenodd" stroke={layer.id === 'districts' ? color : '#31262d'} strokeWidth={geometry.width ?? (layer.id === 'buildings' ? 1.5 : 2)} opacity={layer.id === 'districts' ? .65 : .9}><title>{title}</title></path>;
          }))}
        </svg> : !selected ? <svg viewBox={`0 0 ${editedDraft.bounds.width} ${editedDraft.bounds.height}`} aria-label="Общий план поселения" role="group">
          <rect className="plan-land" x="0" y="0" width={editedDraft.bounds.width} height={editedDraft.bounds.height}/>
          {(editedDraft.waterFeatures ?? []).map(feature => feature.route
            ? <g key={feature.id} role="img" aria-label="Порождённое русло реки">
                <polyline points={points(feature.route)} fill="none" stroke="#b5d0d3" strokeWidth={feature.width + 5} strokeLinecap="round" strokeLinejoin="round" />
                <polyline points={points(feature.route)} fill="none" stroke="#477f98" strokeWidth={feature.width} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            : feature.side ? <rect key={feature.id} className="plan-water" aria-label={feature.kind === 'river' ? 'Порождённая река' : 'Порождённое побережье'}
                x={feature.side === 'west' ? 0 : feature.side === 'east' ? editedDraft.bounds.width - feature.width : 0}
                y={feature.side === 'north' ? 0 : feature.side === 'south' ? editedDraft.bounds.height - feature.width : 0}
                width={feature.side === 'east' || feature.side === 'west' ? feature.width : editedDraft.bounds.width}
                height={feature.side === 'north' || feature.side === 'south' ? feature.width : editedDraft.bounds.height}/>
              : null)}
          {(editedDraft.reliefContours ?? []).map(contour => {
            const labelPoint = pointAtPolylineMidpoint(contour.points);
            return <g key={contour.id} role="img" aria-label={`Авторская горизонталь · ${contour.elevationFeet} футов`} pointerEvents="none">
              <polyline points={points(contour.points)} fill="none" stroke="#735d43" strokeWidth="2" strokeDasharray="8 5" strokeLinecap="round" strokeLinejoin="round" />
              <text x={labelPoint.x} y={labelPoint.y - 2} textAnchor="middle" dominantBaseline="text-after-edge" fill="#594735" stroke="#e6dccb" strokeWidth="1.5" paintOrder="stroke" fontSize="5">{contour.elevationFeet} ft</text>
            </g>;
          })}
          {editedDraft.streets.map((street, index) => <polyline key={`street-${index}`} className="plan-street" points={points(street)}/>)}
          {(editedDraft.bridges ?? []).map((bridge, index) => {
            const dx = bridge.b.x - bridge.a.x; const dy = bridge.b.y - bridge.a.y; const length = Math.hypot(dx, dy);
            if (length <= 0) return null;
            const nx = -dy / length; const ny = dx / length; const offset = Math.max(1, bridge.widthFeet / 2 - 1.5);
            return <g key={bridge.id} role="img" aria-label={`Авторский мост ${index + 1} · 5-футовая сетка`}>
              <line x1={bridge.a.x} y1={bridge.a.y} x2={bridge.b.x} y2={bridge.b.y} stroke="#392d29" strokeWidth={bridge.widthFeet + 5} strokeLinecap="butt" />
              <line x1={bridge.a.x} y1={bridge.a.y} x2={bridge.b.x} y2={bridge.b.y} stroke="#a8895b" strokeWidth={bridge.widthFeet} strokeLinecap="butt" />
              <line x1={bridge.a.x + nx * offset} y1={bridge.a.y + ny * offset} x2={bridge.b.x + nx * offset} y2={bridge.b.y + ny * offset} stroke="#392d29" strokeWidth="1.5" />
              <line x1={bridge.a.x - nx * offset} y1={bridge.a.y - ny * offset} x2={bridge.b.x - nx * offset} y2={bridge.b.y - ny * offset} stroke="#392d29" strokeWidth="1.5" />
            </g>;
          })}
          {(editedDraft.landmarks ?? []).map(landmark => <g key={landmark.id} aria-label={landmark.name}>
            <circle cx={landmark.position.x} cy={landmark.position.y} r="12" fill="#7a332b" stroke="#f1d6a3" strokeWidth="3" />
            <text x={landmark.position.x + 16} y={landmark.position.y - 12} className="plan-label">{landmark.name}</text>
          </g>)}
          {editedDraft.buildings.map(building => {
            const b = buildingBounds(building);
            return <g key={building.id} role="button" tabIndex={0} aria-label={`Выбрать ${building.name}`} aria-pressed={false}
              onClick={() => setSelectedId(building.id)} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(building.id); }
              }}>
              <title>{building.name} · открыть комнаты и сетку 5 футов</title>
              <polygon className="plan-block" points={points(building.outline)}/>
              <text className="plan-label" x={b.x + b.width / 2} y={b.y + b.height / 2} textAnchor="middle" dominantBaseline="middle">{building.name.replace('Постройка ', '#')}</text>
            </g>;
          })}
          {(editedDraft.walls ?? []).map((wall, index) => <g key={wall.id} role="img" aria-label={`Авторская стена ${index + 1} · блокировка обзора`} pointerEvents="none">
            <polyline points={points(wall.points)} fill="none" stroke="#30262d" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter" />
            <polyline points={points(wall.points)} fill="none" stroke="#b89a68" strokeWidth="1.25" strokeLinecap="square" strokeLinejoin="miter" />
          </g>)}
        </svg> : <svg viewBox={`${box!.x} ${box!.y} ${box!.width} ${box!.height}`} aria-label={`${selected.name}: комнаты и тактическая сетка 5 футов`} role="img">
          <defs><pattern id={gridId} width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 L 0 0 0 5" fill="none" className="plan-grid-line"/></pattern></defs>
          <rect className="plan-land" x={box!.x} y={box!.y} width={box!.width} height={box!.height}/>
          <polygon className="plan-block" points={points(selected.outline)}/>
          {selected.rooms.map((room, index) => {
            const b = buildingBounds({ ...selected, outline: room.outline });
            return <g key={room.id}><polygon className="plan-room" points={points(room.outline)}/>
              <text className="plan-room-label" x={b.x + b.width / 2} y={b.y + b.height / 2} textAnchor="middle" dominantBaseline="middle">{roomLabel(room, index)}</text></g>;
          })}
          <rect className="plan-grid" x={box!.x} y={box!.y} width={box!.width} height={box!.height} style={{ fill: `url(#${gridId})` }} pointerEvents="none"/>
          {selected.doors.map(door => <line key={door.id} className="plan-door" x1={door.a.x} y1={door.a.y} x2={door.b.x} y2={door.b.y} opacity={door.open ? 1 : .45}/>)}
        </svg>}
      </div>

      <aside className="settlement-plan__side" aria-label={showWatabou && watabouCity ? 'Слои внешнего плана Watabou' : 'Здания и источник черновика'}>
        {showWatabou && watabouCity ? <>
          <h3>Внешний макроплан</h3>
          <p className="settlement-plan__notice">Только просмотр. Координаты сохранены в условных единицах MFCG; масштаб и положение на Ториле не заданы. Это не боевой план, UVTT не доступен для этого вида.</p>
          <strong>{watabouFileName} · версия {watabouCity.version}</strong>
          {watabouCity.layers.map(layer => <div className="settlement-plan__building" key={layer.id}><span>{MFCG_LAYER_LABEL[layer.id] ?? layer.id}</span><small>{layer.geometries.length}</small></div>)}
          {watabouCity.districtNames.length > 0 && <p>Районы: {watabouCity.districtNames.join(' · ')}</p>}
          <button type="button" onClick={() => setShowWatabou(false)}>Вернуться к черновику</button>
        </> : selected ? <>
          <label className="settlement-plan__field">Название здания
            <input aria-label="Название здания" required maxLength={128} value={selected.name} onChange={event => renameBuilding(selected.id, event.target.value)} />
          </label>
          <button type="button" disabled={editedDraft.buildings.length <= 1} onClick={() => removeBuilding(selected.id)}>Удалить здание</button>
          <fieldset className="settlement-plan__geometry"><legend>Положение и размер · футы</legend>
            <label className="settlement-plan__field">X
              <input aria-label="Координата X здания" type="number" min="0" max={editedDraft.bounds.width - box!.width} step="1" value={Math.round(box!.x)} onChange={event => setGeometryField(selected.id, 'x', event.target.value)} />
            </label>
            <label className="settlement-plan__field">Y
              <input aria-label="Координата Y здания" type="number" min="0" max={editedDraft.bounds.height - box!.height} step="1" value={Math.round(box!.y)} onChange={event => setGeometryField(selected.id, 'y', event.target.value)} />
            </label>
            <label className="settlement-plan__field">Ширина
              <input aria-label="Ширина здания в футах" type="number" min="1" max={editedDraft.bounds.width} step="1" value={Math.round(box!.width)} onChange={event => setGeometryField(selected.id, 'width', event.target.value)} />
            </label>
            <label className="settlement-plan__field">Высота
              <input aria-label="Высота здания в футах" type="number" min="1" max={editedDraft.bounds.height} step="1" value={Math.round(box!.height)} onChange={event => setGeometryField(selected.id, 'height', event.target.value)} />
            </label>
          </fieldset>
          <p>Комнаты и план этажа. Шаг тактической сетки: {editedDraft.gridFeet} футов.</p>
          <div className="settlement-plan__rooms" aria-label="Названия комнат">
            <h4>Комнаты</h4>
            {selected.rooms.map((room, index) => <label className="settlement-plan__field" key={room.id}>
              <span className="sr-only">Название комнаты {index + 1}</span>
              <input aria-label={`Название комнаты ${index + 1}`} required maxLength={128}
                value={room.name ?? `Комната ${String(index + 1).padStart(2, '0')}`}
                onChange={event => renameRoom(selected.id, room.id, event.target.value)} />
            </label>)}
          </div>
          <label className="settlement-plan__field">Геометрия комнаты
            <select aria-label="Комната для редактирования геометрии" value={selectedRoom?.id ?? ''} onChange={event => setSelectedRoomId(event.target.value)}>
              {selected.rooms.map((room, index) => <option key={room.id} value={room.id}>{roomLabel(room, index)}</option>)}
            </select>
          </label>
          <button type="button" disabled={!selectedRoom || selected.rooms.length >= 64 || selected.doors.length >= 128 || Math.max(outlineBounds(selectedRoom?.outline ?? []).width, outlineBounds(selectedRoom?.outline ?? []).height) < 2} onClick={() => selectedRoom && splitRoom(selected.id, selectedRoom.id)}>
            Разделить комнату · добавить дверь
          </button>
          {mergeCandidates.length ? <>
            <label className="settlement-plan__field">Слить с соседней комнатой
              <select aria-label="Соседняя комната для слияния" value={selectedMergeRoomId} onChange={event => { setMergeRoomId(event.target.value); setMergeError(''); }}>
                {mergeCandidates.map(room => <option key={room.id} value={room.id}>{roomLabel(room, selected.rooms.indexOf(room))}</option>)}
              </select>
            </label>
            <button type="button" disabled={!selectedRoom || !selectedMergeRoomId} onClick={() => selectedRoom && mergeRooms(selected.id, selectedRoom.id, selectedMergeRoomId)}>Слить комнаты</button>
          </> : null}
          {mergeError ? <p className="settlement-plan__error" role="alert">{mergeError}</p> : null}
          {selectedRoom ? <fieldset className="settlement-plan__geometry"><legend>Комната · футы</legend>
            {(['x', 'y', 'width', 'height'] as const).map(key => {
              const roomBox = outlineBounds(selectedRoom.outline);
              const label = key === 'x' ? 'X' : key === 'y' ? 'Y' : key === 'width' ? 'Ширина' : 'Высота';
              const value = key === 'x' ? roomBox.x : key === 'y' ? roomBox.y : key === 'width' ? roomBox.width : roomBox.height;
              return <label className="settlement-plan__field" key={key}>{label}
                <input aria-label={`${label} комнаты в футах`} type="number" step="1" value={Math.round(value)} onChange={event => setRoomGeometry(selected.id, selectedRoom.id, key, event.target.value)} />
              </label>;
            })}
          </fieldset> : null}
          <fieldset className="settlement-plan__doors"><legend>Двери</legend>
            <div className="settlement-plan__geometry">
              <label className="settlement-plan__field">Комната у наружной стены
                <select aria-label="Комната для наружной двери" value={selectedExteriorRoomId} onChange={event => setExteriorRoomId(event.target.value)}>
                  {exteriorRooms.map(({ room }) => <option key={room.id} value={room.id}>{roomLabel(room, selected.rooms.indexOf(room))}</option>)}
                </select>
              </label>
              <label className="settlement-plan__field">Стена наружной двери
                <select aria-label="Стена наружной двери" value={selectedExteriorSide} onChange={event => setExteriorSide(event.target.value as ExteriorDoorSide)}>
                  {selectedExteriorSides.map(side => <option key={side} value={side}>{{ north: 'Верхняя', east: 'Правая', south: 'Нижняя', west: 'Левая' }[side]}</option>)}
                </select>
              </label>
            </div>
            <button type="button" disabled={!selectedExteriorRoomId || !selectedExteriorSides.length || selected.doors.length >= 128} onClick={() => addExteriorDoor(selected.id, selectedExteriorRoomId, selectedExteriorSide)}>Добавить наружную дверь</button>
            <button type="button" disabled={!selectedExteriorRoomId || !selectedExteriorSides.length || !selected.doors.some(door => door.connects.includes('outside'))} onClick={() => moveExteriorDoor(selected.id, selectedExteriorRoomId, selectedExteriorSide)}>Перенести наружную дверь</button>
            <div className="settlement-plan__geometry">
              <label className="settlement-plan__field">Из комнаты
                <select aria-label="Первая комната для новой двери" value={selectedDoorRoomA} onChange={event => setDoorRoomAId(event.target.value)}>
                  {selected.rooms.map((room, index) => <option key={room.id} value={room.id}>{roomLabel(room, index)}</option>)}
                </select>
              </label>
              <label className="settlement-plan__field">В комнату
                <select aria-label="Вторая комната для новой двери" value={selectedDoorRoomB} onChange={event => setDoorRoomBId(event.target.value)}>
                  {selected.rooms.map((room, index) => <option key={room.id} value={room.id}>{roomLabel(room, index)}</option>)}
                </select>
              </label>
            </div>
            <button type="button" disabled={selected.doors.length >= 128 || selectedDoorRoomA === selectedDoorRoomB} onClick={() => addInteriorDoor(selected.id, selectedDoorRoomA, selectedDoorRoomB)}>Добавить дверь между комнатами</button>
            <label className="settlement-plan__field">Дверь для редактирования
              <select aria-label="Дверь для редактирования" value={selectedDoor?.id ?? ''} onChange={event => setSelectedDoorId(event.target.value)}>
                {selected.doors.map((door, index) => {
                  const exteriorNumber = selected.doors.slice(0, index + 1).filter(item => item.connects.includes('outside')).length;
                  return <option key={door.id} value={door.id}>{door.connects.includes('outside') ? `Наружная дверь ${exteriorNumber}` : `Дверь ${index + 1}`}</option>;
                })}
              </select>
            </label>
            {selectedDoor ? <>
              <label><input type="checkbox" checked={selectedDoor.open} onChange={event => setDoorOpen(selected.id, selectedDoor.id, event.target.checked)} />{selectedDoor.open ? 'Открыта' : 'Закрыта'}</label>
              <div className="settlement-plan__geometry">
                {(['a', 'b'] as const).flatMap(end => (['x', 'y'] as const).map(axis => <label className="settlement-plan__field" key={`${end}-${axis}`}>{end === 'a' ? 'Начало' : 'Конец'} · {axis.toUpperCase()}
                  <input aria-label={`${end === 'a' ? 'Начало' : 'Конец'} двери ${axis.toUpperCase()} в футах`} type="number" step="1" value={selectedDoor[end][axis]} onChange={event => setDoorPoint(selected.id, selectedDoor.id, end, axis, event.target.value)} />
                </label>))}
              </div>
              {[0, 1].map(end => <label className="settlement-plan__field" key={end}>{end === 0 ? 'Соединяет' : 'С'}
                <select aria-label={`Конец ${end + 1} соединения двери`} value={selectedDoor.connects[end as 0 | 1]} onChange={event => setDoorConnection(selected.id, selectedDoor.id, end as 0 | 1, event.target.value)}>
                  <option value="outside">Внешняя сторона</option>
                  {selected.rooms.map((room, index) => <option key={room.id} value={room.id}>{roomLabel(room, index)}</option>)}
                </select>
              </label>)}
              <button type="button" disabled={selectedDoor.connects.includes('outside') && selected.doors.filter(door => door.connects.includes('outside')).length <= 1} onClick={() => removeDoor(selected.id, selectedDoor.id)}>Удалить дверь</button>
            </> : null}
          </fieldset>
          {!draftValid ? <p id="settlement-plan-validation" className="settlement-plan__error" role="alert">Черновик не пройдёт проверку: {validationMessage}</p> : null}
          {hasEdits ? <p className="settlement-plan__notice" role="status">Есть несохранённые правки. Они попадут в предложение или UVTT после явного действия.</p> : null}
          <button type="button" onClick={() => setSelectedId(null)}>Вернуться к общему плану</button>
        </> : <>
          <h3>Выбрать здание</h3><p>План создан генератором и остаётся редактируемым предложением.</p>
          <button type="button" disabled={editedDraft.buildings.length >= 128} onClick={addBuilding}>Добавить здание из шаблона</button>
          {buildingError ? <p className="settlement-plan__error" role="alert">{buildingError}</p> : null}
          {editedDraft.buildings.map(building => <button className="settlement-plan__building" type="button" key={building.id}
            onClick={() => setSelectedId(building.id)}><span>{building.name}</span><small>{building.rooms.length} комн.</small></button>)}
          <fieldset className="settlement-plan__doors"><legend>Улицы · точки X,Y</legend>
            {editedDraft.streets.map((street, index) => <div className="flex flex-col gap-1" key={index}>
              <label className="settlement-plan__field">Линия {index + 1}
                <textarea aria-label={`Точки улицы ${index + 1}`} value={streetDrafts[index] ?? street.map(point => `${point.x},${point.y}`).join('; ')} onChange={event => setStreetDrafts(current => ({ ...current, [index]: event.target.value }))} />
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={() => applyStreet(index)}>Применить линию</button>
                {editedDraft.streets.length > 1 ? <button type="button" onClick={() => { setEditedDraft(current => ({ ...current, streets: current.streets.filter((_, currentIndex) => currentIndex !== index) })); setStreetDrafts({}); }}>Удалить</button> : null}
              </div>
            </div>)}
            <button type="button" disabled={editedDraft.streets.length >= 256} onClick={() => {
              setEditedDraft(current => ({ ...current, streets: [...current.streets, [{ x: 0, y: Math.round(current.bounds.height * .1) }, { x: current.bounds.width, y: Math.round(current.bounds.height * .1) }]] }));
              setStreetDrafts({});
            }}>Добавить улицу</button>
            {streetError ? <p className="settlement-plan__error" role="alert">{streetError}</p> : null}
          </fieldset>
          <fieldset className="settlement-plan__doors"><legend>Стены · блокировка обзора</legend>
            <p className="settlement-plan__generation-note">Авторские линии с координатами в футах попадут в PNG и UVTT как непрозрачные линии обзора. Они не задают препятствия перемещению и игровые эффекты.</p>
            {(editedDraft.walls ?? []).map((wall, index) => <div className="flex flex-col gap-1" key={wall.id}>
              <label className="settlement-plan__field">Линия стены {index + 1} · точки X,Y
                <textarea aria-label={`Точки стены ${index + 1}`} value={wallDrafts[wall.id] ?? wall.points.map(point => `${point.x},${point.y}`).join('; ')} onChange={event => { setWallDrafts(current => ({ ...current, [wall.id]: event.target.value })); setWallStatus(''); }} />
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={() => applyWall(wall.id)}>Применить линию</button>
                <button type="button" onClick={() => removeWall(wall.id)}>Удалить</button>
              </div>
            </div>)}
            <label className="settlement-plan__field">Новая стена · точки X,Y · футы
              <textarea aria-label="Точки новой стены" value={newWallPoints} placeholder="Например: 100,200; 300,200" onChange={event => { setNewWallPoints(event.target.value); setWallStatus(''); }} />
            </label>
            <button type="button" disabled={!newWallPoints.trim() || (editedDraft.walls?.length ?? 0) >= 128} onClick={addWall}>Добавить стену в черновик</button>
            {wallError ? <p className="settlement-plan__error" role="alert">{wallError}</p> : null}
            {wallStatus ? <p className="settlement-plan__status" role="status" aria-live="polite">{wallStatus}</p> : null}
          </fieldset>
          <fieldset className="settlement-plan__doors"><legend>Горизонтали рельефа · вручную</legend>
            <p className="settlement-plan__generation-note">Задайте линии и отметки высоты в футах относительно местного нуля. Они видны на плане и в PNG/UVTT как картографические пометки; высота не влияет на движение, обзор или расчёты мира.</p>
            {(editedDraft.reliefContours ?? []).map((contour, index) => <div className="flex flex-col gap-1" key={contour.id}>
              <span>Горизонталь {index + 1}</span>
              <label className="settlement-plan__field">Отметка высоты · футы относительно местного нуля
                <input aria-label={`Высота горизонтали ${index + 1}`} type="number" min="-100000" max="100000" step="1" value={reliefElevationDrafts[contour.id] ?? String(contour.elevationFeet)} onChange={event => setReliefElevationDrafts(current => ({ ...current, [contour.id]: event.target.value }))} />
              </label>
              <label className="settlement-plan__field">Точки X,Y · футы
                <textarea aria-label={`Точки горизонтали ${index + 1}`} value={reliefDrafts[contour.id] ?? contour.points.map(point => `${point.x},${point.y}`).join('; ')} onChange={event => setReliefDrafts(current => ({ ...current, [contour.id]: event.target.value }))} />
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={() => applyReliefContour(contour.id)}>Применить горизонталь</button>
                <button type="button" onClick={() => removeReliefContour(contour.id)}>Удалить</button>
              </div>
            </div>)}
            <label className="settlement-plan__field">Новая отметка высоты · футы
              <input aria-label="Высота новой горизонтали в футах" type="number" min="-100000" max="100000" step="1" value={newReliefElevation} onChange={event => setNewReliefElevation(event.target.value)} />
            </label>
            <label className="settlement-plan__field">Новая горизонталь · точки X,Y · футы
              <textarea aria-label="Точки новой горизонтали" value={newReliefPoints} placeholder="Например: 100,200; 300,220; 500,200" onChange={event => setNewReliefPoints(event.target.value)} />
            </label>
            <button type="button" disabled={!newReliefPoints.trim() || (editedDraft.reliefContours?.length ?? 0) >= 128} onClick={addReliefContour}>Добавить горизонталь в черновик</button>
            {reliefError ? <p className="settlement-plan__error" role="alert">{reliefError}</p> : null}
            {reliefStatus ? <p className="settlement-plan__status" role="status" aria-live="polite">{reliefStatus}</p> : null}
          </fieldset>
          <fieldset className="settlement-plan__doors"><legend>Мосты через реки · авторская геометрия</legend>
            <p className="settlement-plan__generation-note">Концы должны пересечь выбранное русло и выйти за его берега. Ширина задаётся в футах. Мост попадает в изображение UVTT, но не создаёт стены, порталы или игровые эффекты.</p>
            {(editedDraft.bridges ?? []).map((bridge, index) => <div className="flex flex-col gap-1" key={bridge.id}>
              <span>Мост {index + 1} · {routeWaterFeatures.find(feature => feature.id === bridge.waterFeatureId)?.id ?? 'река'}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => editBridge(bridge)}>Изменить мост</button>
                <button type="button" onClick={() => removeBridge(bridge.id)}>Удалить</button>
              </div>
            </div>)}
            <button type="button" disabled={routeWaterFeatures.length === 0 || (editedDraft.bridges ?? []).length >= 128} onClick={() => editBridge()}>Добавить мост</button>
            {routeWaterFeatures.length === 0 ? <p className="settlement-plan__generation-note">Нужен явный маршрут русла; река или побережье только у края пока не поддерживаются для мостов.</p> : null}
            {bridgeForm ? <div className="flex flex-col gap-1">
              <label className="settlement-plan__field">Река
                <select aria-label="Река для моста" value={bridgeForm.waterFeatureId} onChange={event => setBridgeForm(current => current ? { ...current, waterFeatureId: event.target.value } : current)}>
                  {routeWaterFeatures.map(feature => <option key={feature.id} value={feature.id}>{feature.id}</option>)}
                </select>
              </label>
              <div className="settlement-plan__geometry">
                {([['ax','Начало · X'],['ay','Начало · Y'],['bx','Конец · X'],['by','Конец · Y'],['widthFeet','Ширина настила · футы']] as const).map(([key,label]) => <label className="settlement-plan__field" key={key}>{label}
                  <input aria-label={label} type="number" min="0" step="1" value={bridgeForm[key]} onChange={event => setBridgeForm(current => current ? { ...current, [key]: event.target.value } : current)} />
                </label>)}
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={saveBridge}>{bridgeForm.id ? 'Сохранить мост' : 'Добавить мост в черновик'}</button>
                <button type="button" onClick={() => { setBridgeForm(null); setBridgeError(''); }}>Отмена</button>
              </div>
            </div> : null}
            {bridgeError ? <p className="settlement-plan__error" role="alert">{bridgeError}</p> : null}
          </fieldset>
          <fieldset className="settlement-plan__doors"><legend>Ориентиры</legend>
            {(editedDraft.landmarks ?? []).map(landmark => <div className="flex flex-col gap-1" key={landmark.id}>
              <label className="settlement-plan__field">Название
                <input aria-label={`Название ориентира ${landmark.name}`} value={landmark.name} maxLength={256} onChange={event => setEditedDraft(current => ({ ...current, landmarks: current.landmarks?.map(item => item.id === landmark.id ? { ...item, name: event.target.value } : item) }))} />
              </label>
              <div className="settlement-plan__geometry">
                {(['x', 'y'] as const).map(axis => <label className="settlement-plan__field" key={axis}>{axis.toUpperCase()} · футы
                  <input aria-label={`${axis.toUpperCase()} ориентира ${landmark.name}`} type="number" step="1" value={landmark.position[axis]} onChange={event => setEditedDraft(current => ({ ...current, landmarks: current.landmarks?.map(item => item.id === landmark.id ? { ...item, position: { ...item.position, [axis]: Number(event.target.value) } } : item) }))} />
                </label>)}
              </div>
              <button type="button" onClick={() => setEditedDraft(current => ({ ...current, landmarks: current.landmarks?.filter(item => item.id !== landmark.id) }))}>Удалить ориентир</button>
            </div>)}
            <label className="settlement-plan__field">Новый ориентир
              <input aria-label="Название нового ориентира" value={landmarkName} maxLength={256} onChange={event => setLandmarkName(event.target.value)} />
            </label>
            <div className="settlement-plan__geometry">
              <label className="settlement-plan__field">X · футы<input aria-label="X нового ориентира" type="number" value={landmarkX} onChange={event => setLandmarkX(event.target.value)} /></label>
              <label className="settlement-plan__field">Y · футы<input aria-label="Y нового ориентира" type="number" value={landmarkY} onChange={event => setLandmarkY(event.target.value)} /></label>
            </div>
            <button type="button" disabled={!landmarkName.trim() || !landmarkX.trim() || !landmarkY.trim() || !Number.isFinite(Number(landmarkX)) || !Number.isFinite(Number(landmarkY)) || (editedDraft.landmarks?.length ?? 0) >= 128} onClick={addLandmark}>Добавить ориентир</button>
          </fieldset>
        </>}
        <div className="settlement-plan__notice"><strong>Источник геометрии</strong><br/>{draft.provenance} · {draft.generatorVersion}<br/>Seed: {draft.seed}</div>
      </aside>
    </div>

    <footer className="settlement-plan__footer">
      <span>{showWatabou && watabouCity ? `${watabouCity.layers.length} внешних слоёв · масштаб не задан` : `${editedDraft.buildings.length} зданий · ${editedDraft.gridFeet} футов / клетка · ${editedDraft.bounds.width} × ${editedDraft.bounds.height} футов`}</span>
      {draftValid && exportUrl && exportSnapshot === editedDraftSnapshot && <a href={exportUrl} download={`${draft.placeId.replace(/[^a-z0-9-]+/gi, '-')}-settlement.dd2vtt`}>Скачать UVTT</a>}
      {exportError && <span className="settlement-plan__error" role="alert">{exportError}</span>}
      <span>{showWatabou && watabouCity ? 'Референсный импорт · без изменения черновика' : draft.provenance === 'table-rule' ? 'Авторская геометрия · не канон' : 'Источник не подтверждён'}</span>
    </footer>
  </section>;
}
