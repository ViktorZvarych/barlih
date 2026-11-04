# Локальні шрифти

Manrope 400/500/700, normal, WOFF2. Кожне накреслення має cyrillic, latin-ext та latin — разом 9 файлів. Базова latin потрібна для англійського тексту, цифр і пунктуації.

Джерела та версії — в assets/CREDITS.md; незмінені OFL 1.1 — у LICENSES/. Файли зберігаються в проєкті й копіюються до dist разом із ліцензіями.

Оновлення: npm ci --ignore-scripts, потім npm run fonts:sync. Скрипт копіює WOFF2 та OFL із dev-пакетів Fontsource і генерує styles/base/fonts.css зі збереженими unicode-range та font-display: swap. Після цього виконати npm run build і npm run package.

Шаблон має рівно два preload: накреслення Manrope 400 (текст) і 500 (заголовки), cyrillic для uk та latin для en/pl. Інші підмножини завантажуються браузером за потреби. Мережевих запитів до сервісів шрифтів немає.
