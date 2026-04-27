#!/usr/bin/env bash
# Smoke-тест локально запущенного backend (см. README → "Бэкенд (локально)").
# Проверяет: GET /quota, POST /analyze (на реальной статье), GET /history.
#
# Запуск:
#   BACKEND=http://localhost:3000 SECRET=local-dev-secret bash scripts/smoke.sh

set -euo pipefail

BACKEND="${BACKEND:-http://localhost:3000}"
SECRET="${SECRET:-local-dev-secret}"
UUID="${UUID:-11111111-2222-4333-8444-555555555555}"
ARTICLE_URL="${ARTICLE_URL:-https://meduza.io/feature/2024/11/14/proverka-faktov}"

echo "→ baseUrl = $BACKEND"
echo "→ uuid    = $UUID"

echo "GET /quota"
curl -fsS "$BACKEND/quota?uuid=$UUID" -H "x-critic-token: $SECRET" | jq .

echo "POST /analyze (this calls OpenRouter — ~10–30 sec, costs cents)"
curl -fsS -X POST "$BACKEND/analyze" \
  -H "x-critic-token: $SECRET" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg uuid "$UUID" --arg url "$ARTICLE_URL" '{
    uuid: $uuid,
    url: $url,
    domain: "meduza.io",
    title: "Smoke test article",
    text: ("Для smoke-теста передаём текст длиной больше 500 символов, чтобы пройти валидацию MIN_TEXT_LENGTH. " * 8),
    lang: "ru"
  }')" | jq .

echo "GET /history"
curl -fsS "$BACKEND/history?uuid=$UUID" -H "x-critic-token: $SECRET" | jq .

echo "✓ smoke ok"
