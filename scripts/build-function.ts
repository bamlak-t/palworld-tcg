/**
 * Copies the engine, card data and session handler into the Edge Function's vendor folder,
 * so the deployed function runs exactly the code the web app and tests use.
 * Usage: npm run build:function (deploy:function runs it first).
 */
import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vendor = `${root}supabase/functions/palworld-game/vendor`;
const keep = (src: string) => !/\.test\.ts$|testkit\.ts$/.test(src);

await rm(vendor, { recursive: true, force: true });
const packages: [string, string[]][] = [
  ['cards', ['src', 'data']],
  ['engine', ['src']],
  ['server', ['src']],
];
for (const [pkg, dirs] of packages) {
  for (const dir of dirs) {
    await cp(`${root}packages/${pkg}/${dir}`, `${vendor}/${pkg}/${dir}`, { recursive: true, filter: keep });
  }
}
console.log(`copied packages into ${vendor}`);
