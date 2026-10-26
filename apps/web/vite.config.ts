import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Read the repo-root .env.local, but expose only the two public Supabase values.
  const env = { ...loadEnv(mode, repoRoot, ''), ...process.env };
  return {
    base: '/palworld-tcg/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': srcDir } },
    define: {
      'import.meta.env.SUPABASE_PROJECT_URL': JSON.stringify(env.SUPABASE_PROJECT_URL ?? ''),
      'import.meta.env.SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY ?? ''),
    },
  };
});
