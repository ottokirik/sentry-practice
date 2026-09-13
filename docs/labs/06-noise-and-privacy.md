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
расширения браузера. SDK берёт адрес файла из **последнего кадра** стектрейса
и сверяет его со списком.

Код, который расширение внедрило в страницу, адресуется по собственному
протоколу расширений:

| Браузер | Протокол |
|---|---|
| Chrome, Edge, Opera, Brave, Яндекс Браузер | `chrome-extension://` |
| Firefox | `moz-extension://` |
| Safari | `safari-web-extension://` (старые расширения — `safari-extension://`) |
| старый Edge (EdgeHTML) | `ms-browser-extension://` |

Не путай с `chrome://` — это внутренние страницы самого браузера, а не
расширения. И не бери шаблон вроде `/extensions\//`: он совпадёт с любым
адресом, в пути которого есть `extensions/`, включая твой собственный сайт.

Без стектрейса в браузерном расширении `denyUrls` бесполезна: у события без
кадров нет адреса, и фильтр его пропускает.

Некоторый шум SDK отбрасывает сам, без настройки: `Script error.`,
`ResizeObserver loop completed with undelivered notifications` и ещё около
десятка шаблонов. Дублировать их в `ignoreErrors` не нужно.

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

Первое, что приходит в голову, — `beforeSend`, срезающий хеш из
`event.request.url`. **Этого недостаточно.** Проверено на этом проекте: при
открытии комнаты и смене хеша ключ оказывается в событии в нескольких местах.

| Где | В каком событии |
|---|---|
| `request.url` | ошибки и транзакции |
| `breadcrumbs[].data.from` и `.to` — крошки навигации | ошибки и транзакции |
| `breadcrumbs[].message` — крошки `console`, если ссылку вывели в консоль | ошибки и транзакции |
| `contexts.trace.data["url.full"]` | транзакции |
| `spans[].description` у спанов загрузки страницы (`browser.request`, `browser.DNS` и других) | транзакции |

И второе: **`beforeSend` вызывается только для ошибок.** Транзакции идут мимо
него, в `beforeSendTransaction`. Раз в пункте 5 ты включаешь трейсинг, чистить
надо в обоих хуках.

Чистить поля по одному ненадёжно: следующая версия SDK положит URL в новое
место. Надёжнее убрать секрет **из всех строк события** — по шаблону самого
секрета, а не по имени поля. У Excalidraw это `#room=<id>,<ключ>` у
совместной комнаты и `#json=<id>,<ключ>` у ссылки «поделиться».

Две ловушки, на которые я наткнулся, пока проверял:

- **Не мутируй объекты события рекурсивно.** В нём есть служебное поле
  `sdkProcessingMetadata` с внутренними объектами SDK, среди них — свойства
  только для чтения. Рекурсивная запись упала с `Cannot set property … which
  has only a getter`, и одно событие в итоге ушло в Sentry **с ключом**.
  Надёжный способ — пересобрать каждое поле события через JSON, пропустив
  `sdkProcessingMetadata`: в Sentry оно не отправляется.
- **Если очистка не удалась — не отправляй событие** (`return null`).
  Потерять событие лучше, чем ключ.

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

Две вещи, которые легко упустить:

- **`crypto.randomUUID` есть только в безопасном контексте** — на `https` и на
  `localhost`. На внутреннем стенде, открытом по `http` и IP-адресу, его нет.
  Проверено: вызов падает с `TypeError: crypto.randomUUID is not a function`,
  а поскольку `sentry.ts` импортируется первым, **приложение не запускается
  вовсе**. `crypto.getRandomValues` работает везде — используй его как запасной
  вариант.
- **Недоступное хранилище — не ошибка для Sentry.** localStorage бросает в
  приватном режиме, при запрете сайту хранить данные, при переполнении. Это
  условие окружения, а не баг, который можно починить: `captureException` на
  каждый такой случай даст шумный issue без действия. Если хочешь знать,
  скольких пользователей это касается, повесь тег на события, а не отправляй
  отдельное событие.

И общее правило: код в `sentry.ts` не должен бросать исключений. Он
выполняется до приложения, и любая ошибка в нём роняет всё.

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

Проверен в сборке с заглушкой вместо Sentry: ни в одной из 15 отправок нет
ключа — ни в ошибках, ни в транзакциях, ни в крошках навигации и `console`;
на стенде по `http` и IP-адресу приложение запускается, и событие уходит.

