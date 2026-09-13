# Лаба 06. Шум и приватность

**~30 минут**

## Цель

Сделать поток событий пригодным для работы: убрать мусор, не отправить лишнего
и настроить сэмплирование по стендам.

## Теория на пять строк

Свежеподключённый Sentry почти всегда шумит. Источники шума типовые:
расширения браузера, которые падают в чужом коде на твоей странице; устаревший
сервис-воркер, который просит удалённый чанк; переполненный localStorage;
`ResizeObserver loop limit exceeded`. Всё это не твои баги, но они забивают
ленту и съедают квоту.

Отдельно — приватность. Sentry отправляет URL страницы, а в URL может лежать
то, чего в мониторинге быть не должно.

## Задание

### 1. Отсеки заведомый шум

Добавь в `Sentry.init` опцию `ignoreErrors` — список строк и регулярок,
события с которыми SDK не отправит. Начни со списка, который Excalidraw
накопил в проде (он лежит в `docs/upstream/sentry.original.ts`) — там
подписано, что за чем.

Рядом полезна `denyUrls`: она отбрасывает события, чей стектрейс ведёт в
расширения браузера.

### 2. Вычисти URL перед отправкой

Вот это — не учебный пример, а настоящая дыра.

Excalidraw хранит **ключ шифрования комнаты в хеше URL**:

```
https://excalidraw.com/#room=8a1b...,Zx9Kq...
                              ^^^^^^^ идентификатор  ^^^^^^^ ключ
```

Ссылка целиком — это доступ к содержимому доски. Если такой URL уедет в
Sentry, ключ окажется в системе мониторинга, у всех, у кого есть доступ к
проекту, и в её бэкапах.

Добавь `beforeSend` и срежь хеш из `event.request.url`.

> **Подумай дальше.** URL уезжает не только в `request.url`. Хлебные крошки
> навигации тоже его содержат. Загляни в `event.breadcrumbs` — стоит ли
> чистить и там? Готового ответа в эталоне нет намеренно.

### 3. Разберись, что уходит по умолчанию

В SDK 10 опция `sendDefaultPii` объявлена устаревшей, вместо неё — секция
`dataCollection` с раздельным управлением категориями: `userInfo`, `cookies`,
`httpHeaders`, `httpBodies`, `urlQueryParams`.

По умолчанию отправка PII **выключена** — специально ничего делать не нужно.
Важно другое: знать, что она существует, и не включить её случайно, скопировав
сниппет из статьи.

### 4. Добавь пользователя — правильно

Для триажа полезно знать, скольких людей задела ошибка. Но идентифицировать
человека надо непрозрачным идентификатором, а не почтой и не именем.

Проставь `Sentry.setUser({ id: ... })` — например, от анонимного идентификатора
из localStorage. Почту не отправляй.

### 5. Настрой сэмплирование по стендам

Две независимые ручки:

- `sampleRate` — доля **ошибок**. Держи `1.0`: ошибки редки и каждая ценна.
  Занижают только когда квота горит.
- `tracesSampleRate` — доля **трейсов производительности**. Вот их бывает
  много, и это отдельный продукт со своей квотой.

Разумно: на staging `1.0` (трафика мало, видно всё), на проде `0.1`.

Сборка одна на все стенды, поэтому долю трейсов в неё не зашить — она приходит
со стенда. В `deploy/stands/*.json` уже есть `sentry.tracesSampleRate`, и
`render-config.sh` кладёт его в `config.js`. Возьми значение оттуда. Если
конфигурации нет, выбери осторожное значение по умолчанию.

Учти: `tracesSampleRate` сам по себе ничего не включает — нужна интеграция
`browserTracingIntegration()`.

<details>
<summary>Эталон</summary>

