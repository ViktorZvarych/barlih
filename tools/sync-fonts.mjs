import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const families = { manrope: [400, 500, 700] };
const subsets = ['cyrillic', 'latin-ext', 'latin'];
const css = ['/* GENERATED — npm run fonts:sync; unicode-range з Fontsource. */'];
await mkdir(new URL('assets/fonts/LICENSES/', root), { recursive: true });
for (const [family, weights] of Object.entries(families)) {
  const source = new URL(`node_modules/@fontsource/${family}/`, root);
  const license = await readFile(new URL('LICENSE', source), 'utf8');
  if (!license.includes('SIL OPEN FONT LICENSE')) throw new Error(`Missing OFL: ${family}`);
  await copyFile(new URL('LICENSE', source), new URL(`assets/fonts/LICENSES/${family}-OFL.txt`, root));
  for (const weight of weights) {
    const original = await readFile(new URL(`${weight}.css`, source), 'utf8');
    for (const subset of subsets) {
      const name = `${family}-${subset}-${weight}-normal`;
      const block = original.match(new RegExp(`/\\* ${name} \\*/\\s*(@font-face \\{[^}]+\\})`))?.[1];
      if (!block) throw new Error(`Missing font face: ${name}`);
      const file = `${name}.woff2`;
      const bytes = await readFile(new URL(`files/${file}`, source));
      if (bytes.subarray(0, 4).toString() !== 'wOF2') throw new Error(`Invalid WOFF2: ${file}`);
      await writeFile(new URL(`assets/fonts/${file}`, root), bytes);
      css.push(`/* ${name} */\n${block.replace(/src:[^;]+;/u, `src: url('/assets/fonts/${file}') format('woff2');`)}`);
    }
  }
}
await writeFile(new URL('styles/base/fonts.css', root), `${css.join('\n\n')}\n`);
console.log(`Synced 9 WOFF2 files and 1 OFL license into ${fileURLToPath(new URL('assets/fonts/', root))}`);
