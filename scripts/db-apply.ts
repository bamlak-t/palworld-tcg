/**
 * Applies supabase/palworld/*.sql to the linked project in order, through the Management
 * API. It doesn't use or touch the project's migration history, which belongs to the other
 * app sharing this project. Every file is safe to re-run.
 * Usage: npm run db:apply
 */
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../supabase/palworld/', import.meta.url));
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
  console.log(`applying ${file}`);
  execFileSync('npx', ['-y', 'supabase@2.122.0', 'db', 'query', '--linked', '-f', `${dir}${file}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
