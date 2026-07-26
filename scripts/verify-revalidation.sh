#!/usr/bin/env bash
#
# P3 freshness proof (§5.3) — run against the docker-compose stack.
#
# Proves three things the P3 Definition of Done requires:
#   1. HMAC verification REJECTS unsigned / wrongly-signed webhook calls (401).
#   2. A correctly-signed webhook is accepted (200) and reports the tags it
#      revalidated.
#   3. Multi-instance / cluster-wide freshness: an article published in the CMS
#      becomes visible on BOTH web instances in under ~2s WITHOUT any rebuild —
#      including `web2`, which never receives the webhook (only `web` does).
#      That can only work because the ISR cache handler is Redis-backed.
#
# Usage:
#   docker compose up --build -d        # postgres + redis + cms + web + web2
#   # (wait for CMS to seed, ~30-60s on first boot)
#   ./scripts/verify-revalidation.sh
#
# Env overrides:
#   WEB1   (default http://localhost:3000)   instance that RECEIVES the webhook
#   WEB2   (default http://localhost:3001)   instance that must stay consistent
#   STRAPI (default http://localhost:1337)
#   SECRET (default dev-revalidate-secret-change-me)  must match both apps
#   ADMIN_EMAIL + ADMIN_PASSWORD  a Strapi admin — enables the end-to-end
#                 publish test (drives the real editor flow: update + publish).
#   LOCALE (default vi)
#
set -uo pipefail

WEB1="${WEB1:-http://localhost:3000}"
WEB2="${WEB2:-http://localhost:3001}"
STRAPI="${STRAPI:-http://localhost:1337}"
SECRET="${SECRET:-dev-revalidate-secret-change-me}"
LOCALE="${LOCALE:-vi}"
REVALIDATE_PATH="/api/revalidate"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAILED=1; }
hr()   { printf '\n\033[1m%s\033[0m\n' "$1"; }
FAILED=0

# HMAC-SHA256 hex of stdin using $SECRET, in the `sha256=<hex>` header form.
# `$NF` grabs the trailing hex whether or not openssl prints a `(stdin)= ` prefix.
sign() { openssl dgst -sha256 -hmac "$SECRET" | awk '{print "sha256="$NF}'; }

status_of() { # $1=url $2=body $3=signature-header(optional)
  local url="$1" body="$2" sig="${3:-}"
  if [ -n "$sig" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X POST "$url" \
      -H 'content-type: application/json' -H "x-vng-signature: $sig" -d "$body"
  else
    curl -s -o /dev/null -w '%{http_code}' -X POST "$url" \
      -H 'content-type: application/json' -d "$body"
  fi
}

hr "1. HMAC verification"
BODY='{"model":"article","documentId":"proof","slug":"proof","locale":"'"$LOCALE"'"}'
SIG="$(printf '%s' "$BODY" | sign)"

code="$(status_of "$WEB1$REVALIDATE_PATH" "$BODY")"
[ "$code" = "401" ] && pass "unsigned request rejected (401)" || fail "unsigned request got $code, expected 401"

code="$(status_of "$WEB1$REVALIDATE_PATH" "$BODY" "sha256=deadbeef")"
[ "$code" = "401" ] && pass "bad-signature request rejected (401)" || fail "bad-signature got $code, expected 401"

resp="$(curl -s -X POST "$WEB1$REVALIDATE_PATH" -H 'content-type: application/json' \
  -H "x-vng-signature: $SIG" -d "$BODY")"
if echo "$resp" | grep -q '"revalidated":true'; then
  pass "correctly-signed request accepted (200): $resp"
else
  fail "correctly-signed request not accepted: $resp"
fi

# Millisecond clock (bash `date +%s%3N` isn't portable to macOS).
now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }

# ---------------------------------------------------------------------------
hr "2. Multi-instance content freshness (end-to-end publish)"
if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "  (skipped — set ADMIN_EMAIL + ADMIN_PASSWORD to run the real publish flow)"
else
  # Log in as an admin (the same flow the editor UI uses).
  JWT="$(curl -s -X POST "$STRAPI/admin/login" -H 'content-type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
  if [ -z "$JWT" ]; then
    fail "admin login failed (check ADMIN_EMAIL / ADMIN_PASSWORD)"
  else
    # Pick a published article (public read — no auth needed). `-g` disables
    # curl URL globbing so any `[...]` query params are sent literally.
    art="$(curl -s -g "$STRAPI/api/articles?locale=$LOCALE")"
    # First occurrence = the article's own fields (nested category/author come
    # later in the object, so a greedy match would wrongly grab those).
    DOC_ID="$(echo "$art" | grep -o '"documentId":"[^"]*"' | head -1 | cut -d'"' -f4)"
    SLUG="$(echo "$art"   | grep -o '"slug":"[^"]*"'       | head -1 | cut -d'"' -f4)"

    if [ -z "$DOC_ID" ] || [ -z "$SLUG" ]; then
      fail "could not find a seeded article (is the CMS seeded? SEED=true)"
    else
      ART_URL="/$LOCALE/tin-tuc/$SLUG"
      NEW_TITLE="Freshness proof $(now_ms)"
      CM="$STRAPI/content-manager/collection-types/api::article.article/$DOC_ID"
      echo "  article documentId=$DOC_ID slug=$SLUG"
      echo "  new title → \"$NEW_TITLE\""

      # Warm both instances so they hold a cached copy first.
      curl -s -o /dev/null "$WEB1$ART_URL"; curl -s -o /dev/null "$WEB2$ART_URL"

      # Edit the draft, then PUBLISH — publish fires the webhook to `web` only.
      curl -s -o /dev/null -X PUT "$CM?locale=$LOCALE" \
        -H "Authorization: Bearer $JWT" -H 'content-type: application/json' \
        -d "{\"title\":\"$NEW_TITLE\"}"
      curl -s -o /dev/null -X POST "$CM/actions/publish?locale=$LOCALE" \
        -H "Authorization: Bearer $JWT" -H 'content-type: application/json'

      # Poll BOTH instances until the new title appears; measure latency.
      start="$(now_ms)"
      seen1=0; seen2=0
      for _ in $(seq 1 40); do   # up to ~10s (40 × 250ms)
        [ "$seen1" -eq 0 ] && curl -s "$WEB1$ART_URL" | grep -q "$NEW_TITLE" && seen1=1
        [ "$seen2" -eq 0 ] && curl -s "$WEB2$ART_URL" | grep -q "$NEW_TITLE" && seen2=1
        if [ "$seen1" -eq 1 ] && [ "$seen2" -eq 1 ]; then break; fi
        sleep 0.25
      done
      elapsed=$(( $(now_ms) - start ))

      [ "$seen1" -eq 1 ] && pass "web  (got webhook)       fresh in ${elapsed}ms" || fail "web  never went fresh"
      [ "$seen2" -eq 1 ] && pass "web2 (NO webhook, Redis)  fresh in ${elapsed}ms" || fail "web2 never went fresh (Redis propagation broken)"
      if [ "$seen1" -eq 1 ] && [ "$seen2" -eq 1 ] && [ "$elapsed" -le 3000 ]; then
        pass "both instances fresh in ${elapsed}ms (< 3s target)"
      elif [ "$seen1" -eq 1 ] && [ "$seen2" -eq 1 ]; then
        fail "both fresh but took ${elapsed}ms (> 3s)"
      fi
    fi
  fi
fi

hr "Result"
if [ "$FAILED" -eq 0 ]; then
  printf '\033[32mALL CHECKS PASSED\033[0m\n'; exit 0
else
  printf '\033[31mSOME CHECKS FAILED\033[0m\n'; exit 1
fi
