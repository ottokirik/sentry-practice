# Лаба 09. Мониторинг за фасадом и бизнес-ошибки

**~70 минут**

## Цель

Спрятать Sentry за собственным модулем, чтобы код приложения не зависел от
поставщика, и начать сообщать о бизнес-ошибках — так, чтобы они помогали, а
не превращались в шум.

Лаба не зависит от лаб 07 и 08: её можно делать в любом порядке после 06.
Если лаба 07 уже пройдена, локальная сборка не заливает карты — стектрейсы в
Sentry будут минифицированными, но на выводы лабы это не влияет.

## Теория

### Где поставщик уже в коде

| Файл | Что там |
|---|---|
| `excalidraw-app/sentry.ts` | инициализация, очистка ключа, пользователь |
| `excalidraw-app/App.tsx` | `Sentry.ErrorBoundary` вокруг панели |
| `excalidraw-app/components/TopErrorBoundary.tsx` | `withScope` и `captureException` |

Пока мест три, переезд дешёвый. Дороже он станет, когда `captureException`
появится в каждом модуле с бизнес-логикой — а бизнес-ошибки как раз туда его и
принесут. Поэтому оба вопроса лабы решаются одним модулем.

### Фасад: что прятать, а что нет

Фасад — модуль с API **в терминах приложения**: «сообщить о баге», «сообщить о
бизнес-проблеме», «отметить ожидаемый исход». Внутри один адаптер, и только он
знает о Sentry.

У Excalidraw уже есть ровно такой фасад — для `jotai`. Загляни в
`.eslintrc.json`: прямой импорт `jotai` запрещён правилом с сообщением «Use
our app-specific modules», а `excalidraw-app/app-jotai.ts` — единственный
файл, где запрет снят комментарием. Сделаем так же.

Что **не** стоит абстрагировать:

- инициализацию, очистку ключа, трейсинг и заливку карт — они завязаны на
  поставщика и при переезде всё равно переписываются. Им место внутри адаптера;
- весь API Sentry целиком — фасад описывает твои потребности, а не чужой SDK;
- поддержку нескольких поставщиков сразу — её не нужно, пока нет второго.

Фасад не делает переезд бесплатным: алерты, дашборды и соглашения о тегах тоже
живут у поставщика. Он превращает переезд **кода** в правку одной папки.

### Ошибки рендера сообщаются в корне

В React 19 у `createRoot` есть обработчики `onCaughtError`,
`onUncaughtError` и `onRecoverableError`. Если сообщать об ошибках рендера
там, границы ошибок становятся обычными React-компонентами без импорта SDK.

Проверено по исходнику React 19.0.0 из этого проекта:

- **`onCaughtError` вызывается раньше `componentDidCatch`.** Значит, внутри
  `componentDidCatch` идентификатор отправленного события уже известен.
- **Заданный обработчик заменяет стандартный.** По умолчанию `onCaughtError`
  печатает ошибку в консоль. Если передать свой и не печатать, ошибка пропадёт
  из консоли даже в разработке.

В `@sentry/react` для этих обработчиков есть `reactErrorHandler()`. Проверено
по его исходнику: **без колбэка** он помечает ошибку как необработанную,
**с колбэком** — как обработанную. Отсюда разные варианты для пойманных и
непойманных ошибок в эталоне.

### Не всё, что пошло не так, — ошибка для Sentry

Главный вопрос: нужно ли кому-то взять задачу, если это случилось один раз?

| Класс | Пример в Excalidraw | Как сообщать | Алерт |
|---|---|---|---|
| **Баг** | исключение в коде | `reportError`, уровень `error` | на новый issue |
| **Аномалия**: инвариант нарушен, исключения может и не быть | данные ссылки пришли, но не расшифровались | `reportProblem`, уровень `error` | на новый issue |
| **Обработанный сбой** | бэкенд ответил 5xx | `reportProblem`, уровень `warning` | на частоту |
| **Ожидаемый исход** | ключ в ссылке не той длины; ссылка устарела (404); нет сети | `trackOutcome` — крошка, а не событие | не нужен |

