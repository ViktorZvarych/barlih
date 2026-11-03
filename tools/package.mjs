import { cp, lstat, mkdir, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../scripts/config.js';
import { assertNoMarkers, buildPages, PROJECT_ROOT } from './build-pages.mjs';

const PUBLIC_ENTRIES = [
  'index.html', 'en', 'pl', 'privacy.html', 'offer.html', '404.html',
  'assets', 'styles', 'scripts', 'data/availability.json',
  'robots.txt', 'sitemap.xml', 'favicon.svg', '.htaccess',
];
const TEXT_FILE = /\.(?:html|css|js|json|svg|xml|txt|md)$|(?:^|\/)\.htaccess$/iu;

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function isForbidden(path, showDemoData) {
  const normalized = path.replaceAll('\\', '/');
  return /(?:^|\/)(?:\.env(?:\..*)?|\.git|node_modules)(?:\/|$)|\.ics$/iu.test(normalized)
    || /\.md$/iu.test(normalized)
    || (!showDemoData && /\.demo\.js$/u.test(normalized));
}

async function inspectTree(path, rootDir, prod) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${relative(rootDir, path)}`);
  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) await inspectTree(join(path, entry), rootDir, prod);
  } else {
    if (/\.ics$|(?:^|[\\/])\.env(?:\.|$)/iu.test(path)) throw new Error('Private file in package');
    if (prod && TEXT_FILE.test(path)) assertNoMarkers(await readFile(path, 'utf8'), relative(rootDir, path));
  }
}

export async function packageSite({ rootDir = PROJECT_ROOT, prod = false } = {}) {
  await buildPages({ rootDir, prod });
  const root = await realpath(rootDir);
  const target = resolve(root, 'dist');
  const inside = relative(root, target);
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || target !== join(root, 'dist')) {
    throw new Error('Unsafe package destination');
  }
  if (await exists(target)) {
    if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== target) {
      throw new Error('Unsafe dist directory');
    }
  }
  // Перевірений абсолютний шлях: очищається тільки dist/ цього проєкту.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const entry of PUBLIC_ENTRIES) {
    const source = join(root, entry);
    if (!await exists(source)) continue;
    await cp(source, join(target, entry), {
      recursive: true,
      filter: async (path) => {
        if ((await lstat(path)).isSymbolicLink()) throw new Error('Public source contains a symlink');
        return !isForbidden(relative(root, path), CONFIG.flags.showDemoData);
      },
    });
  }
  await inspectTree(target, target, prod);
  // Мінімізація та остаточні перевірки хостингу додаються лише на Кроці 7.
  return target;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== '--prod')) throw new Error('Unknown package option');
    console.log(`Packaged: ${await packageSite({ prod: args.includes('--prod') })}`);
  } catch (error) {
    console.error(`Package failed: ${error.message}`);
    process.exitCode = 1;
  }
}
