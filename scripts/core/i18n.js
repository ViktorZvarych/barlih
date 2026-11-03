import { CONFIG } from '../config.js';

function getValue(object, key) {
  let value = object;
  for (const segment of key.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) {
      throw new Error(`Missing translation: ${key}`);
    }
    value = value[segment];
  }
  return value;
}

function interpolate(text, params) {
  return text.replace(/\{(\w+)\}/gu, (_, key) => {
    if (!Object.hasOwn(params, key)) throw new Error(`Missing interpolation: ${key}`);
    return String(params[key]);
  });
}

export function createI18n({ language, ui }) {
  if (!CONFIG.i18n.languages.includes(language)) throw new Error(`Unsupported language: ${language}`);
  const pluralRules = new Intl.PluralRules(CONFIG.i18n.locales[language]);
  return Object.freeze({
    language,
    locale: CONFIG.i18n.locales[language],
    t(key, params = {}) {
      const text = getValue(ui, key);
      if (typeof text !== 'string') throw new Error(`Expected translation string: ${key}`);
      return interpolate(text, params);
    },
    plural(key, n, params = {}) {
      if (!Number.isFinite(n)) throw new Error('Plural count must be finite');
      const forms = getValue(ui, key);
      const text = forms[pluralRules.select(n)] ?? forms.other;
      if (typeof text !== 'string') throw new Error(`Missing plural form: ${key}`);
      return interpolate(text, { ...params, n });
    },
  });
}

let pageI18n;

export function initializeI18n(documentRoot = document) {
  const node = documentRoot.getElementById('i18n-ui');
  if (!node) throw new Error('Missing i18n-ui payload');
  pageI18n = createI18n({
    language: documentRoot.documentElement.lang,
    ui: JSON.parse(node.textContent),
  });
  return pageI18n;
}

function currentI18n() {
  return pageI18n ?? initializeI18n();
}

export function t(key, params = {}) {
  return currentI18n().t(key, params);
}

export function plural(key, n, params = {}) {
  return currentI18n().plural(key, n, params);
}
