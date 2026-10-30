// И7: цена сидированного d20 (FNV-1a по склеенной строке + Mulberry32) — для оценки свёрнутого такта.
import { d20 } from '../../src/campaign/rng';
let x = 0; for (let i = 0; i < 1e5; i++) x += d20('econ-00442657-0e01-4919-8255-743faa21de58', String(i), 'harvest');
const n = 2e6, t = performance.now();
for (let i = 0; i < n; i++) x += d20('econ-00442657-0e01-4919-8255-743faa21de58', String(i * 864000), 'harvest');
console.log(JSON.stringify({ usPerRoll: +((performance.now() - t) / n * 1000).toFixed(3), x: x % 7 }));