Ожидаемые исходы в ленте issues — это шум и выгорание от алертов. Список
`ignoreErrors` у Excalidraw — пример того, как такое приходится вычищать
постфактум. Считать их частоту — задача аналитики или метрик, а не трекера
ошибок. В Sentry они полезны как **крошки**: когда случится настоящий баг, в
событии будет видно, что пользователь перед этим открыл битую ссылку.

### Группировка: без fingerprint ничего не заработает

Из документации Sentry:

> When Sentry detects a stack trace in the event data (either directly or as
> part of an exception), the grouping is effectively based entirely on the
> stack trace.

Текст ошибки при этом **не учитывается**. Если все бизнес-ошибки идут через
один `reportProblem`, то разные коды из одного места слипнутся в один issue, а
один и тот же код из двух мест разделится на два.

Лечится явным `fingerprint` по коду. Проверено на этом проекте: у проблем с
кодами из одной строки кода, отправленных при ответах 500 и 503, стектрейсы
совпадают до кадра — без `fingerprint` их различал бы только текст, который
Sentry не смотрит.

Отсюда ещё одно правило: **код — стабильный машинный идентификатор**
(`scene_import.decode_failed`), а не текст сообщения. У Excalidraw интерфейс
переведён на много языков, и текст из `t()` разделил бы одну проблему по
языкам.

## Что уже есть в репозитории

- `excalidraw-app/debug/fake-scene-backend.mjs` — поддельный бэкенд ссылок
  «поделиться». Отвечает на `GET /api/v2/<id>`: `missing` → 404,
  `error` → 500, `unavailable` → 503, `garbage` → 200 с мусором вместо
  зашифрованной сцены. Настоящий `json.excalidraw.com` в лабе не нужен.
- `docs/upstream/` исключён из линтера: там архивная копия `sentry.ts`
  Excalidraw, новое правило ругалось бы и на неё.

## Задание

### 0. Посмотри, как сейчас

Запусти поддельный бэкенд и собери приложение, направив его туда. Переменная
окружения при сборке важнее значения из `.env.production`:

```bash
node excalidraw-app/debug/fake-scene-backend.mjs
```

```bash
VITE_APP_BACKEND_V2_GET_URL=http://localhost:5083/api/v2/ \
  yarn workspace excalidraw-app build:artifact
deploy/serve-stand.sh staging-01 5091
```

> Эта сборка смотрит в поддельный бэкенд. Не раскатывай её никуда, а после
> лабы пересобери без переменной.

Каждую ссылку открывай в **новом приватном окне**: сервис-воркер
(лаба 05) и сохранённая сцена мешают повторным проверкам. Ключ в ссылке —
любые 22 символа:

```
http://localhost:5091/#json=error,AAAAAAAAAAAAAAAAAAAAAA
http://localhost:5091/#json=garbage,AAAAAAAAAAAAAAAAAAAAAA
```

Сравни, что видит пользователь и что приходит в Sentry. На текущем коде
проверено:

| Ссылка | Пользователь видит | В Sentry |
|---|---|---|
| `error` (500) | «Не удалось импортировать с сервера» | **ничего** |
| `garbage` | **ничего**: ни сообщения, ни сцены | `OperationError: No error message`, необработанное |

Второй случай — настоящий баг Excalidraw. Найди его в
`importFromBackend` (`excalidraw-app/data/index.ts`) до того, как откроешь
разбор ниже.

<details>
<summary>Разбор бага</summary>

Во внутреннем `catch` стоит `return legacy_decodeFromBackend(...)` без
`await`, а сама функция асинхронная. В асинхронной функции `return` промиса
внутри `try` завершает блок сразу, и отказ этого промиса уходит вызывающему
коду **мимо** внешнего `catch`. Поэтому не показывается сообщение, а в Sentry
прилетает безликий необработанный отказ.

