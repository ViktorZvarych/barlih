import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../scripts/config.js';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLURAL_FORMS = ['one', 'few', 'many', 'other'];
const MARKERS = /TODO-OWNER|NEEDS-REVIEW|LEGAL-REVIEW/u;
const PSEUDO_LETTERS = { a: 'á', e: 'ë', i: 'ï', o: 'ø', u: 'ü', A: 'Á', E: 'Ë' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function serializeJson(value) {
  // JSON усередині script не повинен закривати тег чи створювати HTML.
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function assertNoMarkers(value, label) {
  const marker = String(value).match(MARKERS)?.[0];
  if (marker) throw new Error(`${label}: unresolved ${marker}`);
}

function isPlural(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && 'other' in value && Object.keys(value).every((key) => PLURAL_FORMS.includes(key));
}

function schema(value, language, path = '', result = {}) {
  if (isPlural(value)) {
    const required = language === 'en' ? ['one', 'other'] : PLURAL_FORMS;
    if (Object.keys(value).sort().join() !== [...required].sort().join()
      || Object.values(value).some((entry) => typeof entry !== 'string')) {
      throw new Error(`${language}:${path}: invalid plural forms`);
    }
    result[path] = 'plural';
  } else if (Array.isArray(value)) {
    result[path] = `array:${value.length}`;
    value.forEach((entry, index) => schema(entry, language, `${path}.${index}`, result));
  } else if (value && typeof value === 'object') {
    result[path] = 'object';
    for (const [key, entry] of Object.entries(value)) {
      schema(entry, language, path ? `${path}.${key}` : key, result);
    }
  } else {
    if (typeof value !== 'string') throw new Error(`${language}:${path}: expected string`);
    result[path] = 'string';
  }
  return result;
}

export function validateLocales(dictionaries) {
  const reference = schema(dictionaries.uk, 'uk');
  for (const language of CONFIG.i18n.languages) {
    if (!dictionaries[language]) throw new Error(`Missing locale: ${language}`);
    const candidate = schema(dictionaries[language], language);
    const keys = new Set([...Object.keys(reference), ...Object.keys(candidate)]);
    for (const key of keys) {
      if (reference[key] !== candidate[key]) {
        throw new Error(`${language}:${key}: missing/extra key or incompatible type`);
      }
    }
  }
}

export function pseudoText(text) {
  // Підстановки та URL лишаються незмінними; подовжується тільки видимий текст.
  const parts = text.split(/(\{\w+\}|https?:\/\/\S+)/gu);
  return parts.map((part, index) => {
    if (index % 2 || !part.trim()) return part;
    const accented = part.replace(/[aeiouAE]/gu, (char) => PSEUDO_LETTERS[char]);
    return `［${accented}${'~'.repeat(Math.ceil(part.length * 0.4))}］`;
  }).join('');
}

function pseudoDictionary(value, path = '') {
  if (typeof value === 'string') {
    if (path === 'reviewStatus' || path === 'brand.name' || path.startsWith('ui.languages.') || path.startsWith('ui.languageLabels.')) return value;
    return pseudoText(value);
  }
  if (Array.isArray(value)) return value.map((entry, index) => pseudoDictionary(entry, `${path}.${index}`));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
    [key, pseudoDictionary(entry, path ? `${path}.${key}` : key)]));
}

function lookup(data, path) {
  let value = data;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      throw new Error(`Unknown template key: ${path}`);
    }
    value = value[key];
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Non-scalar template key: ${path}`);
  }
  return value;
}

export function renderTemplate(template, data, fragments) {
  // Один прохід: текст перекладу не може стати наступною шаблонною інструкцією.
  return template.replace(/\{\{\{([\w.]+)\}\}\}|\{\{([\w.]+)\}\}/gu, (_, rawKey, key) => {
    if (!rawKey) return escapeHtml(lookup(data, key));
    if (!Object.hasOwn(fragments, rawKey)) throw new Error(`Unknown HTML fragment: ${rawKey}`);
    return fragments[rawKey];
  });
}

export function pagePath(language) {
  return language === CONFIG.i18n.defaultLanguage ? '/' : `/${language}/`;
}

function absoluteUrl(path) {
  return new URL(path, CONFIG.site.url).href;
}

function structuredData(dictionary, language) {
  const property = CONFIG.property;
  const entries = [{
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: property.name,
    url: absoluteUrl(pagePath(language)),
    description: dictionary.meta.description,
    inLanguage: language,
    address: {
      '@type': 'PostalAddress',
      addressCountry: property.address.country,
      addressRegion: property.address.region,
      addressLocality: property.address.locality,
      streetAddress: property.address.street,
    },
    geo: { '@type': 'GeoCoordinates', latitude: property.geo.lat, longitude: property.geo.lng },
  }];
  // FAQ з'явиться разом із видимою секцією, із того самого мовного джерела.
  if (dictionary.faq?.items?.length) {
    entries.push({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: dictionary.faq.items.map(({ q, a }) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  return entries;
}

function headHtml(dictionary, language) {
  const url = absoluteUrl(pagePath(language));
  const meta = dictionary.meta;
  const alternatives = CONFIG.i18n.languages.map((code) =>
    `<link rel="alternate" hreflang="${code}" href="${escapeHtml(absoluteUrl(pagePath(code)))}">`);
  return [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
    '<meta name="robots" content="noindex, nofollow">',
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    ...alternatives,
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(absoluteUrl('/'))}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeHtml(CONFIG.property.name)}">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:locale" content="${CONFIG.i18n.locales[language].replace('-', '_')}">`,
    `<script type="application/ld+json">${serializeJson(structuredData(dictionary, language))}</script>`,
  ].join('\n    ');
}

