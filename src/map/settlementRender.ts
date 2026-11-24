import { parseSettlementDraft, type DraftPoint, type SettlementDraft } from './settlementDraft';

export interface SettlementCanvasSize { width: number; height: number; scale: number }

/** Foot coordinates become UVTT grid coordinates; M19 fixes one grid cell to five feet. */
export function settlementGridPoint(point: DraftPoint, gridFeet = 5): DraftPoint {
  if (!Number.isFinite(gridFeet) || gridFeet <= 0) throw new RangeError('gridFeet must be positive');
  return { x: point.x / gridFeet, y: point.y / gridFeet };
}

/** Pixel dimensions for an exported image at a uniform scale, padded to whole grid cells within maxEdge. */
export function settlementCanvasSize(value: unknown, maxEdge = 4096): SettlementCanvasSize {
  const draft: Readonly<SettlementDraft> = parseSettlementDraft(value);
  if (!Number.isInteger(maxEdge) || maxEdge < 1 || maxEdge > 4096) throw new RangeError('maxEdge must be between 1 and 4096');
  const gridWidth = Math.ceil(draft.bounds.width / draft.gridFeet);
  const gridHeight = Math.ceil(draft.bounds.height / draft.gridFeet);
  const pixelsPerGrid = Math.floor(Math.min(10, maxEdge / Math.max(gridWidth, gridHeight)));
  if (pixelsPerGrid < 9) throw new RangeError('MapTool requires at least 9 pixels per grid cell within the PNG size limit');
  const scale = pixelsPerGrid / draft.gridFeet;
  return {
    width: gridWidth * pixelsPerGrid,
    height: gridHeight * pixelsPerGrid,
    scale,
  };
}

