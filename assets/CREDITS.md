# Джерела та ліцензії

## Поточні файли

`images/placeholders/{panorama,landscape,portrait,square,social}.svg` і `/favicon.svg` — прості векторні файли, створені в межах цього проєкту. Плейсхолдери не є фотографіями Barlih та не засвідчують вигляд котеджу. Стокових матеріалів і зовнішніх URL зображень у проєкті немає.

## Матеріали для заміни

TODO-OWNER: додати фотографії за маніфестом у README та для кожної вказати реальний файл, автора, перевірене посилання на джерело й ліцензію/дозвіл. Тимчасові стокові фото позначати `data-stock="true"`; не видавати їх за реальні фото Barlih.

## Локальні шрифти

- **manrope**, Fontsource `5.3.0`: https://fontsource.org/fonts/manrope/about ; пакет https://www.npmjs.com/package/@fontsource/manrope/v/5.3.0. Ліцензію OFL 1.1 із copyright скопійовано без змін у `fonts/LICENSES/manrope-OFL.txt`.

Manrope: normal 400/500/700. Підмножини: cyrillic, latin-ext і latin (базова латиниця, цифри та пунктуація). WOFF2 скопійовано без змін із пакетів; unicode-range збережено з CSS Fontsource. Версії та integrity зафіксовані в package-lock.json. Відтворення: `npm ci --ignore-scripts`, потім `npm run fonts:sync`. Пакети — лише devDependencies, до dist потрапляють локальні шрифти, CSS та OFL, без node_modules.
