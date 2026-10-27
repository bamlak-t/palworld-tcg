import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    projects: [
      // Rules engine, cards and the session server: plain Node.
      { test: { name: 'packages', include: ['packages/**/*.test.ts'] } },
      // Web components, rendered in a simulated browser.
      {
        plugins: [react()],
        resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['apps/web/src/test/setup.ts'],
        },
      },
    ],
  },
});
