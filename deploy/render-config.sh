#!/usr/bin/env bash
#
# Имитация entrypoint контейнера: забрать конфигурацию стенда и разложить её
# статическими файлами рядом со сборкой. Сама сборка при этом не меняется.
#
#   deploy/render-config.sh <url-конфига-стенда> <каталог-со-сборкой>
#
# На рабочем проекте URL указывает на внутренний сервис конфигурации. В
# практикуме это file:// на deploy/stands/*.json — curl понимает оба варианта,
# так что скрипт одинаковый.
set -euo pipefail

config_url="${1:?укажи URL конфигурации стенда}"
target_dir="${2:?укажи каталог со сборкой}"

command -v jq >/dev/null || {
  echo "нужен jq: mise use -g jq" >&2
  exit 1
}

raw="$(curl -fsS "$config_url")"

# Как принято на проекте: небольшие JSON-файлы, которые приложение само
# запрашивает fetch'ем уже после старта.
mkdir -p "$target_dir/config"
jq '.app' <<<"$raw" >"$target_dir/config/app.json"

# То, что нужно знать ДО старта приложения, — синхронным скриптом.
# Файл публичный, как и JSON выше: секретам здесь не место.
jq -r '"window.__APP_CONFIG__ = " + ({environment, stand, sentry} | tojson) + ";"' \
  <<<"$raw" >"$target_dir/config.js"

echo "конфигурация $(jq -r .stand <<<"$raw") → $target_dir"