```ts
import * as Sentry from "@sentry/react";

const runtimeConfig = window.__APP_CONFIG__;

// crypto.randomUUID есть только в безопасном контексте (https или localhost).
// На стенде, открытом по http и IP-адресу, его нет. getRandomValues есть везде.
function generateId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

let storageAvailable = true;

function getOrCreateAnonymousId(): string {
  try {
    const existing = localStorage.getItem("anonymousId");
    if (existing) {
      return existing;
    }
    const id = generateId();
    localStorage.setItem("anonymousId", id);
    return id;
  } catch {
    // Хранилище недоступно: приватный режим, запрет сайту хранить данные,
    // переполнение. Это не баг приложения — работаем с id на время вкладки.
    storageAvailable = false;
    return generateId();
  }
}

// Ключ шифрования Excalidraw живёт в хеше ссылки: #room=<id>,<ключ> у
// совместной комнаты и #json=<id>,<ключ> у ссылки «поделиться».
const SECRET_IN_HASH = /#(?:room|json)=[^\s"'<>\\]*/g;

// URL страницы оседает в событии во многих местах: request.url, крошки
// навигации, contexts.trace.data, description спанов загрузки страницы.
// Поэтому чистим не отдельные поля, а всё, что уйдёт в Sentry.
//
// Объекты события не мутируем: среди них есть свойства только для чтения.
// Каждое поле пересобирается через JSON — ровно в том виде, в каком
// отправляется. sdkProcessingMetadata — внутренние данные SDK, в Sentry
// они не уходят.
function scrubSecrets<T extends object>(event: T): T | null {
  const fields = event as unknown as Record<string, unknown>;
  try {
    for (const key of Object.keys(fields)) {
      if (key === "sdkProcessingMetadata") {
        continue;
      }
      const json = JSON.stringify(fields[key]);
      if (json !== undefined) {
        fields[key] = JSON.parse(json.replace(SECRET_IN_HASH, ""));
      }
    }
    return event;
  } catch {
    // Не смогли вычистить — не отправляем: потерять событие лучше, чем ключ.
    return null;
  }
}

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
    // Безвредный шум старых браузеров. Новую формулировку
    // «…completed with undelivered notifications» SDK отбрасывает сам.
    "ResizeObserver loop limit exceeded",
  ],

  // Код, внедрённый расширениями браузера.
  denyUrls: [/^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i],

  // Только события ошибок. Крошки к этому моменту уже в событии.
  beforeSend: (event) => scrubSecrets(event),
  // Трейсы идут мимо beforeSend.
  beforeSendTransaction: (event) => scrubSecrets(event),
});

// Непрозрачный идентификатор вместо почты и имени.
Sentry.setUser({ id: getOrCreateAnonymousId() });
if (!storageAvailable) {
  Sentry.setTag("storage", "unavailable");
}
```

> **Про `Failed to fetch` в списке Excalidraw.** Это сообщение любого
> сетевого сбоя `fetch`, а не только устаревших чанков. Шаблон спрячет и
> падения твоего собственного API. Для рабочего проекта сужай его до
> `/(fetch|loading) dynamically imported module/i`.

</details>

## Проверка

```bash
yarn workspace excalidraw-app build:artifact
deploy/serve-stand.sh production-01 5092
```

1. Открой адрес с ключом правильной длины — иначе Excalidraw покажет
   предупреждение и не войдёт в комнату:

   ```
   http://localhost:5092/#room=0123456789abcdef0123,SECRETkey1234567890abc
   ```

   В devtools → Console смени хеш, чтобы появилась крошка навигации:

   ```js
   history.pushState(null, "", "#room=fedcba9876543210fedc,SECONDkey0987654321xy")
   ```

   Нажми детонатор 1. В devtools → Network отфильтруй по `ingest` и поищи в
   телах запросов `SECRETkey` и `SECONDkey` — поиск по содержимому запросов
   открывается `Ctrl+F` на вкладке Network. Совпадений быть не должно ни в
   запросах ошибок, ни в запросе с `"type":"transaction"`.
2. В разделе **User** должен быть только `id`.
3. Открой devtools → Network, отфильтруй по `ingest`, найди запрос к Sentry и
   посмотри тело — полезно один раз увидеть своими глазами, что именно уезжает.
4. Проверь, что фильтр работает: временно добавь в `ignoreErrors` строку
   `"SENTRY LAB: synchronous throw"`, пересобери, перезапусти стенд, нажми
   детонатор 1 — события быть не должно. Потом убери.
5. Открой тот же стенд не по `localhost`, а по IP-адресу машины:
   `http://<IP>:5092`. Это небезопасный контекст, как у внутреннего стенда
   без `https`. Приложение должно запуститься, а событие детонатора 1 —
   прийти с `id` пользователя.
6. Проверь сэмплирование по стендам. Подними рядом `deploy/serve-stand.sh
   staging-01 5091` и в Network обнови страницу: при каждой загрузке уходит
   запрос с `"type":"transaction"` в теле. На `production-01` такой запрос
   будет примерно в одной загрузке из десяти. Сборка та же — отличается
   только `config.js`.

## Что должно сломаться, если сделать неправильно

| Симптом | Причина |
|---|---|
| `ignoreErrors` не срабатывает | Строка сопоставляется как подстрока сообщения; проверь, что не опечатался |
| Хеш всё ещё в событии | `beforeSend` не вернул `event`, либо чистишь отдельные поля и пропустил крошки |
| Ключ в запросе с `"type":"transaction"` | Нет `beforeSendTransaction`: транзакции идут мимо `beforeSend` |
| `Cannot set property … which has only a getter` | Рекурсивно мутируешь событие и зашёл в `sdkProcessingMetadata` |
| По IP-адресу пустая страница, `crypto.randomUUID is not a function` | Небезопасный контекст: нужен запасной вариант через `getRandomValues` |
| События из расширений всё ещё приходят | В `denyUrls` не тот протокол, либо у события нет стектрейса |
| Событий стало сильно меньше | Занизил `sampleRate` вместо `tracesSampleRate` |
| Трейсов нет вовсе | `tracesSampleRate` есть, а `browserTracingIntegration()` не подключил |

## Итог

- [ ] Шум отфильтрован через `ignoreErrors` и `denyUrls`
- [ ] Ключ комнаты не уходит ни в ошибках, ни в транзакциях, ни в крошках
- [ ] Стенд по `http` и IP-адресу запускается
- [ ] Пользователь — непрозрачный `id`, без почты
- [ ] Сэмплирование трейсов различается по стендам

```bash
git add -A && git commit -m "лаба 06: фильтрация шума, чистка URL, сэмплирование"
```

→ [Лаба 07. CI](07-ci.md)