```bash
node -e '
async function inner() { throw new Error("legacy failed") }
async function f() {
  try { try { throw new Error("new format failed") } catch { return inner() } }
  catch { return "внешний catch" }
}
f().then(v => console.log("resolved:", v), e => console.log("мимо catch:", e.message))'
```

Выведет `мимо catch: legacy failed`. Лечится `return await`.

</details>

### 1. Сначала правило линтера

Добавь в `.eslintrc.json` запрет на импорт `@sentry/*`. Сейчас правило
`no-restricted-imports` задано в короткой форме только для `jotai` — его
придётся переписать в форму с `paths` и `patterns`, не потеряв запрет на
`jotai`.

```bash
yarn test:code
```

Линтер покажет ровно те места, которые предстоит перенести. Проверено — их три:
`App.tsx`, `TopErrorBoundary.tsx` и `sentry.ts`. Цель следующих шагов —
вернуть линтер в зелёное состояние.

`vite.config.mts` с плагином заливки линтер не проверяет: в
`yarn test:code` расширения только `.js,.ts,.tsx`.

### 2. Спроектируй API

До кода ответь себе:

- какие действия нужны приложению — не SDK, а именно приложению;
- что из них возвращает результат и зачем (подсказка: `TopErrorBoundary`
  показывает пользователю идентификатор события);
- чем `reportProblem` отличается от `reportError` на входе.

Сверь с эталоном: `types.ts` и `index.ts`.

### 3. Адаптер

Создай `excalidraw-app/monitoring/`:

- `types.ts` — контракт без упоминания поставщика;
- `sentry.ts` — перенеси сюда содержимое `excalidraw-app/sentry.ts` из лабы 06
  и реализуй функции фасада. Запрет линтера здесь сними комментарием, как в
  `app-jotai.ts`;
- `index.ts` — публичный API, реэкспорт из адаптера.

Старый `excalidraw-app/sentry.ts` удали.

Импорт фасада в `index.tsx` по-прежнему должен стоять **раньше**
`import ExcalidrawApp from "./App"`: модуль адаптера инициализирует SDK при
загрузке.

### 4. Ошибки рендера в корне

1. Передай обработчики из фасада в `createRoot(rootElement, …)`.
2. Замени `Sentry.ErrorBoundary` в `App.tsx` своей границей ошибок без
   поставщика — простой классовый компонент с `getDerivedStateFromError`.
3. В `TopErrorBoundary` убери отправку: об ошибке уже сообщает корень, а два
   независимых вызова отправки на одну ошибку — лишний риск задвоенных
   событий. Идентификатор события для экрана ошибки возьми через фасад.

Экран `TopErrorBoundary` у Excalidraw всё равно не отрисуется: это баг из
[docs/README.md](../README.md) с `Missing Provider`. Правка здесь нужна ради
того, чтобы в границе не осталось SDK и не было двойной отправки.

### 5. Бизнес-ошибки в `data/index.ts`

Классифицируй по таблице из теории и расставь вызовы фасада:

- `getCollaborationLinkData` — ключ не той длины;
- `importFromBackend` — нет сети, 404, другой код ответа, данные не
  расшифровались. Сейчас нет сети и ошибка расшифровки попадают в один и тот же
  `catch`, а классы у них разные. Разнеси их по разным местам кода;
- почини баг с `return` без `await` из шага 0.

<details>
<summary>Эталон</summary>

Проверен на сборке с поддельным бэкендом и заглушкой вместо Sentry — таблица
результатов в разделе «Проверка». Код проходит `tsc`, `eslint` и `prettier`.

`.eslintrc.json`:

```json
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          {
            "name": "jotai",
            "message": "Do not import from \"jotai\" directly. Use our app-specific modules (\"editor-jotai\" or \"app-jotai\")."
          }
        ],
        "patterns": [
          {
            "group": ["@sentry/*"],
            "message": "Не импортируй SDK мониторинга напрямую. Используй excalidraw-app/monitoring."
          }
        ]
      }
    ],
```

`excalidraw-app/monitoring/types.ts`:

