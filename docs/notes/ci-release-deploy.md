# Релиз, deploy и переменные: схемы

Шпаргалка к лабе 07. Схемы описывают файлы `.github/workflows/build-and-deploy.yml`
и `restore-sourcemaps.yml` из эталона лабы.

Mermaid отображается на GitHub. В VS Code для этого нужно расширение
«Markdown Preview Mermaid Support».

## Что с чем связывает Sentry

```mermaid
flowchart LR
    ev["Событие ошибки из браузера"]
    rel["Релиз<br/>excalidraw-lab@хеш"]
    env["Окружение<br/>staging или production"]
    tag["Тег stand<br/>staging-01, production-01"]
    bundle["Бандл карт"]
    commits["Коммиты"]
    d1["Deploy<br/>staging, staging-01"]
    d2["Deploy<br/>production, production-01"]

    ev -- "release" --> rel
    ev -- "environment" --> env
    ev -- "tags.stand" --> tag
    ev -- "debug_id" --> bundle
    rel --> commits
    rel --> d1
    rel --> d2
    d1 -.-> env
    d2 -.-> env
```

- **Релиз** — версия кода. Один на артефакт, создаётся при сборке.
- **Deploy** — факт выкатки релиза в окружение. Их столько, сколько раскаток.
- **Карты к событию подбираются по `debug_id`, а не по релизу** (лаба 03).

## Релиз и deploy по шагам

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Разработчик
    participant Build as CI: build
    participant Store as Артефакты CI
    participant Sentry
    participant Stg as CI: deploy-staging
    participant Prod as CI: deploy-production
    actor User as Пользователь

    Dev->>Build: git push в main
    Note over Build: RELEASE = excalidraw-lab@ + короткий хеш
    Build->>Build: vite build — RELEASE и DSN вшиваются в бандл
    Build->>Build: sentry-cli sourcemaps inject — Debug ID в JS и карты
    Build->>Store: sentry-bundle — код и карты
    Build->>Sentry: releases new
    Build->>Sentry: sourcemaps upload --wait
    Build->>Sentry: releases set-commits
    Build->>Sentry: releases finalize
    Build->>Build: удалить карты
    Build->>Sentry: artifact-lookup по Debug ID
    Sentry-->>Build: бандл найден
    Build->>Store: excalidraw-app — код без карт

    Store->>Stg: excalidraw-app
    Stg->>Stg: config.js для staging-01, публикация
    Stg->>Sentry: deploys new --env staging --name staging-01

    Note over Prod: ждёт подтверждения в GitHub
    Store->>Prod: sentry-bundle
    Prod->>Sentry: sourcemaps upload из архива
    Sentry-->>Prod: обычно Nothing to upload
    Store->>Prod: excalidraw-app
    Prod->>Prod: config.js для production-01, публикация
    Prod->>Sentry: deploys new --env production --name production-01

    User->>Sentry: событие: release, environment, stand, debug_id
    Sentry->>Sentry: карта по debug_id, событие попадает в релиз
```

Восстановление карт — отдельный ручной workflow `restore-sourcemaps`: берёт
`sentry-bundle` из указанного прогона и повторяет шаг заливки.

## Откуда берутся переменные

### Что попадает в браузер

```mermaid
flowchart LR
    git["git<br/>короткий хеш коммита"] --> release["RELEASE<br/>excalidraw-lab@хеш"]
    release --> bundle["бандл"]
    envprod[".env.production<br/>VITE_SENTRY_DSN"] --> bundle
    bundle -- "dsn, release<br/>вшиты при сборке" --> sdk["Sentry.init<br/>в браузере"]
    stands["deploy/stands/*.json"] --> config["config.js стенда"]
    config -- "environment, stand,<br/>tracesSampleRate<br/>при раскатке" --> sdk
```

Ветка через бандл одинакова на всех стендах и вшивается **при сборке**. Ветка
через `config.js` у каждого стенда своя и пишется **при раскатке**.

### Чем CI обращается к Sentry

```mermaid
flowchart LR
    access["Доступ к Sentry<br/>токен · Secrets<br/>организация · Variables<br/>проект · env workflow"]
    release["RELEASE<br/>excalidraw-lab@хеш"]
    envprod[".env.production<br/>DSN"]
    literals["строки в workflow<br/>staging, staging-01"]

    subgraph build["job build"]
        releaseCmds["releases new, upload,<br/>set-commits, finalize"]
        lookup["проверка artifact-lookup"]
    end

    subgraph deploy["job deploy-*"]
        deployCmd["deploys new"]
    end

    access --> build
    access --> deploy
    release --> releaseCmds
    release -- "outputs.release" --> deployCmd
    envprod -- "регион API" --> lookup
    literals -- "--env, --name" --> deployCmd

    classDef secretNode stroke:#c0392b,stroke-width:3px
    class access secretNode
```

> **Имя окружения живёт в двух местах.** Для SDK оно берётся из
> `deploy/stands/staging-01.json`, а для `deploys new` записано в workflow
> строкой. Если переименовать окружение только в одном месте, deploy в Sentry
> окажется в одном окружении, а события — в другом. На рабочем проекте лучше
> брать оба значения из одной конфигурации стенда, например
> `jq -r .environment` по тому же файлу, из которого пишется `config.js`.

| Переменная | Откуда | Где используется | Секрет |
|---|---|---|---|
| `SENTRY_AUTH_TOKEN` | GitHub → Settings → Secrets | все вызовы `sentry-cli` и API Sentry | **да** |
| `SENTRY_ORG` | GitHub → Settings → Variables | `sentry-cli`, API | нет |
| `SENTRY_PROJECT` | `env` в workflow: `excalidraw-lab` | `sentry-cli`, API | нет |
| `RELEASE` / `VITE_APP_RELEASE` | шаг «Имя релиза»: `excalidraw-lab@` + короткий хеш | вшивается в бандл; `releases`; в deploy через `outputs.release` | нет |
| `VITE_SENTRY_DSN` | `.env.production` в репозитории | вшивается в бандл; из него вычисляется регион API | нет |
| `environment`, `stand`, `tracesSampleRate` | `deploy/stands/*.json` → `config.js` | `Sentry.init` в браузере; `--env` и `--name` у `deploys new` | нет |
| `GITHUB_TOKEN` | выдаётся GitHub на каждый прогон | публикация на Pages, скачивание архива | да, но заводить не нужно |

Единственный секрет, который заводишь ты, — токен Sentry. Всё остальное
открыто: DSN уезжает в бандл, конфигурация стенда — в публичный `config.js`.