/** Paint the generator's own bounded geometry. Coordinates are feet in the draft, not raster-map pixels. */
export function drawSettlementPlan(ctx: CanvasRenderingContext2D, value: unknown, width: number, height: number, exportScale?: number): void {
  const draft: Readonly<SettlementDraft> = parseSettlementDraft(value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw new RangeError('canvas dimensions must be between 1 and 4096');
  }
  const sx = exportScale ?? width / draft.bounds.width; const sy = exportScale ?? height / draft.bounds.height;
  if (!Number.isFinite(sx) || sx <= 0 || !Number.isFinite(sy) || sy <= 0) throw new RangeError('render scale must be positive');
  const renderBounds = { width: width / sx, height: height / sy };
  ctx.save();
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.fillStyle = '#e6dccb'; ctx.fillRect(0, 0, renderBounds.width, renderBounds.height);

  for (const feature of draft.waterFeatures ?? []) {
    if (feature.route) {
      ctx.beginPath(); ctx.moveTo(feature.route[0].x, feature.route[0].y);
      for (const p of feature.route.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#b5d0d3'; ctx.lineWidth = feature.width + 5; ctx.stroke();
      ctx.strokeStyle = '#477f98'; ctx.lineWidth = feature.width; ctx.stroke();
    } else if (feature.side) {
      ctx.fillStyle = '#477f98'; ctx.strokeStyle = '#b5d0d3'; ctx.lineWidth = 2;
      const x = feature.side === 'west' ? 0 : feature.side === 'east' ? renderBounds.width - feature.width : 0;
      const y = feature.side === 'north' ? 0 : feature.side === 'south' ? renderBounds.height - feature.width : 0;
      const width = feature.side === 'east' || feature.side === 'west' ? feature.width : renderBounds.width;
      const height = feature.side === 'north' || feature.side === 'south' ? feature.width : renderBounds.height;
      ctx.fillRect(x, y, width, height); ctx.strokeRect(x, y, width, height);
    }
  }

  for (const contour of draft.reliefContours ?? []) {
    ctx.beginPath(); ctx.moveTo(contour.points[0].x, contour.points[0].y);
    for (const point of contour.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#735d43'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
    const lengths = contour.points.slice(1).map((point, index) => Math.hypot(point.x - contour.points[index].x, point.y - contour.points[index].y));
    const half = lengths.reduce((sum, length) => sum + length, 0) / 2;
    let travelled = 0; let label = contour.points[0];
    for (let index = 1; index < contour.points.length; index++) {
      const length = lengths[index - 1];
      if (travelled + length >= half) {
        const t = length === 0 ? 0 : (half - travelled) / length;
        label = { x: contour.points[index - 1].x + (contour.points[index].x - contour.points[index - 1].x) * t, y: contour.points[index - 1].y + (contour.points[index].y - contour.points[index - 1].y) * t };
        break;
      }
      travelled += length;
    }
    const text = `${contour.elevationFeet} ft`;
    ctx.font = '5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e6dccb'; ctx.strokeText(text, label.x, label.y - 2);
    ctx.fillStyle = '#594735'; ctx.fillText(text, label.x, label.y - 2);
  }

  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#a89b86'; ctx.lineWidth = 28;
  for (const street of draft.streets) {
    ctx.beginPath(); ctx.moveTo(street[0].x, street[0].y);
    for (const p of street.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  for (const bridge of draft.bridges ?? []) {
    const dx = bridge.b.x - bridge.a.x; const dy = bridge.b.y - bridge.a.y; const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const nx = -dy / length; const ny = dx / length; const railOffset = Math.max(1, bridge.widthFeet / 2 - 1.5);
    ctx.beginPath(); ctx.moveTo(bridge.a.x, bridge.a.y); ctx.lineTo(bridge.b.x, bridge.b.y);
    ctx.lineCap = 'butt'; ctx.strokeStyle = '#392d29'; ctx.lineWidth = bridge.widthFeet + 5; ctx.stroke();
    ctx.strokeStyle = '#a8895b'; ctx.lineWidth = bridge.widthFeet; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bridge.a.x + nx * railOffset, bridge.a.y + ny * railOffset); ctx.lineTo(bridge.b.x + nx * railOffset, bridge.b.y + ny * railOffset);
    ctx.moveTo(bridge.a.x - nx * railOffset, bridge.a.y - ny * railOffset); ctx.lineTo(bridge.b.x - nx * railOffset, bridge.b.y - ny * railOffset);
    ctx.strokeStyle = '#392d29'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.lineCap = 'round';
  }
  for (const building of draft.buildings) {
    const drawOutline = (points: readonly DraftPoint[]) => {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
    };
    drawOutline(building.outline);
    ctx.fillStyle = '#bca77f'; ctx.fill(); ctx.strokeStyle = '#352a30'; ctx.lineWidth = 2.5; ctx.stroke();
    for (const [index, room] of building.rooms.entries()) {
      drawOutline(room.outline); ctx.strokeStyle = '#493840'; ctx.lineWidth = 1.3; ctx.stroke();
      const xs = room.outline.map(point => point.x); const ys = room.outline.map(point => point.y);
      const x = (Math.min(...xs) + Math.max(...xs)) / 2; const y = (Math.min(...ys) + Math.max(...ys)) / 2;
      const maxWidth = Math.max(1, Math.max(...xs) - Math.min(...xs) - 4);
      ctx.fillStyle = '#30262d'; ctx.font = '3.5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(room.name?.trim() || `Комната ${String(index + 1).padStart(2, '0')}`, x, y, maxWidth);
    }
    for (const door of building.doors) {
      ctx.beginPath(); ctx.moveTo(door.a.x, door.a.y); ctx.lineTo(door.b.x, door.b.y);
      ctx.strokeStyle = door.open ? '#e1bd73' : '#211a20'; ctx.lineWidth = 3.5; ctx.stroke();
    }
  }
  for (const wall of draft.walls ?? []) {
    ctx.beginPath(); ctx.moveTo(wall.points[0].x, wall.points[0].y);
    for (const point of wall.points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.lineCap = 'square'; ctx.lineJoin = 'miter'; ctx.miterLimit = 4;
    ctx.strokeStyle = '#30262d'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#b89a68'; ctx.lineWidth = 1.25; ctx.stroke();
  }
  ctx.restore();
}

/** Create the PNG supplied to settlementDraftToUvtt; output edges never exceed 4096 pixels. */
export function settlementPlanPng(value: unknown): string {
  const size = settlementCanvasSize(value);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  drawSettlementPlan(context, value, size.width, size.height, size.scale);
  return canvas.toDataURL('image/png');
}