```ts
import * as Sentry from "@sentry/react";

const runtimeConfig = window.__APP_CONFIG__;

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: runtimeConfig?.environment ?? "unconfigured",
  release: import.meta.env.VITE_APP_RELEASE,
  enabled: import.meta.env.MODE !== "development",
  initialScope: {
    tags: { stand: runtimeConfig?.stand ?? "unconfigured" },
  },

  integrations: [Sentry.browserTracingIntegration()],

  // Ошибки шлём все — они редкие и каждая ценна.
  sampleRate: 1.0,
  // Трейсов много, и это отдельная квота. Доля — свойство стенда.
  // Без конфигурации берём прод-значение: лучше недособрать, чем сжечь квоту.
  // ?. на каждом уровне: секции sentry в конфигурации может не оказаться.
  tracesSampleRate: runtimeConfig?.sentry?.tracesSampleRate ?? 0.1,

  ignoreErrors: [
    // Только Safari, ничего не ломает, но спамит.
    "undefined is not an object (evaluating 'window.__pad.performLoop')",
    // Вкладка закрывается в момент транзакции IndexedDB — сделать нечего.
    "InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase'",
    // Устаревший сервис-воркер просит чанк, которого больше нет.
    /(Failed to fetch|(fetch|loading) dynamically imported module)/i,
    // Переполнен localStorage.
    /QuotaExceededError: (The quota has been exceeded|.*setItem.*Storage)/i,
    // Приватный режим или отключённый IndexedDB.
    "Internal error opening backing store for indexedDB.open",
    // Известный безвредный шум браузеров.
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
  ],

  denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],

  beforeSend(event) {
    // В хеше URL у Excalidraw лежит ключ шифрования комнаты.
    // Отправлять его в систему мониторинга нельзя.
    if (event.request?.url) {
      event.request.url = event.request.url.replace(/#.*$/, "");
    }
    return event;
  },
});

// Непрозрачный идентификатор вместо почты и имени.
Sentry.setUser({ id: getOrCreateAnonymousId() });
```

Функцию `getOrCreateAnonymousId` напиши сам — достаточно `crypto.randomUUID()`,
положенного в localStorage при первом заходе.

</details>

## Проверка

```bash
yarn workspace excalidraw-app build:artifact
deploy/serve-stand.sh production-01 5092
```

1. Открой `http://localhost:5092/#room=test123,secretkey456` и жми детонатор 1.
   В событии, в разделе **Request → URL**, хеша быть не должно.
2. В разделе **User** должен быть только `id`.
3. Открой devtools → Network, отфильтруй по `ingest`, найди запрос к Sentry и
   посмотри тело — полезно один раз увидеть своими глазами, что именно уезжает.
4. Проверь, что фильтр работает: временно добавь в `ignoreErrors` строку
   `"SENTRY LAB: synchronous throw"`, пересобери, перезапусти стенд, нажми
   детонатор 1 — события быть не должно. Потом убери.
5. Проверь сэмплирование по стендам. Подними рядом `deploy/serve-stand.sh
   staging-01 5091` и в Network обнови страницу: при каждой загрузке уходит
   запрос с `"type":"transaction"` в теле. На `production-01` такой запрос
   будет примерно в одной загрузке из десяти. Сборка та же — отличается
   только `config.js`.

## Что должно сломаться, если сделать неправильно

| Симптом | Причина |
|---|---|
| `ignoreErrors` не срабатывает | Строка сопоставляется как подстрока сообщения; проверь, что не опечатался |
| Хеш всё ещё в событии | `beforeSend` не вернул `event`, либо правишь не то поле |
| Событий стало сильно меньше | Занизил `sampleRate` вместо `tracesSampleRate` |
| Трейсов нет вовсе | `tracesSampleRate` есть, а `browserTracingIntegration()` не подключил |

## Итог

- [ ] Шум отфильтрован через `ignoreErrors` и `denyUrls`
- [ ] Хеш URL срезается в `beforeSend`
- [ ] Пользователь — непрозрачный `id`, без почты
- [ ] Сэмплирование трейсов различается по стендам

```bash
git add -A && git commit -m "лаба 06: фильтрация шума, чистка URL, сэмплирование"
```

→ [Лаба 07. CI](07-ci.md)
