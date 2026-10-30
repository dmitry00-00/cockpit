// И7, Монте-Карло устойчивости: игрушечный связанный мир на графе С2 (820 поселений) и державах справочника
// (places → узлы графа). Это не модель стола, а проверка МЕТОДА: какие регуляторы нужны, чтобы мир за век не вымер,
// не взорвался и не застыл, и какие инварианты это ловят. Числа правил — игрушечные (порядок величины — И3 §4).
//
// Связи: хозяйство (запас еды → голод → население и порядок), бунт (порядок), война соседних держав (сила, порядок,
// еда фронта), рост населения. Три варианта:
//   bare    — без регуляторов: рост экспоненциальный, война начинается от силы и не кончается усталостью;
//   capped  — потолок населения (логистика) и усталость войны, но без отдыха после мира;
//   full    — плюс перемирие после войны (кулдаун) и «помощь соседей» в голод (притяжение запаса к соседям).
//
//   node_modules/.bin/esbuild research/world-sim/bench-mc.ts --bundle --platform=node --format=esm \
//     --outfile=research/world-sim/out/bench-mc.mjs && node research/world-sim/out/bench-mc.mjs [прогонов] [лет]
import { readFileSync } from 'node:fs';
import { hash32 } from '../../src/campaign/rng';

type Variant = 'bare' | 'capped' | 'full';
const RUNS = Number(process.argv[2] ?? 64), YEARS = Number(process.argv[3] ?? 100), TPY = 36;

const graph = JSON.parse(readFileSync(new URL('../../../maps/tiles/toril/graph.json', import.meta.url), 'utf8')) as { nodes: [string, number, number, number][]; edges: [number, number, string, number][] };
const places = JSON.parse(readFileSync(new URL('../../../content/maps/toril-places.json', import.meta.url), 'utf8')).places as { id: string; class: string }[];
const kingdomsRaw = JSON.parse(readFileSync(new URL('../../../content/world/kingdoms.json', import.meta.url), 'utf8')).kingdoms as { id: string; places?: string[] }[];

const N = graph.nodes.length;
const idx = new Map(graph.nodes.map(([id], i) => [id, i]));
const cls = new Map(places.map(p => [p.id, p.class]));
const nbr: number[][] = Array.from({ length: N }, () => []);
for (const [a, b] of graph.edges) { nbr[a].push(b); nbr[b].push(a); }
// Держава узла — первая по справочнику; у 385 узлов державы нет (независимые).
const owner = new Int32Array(N).fill(-1);
const K: string[] = [];
for (const k of kingdomsRaw) {
  const mine = (k.places ?? []).map(p => idx.get(p)).filter((i): i is number => i !== undefined && owner[i] === -1);
  if (!mine.length) continue;
  for (const i of mine) owner[i] = K.length;
  K.push(k.id);
}
const KN = K.length;
// Соседи держав — есть ребро графа между их узлами.
const kNbr = Array.from({ length: KN }, () => new Set<number>());
for (const [a, b] of graph.edges) if (owner[a] >= 0 && owner[b] >= 0 && owner[a] !== owner[b]) { kNbr[owner[a]].add(owner[b]); kNbr[owner[b]].add(owner[a]); }
const CAP: Record<string, number> = { City: 20000, Town: 3000, Village: 400, Fortification: 800 };
const cap0 = Float64Array.from(graph.nodes, ([id]) => CAP[cls.get(id) ?? ''] ?? 1000);

/** Последовательный ГСЧ прогона (Mulberry32): для МК важна скорость, детерминизм — по зерну прогона. */
function rng(seed: number) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

interface Result { popRatio: number; deadShare: number; warsMean: number; warYearsShare: number; zeroWarDecades: number; famineShare: number; revoltsPerYear: number; maxWarLen: number; nan: boolean; quietDecades: number }

