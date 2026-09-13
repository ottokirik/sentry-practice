#!/usr/bin/env bash
#
# Опубликовать раскатанный стенд на GitHub Pages: каталог стенда в ветке
# gh-pages заменяется целиком, остальные стенды не трогаются.
#
#   PAGES_REPO_URL=<url-репозитория> deploy/publish-pages.sh <каталог-стенда> <стенд>
#
# На рабочем проекте этому шагу соответствует выкатка контейнера в под. Здесь
# хостинг статический, поэтому «стенд» — это подкаталог сайта.
set -euo pipefail

source_dir="${1:?укажи каталог с раскатанным стендом}"
stand="${2:?укажи имя стенда}"
repo_url="${PAGES_REPO_URL:?задай PAGES_REPO_URL}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Отличаем «ветки ещё нет» (код 2) от любой другой ошибки — например, нет
# прав: её нельзя маскировать созданием пустой ветки.
set +e
git ls-remote --exit-code --heads "$repo_url" gh-pages >/dev/null
status=$?
set -e

if [ "$status" -eq 0 ]; then
  git clone --quiet --branch gh-pages --depth 1 "$repo_url" "$work"
elif [ "$status" -eq 2 ]; then
  git init --quiet "$work"
  git -C "$work" checkout --quiet --orphan gh-pages
  git -C "$work" remote add origin "$repo_url"
else
  echo "не удалось прочитать $repo_url (код $status)" >&2
  exit "$status"
fi

rm -rf "${work:?}/$stand"
mkdir -p "$work/$stand"
cp -r "$source_dir/." "$work/$stand/"
# Без этого Pages пропустит файлы и каталоги, начинающиеся с подчёркивания.
touch "$work/.nojekyll"

git -C "$work" add -A
if git -C "$work" diff --cached --quiet; then
  echo "стенд $stand: изменений нет"
  exit 0
fi

git -C "$work" \
  -c user.name="github-actions[bot]" \
  -c user.email="github-actions[bot]@users.noreply.github.com" \
  commit --quiet -m "deploy $stand"
git -C "$work" push --quiet origin gh-pages
echo "стенд $stand опубликован"
