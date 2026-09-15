#!/usr/bin/env bash
# ── Movies by InvokeIL — Cloudflare Worker deploy ─────────────────────────
# Loads credentials from ../.env.cloudflare (git-ignored) and deploys.
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f ../.env.cloudflare ]]; then
  # shellcheck disable=SC1091
  source ../.env.cloudflare
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "✗ Missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID."
  echo "  Create ../.env.cloudflare or export them, then re-run."
  exit 1
fi

export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

echo "→ Checking wrangler…"
WRANGLER="bunx wrangler"
command -v wrangler >/dev/null 2>&1 && WRANGLER="wrangler"

echo "→ Generating sitemap asset (scripts/gen-sitemap.mjs)…"
node ../scripts/gen-sitemap.mjs 2>/dev/null || bun ../scripts/gen-sitemap.mjs 2>/dev/null || echo "  (skipped — sitemap stays as-is)"

echo "→ Deploying invokeil-movies-api…"
$WRANGLER deploy

cat <<'EOF'

✓ Deployed. Next steps (one-time secrets):
    wrangler secret put TMDB_API_TOKEN    # TMDB v4 read token
    wrangler secret put OMDB_API_KEY
    wrangler secret put GEMINI_API_KEY
    wrangler secret put GROQ_API_KEY
  Verify:  curl https://invokeil-movies-api.<your-subdomain>.workers.dev/health
EOF