```ts
// Контракт мониторинга. Здесь нет ничего от поставщика: при переезде на
// другой сервис этот файл не меняется.

export interface ReportContext {
  // Область приложения: "collab", "scene-import", "export".
  domain?: string;
  // Дополнительные данные. Без персональных данных и секретов.
  extra?: Record<string, unknown>;
}

export interface ProblemContext extends ReportContext {
  // error — нарушен инвариант, нужен разбор по первому событию.
  // warning — обработанный сбой, важна частота, а не каждый случай.
  level?: "error" | "warning";
  // Исходная ошибка, если она есть. Попадёт в событие цепочкой причин.
  cause?: unknown;
}
```

`excalidraw-app/monitoring/index.ts`:

```ts
// Публичный API мониторинга. Приложение импортирует только этот модуль.
// Поставщик (сейчас Sentry) спрятан в ./sentry: импорт этого модуля
// инициализирует SDK, поэтому в index.tsx он стоит раньше приложения.

export {
  lastReportId,
  reportError,
  reportProblem,
  rootErrorHandlers,
  trackOutcome,
} from "./sentry";

export type { ProblemContext, ReportContext } from "./types";
```

`excalidraw-app/monitoring/sentry.ts` — начало файла:

```ts
// Единственный файл приложения, который знает о поставщике мониторинга.
// eslint-disable-next-line no-restricted-imports
import * as Sentry from "@sentry/react";

import type { RootOptions } from "react-dom/client";

import type { ProblemContext, ReportContext } from "./types";
```

дальше без изменений всё из `sentry.ts` лабы 06: `generateId`, анонимный
идентификатор, `scrubSecrets`, `Sentry.init`, `setUser` и тег хранилища. В
конце файла:

```ts
const domainTag = (domain?: string) => (domain ? { domain } : undefined);

// Баг: исключение, которого в коде быть не должно.
export function reportError(error: unknown, ctx: ReportContext = {}): string {
  return Sentry.captureException(error, {
    tags: domainTag(ctx.domain),
    extra: ctx.extra,
  });
}

// Бизнес-проблема со стабильным кодом.
export function reportProblem(code: string, ctx: ProblemContext = {}): string {
  const problem = new Error(code, { cause: ctx.cause });
  problem.name = "Problem";

  return Sentry.captureException(problem, {
    level: ctx.level ?? "error",
    // Без fingerprint Sentry группирует по стектрейсу и не смотрит на код:
    // разные коды из одного места слипнутся, один код из двух мест разделится.
    fingerprint: ["problem", code],
    tags: { problem: code, ...domainTag(ctx.domain) },
    extra: ctx.extra,
  });
}

// Ожидаемый исход: не ошибка, а контекст для будущих событий.
export function trackOutcome(code: string, ctx: ReportContext = {}): void {
  Sentry.addBreadcrumb({
    category: "outcome",
    message: code,
    level: "info",
    data: { ...domainTag(ctx.domain), ...ctx.extra },
  });
}

export const lastReportId = (): string | undefined => Sentry.lastEventId();

const reportUncaught = Sentry.reactErrorHandler();

// Ошибки рендера сообщаются в корне, а не в каждой границе ошибок.
// Заданный обработчик заменяет стандартный вывод React в консоль,
// поэтому печатаем сами.
export const rootErrorHandlers: Pick<
  RootOptions,
  "onCaughtError" | "onUncaughtError" | "onRecoverableError"
> = {
  // Ошибку поймала граница, пользователь видит запасной интерфейс.
  // С колбэком SDK помечает ошибку как обработанную.
  onCaughtError: Sentry.reactErrorHandler((error) => console.error(error)),
  // Ни одна граница не поймала: React размонтировал дерево.
  onUncaughtError: (error, errorInfo) => {
    reportUncaught(error, errorInfo);
    console.error(error);
  },
  onRecoverableError: Sentry.reactErrorHandler((error) => console.warn(error)),
};
```

`excalidraw-app/components/ErrorBoundary.tsx`:

