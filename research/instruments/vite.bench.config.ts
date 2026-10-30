// И5: сборка замера (bench.html) в каталог вне репозитория — продакшн-React, как в приложении.
//   npx vite build --config research/instruments/vite.bench.config.ts --outDir <каталог>
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  build: { target: 'es2022', emptyOutDir: true, rollupOptions: { input: { bench: `${here}bench.html` } } },
});
