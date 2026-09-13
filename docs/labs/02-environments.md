# Лаба 02. Три стенда

**~20 минут**

## Цель

Развести события по трём окружениям — `development`, `staging`, `production` —
и решить, что делать с ошибками из разработки.

## Теория на пять строк

Окружение в Sentry — это **тег на событии**, а не отдельная сущность, которую
надо где-то заводить. Приходит событие с `environment: "staging"` — окружение
появляется в фильтрах само.

Из этого следует важное: один и тот же Issue виден сразу во всех окружениях, и
можно спросить «эта ошибка только на staging или на проде тоже?». Если бы
стенды жили в разных проектах Sentry, такой вопрос задать было бы нельзя.
Поэтому **один проект, три окружения**, а не три проекта.

Читать окружение из `window.location.hostname` (как делает Excalidraw) —
рабочий, но плохой способ: он ломается на превью-доменах, в докере и локально.
Правильно — зашивать окружение в сборку.

## Задание

### 1. Перенеси DSN в переменные окружения

Env-файлы Excalidraw лежат **в корне репозитория**, а не рядом с
`vite.config.mts` — в конфиге прописано `envDir: "../"`. Это регулярный
источник недоумения, имей в виду.

Добавь `VITE_SENTRY_DSN` в три файла: `.env.development`, `.env.staging`,
`.env.production`. Значение **одно и то же** во всех трёх — это один проект.

Не забудь объявить переменную в `excalidraw-app/vite-env.d.ts`, иначе
TypeScript не даст к ней обратиться.

### 2. Прокинь окружение в SDK

В `sentry.ts` добавь `environment`. Брать его надо из `import.meta.env.MODE` —
Vite подставляет туда имя режима сборки на этапе компиляции.

> **Ловушка.** Может показаться, что стенды удобно различать через
> `import.meta.env.PROD`. Нельзя: при сборке `--mode staging` значение `PROD`
> тоже равно `true`. `PROD` отличает сборку от дев-сервера, но **не** отличает
> staging от production. Проверить легко — панель-детонатор показывает оба
> значения.

### 3. Реши судьбу событий из разработки

Слать ли ошибки из `yarn start` в Sentry? В рабочих проектах — почти всегда
нет: они забивают квоту и создают шум из ошибок, которые ты и так видишь в
консоли. Выключи отправку в режиме `development` через опцию `enabled`.

Чтобы при необходимости включить обратно, заведи `.env.development.local`
(он уже в `.gitignore`) — но по умолчанию dev молчит.

### 4. Добавь скрипты сборки стендов

В `excalidraw-app/package.json` добавь два скрипта — сборку staging и сборку
production. Vite выбирает env-файл по флагу `--mode`.

<details>
<summary>Эталон</summary>

В каждый из `.env.development`, `.env.staging`, `.env.production`:

```
VITE_SENTRY_DSN=https://<твой-ключ>@<org>.ingest.sentry.io/<id>
```

`excalidraw-app/vite-env.d.ts` — внутрь `interface ImportMetaEnv`:

```ts
  // DSN проекта Sentry. Не секрет: уезжает в бандл.
  VITE_SENTRY_DSN: string;
```

`excalidraw-app/sentry.ts`:

```ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,

  // MODE — имя режима сборки: development | staging | production.
  // Не PROD: при --mode staging он тоже true.
  environment: import.meta.env.MODE,

  // В разработке молчим: ошибки и так видны в консоли, а квота не резиновая.
  // Чтобы временно включить — VITE_SENTRY_FORCE_ENABLE=true в
  // .env.development.local
  enabled:
    import.meta.env.MODE !== "development" ||
    import.meta.env.VITE_SENTRY_FORCE_ENABLE === "true",
});
```

Тогда в `vite-env.d.ts` нужна и вторая переменная:

```ts
  VITE_SENTRY_FORCE_ENABLE: string;
```

`excalidraw-app/package.json`, в `scripts`:

```json
"build:staging": "vite build --mode staging",
"build:production": "vite build --mode production",
```

</details>

## Проверка

Собери и раздай staging-сборку:

```bash
yarn workspace excalidraw-app build:staging
npx http-server excalidraw-app/build -p 5001 --silent
```

Открой `http://localhost:5001`, разверни панель. В шапке панели должно быть
`mode: staging · PROD: true` — вот она, та самая ловушка, своими глазами.

Жми детонатор 1. В Sentry открой **Issues** и переключи фильтр окружения
на `staging`.

Теперь то же самое для прода:

```bash
yarn workspace excalidraw-app build:production
npx http-server excalidraw-app/build -p 5002 --silent
```

Событие должно лечь в окружение `production`.

И наконец — `yarn start`, детонатор 1: в консоли ошибка есть, **в Sentry её
нет**. Отправка из разработки выключена.

## Что должно сломаться, если сделать неправильно

| Симптом | Причина |
|---|---|
| `VITE_SENTRY_DSN` не существует в типах | Не объявил переменную в `vite-env.d.ts` |
| DSN оказался `undefined`, событий нет | Env-файл положил в `excalidraw-app/` вместо корня репозитория |
| Все события падают в `production` | Собрал без `--mode`; по умолчанию Vite использует режим `production` |
| События из `yarn start` всё равно летят | В `enabled` сравнил с `PROD`, а не с `MODE` |
| Фильтра `staging` нет в выпадашке | Ни одного события с этим окружением ещё не приходило — окружения создаются событиями |

## Итог

- [ ] DSN в трёх env-файлах, объявлен в типах
- [ ] `environment` берётся из `MODE`
- [ ] Разработка не шлёт события
- [ ] В Sentry есть окружения `staging` и `production`

```bash
git add -A && git commit -m "лаба 02: DSN в env-файлах, окружения по режиму сборки"
```

## Где эта схема перестаёт работать

Собери staging и загляни в бандл:

```bash
yarn workspace excalidraw-app build:staging
grep -o '="staging";.\{0,70\}' $(ls -S excalidraw-app/build/assets/*.js | head -1)
```

Увидишь примерно такое:

```
="staging";Kue({dsn:nfe,environment:DR,enabled:DR!=="development"})
```

Окружение там — строковая константа. Сборка, сделанная с `--mode staging`,
навсегда останется staging-сборкой. Если в проекте принято собирать **один
артефакт**, тестировать его и без изменений раскатывать на любой из стендов,
эта схема не годится: пришлось бы пересобирать под каждый стенд, и на прод
уехало бы не то, что тестировали.

Из того, что ты сделал, останется `enabled` по `MODE`: он отличает
дев-сервер от сборки, и это по-прежнему нужно. Уйдут три режима сборки —
окружение станет свойством стенда, а не артефакта.

→ [Лаба 02b. Одна сборка — много стендов](02b-runtime-config.md)
