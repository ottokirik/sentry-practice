#!/usr/bin/env bash
#
# Раскатать текущую сборку на локальный «стенд»: отдельная копия артефакта
# плюс конфигурация этого стенда. Артефакт один на все стенды.
#
#   deploy/serve-stand.sh <стенд> <порт>
#
# Стенды описаны в deploy/stands/. Раздача без кеширования (-c-1): на проекте
# config.js тоже нужно отдавать с Cache-Control: no-cache.
set -euo pipefail

stand="${1:?укажи стенд, например staging-01}"
port="${2:?укажи порт}"

root="$(git rev-parse --show-toplevel)"
artifact="$root/excalidraw-app/build"
target="$root/.stands/$stand"

[ -d "$artifact" ] || {
  echo "нет сборки: сначала yarn workspace excalidraw-app build:artifact" >&2
  exit 1
}

rm -rf "$target"
mkdir -p "$target"
cp -r "$artifact/." "$target/"

# На стенд карты не попадают никогда. После перехода на sentry-cli (лаба 07)
# локальная сборка их не удаляет — их удаляет только CI после заливки.
maps="$(find "$target" -name '*.map' | wc -l)"
if [ "$maps" -gt 0 ]; then
  find "$target" -name '*.map' -delete
  echo "удалено карт со стенда: $maps"
fi
"$root/deploy/render-config.sh" "file://$root/deploy/stands/$stand.json" "$target"

echo "стенд $stand: http://localhost:$port"
exec npx http-server "$target" -p "$port" -c-1 --silent
