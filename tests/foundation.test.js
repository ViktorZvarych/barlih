import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildPages, PROJECT_ROOT, renderTemplate, serializeJson, validateLocales,
} from '../tools/build-pages.mjs';
import { packageSite } from '../tools/package.mjs';
import { createI18n } from '../scripts/core/i18n.js';
import { CONFIG } from '../scripts/config.js';
import { generateDemoBlockedRanges } from '../scripts/data/availability.demo.js';
import { getSettings, getReviews, submitBookingRequest } from '../scripts/api/dataSource.js';

async function dictionaries() {
  return Object.fromEntries(await Promise.all(['uk', 'en', 'pl'].map(async (language) =>
    [language, JSON.parse(await readFile(join(PROJECT_ROOT, 'locales', `${language}.json`), 'utf8'))])));
}

async function fixture(t) {
  const parent = resolve(tmpdir());
  const root = await mkdtemp(join(parent, 'barlih-step0-'));
  t.after(async () => {
    if (dirname(root) !== parent || !basename(root).startsWith('barlih-step0-')) {
      throw new Error('Unsafe test cleanup path');
    }
    await rm(root, { recursive: true, force: true });
  });
  for (const directory of ['templates', 'locales', 'scripts']) {
    await cp(join(PROJECT_ROOT, directory), join(root, directory), { recursive: true });
  }
  return root;
}

test('build creates three complete static pages and language alternatives', async (t) => {
  const root = await fixture(t);
  await buildPages({ rootDir: root });
  for (const [language, path] of [['uk', 'index.html'], ['en', 'en/index.html'], ['pl', 'pl/index.html']]) {
    const html = await readFile(join(root, path), 'utf8');
    assert.ok(html.includes(`<html lang="${language}">`));
    assert.ok(html.includes('GENERATED — edit templates/ and locales/'));
    assert.match(html, /href="\/styles\/base\/tokens\.css"/u);
    assert.match(html, /href="\/en\/" hreflang="en"/u);
    assert.match(html, /href="\/pl\/" hreflang="pl"/u);
    assert.equal((html.match(/aria-current="page"/gu) ?? []).length, 1);
    const ui = JSON.parse(html.match(/id="i18n-ui">(.*?)<\/script>/su)[1]);
    assert.equal(typeof ui.skipToContent, 'string');
    assert.equal(ui.meta, undefined);
    const ld = JSON.parse(html.match(/type="application\/ld\+json">(.*?)<\/script>/su)[1]);
    assert.equal(ld[0]['@type'], 'LodgingBusiness');
    assert.equal(ld[0].aggregateRating, undefined);
    assert.equal(ld[0].inLanguage, language);
    assert.equal(html.includes('{{'), false);
  }
  const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
  assert.equal((sitemap.match(/<loc>/gu) ?? []).length, 3);
  assert.equal((sitemap.match(/hreflang="x-default"/gu) ?? []).length, 3);
});

test('locale validation rejects missing/extra keys and wrong plural forms', async () => {
  const source = await dictionaries();
  assert.doesNotThrow(() => validateLocales(source));
  const missing = structuredClone(source);
  delete missing.en.intro.title;
  assert.throws(() => validateLocales(missing), /en:intro.title/u);
  const extra = structuredClone(source);
  extra.pl.intro.unexpected = 'extra';
  assert.throws(() => validateLocales(extra), /pl:intro.unexpected/u);
  const plural = structuredClone(source);
  delete plural.pl.ui.nights.few;
  assert.throws(() => validateLocales(plural), /invalid plural forms/u);
});

test('untrusted translations cannot inject HTML or close JSON script elements', async (t) => {
  const root = await fixture(t);
  const locales = await dictionaries();
  const payload = '</script><img src=x onerror=alert(1)> & "quote"';
  locales.uk.intro.title = payload;
  locales.uk.ui.skipToContent = payload;
  await writeFile(join(root, 'locales/uk.json'), JSON.stringify(locales.uk));
  await buildPages({ rootDir: root });
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.equal(html.includes(payload), false);
  assert.ok(html.includes('&lt;/script&gt;&lt;img'));
  const ui = JSON.parse(html.match(/id="i18n-ui">(.*?)<\/script>/su)[1]);
  assert.equal(ui.skipToContent, payload);
  assert.equal(JSON.parse(serializeJson({ payload })).payload, payload);
  assert.equal(renderTemplate('{{text}}', { text: '{{{fragment}}}' }, { fragment: '<b>unsafe</b>' }), '{{{fragment}}}');
  assert.throws(() => renderTemplate('{{unknown}}', {}, {}), /Unknown template key/u);
});