function run(v: Variant, seed: number): Result {
  const r = rng(hash32(`${v}|${seed}`));
  const pop = Float64Array.from(cap0, c => c * 0.6), food = new Float64Array(N).fill(50), order = new Float64Array(N).fill(5);
  const power = new Float64Array(KN).fill(5), war = new Int32Array(KN).fill(-1), warLen = new Int32Array(KN), cooldown = new Int32Array(KN), exhaust = new Float64Array(KN);
  const pop0 = pop.reduce((a, b) => a + b, 0);
  const bad = new Uint8Array(6);
  let warTicks = 0, famineTicks = 0, revolts = 0, maxWar = 0, zeroWarDecades = 0, decadeWars = 0, quietDecades = 0, decadeEvents = 0;
  for (let t = 0; t < YEARS * TPY; t++) {
    const season = Math.floor((t % TPY) / 9); // 0 зима … 3 осень
    const eq = [40, 50, 60, 90][season];
    // Урожай года — один бросок на полосу (y-координата узла / 1500) в начале осени, держится год (И3 §4.4).
    if (t % TPY === 27) for (let b = 0; b < 6; b++) bad[b] = r() < 0.15 ? 1 : 0;
    for (let i = 0; i < N; i++) {
      const front = owner[i] >= 0 && war[owner[i]] >= 0;
      // Равновесие еды: сезон × урожай полосы × фронт × еда на душу (больше людей, чем земля кормит, — меньше) − 15.
      const target = eq * (bad[Math.min(5, Math.floor(graph.nodes[i][2] / 1500))] ? 0.4 : 1) * (front ? 0.5 : 1) * Math.min(1.5, cap0[i] / pop[i]) - 15;
      food[i] += (target - food[i]) / 3 + (r() - 0.5) * 6;
      if (v === 'full' && food[i] < 10) { // помощь соседей: тянемся к среднему соседей, у них убывает поровну
        const ns = nbr[i]; if (ns.length) { const give = Math.min(5, (ns.reduce((s, j) => s + food[j], 0) / ns.length - food[i]) / 4); if (give > 0) { food[i] += give; for (const j of ns) food[j] -= give / ns.length; } }
      }
      if (food[i] <= 0) { food[i] = 0; pop[i] *= 0.99; order[i] -= 1; famineTicks++; decadeEvents++; }
      else {
        const g = 0.005 / TPY * 10; // +0,5 % в год ×10 — игрушечно быстрый рост, чтобы взрыв был виден за век
        pop[i] *= v === 'bare' ? 1 + g : 1 + g * (1 - pop[i] / cap0[i]);
        order[i] += (5 - order[i]) * 0.05;
      }
      if (front) { pop[i] *= 0.998; order[i] -= 0.1; }
      if (order[i] <= 2) { revolts++; decadeEvents++; order[i] = 4; pop[i] *= 0.98; }
      if (order[i] > 10) order[i] = 10;
    }
    // Войны: раз в десятидневку держава без войны может начать войну с соседом.
    for (let k = 0; k < KN; k++) {
      if (cooldown[k] > 0) cooldown[k]--;
      if (war[k] < 0) {
        exhaust[k] = Math.max(0, exhaust[k] - 0.5);
        power[k] += (5 - power[k]) * 0.02;
        if (v !== 'full' || cooldown[k] === 0) {
          const ns = [...kNbr[k]].filter(j => war[j] < 0 && (v !== 'full' || cooldown[j] === 0));
          const pStart = v === 'bare' ? 0.002 * power[k] : 0.003;
          if (ns.length && r() < pStart) { const j = ns[Math.floor(r() * ns.length)]; war[k] = j; war[j] = k; warLen[k] = warLen[j] = 0; decadeEvents++; }
        }
      } else if (war[k] > k) {
        const j = war[k];
        warLen[k]++; warLen[j]++; maxWar = Math.max(maxWar, warLen[k]);
        const wonK = r() * 20 + 2 * (power[k] - power[j]) >= 11;
        if (wonK) { power[j] -= 0.2; if (v === 'bare') power[k] += 0.2; } else { power[k] -= 0.2; if (v === 'bare') power[j] += 0.2; }
        if (v !== 'bare') { exhaust[k] += 1; exhaust[j] += 1; }
        const ends = v === 'bare' ? power[k] <= 0 || power[j] <= 0 : exhaust[k] > 30 + r() * 30 || power[k] <= 0 || power[j] <= 0;
        if (ends) { war[k] = war[j] = -1; cooldown[k] = cooldown[j] = v === 'full' ? 5 * TPY : 0; decadeEvents++; }
        power[k] = Math.max(0, Math.min(12, power[k])); power[j] = Math.max(0, Math.min(12, power[j]));
      }
    }
    let active = 0; for (let k = 0; k < KN; k++) if (war[k] >= 0) active++;
    warTicks += active / 2; decadeWars += active;
    if ((t + 1) % (10 * TPY) === 0) { if (decadeWars === 0) zeroWarDecades++; if (decadeEvents === 0) quietDecades++; decadeWars = 0; decadeEvents = 0; }
  }
  let pop1 = 0, dead = 0, nan = false;
  for (let i = 0; i < N; i++) { pop1 += pop[i]; if (pop[i] < cap0[i] * 0.06) dead++; if (!Number.isFinite(pop[i])) nan = true; }
  const T = YEARS * TPY;
  return { popRatio: pop1 / pop0, deadShare: dead / N, warsMean: warTicks / T, warYearsShare: warTicks / T / (KN / 2), zeroWarDecades, famineShare: famineTicks / (T * N), revoltsPerYear: revolts / YEARS, maxWarLen: maxWar / TPY, nan, quietDecades };
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r3 = (x: number) => Math.round(x * 1000) / 1000;
/** Инварианты «живого мира» (предложение И7 §6): каждый — с границей, нарушение считается по прогонам. */
const INVARIANTS: [string, (x: Result) => boolean][] = [
  ['население 0,5…2 от начала', x => x.popRatio >= 0.5 && x.popRatio <= 2],
  ['вымерших узлов < 5 %', x => x.deadShare < 0.05],
  ['ни одного десятилетия без войн', x => x.zeroWarDecades === 0],
  ['войной занято < 25 % держав', x => x.warYearsShare < 0.25],
  ['война не дольше 30 лет', x => x.maxWarLen <= 30],
  ['нет NaN', x => !x.nan],
  // Живость механизмов: канал, который за век ни разу не сработал, — мёртвый код правил, а не «спокойный мир».
  ['голод бывает (> 0,05 % узло-десятидневок)', x => x.famineShare > 0.0005],
  ['бунты бывают (≥ 1 в год)', x => x.revoltsPerYear >= 1],
  ['нет «тихих» десятилетий без событий', x => x.quietDecades === 0],
];
const report: Record<string, unknown> = { kingdoms: KN, nodes: N, runs: RUNS, years: YEARS };
for (const v of ['bare', 'capped', 'full'] as Variant[]) {
  const t0 = performance.now();
  const rs = Array.from({ length: RUNS }, (_, s) => run(v, s));
  const ms = performance.now() - t0;
  const pick = (f: (x: Result) => number) => ({ p5: r3(q(rs.map(f), 0.05)), p50: r3(q(rs.map(f), 0.5)), p95: r3(q(rs.map(f), 0.95)) });
  report[v] = {
    msPerSimYear: r3(ms / RUNS / YEARS),
    popRatio: pick(x => x.popRatio), deadShare: pick(x => x.deadShare), warYearsShare: pick(x => x.warYearsShare),
    maxWarLenYears: pick(x => x.maxWarLen), famineShare: pick(x => x.famineShare), revoltsPerYear: pick(x => x.revoltsPerYear),
    violations: Object.fromEntries(INVARIANTS.map(([name, ok]) => [name, `${rs.filter(x => !ok(x)).length}/${RUNS}`])),
  };
}
console.log(JSON.stringify(report, null, 1));