```tsx
import React from "react";

interface ErrorBoundaryProps {
  fallback: (reset: () => void) => React.ReactNode;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Граница ошибок без поставщика мониторинга. Об ошибке сообщает обработчик
// onCaughtError в корне приложения (excalidraw-app/index.tsx).
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    return this.state.hasError
      ? this.props.fallback(this.reset)
      : this.props.children;
  }
}
```

`excalidraw-app/index.tsx`:

```tsx
import { rootErrorHandlers } from "./monitoring";
import ExcalidrawApp from "./App";

// …

const root = createRoot(rootElement, rootErrorHandlers);
```

`excalidraw-app/App.tsx` — вместо импорта `@sentry/react`:

```tsx
import { ErrorBoundary } from "./components/ErrorBoundary";
```

и вокруг панели:

```tsx
<ErrorBoundary
  fallback={(reset) => (
    <button
      style={{ position: "fixed", bottom: "1rem", left: "1rem" }}
      onClick={reset}
    >
      Панель упала. Восстановить
    </button>
  )}
>
  <DebugPanel />
</ErrorBoundary>
```

`excalidraw-app/components/TopErrorBoundary.tsx`:

```tsx
import React from "react";

import { lastReportId } from "../monitoring";
```

```tsx
    // Об ошибке уже сообщил onCaughtError в корне: React вызывает его
    // раньше componentDidCatch, поэтому идентификатор события уже есть.
    this.setState({
      hasError: true,
      sentryEventId: lastReportId() ?? "",
      localStorage: JSON.stringify(_localStorage),
    });
```

`excalidraw-app/data/index.ts`:

```ts
import { reportProblem, trackOutcome } from "../monitoring";
```

```ts
  if (match && match[2].length !== 22) {
    // Ожидаемый исход: ссылку обрезали при копировании. Это не баг.
    trackOutcome("collab.invalid_key_length", { domain: "collab" });
    window.alert(t("alerts.invalidEncryptionKey"));
    return null;
  }
```

```ts
export const importFromBackend = async (
  id: string,
  decryptionKey: string,
): Promise<ImportedDataState> => {
  let response: Response;
  try {
    response = await fetch(`${BACKEND_V2_GET}${id}`);
  } catch (error: any) {
    // Нет сети: состояние пользователя, а не наш сбой.
    trackOutcome("scene_import.network_failed", { domain: "scene-import" });
    window.alert(t("alerts.importBackendFailed"));
    console.error(error);
    return {};
  }

  if (!response.ok) {
    if (response.status === 404) {
      // Ссылка устарела или скопирована с ошибкой.
      trackOutcome("scene_import.link_not_found", { domain: "scene-import" });
    } else {
      // Бэкенд ответил ошибкой. Сбой на нашей стороне, важна частота.
      reportProblem("scene_import.backend_failed", {
        level: "warning",
        domain: "scene-import",
        extra: { status: response.status },
      });
    }
    window.alert(t("alerts.importBackendFailed"));
    return {};
  }

  try {
    const buffer = await response.arrayBuffer();

    try {
      // … расшифровка в новом формате без изменений …
    } catch (error: any) {
      console.warn(
        "error when decoding shareLink data using the new format:",
        error,
      );
      // Без await отказ старого декодера проскакивал мимо catch ниже:
      // пользователь не видел сообщения, а в мониторинг уходил безликий
      // необработанный OperationError.
      return await legacy_decodeFromBackend({ buffer, decryptionKey });
    }
  } catch (error: any) {
    // Данные пришли, но не расшифровались: ключ не подходит к сцене или
    // сломан формат. На клиенте одно от другого не отличить, а сломанное
    // шифрование после релиза — самый дорогой вариант. Разбираем по первому.
    reportProblem("scene_import.decode_failed", {
      domain: "scene-import",
      cause: error,
    });
    window.alert(t("alerts.importBackendFailed"));
    console.error(error);
    return {};
  }
};
```