test('production build rejects unfinished content before replacing existing HTML', async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, 'index.html'), 'previous output');
  await assert.rejects(buildPages({ rootDir: root, prod: true }), /TODO-OWNER|NEEDS-REVIEW/u);
  assert.equal(await readFile(join(root, 'index.html'), 'utf8'), 'previous output');
  await assert.rejects(buildPages({ rootDir: root, prod: true, pseudo: true }), /mutually exclusive/u);
});

test('pseudo build expands text, keeps brand and does not modify locale sources', async (t) => {
  const root = await fixture(t);
  const before = await readFile(join(root, 'locales/en.json'), 'utf8');
  await buildPages({ rootDir: root, pseudo: true });
  const html = await readFile(join(root, 'en/index.html'), 'utf8');
  assert.match(html, /［/u);
  assert.match(html, /~{5}/u);
  assert.ok(html.includes('>Barlih</a>'));
  const ui = JSON.parse(html.match(/id="i18n-ui">(.*?)<\/script>/su)[1]);
  assert.ok(ui.nights.other.includes('{n}'));
  assert.equal(await readFile(join(root, 'locales/en.json'), 'utf8'), before);
});

test('i18n selects Ukrainian/Polish/English plural forms and interpolates safely', async () => {
  const source = await dictionaries();
  const uk = createI18n({ language: 'uk', ui: source.uk.ui });
  const pl = createI18n({ language: 'pl', ui: source.pl.ui });
  const en = createI18n({ language: 'en', ui: source.en.ui });
  assert.equal(uk.plural('nights', 1), '1 ніч');
  assert.equal(uk.plural('nights', 3), '3 ночі');
  assert.equal(uk.plural('nights', 11), '11 ночей');
  assert.equal(pl.plural('nights', 2), '2 noce');
  assert.equal(pl.plural('nights', 12), '12 nocy');
  assert.equal(pl.plural('nights', 22), '22 noce');
  assert.equal(en.plural('nights', 1), '1 night');
  assert.equal(en.plural('nights', 2), '2 nights');
  assert.equal(uk.t('currency'), 'грн');
  assert.throws(() => uk.t('missing'), /Missing translation/u);
});

test('package whitelist excludes private calendars, env files and development sources', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'assets/private'), { recursive: true });
  await mkdir(join(root, 'data/calendar'), { recursive: true });
  await writeFile(join(root, 'assets/private/guest.ics'), 'private guest');
  await writeFile(join(root, 'assets/private/.env.production'), 'private key');
  await writeFile(join(root, 'assets/private/README.md'), 'private documentation');
  await writeFile(join(root, 'assets/private/public.svg'), '<svg/>');
  await writeFile(join(root, 'data/calendar/guest.ics'), 'private guest');
  const target = await packageSite({ rootDir: root });
  const entries = await readdir(target);
  for (const forbidden of ['templates', 'locales', 'tools', 'tests', 'package.json']) {
    assert.equal(entries.includes(forbidden), false);
  }
  assert.deepEqual(await readdir(join(target, 'assets/private')), ['public.svg']);
  assert.ok((await readFile(join(target, 'index.html'), 'utf8')).includes('<html lang="uk">'));
});

test('data adapters keep settings isolated and do not pretend to submit or convert', async () => {
  const settings = await getSettings();
  settings.pricing.baseNightPrice = 1;
  assert.equal(CONFIG.pricing.baseNightPrice, 5600);
  assert.deepEqual(await getReviews(), []);
  await assert.rejects(submitBookingRequest({}), /BOOKING_SUBMISSION_NOT_IMPLEMENTED/u);
  const ranges = generateDemoBlockedRanges(new Date('2026-11-01T22:30:00Z'));
  assert.equal(ranges[0].from, '2026-11-07');
  assert.equal(ranges[0].to, '2026-11-10');
  const cli = spawnSync(process.execPath, [join(PROJECT_ROOT, 'tools/ics-to-availability.mjs')], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /not implemented/u);
});