function languageLinks(dictionary, language) {
  return CONFIG.i18n.languages.map((code) =>
    `<a class="language-nav__link" href="${pagePath(code)}" hreflang="${code}" lang="${code}"${language === code ? ' aria-current="page"' : ''} aria-label="${escapeHtml(dictionary.ui.languages[code])}">${escapeHtml(dictionary.ui.languageLabels[code])}</a>`
  ).join('\n          ');
}

function sitemapXml() {
  const alternatives = CONFIG.i18n.languages.map((language) =>
    `    <xhtml:link rel="alternate" hreflang="${language}" href="${escapeHtml(absoluteUrl(pagePath(language)))}" />`);
  alternatives.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(absoluteUrl('/'))}" />`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...CONFIG.i18n.languages.map((language) => [
      '  <url>', `    <loc>${escapeHtml(absoluteUrl(pagePath(language)))}</loc>`, ...alternatives, '  </url>',
    ].join('\n')),
    '</urlset>', '',
  ].join('\n');
}

export async function buildPages({ rootDir = PROJECT_ROOT, prod = false, pseudo = false } = {}) {
  if (prod && pseudo) throw new Error('Production and pseudo modes are mutually exclusive');
  const template = await readFile(join(rootDir, 'templates/index.template.html'), 'utf8');
  const dictionaries = Object.fromEntries(await Promise.all(CONFIG.i18n.languages.map(async (language) =>
    [language, JSON.parse(await readFile(join(rootDir, 'locales', `${language}.json`), 'utf8'))])));
  validateLocales(dictionaries);
  if (prod) {
    assertNoMarkers(template, 'templates/index.template.html');
    assertNoMarkers(JSON.stringify(CONFIG), 'CONFIG');
    assertNoMarkers(await readFile(join(rootDir, 'scripts/config.js'), 'utf8'), 'scripts/config.js');
    for (const [language, dictionary] of Object.entries(dictionaries)) {
      assertNoMarkers(JSON.stringify(dictionary), language);
    }
  }

  // Спочатку перевіряємо та рендеримо всі мови, лише тоді записуємо результат.
  const pages = CONFIG.i18n.languages.map((language) => {
    const dictionary = pseudo ? pseudoDictionary(dictionaries[language]) : dictionaries[language];
    const html = renderTemplate(template, { ...dictionary, language, fontSubset: language === 'uk' ? 'cyrillic' : 'latin', pagePath: pagePath(language) }, {
      head: headHtml(dictionary, language),
      languageLinks: languageLinks(dictionary, language),
      uiJson: `<script type="application/json" id="i18n-ui">${serializeJson(dictionary.ui)}</script>`,
    });
    if (prod) assertNoMarkers(html, language);
    const directory = language === CONFIG.i18n.defaultLanguage ? rootDir : join(rootDir, language);
    return { directory, html };
  });
  for (const { directory, html } of pages) {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'index.html'), html, 'utf8');
  }
  await writeFile(join(rootDir, 'sitemap.xml'), sitemapXml(), 'utf8');
  return { languages: CONFIG.i18n.languages, pseudo, prod };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--prod', '--pseudo'].includes(arg))) throw new Error('Unknown build option');
    const result = await buildPages({ prod: args.includes('--prod'), pseudo: args.includes('--pseudo') });
    console.log(`Built: ${result.languages.join(', ')}${result.pseudo ? ' (pseudo)' : ''}`);
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
