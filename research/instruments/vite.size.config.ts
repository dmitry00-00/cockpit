// И5: вклад прибора в бандл. Каждый модуль — отдельный вход; React и всё из src/ — внешние: в приложении они уже
// в основном куске и куске vendor, прибор добавляет только своё.
//   npx vite build --config research/instruments/vite.size.config.ts --outDir <каталог>
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  plugins: [react()],
  build: {
    target: 'es2022',
    emptyOutDir: true,
    minify: 'esbuild',
    lib: { entry: { astrolabe: `${here}Astrolabe.tsx`, orb: `${here}HpOrb.tsx`, canvas: `${here}canvasFace.ts`, gl: `${here}glFace.ts` }, formats: ['es'] },
    rollupOptions: { external: id => /^react(-dom)?(\/|$)/.test(id) || id.includes('/src/') },
  },
});
