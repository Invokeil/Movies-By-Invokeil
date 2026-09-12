# InvokeIL Movies API — Cloudflare Worker

Production edge gateway for **Movies by InvokeIL**. The browser never holds any
API key — everything is proxied, cached and protected here.

```
Browser (zero keys)
   │  fetch /api/*
   ▼
Cloudflare Worker  ── Cache API (GET /api/tmdb/*, X-Cache: HIT|MISS)
   │                 ── CORS + security headers
   ├─ /api/tmdb/*  →  api.themoviedb.org/3/*   (Bearer TMDB_API_TOKEN)
   ├─ /api/omdb    →  www.omdbapi.com          (?apikey=OMDB_API_KEY)
   ├─ /api/ai      →  Gemini → Groq → {ok:false,fallback:true}
   │                  (client then uses its local deterministic engine)
   └─ /health      →  liveness probe
```

## Deploy

```bash
# credentials live in ../.env.cloudflare (git-ignored)
cd worker
./deploy.sh
```

One-time secrets:

```bash
bunx wrangler secret put TMDB_API_TOKEN     # TMDB v4 read token (long-lived)
bunx wrangler secret put OMDB_API_KEY       # optional: IMDb ratings / Metascore
bunx wrangler secret put GEMINI_API_KEY     # optional: AI recommendations
bunx wrangler secret put GROQ_API_KEY       # optional: AI fallback tier
```

## Optional bindings (uncomment in wrangler.jsonc)

- **KV `CACHE`** — hot keys like `trending:v1`, `genres:v1`, feature flags.
- **D1 `MEDIA_D1`** — global metadata persistence (the "last known good" layer
  when TMDB is down).
- **Static Assets** — serve the exported SPA frontend from the same Worker.

## Relationship to the sandbox app

The Next.js dev app's `/api/media` + `/api/ai` routes mirror this Worker's
contract (same response shapes, `X-Cache` headers, fallback semantics), so the
frontend code switches to this Worker by changing one base URL — no logic
changes.
