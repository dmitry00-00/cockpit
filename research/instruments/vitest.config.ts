// И5: тесты песочницы приборов — отдельным конфигом, чтобы `npm test` приложения их не видел.
//   npx vitest run --config research/instruments/vitest.config.ts --maxWorkers=4
import { fileURLToPath } from 'node:url';
import { mergeConfig, type UserConfig } from 'vite';
import base from '../../vite.config';

const root = fileURLToPath(new URL('../..', import.meta.url));
const cfg = mergeConfig(base, { root }) as UserConfig & { test: { include: string[] } };
// mergeConfig склеивает массивы — include задаётся заменой, а не слиянием.
cfg.test.include = ['research/instruments/**/*.test.{ts,tsx}'];
export default cfg;