> **Спорное решение.** `decode_failed` помечен уровнем `error`. Если окажется,
> что это в основном пользователи с испорченными ссылками, понизь до
> `warning` и повесь алерт на рост частоты после релиза.

</details>

## Проверка

```bash
yarn test:typecheck && yarn test:code
```

Оба зелёные — значит, SDK больше нигде, кроме адаптера, не импортируется.

Пересобери с поддельным бэкендом, перезапусти стенд и пройди сценарии, каждый
в новом приватном окне. После сценариев с крошками нажми детонатор 1, чтобы
крошки уехали вместе с событием.

| Сценарий | Пользователь видит | В Sentry |
|---|---|---|
| `#room=abcdef0123456789abcd,shortkey`, затем детонатор 1 | предупреждение о длине ключа | нет события про ключ; у события детонатора крошка `outcome` `collab.invalid_key_length` |
| `#json=missing,…` | «Не удалось импортировать с сервера» | событий нет |
| `#json=error,…` | то же сообщение | `Problem: scene_import.backend_failed`, уровень `warning`, `extra.status: 500` |
| `#json=unavailable,…` | то же сообщение | ещё одно событие **в том же issue**, `extra.status: 503` |
| `#json=garbage,…` | то же сообщение — **раньше не было** | `Problem: scene_import.decode_failed`, уровень `error`, причина — `OperationError` |
| останови поддельный бэкенд, `#json=anything,…`, затем детонатор 1 | то же сообщение | нет события про сеть; у события детонатора крошка `scene_import.network_failed` |
| детонатор 6 | кнопка «Панель упала. Восстановить», ошибка в консоли | **одно** событие со стеком компонентов React |

Всё это проверено на эталоне, кроме группировки в интерфейсе Sentry — её
смотри у себя:

1. Открой issue `scene_import.backend_failed`. Внизу страницы, в **Event
   Grouping Information**, должно быть написано, что группировка по
   fingerprint, а событий — два, с разными статусами.
2. **Проверь ловушку.** Временно поменяй код на
   `` reportProblem(`scene_import.http_${response.status}`) `` и убери
   `fingerprint` в адаптере. Пересобери, открой `error` и `unavailable`.
   Два разных кода окажутся **в одном** issue: строка кода одна, стектрейс
   один, а текст Sentry не смотрит. Верни `fingerprint` — коды разойдутся по
   двум issue. Потом верни и код.

## Что должно сломаться, если сделать неправильно

| Симптом | Причина |
|---|---|
| Линтер ругается на `jotai` там, где раньше не ругался, или перестал ругаться | Правило переписано в форму `paths` и `patterns`, но запрет на `jotai` потерян или заменён |
| Линтер ругается на `docs/upstream/sentry.original.ts` | Нет строки `docs/upstream/` в `.eslintignore` |
| Ошибка рендера не видна в консоли | Свой `onCaughtError` без `console.error`: он заменяет стандартный вывод React |
| У ошибки рендера нет события | Обработчики не переданы в `createRoot` |
| Разные коды проблем в одном issue | Нет `fingerprint` |
| На `garbage` пользователь снова ничего не видит | Вернулся `return` без `await` |
| Событие про 404 или про отсутствие сети | Ожидаемый исход отправлен через `reportProblem` вместо `trackOutcome` |
| Сценарии ведут себя по-старому | Сервис-воркер отдал прежнюю сборку — открой в новом приватном окне |

## Итог

- [ ] SDK импортирует только `excalidraw-app/monitoring/sentry.ts`, линтер
      это проверяет
- [ ] Ошибки рендера сообщаются в корне, границы ошибок без поставщика
- [ ] Бизнес-ошибки разделены на аномалии, обработанные сбои и ожидаемые
      исходы
- [ ] У проблем стабильные коды и `fingerprint`
- [ ] Баг с `return` без `await` исправлен

```bash
git add -A && git commit -m "лаба 09: мониторинг за фасадом, бизнес-ошибки"
```

Не забудь пересобрать приложение без `VITE_APP_BACKEND_V2_GET_URL`.
