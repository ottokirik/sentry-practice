# Лаба 01. SDK и первая ошибка

**~20 минут**

## Цель

Поставить `@sentry/react`, инициализировать SDK и увидеть первое событие в
интерфейсе Sentry.

## Теория на пять строк

`Sentry.init()` вешает глобальные перехватчики: `window.onerror`,
`unhandledrejection`, обёртки над `setTimeout` и прочим. Поэтому вызывать его
надо **до** того, как выполнится код приложения — иначе ошибки, случившиеся
на старте, пройдут мимо.

В ES-модулях импорты выполняются в порядке их объявления. Значит,
side-effect импорт `import "./sentry"` достаточно поставить **выше** импорта
`App` — и он отработает первым.

Отдельная история — ошибки рендера React. Их не ловит ни `window.onerror`, ни
что-либо ещё: React перехватывает их сам и отдаёт ближайшей *error boundary*.
Если у boundary нет явного вызова Sentry — событие не уедет никуда.

## Задание

### 1. Поменяй SDK

Excalidraw использует `@sentry/browser`. Нам нужен `@sentry/react` — это тот же
SDK плюс React-специфика: `ErrorBoundary`, хук профилировщика, интеграции с
роутерами.

```bash
yarn workspace excalidraw-app add @sentry/react@10.74.0
```

После этого `@sentry/browser` останется в зависимостях, но его использует
`excalidraw-app/components/TopErrorBoundary.tsx`. Переведи и его на
`@sentry/react` (там ровно одна строка импорта), а потом убери старый пакет:

```bash
yarn workspace excalidraw-app remove @sentry/browser
```

> `@sentry/react` реэкспортирует всё из `@sentry/browser`, так что
> `Sentry.withScope` и `Sentry.captureException` в `TopErrorBoundary`
> продолжат работать без изменений.

### 2. Создай `excalidraw-app/sentry.ts`

Минимальная инициализация — только DSN. Всё остальное добавим в следующих
лабах.

### 3. Подключи его в `excalidraw-app/index.tsx`

Импорт должен стоять **выше** `import ExcalidrawApp from "./App"`.

### 4. Оберни панель в `Sentry.ErrorBoundary`

В `excalidraw-app/App.tsx` оберни `<DebugPanel />` в `Sentry.ErrorBoundary` с
каким-нибудь `fallback`. Это решает сразу две задачи: ошибки рендера начнут
доезжать до Sentry, и детонатор 6 перестанет ронять приложение в пустой экран
(тот самый баг Excalidraw из [docs/README.md](../README.md)).

> **Про импорт и линтер.** У Excalidraw включено правило `import/order`, и
> `yarn fix:code` его здесь не починит. Ставь `import * as Sentry from
> "@sentry/react";` сразу после `import clsx from "clsx";` в блоке внешних
> пакетов (около 58-й строки). Если положить импорт рядом с `DebugPanel`,
> получишь предупреждение и красный `yarn test:code`.

<details>
<summary>Эталон</summary>

`excalidraw-app/sentry.ts`:

```ts
import * as Sentry from "@sentry/react";

Sentry.init({
  // DSN — не секрет: он уезжает в бандл и виден в devtools.
  // В лабе 02 переедет в переменные окружения.
  dsn: "https://<твой-ключ>@<org>.ingest.sentry.io/<id>",
});
```

`excalidraw-app/index.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import "../excalidraw-app/sentry";

import ExcalidrawApp from "./App";
```

`excalidraw-app/components/TopErrorBoundary.tsx`, строка 3:

```ts
import * as Sentry from "@sentry/react";
```

`excalidraw-app/App.tsx` — импорт в блоке внешних пакетов:

```ts
import clsx from "clsx";
import * as Sentry from "@sentry/react";
```

и сама обёртка:

```tsx
<Provider store={appJotaiStore}>
  <ExcalidrawAPIProvider>
    <ExcalidrawWrapper />
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <button
          style={{ position: "fixed", bottom: "1rem", left: "1rem" }}
          onClick={resetError}
        >
          Панель упала. Восстановить
        </button>
      )}
    >
      <DebugPanel />
    </Sentry.ErrorBoundary>
  </ExcalidrawAPIProvider>
</Provider>
```

</details>

## Проверка

```bash
yarn test:typecheck && yarn test:code
```

Оба должны пройти. Затем:

```bash
yarn start
```

1. Нажми **💣 Sentry lab** → **1. Синхронный throw**.
2. Открой **Issues** в Sentry. В течение 10–30 секунд появится
   `Error: SENTRY LAB: synchronous throw in a click handler`.
3. Открой событие. Стектрейс будет **читаемый** — с именами файлов и строками
   исходника. Так и должно быть: дев-сервер Vite отдаёт неминифицированный код.
   Именно поэтому проблема source maps не видна в разработке и обнаруживается
   уже на проде.
4. Нажми детонатор **6. Ошибка при рендере React**. Вместо пустого экрана
   появится кнопка «Панель упала. Восстановить», приложение останется живым,
   а в Sentry прилетит второе событие.

## Что должно сломаться, если сделать неправильно

| Симптом | Причина |
|---|---|
| В Issues пусто, в Network запрос к `ingest` красный или отсутствует | Блокировщик рекламы. Отключи его для `localhost`, а не для `sentry.io` |
| В Issues пусто, в консоли тишина | Либо блокировщик (см. строку выше), либо опечатка в DSN — SDK молчит в обоих случаях. Различает только вкладка Network |
| `yarn test:code` ругается на `import/order` | Импорт `@sentry/react` не в том блоке — см. врезку выше |
| Детонатор 6 всё ещё даёт пустой экран | `Sentry.ErrorBoundary` обёрнут не вокруг `<DebugPanel />` |
| Ошибки со старта приложения не приходят | `import "./sentry"` стоит ниже `import ExcalidrawApp` |

## Итог

- [ ] `@sentry/react` установлен, `@sentry/browser` удалён
- [ ] `sentry.ts` создан, импортирован до `App`
- [ ] `Sentry.ErrorBoundary` обёрнут вокруг панели
- [ ] События из детонаторов 1 и 6 видны в Issues

```bash
git add -A && git commit -m "лаба 01: @sentry/react, init и ErrorBoundary"
```

→ [Лаба 02. Три стенда](02-environments.md)
