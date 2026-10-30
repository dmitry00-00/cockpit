// Легенда схемы карты (TASKS M16): что значит каждый цвет и линия схемы — классы местности токенами terrain-* с
// подписями TERRAIN_NAMES, вода, берег, реки, границы и дороги. Только то, что есть в этой схеме: класса нет — нет и строки.
import { SCHEMA_ORDER, type MapSchema } from './schema';
import { TERRAIN_NAMES, type TerrainCode } from './terrain';

export interface LegendItem {
  key: string;
  label: string;
  /** Токен цвета: заливка или линия. */
  token: string;
  /** dash — штрих-пунктир (граница): форма, а не только цвет. */
  shape: 'fill' | 'line' | 'dash';
  title: string;
}

const CLASS_NOTE = 'класс местности по цвету растра (scripts/terrain-from-map.py), сглажен в схеме';

export function schemaLegend(schema: MapSchema): LegendItem[] {
  const fill = (c: TerrainCode, title = CLASS_NOTE): LegendItem => ({ key: c, label: TERRAIN_NAMES[c], token: `terrain-${c}`, shape: 'fill', title });
  const out: LegendItem[] = [];
  if (schema.land.length) out.push(fill('g', 'суша без своего класса — подложка схемы'));
  for (const c of SCHEMA_ORDER) if (schema.regions[c]?.length) out.push(fill(c));
  out.push(fill('o', 'всё, что не суша'));
  if (schema.land.length) out.push({ key: 'coast', label: 'берег', token: 'lo', shape: 'line', title: 'береговая линия — край воды растра HandsomeRob (scripts/schema-from-grids.py)' });
  if (schema.rivers?.length) out.push({ key: 'river', label: 'река', token: 'terrain-o', shape: 'line', title: 'реки — тонкая вода растра HandsomeRob по цвету; бледные серые ручьи не сняты' });
  if (schema.borders?.length) out.push({ key: 'border', label: 'граница', token: 'map-border', shape: 'dash', title: 'границы держав — бордовый штрих-пунктир растра HandsomeRob (scripts/borders-from-map.py), сомкнутый в линии' });
  if (schema.roads.length) out.push({ key: 'road', label: 'дорога', token: 'gd', shape: 'line', title: 'дороги — пунктир растра HandsomeRob (scripts/roads-from-map.py), сомкнутый в линии' });
  return out;
}
