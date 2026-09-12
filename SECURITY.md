# 🔐 Security Policy — Movies by InvokeIL

## Supported version

| Version | Supported |
|---|---|
| `main` branch | ✅ |

The deployed production site ([movies.invokeil.cfd](https://movies.invokeil.cfd))
tracks `main`.

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

1. Use GitHub's **"Report a vulnerability"** (Security → Advisories) on this
   repository, **or**
2. Open a GitHub issue titled `[security] …` with minimal detail and ask the
   maintainer for a private channel.

You will get a response within a few days. Once a fix ships, credit is given
in the release notes unless you prefer to stay anonymous.

## Secret-handling policy (contributors — read this first)

**Never commit any of the following:**

| Category | Examples |
|---|---|
| Provider API keys / tokens | `TMDB_API_TOKEN`, `TMDB_DEMO_KEY`, `OMDB_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` |
| Cloudflare credentials | `CLOUDFLARE_API_TOKEN`, `.env.cloudflare` |
| GitHub tokens | personal access tokens (`ghp_…`, `github_pat_…`) |
| Local secret files | `.env`, `.env.*`, `worker/.dev.vars` |
| Account identifiers | Cloudflare `account_id` is intentionally **not** in `wrangler.jsonc` |

Provisioning rules:

- **Production:** `cd worker && bunx wrangler secret put <NAME>` — values live
  in Cloudflare, never in source control.
- **Local worker dev:** copy `worker/.dev.vars.example` → `worker/.dev.vars`.
- **Deploy credentials:** keep `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
  in `../.env.cloudflare` (git-ignored) or export them in your shell.
- KV namespace IDs and R2 bucket names in `wrangler.jsonc` are **resource
  identifiers, not credentials** — they authenticate nothing on their own. If
  you fork this project, replace them with your own namespace/bucket.

### If a secret leaks

1. **Revoke it immediately at the provider** (TMDB/OMDb/Groq/Google AI Studio
   dashboards; Cloudflare → My Profile → API Tokens → Roll; GitHub → Settings
   → Developer settings → delete the PAT).
2. Provision the replacement with `wrangler secret put <NAME>`.
3. Open a private security advisory describing what leaked and when.
4. Assume it is burned forever — **rotation beats redaction**: rewriting git
   history does not un-leak a key that was cloned or cached.

## Data collection

The app collects nothing. There is no account system, no analytics, no
telemetry. All user state (history, library, progress, preferences) lives in
the visitor's IndexedDB and never leaves their device. The Worker keeps no
per-user records.

## Third-party components

- **TMDB API** — metadata source (not endorsed by TMDB).
- **OMDb API** — ratings enrichment.
- **VidLink** — third-party playback embeds. The project hosts no video.
