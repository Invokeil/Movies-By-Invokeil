/* ── Movies by invokeil — SEO/AEO edge rendering engine ──────────────────
   Serves search-engine & answer-engine friendly pages while leaving the
   interactive SPA 100% untouched for human visitors:

   • crawler user-agents (Googlebot, Bingbot, social previews, AI bots)
       → fully server-rendered static HTML: unique <title>, meta
         description, canonical, Open Graph/Twitter cards, JSON-LD
         (Movie / TVSeries / ItemList), visible AEO "quick answers"
         block, real <a href> internal links, legal watch-provider info.
   • human browsers
       → the normal SPA shell with ONLY the <head> patched per-URL
         (title / description / canonical / og / twitter / JSON-LD).
         Zero hydration risk, zero UX change, no feature interruption.

   Routes: /sitemap.xml · /movie/{id} · /tv/{id} · /genre/{slug} · /
   Real 404 (status + noindex) for invalid title ids — no soft-404s.     */

import { handleMedia, fetchWatchProviders, type UnifiedMedia } from './media-gateway'

interface Env {
  CACHE?: KVNamespace
  ASSETS?: { fetch: (req: Request) => Promise<Response> }
  GOOGLE_SITE_VERIFICATION?: string // Search Console token — Worker secret, value never in git
}

/* ── constants ───────────────────────────────────────────────────────── */

const SITE_NAME = 'Movies by InvokeIL'
const CACHE_BASE = 'https://cache.invokeil.internal/seo'
const PAGE_TTL = 7200 // 2 h — rendered HTML edge cache
const SHELL_TTL = 3600 // 1 h — head-injected shell cache
const SITEMAP_TTL = 21600 // 6 h
const MAX_SITEMAP_URLS = 4000

/* Curated genre collection pages (indexable, real content, no thin URLs) */
const GENRE_SLUGS: Record<string, string> = {
  action: 'Action', adventure: 'Adventure', animation: 'Animation', comedy: 'Comedy',
  crime: 'Crime', documentary: 'Documentary', drama: 'Drama', family: 'Family',
  fantasy: 'Fantasy', history: 'History', horror: 'Horror', music: 'Music',
  mystery: 'Mystery', romance: 'Romance', 'sci-fi': 'Sci-Fi', thriller: 'Thriller',
  war: 'War', western: 'Western',
}

/* Verified crawler / social-preview / answer-engine user agents */
const BOT_PATTERNS = [
  'googlebot', 'bingbot', 'duckduckbot', 'yandexbot', 'baiduspider', 'applebot',
  'twitterbot', 'facebookexternalhit', 'facebookcatalog', 'linkedinbot', 'slackbot',
  'whatsapp', 'telegrambot', 'discordbot', 'imessagerichlink', 'skypeuripreview',
  'embedly', 'quora link preview', 'outbrain', 'vkshare',
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'claudebot', 'claude-web', 'anthropic-ai',
  'perplexitybot', 'perplexity-user', 'google-other', 'googlebot-image', 'adsbot-google',
  'bytespider', 'amazonbot', 'applebot-extended', 'meta-externalagent', 'ccbot',
]

function isCrawler(ua: string): boolean {
  const u = ua.toLowerCase()
  return BOT_PATTERNS.some((p) => u.includes(p))
}

/* ── small utils ─────────────────────────────────────────────────────── */

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function attr(s: unknown): string {
  return esc(s).replace(/\n/g, ' ')
}

/** deterministic metadata block, shared by both renderer variants */
function metaParts(m: UnifiedMedia, origin: string) {
  const year = m.year > 0 ? m.year : 0
  const yearBit = year ? ` (${year})` : ''
  const title = `${m.title}${yearBit} — Cast, Story & Where to Watch | ${SITE_NAME}`
  const ov = m.overview.replace(/\s+/g, ' ').trim()
  const base = `Discover ${m.title}${yearBit}: story, release date, runtime, genres, director, cast and rating information.`
  let description = base
  if (ov) {
    const budget = 165 - base.length
    if (budget > 40) {
      let cut = ov.slice(0, budget)
      const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
      if (lastStop > budget * 0.5) cut = cut.slice(0, lastStop + 1)
      else cut = cut.slice(0, cut.lastIndexOf(' ')) + '…'
      description = `${base} ${cut}`
    }
  }
  const path = `/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}`
  const canonical = `${origin}${path}`
  const imgPath = m.posterPath || m.backdropPath
  const image = imgPath ? `${origin}/api/img?p=${encodeURIComponent(imgPath)}&s=w780` : `${origin}/logo.svg`
  const watchUrl = `${origin}/watch${path}`
  return { title, description, canonical, image, year, path, watchUrl }
}

function isoDuration(min?: number): string | undefined {
  if (!min || min <= 0) return undefined
  const h = Math.floor(min / 60)
  const mm = min % 60
  return `PT${h > 0 ? `${h}H` : ''}${mm > 0 ? `${mm}M` : h > 0 ? '0M' : ''}` || undefined
}

/* ── data (reuses the /api/media pipeline incl. KV + edge caches) ────── */

async function api<T>(env: Env, qs: string): Promise<T | null> {
  try {
    const res = await handleMedia(new URL(`https://seo.internal/api/media?${qs}`), env)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function getDetail(env: Env, type: 'movie' | 'tv', num: string): Promise<UnifiedMedia | null> {
  const j = await api<{ result?: UnifiedMedia }>(env, `action=detail&id=${type}-${num}`)
  return j?.result ?? null
}

async function getList(env: Env, qs: string): Promise<UnifiedMedia[]> {
  const j = await api<{ results?: UnifiedMedia[] }>(env, qs)
  return Array.isArray(j?.results) ? j!.results! : []
}

async function getSimilar(env: Env, m: UnifiedMedia): Promise<UnifiedMedia[]> {
  const items = await getList(env, `action=similar&id=${encodeURIComponent(m.id)}`)
  return items.filter((x) => x.id !== m.id).slice(0, 6)
}

/* ── JSON-LD builders (Google Movie / TVSeries / ItemList docs) ──────── */

function titleJsonLd(m: UnifiedMedia, origin: string): object {
  const { canonical, image } = metaParts(m, origin)
  const isTv = m.mediaType === 'tv'
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': isTv ? 'TVSeries' : 'Movie',
    '@id': `${canonical}#${isTv ? 'tvseries' : 'movie'}`,
    url: canonical,
    name: m.title,
    description: m.overview.replace(/\s+/g, ' ').trim() || undefined,
    image: m.posterPath ? [image] : undefined,
    genre: m.genres.length ? m.genres : undefined,
    actor: m.cast.slice(0, 6).map((c) => ({ '@type': 'Person', name: c.name })),
  }
  if (isTv) {
    ld.startDate = m.releaseDate || undefined
    ld.numberOfSeasons = m.seasons?.length || undefined
    if (m.director) ld.creator = { '@type': 'Person', name: m.director }
  } else {
    ld.datePublished = m.releaseDate || undefined
    ld.duration = isoDuration(m.runtime)
    if (m.director) ld.director = { '@type': 'Person', name: m.director }
  }
  if (m.voteAverage > 0 && m.voteCount >= 10) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: m.voteAverage.toFixed(1),
      bestRating: '10',
      ratingCount: m.voteCount,
    }
  }
  /* sameAs — authoritative external references (AEO trust signal) */
  ld.sameAs = [
    `https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${m.tmdbId}`,
    `https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${m.tmdbId}${m.mediaType === 'tv' ? '' : '-' + m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  ]
  return ld
}

/** Breadcrumb trail: Home → Movies/TV Series → Title (Google BreadcrumbList) */
function breadcrumbJsonLd(m: UnifiedMedia, origin: string): object {
  const { canonical } = metaParts(m, origin)
  const isTv = m.mediaType === 'tv'
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: isTv ? 'TV Series' : 'Movies', item: `${origin}/${isTv ? 'tv' : 'movies'}` },
      { '@type': 'ListItem', position: 3, name: m.title, item: canonical },
    ],
  }
}

/** WebSite + sitelinks SearchAction (home page rich result) */
function websiteJsonLd(origin: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${origin}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${origin}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

function itemListJsonLd(items: UnifiedMedia[], origin: string, listName: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${origin}/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}`,
      name: `${m.title}${m.year ? ` (${m.year})` : ''}`,
      image: m.posterPath ? `${origin}/api/img?p=${encodeURIComponent(m.posterPath)}&s=w342` : undefined,
    })),
  }
}

/* ── shared page chrome (crawler variant only) ───────────────────────── */

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#44353B;
background:linear-gradient(160deg,#D8E2DC 0%,#FFE5D9 35%,#FFCAD4 70%,#F4ACB7 100%);min-height:100vh}
a{color:#9D8189;font-weight:600;text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:880px;margin:0 auto;padding:20px 16px 56px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px 22px;flex-wrap:wrap}
.brand{font-size:17px;font-weight:800;color:#44353B}
.nav{display:flex;gap:14px;flex-wrap:wrap;font-size:13px}
.glass{background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.7);border-radius:18px;
padding:18px 20px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);margin-bottom:16px}
.hero{display:flex;gap:20px;flex-wrap:wrap}
.hero img.poster{width:180px;border-radius:14px;box-shadow:0 12px 32px rgba(68,53,59,.25);flex-shrink:0}
.hero .info{flex:1;min-width:260px}
h1{margin:0 0 6px;font-size:26px;line-height:1.2}
.tagline{margin:0 0 10px;font-style:italic;opacity:.75;font-size:14px}
.chip{display:inline-block;padding:4px 11px;background:rgba(157,129,137,.16);border-radius:999px;
font-size:12px;font-weight:700;margin:0 6px 6px 0}
h2{font-size:15px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}
dl.facts{display:grid;grid-template-columns:auto 1fr;gap:7px 16px;margin:0;font-size:14px}
dl.facts dt{font-weight:800;white-space:nowrap;opacity:.65}
dl.facts dd{margin:0}
.answer{font-size:15px;line-height:1.65;margin:0}
.cast{display:flex;flex-wrap:wrap;gap:10px}
.cast .who{background:rgba(255,255,255,.5);border-radius:12px;padding:8px 12px;font-size:13px;min-width:120px;flex:1}
.cast .who b{display:block;font-size:13px}
.cast .who span{opacity:.65;font-size:12px}
.btn{display:inline-block;padding:10px 18px;border-radius:999px;background:linear-gradient(135deg,#F4ACB7,#FFCAD4);
color:#44353B;font-weight:800;font-size:14px;box-shadow:0 6px 18px rgba(244,172,183,.45)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:14px}
.card{background:rgba(255,255,255,.55);border-radius:14px;padding:10px;text-align:center;font-size:12.5px;line-height:1.35}
.card img{width:100%;border-radius:9px;aspect-ratio:2/3;object-fit:cover;background:rgba(157,129,137,.15)}
.card b{display:block;margin-top:7px;font-size:12.5px;color:#44353B}
.card span{opacity:.65}
.similar{display:flex;flex-wrap:wrap;gap:8px}
.similar a{background:rgba(255,255,255,.5);padding:7px 12px;border-radius:999px;font-size:13px}
footer{margin-top:26px;font-size:12px;opacity:.7;text-align:center}
footer a{font-weight:600}
@media(max-width:560px){.hero img.poster{width:132px}h1{font-size:21px}dl.facts{font-size:13px}}
`

function chrome(origin: string, head: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${GV_META}
${head}
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <a class="brand" href="/">🎬 ${SITE_NAME}</a>
    <nav class="nav"><a href="/movies">Movies</a><a href="/tv">TV Series</a><a href="/anime">Anime</a><a href="/search">Search</a></nav>
  </div>
  ${content}
  <footer>Data via the TMDB API but not endorsed by TMDB · Discovery &amp; information service ·
  <a href="/">Open the full app</a></footer>
</div>
</body>
</html>`
}

/* full <head> block for bot-rendered pages (same metadata contract as
   the human head-injection path — one source of truth via metaParts)   */
function botHead(opts: {
  title: string
  description: string
  canonical?: string
  ogType?: string
  ogImage?: string
  jsonLd?: object | object[]
  noindex?: boolean
}): string {
  return [
    `<title>${attr(opts.title)}</title>`,
    `<meta name="description" content="${attr(opts.description)}">`,
    opts.noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    opts.canonical ? `<link rel="canonical" href="${attr(opts.canonical)}">` : '',
    `<meta property="og:site_name" content="${attr(SITE_NAME)}">`,
    `<meta property="og:title" content="${attr(opts.title)}">`,
    `<meta property="og:description" content="${attr(opts.description)}">`,
    `<meta property="og:type" content="${attr(opts.ogType ?? 'website')}">`,
    opts.canonical ? `<meta property="og:url" content="${attr(opts.canonical)}">` : '',
    opts.ogImage ? `<meta property="og:image" content="${attr(opts.ogImage)}">` : '',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(opts.title)}">`,
    `<meta name="twitter:description" content="${attr(opts.description)}">`,
    opts.ogImage ? `<meta name="twitter:image" content="${attr(opts.ogImage)}">` : '',
    ...([] as object[])
    .concat(opts.jsonLd ?? [])
    .map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`),
  ]
    .filter(Boolean)
    .join('\n')
}

/* ── title page (crawler variant) ────────────────────────────────────── */

function titlePageBot(
  m: UnifiedMedia,
  origin: string,
  region: string,
  providers: string[] | null,
  similar: UnifiedMedia[],
): string {
  const meta = metaParts(m, origin)
  const { year } = meta
  const yb = year ? ` (${year})` : ''
  const runtime = m.runtime
    ? `${Math.floor(m.runtime / 60) > 0 ? `${Math.floor(m.runtime / 60)}h ` : ''}${m.runtime % 60}m`
    : m.episodeRuntime
      ? `${m.episodeRuntime}m per episode`
      : 'Unknown'
  const released = m.releaseDate || 'Unknown'
  const rating = m.voteAverage > 0 ? `${m.voteAverage.toFixed(1)}/10 on TMDB (${m.voteCount.toLocaleString()} votes)` : 'Unknown'
  const watch =
    providers && providers.length > 0
      ? providers.map((p) => `<span class="chip">${esc(p)}</span>`).join('') +
        `<p style="font-size:12px;opacity:.65;margin:6px 0 0">Verified via TMDB watch providers for region ${esc(region)}. Availability varies by region and plan.</p>`
      : `<p class="answer">No verified streaming offers found for region ${esc(region)} right now.
         Check <a href="https://www.justwatch.com/us/search?q=${attr(encodeURIComponent(m.title))}" rel="nofollow noopener" target="_blank">JustWatch</a>
         for up-to-date legal availability.</p>`

  const answer =
    m.overview.replace(/\s+/g, ' ').trim() ||
    `${m.title}${yb} is listed in our catalog${m.genres.length ? ` under ${m.genres.join(', ')}` : ''}. Detailed synopsis coming soon.`
  const similarHtml = similar.length
    ? `<div class="glass"><h2>More like this</h2><div class="similar">${similar
        .map(
          (s) =>
            `<a href="/${s.mediaType === 'tv' ? 'tv' : 'movie'}/${s.tmdbId}">${esc(s.title)}${s.year ? ` (${s.year})` : ''}</a>`,
        )
        .join('')}</div></div>`
    : ''

  const posterImg = m.posterPath
    ? `<img class="poster" src="${attr(`${origin}/api/img?p=${encodeURIComponent(m.posterPath)}&s=w342`)}" alt="${attr(`${m.title}${yb} movie poster`)}" width="180" loading="eager">`
    : ''

  return chrome(
    origin,
    botHead({
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      ogType: m.mediaType === 'tv' ? 'video.tv_show' : 'video.movie',
      ogImage: meta.image,
      jsonLd: [titleJsonLd(m, origin), breadcrumbJsonLd(m, origin)],
      noindex: !m.overview.trim() && m.cast.length === 0,
    }),
    `
  <div class="glass hero">
    ${posterImg}
    <div class="info">
      <h1>${esc(m.title)}${esc(yb)}</h1>
      ${m.tagline ? `<p class="tagline">“${esc(m.tagline)}”</p>` : ''}
      <div>${m.genres.slice(0, 4).map((g) => `<span class="chip">${esc(g)}</span>`).join('')}
        <span class="chip">${m.mediaType === 'tv' ? 'TV Series' : 'Movie'}</span></div>
      <p style="margin:14px 0 6px"><a class="btn" href="${attr(`/watch/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}`)}">▶ Play ${esc(m.title)}</a></p>
    </div>
  </div>
  <div class="glass">
    <h2>Quick answers</h2>
    <dl class="facts">
      <dt>What is it about?</dt><dd class="answer"><strong>What is ${esc(m.title)}${esc(yb)} about?</strong> ${esc(answer)}</dd>
      <dt>Released</dt><dd>${esc(released)}</dd>
      <dt>${m.mediaType === 'tv' ? 'Creator' : 'Director'}</dt><dd>${m.director ? esc(m.director) : 'Unknown'}</dd>
      <dt>${m.mediaType === 'tv' ? 'Episodes run' : 'Runtime'}</dt><dd>${esc(runtime)}</dd>
      <dt>Rating</dt><dd>${esc(rating)}</dd>
      <dt>Genres</dt><dd>${m.genres.length ? esc(m.genres.join(', ')) : 'Unknown'}</dd>
      ${m.mediaType === 'tv' && m.seasons?.length ? `<dt>Seasons</dt><dd>${esc(m.seasons.map((s) => `S${s.season} (${s.episodes} ep)`).join(', '))}</dd>` : ''}
    </dl>
  </div>
  <div class="glass">
    <h2>Where to watch legally${region ? ` (${esc(region)})` : ''}</h2>
    ${watch}
  </div>
  <div class="glass">
    <h2>Principal cast</h2>
    <div class="cast">${m.cast.length ? m.cast.map((c) => `<div class="who"><b>${esc(c.name)}</b><span>${esc(c.character || 'Unknown role')}</span></div>`).join('') : '<p class="answer">Cast information unavailable.</p>'}</div>
  </div>
  ${similarHtml}`,
  )
}

/* ── genre collection page (crawler variant) ─────────────────────────── */

function genrePageBot(slug: string, label: string, items: UnifiedMedia[], origin: string): string {
  const head = botHead({
    title: `Best ${label} Movies & Series — Watchlist Ideas | ${SITE_NAME}`,
    description: `Discover the most popular ${label.toLowerCase()} movies and TV series, ranked by live popularity and rating data. Updated continuously.`,
    canonical: `${origin}/genre/${slug}`,
    ogImage: items.find((x) => x.posterPath)
      ? `${origin}/api/img?p=${encodeURIComponent(items.find((x) => x.posterPath)!.posterPath!)}&s=w780`
      : undefined,
    jsonLd: items.length ? itemListJsonLd(items, origin, `Best ${label} movies & series`) : undefined,
    noindex: items.length === 0,
  })
  const cards = items
    .map(
      (m) =>
        `<a class="card" href="/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}">${
          m.posterPath
            ? `<img src="${attr(`${origin}/api/img?p=${encodeURIComponent(m.posterPath)}&s=w185`)}" alt="${attr(`${m.title} poster`)}" loading="lazy">`
            : '<img alt="">'
        }<b>${esc(m.title)}</b><span>${m.year || 'Unknown'} · ★ ${m.voteAverage > 0 ? m.voteAverage.toFixed(1) : 'Unknown'}</span></a>`,
    )
    .join('')
  const otherGenres = Object.entries(GENRE_SLUGS)
    .filter(([s]) => s !== slug)
    .slice(0, 10)
    .map(([s, l]) => `<a href="/genre/${attr(s)}">${esc(l)}</a>`)
    .join(' · ')
  return chrome(
    origin,
    head,
    `
  <div class="glass">
    <h1>Best ${esc(label)} movies &amp; series</h1>
    <p class="answer">Discover the most popular ${esc(label.toLowerCase())} movies, TV series and anime,
    ranked by live popularity and audience rating data. This collection updates continuously as
    new titles trend, so it always reflects what people are watching right now.</p>
  </div>
  <div class="glass"><div class="grid">${cards || '<p class="answer">No titles found in this collection yet.</p>'}</div></div>
  <div class="glass"><h2>Browse more collections</h2><p>${otherGenres}</p></div>`,
  )
}

/* ── home page (crawler variant) ─────────────────────────────────────── */

function homePageBot(trending: UnifiedMedia[], origin: string): string {
  const head = botHead({
    title: `${SITE_NAME} — Discover Movies, TV Series & Anime`,
    description:
      'Browse movies, TV series and anime by genre, cast, release year and rating — with ratings, runtimes and legal streaming info on every title page.',
    canonical: `${origin}/`,
    ogImage: trending.find((x) => x.backdropPath)
      ? `${origin}/api/img?p=${encodeURIComponent(trending.find((x) => x.backdropPath)!.backdropPath!)}&s=w780`
      : undefined,
    jsonLd: trending.length
      ? [websiteJsonLd(origin), itemListJsonLd(trending.slice(0, 18), origin, 'Trending this week')]
      : websiteJsonLd(origin),
  })
  const cards = trending
    .slice(0, 18)
    .map(
      (m) =>
        `<a class="card" href="/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}">${
          m.posterPath
            ? `<img src="${attr(`${origin}/api/img?p=${encodeURIComponent(m.posterPath)}&s=w185`)}" alt="${attr(`${m.title} poster`)}" loading="lazy">`
            : '<img alt="">'
        }<b>${esc(m.title)}</b><span>${m.year || 'Unknown'} · ★ ${m.voteAverage > 0 ? m.voteAverage.toFixed(1) : 'Unknown'}</span></a>`,
    )
    .join('')
  const genres = Object.entries(GENRE_SLUGS)
    .slice(0, 12)
    .map(([s, l]) => `<a href="/genre/${attr(s)}">${esc(l)}</a>`)
    .join(' · ')
  return chrome(
    origin,
    head,
    `
  <div class="glass">
    <h1>Discover movies, TV series and anime</h1>
    <p class="answer">Browse titles by name, genre, cast, release year and rating. Explore current
    releases, popular films, family movies, sci-fi, horror, romance and more — with ratings,
    runtimes, cast lists and verified legal streaming availability on every title page.</p>
    <p><a class="btn" href="/movies">Browse movies</a> &nbsp; <a class="btn" href="/tv">Browse TV series</a> &nbsp; <a class="btn" href="/anime">Browse anime</a></p>
  </div>
  <div class="glass"><h2>Trending this week</h2><div class="grid">${cards}</div></div>
  <div class="glass"><h2>Collections</h2><p>${genres}</p></div>`,
  )
}

/* ── browse hub pages (crawler variant): /movies · /tv · /anime ──────── */

function collectionPageBot(h1: string, listLabel: string, pathKind: string, items: UnifiedMedia[], origin: string): string {
  const head = botHead({
    title: `${listLabel} — Stream & Discover | ${SITE_NAME}`,
    description: `Browse the ${listLabel.toLowerCase()} — ratings, runtimes, cast and legal streaming info on every title. Updated continuously from live popularity data.`,
    canonical: `${origin}/${pathKind}`,
    ogImage: items.find((x) => x.backdropPath || x.posterPath)
      ? `${origin}/api/img?p=${encodeURIComponent((items.find((x) => x.backdropPath || x.posterPath)!.backdropPath || items.find((x) => x.posterPath)!.posterPath)!)}&s=w780`
      : undefined,
    jsonLd: items.length ? itemListJsonLd(items, origin, listLabel) : undefined,
    noindex: items.length === 0,
  })
  const cards = items
    .map(
      (m) =>
        `<a class="card" href="/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}">${
          m.posterPath
            ? `<img src="${attr(`${origin}/api/img?p=${encodeURIComponent(m.posterPath)}&s=w185`)}" alt="${attr(`${m.title} poster`)}" loading="lazy">`
            : '<img alt="">'
        }<b>${esc(m.title)}</b><span>${m.year || 'Unknown'} · ★ ${m.voteAverage > 0 ? m.voteAverage.toFixed(1) : 'Unknown'}</span></a>`,
    )
    .join('')
  const otherHubs = [
    ['movies', 'Movies'],
    ['tv', 'TV Series'],
    ['anime', 'Anime'],
  ]
    .filter(([k]) => k !== pathKind)
    .map(([k, l]) => `<a href="/${k}">${l}</a>`)
    .join(' · ')
  return chrome(
    origin,
    head,
    `
  <div class="glass">
    <h1>${esc(h1)}</h1>
    <p class="answer">The most popular titles right now, ranked by live popularity and audience
    rating data. Every title page includes the full cast, story summary and verified legal
    streaming availability for your region. This list updates continuously.</p>
    <p>Browse more: ${otherHubs}</p>
  </div>
  <div class="glass"><div class="grid">${cards || '<p class="answer">No titles found right now.</p>'}</div></div>`,
  )
}

/* ── 404 (crawler variant) ───────────────────────────────────────────── */

function notFoundPageBot(origin: string): string {
  return chrome(
    origin,
    botHead({
      title: `Page not found | ${SITE_NAME}`,
      description: 'The requested page does not exist in our catalog.',
      noindex: true,
    }),
    `<div class="glass"><h1>Page not found</h1>
     <p class="answer">The page you requested does not exist in our catalog. It may have been
     removed or the address may be mistyped.</p>
     <p><a class="btn" href="/">Go to the homepage</a></p></div>`,
  )
}

/* ── head patching for the human/SPA variant ─────────────────────────── */

interface HeadPatch {
  title: string
  description: string
  canonical?: string
  ogType?: string
  ogImage?: string
  jsonLd?: object | object[]
  noindex?: boolean
}

/* Search Console ownership verification — value resolves from a Worker
   secret at runtime, so the token never appears in source control.
   Memoized because the secret is constant for a deployment; initialized
   once per isolate from handleSEO and shared by every render path.       */
let GV_META = ''
function initVerificationMeta(env: Env): void {
  if (!GV_META) {
    const gv = (env.GOOGLE_SITE_VERIFICATION ?? '').replace(/["&<>]/g, '')
    GV_META = gv ? `<meta name="google-site-verification" content="${gv}">` : ''
  }
}

async function shellWithHead(env: Env, req: Request, patch: HeadPatch, cacheTag: string, ttl: number): Promise<Response> {
  /* The shell is fetched FIRST so the cache key can carry the deployment's
     own asset revision (index.html etag). Without this, a deploy would leave
     every POP serving the previous build's HTML — which references chunk
     hashes the new deployment no longer contains → 404 scripts → React
     never hydrates → the whole site looks dead after a refresh.          */
  let html = ''
  let rev = '0'
  try {
    const shellRes = env.ASSETS
      ? await env.ASSETS.fetch(new Request(new URL('/', req.url), { headers: req.headers }))
      : null
    html = shellRes && shellRes.ok ? await shellRes.text() : ''
    if (shellRes) rev = (shellRes.headers.get('etag') ?? '0').replace(/[^a-zA-Z0-9]/g, '')
  } catch {
    html = ''
  }
  if (!html) return new Response('Service unavailable', { status: 503 })

  /* '-gv' suffix self-invalidates cached shells whenever verification is
     newly armed (or removed) — otherwise stale shells would miss the tag. */
  const cacheKey = new Request(
    `${CACHE_BASE}:ui:${cacheTag}:v${rev}${env.GOOGLE_SITE_VERIFICATION ? '-gv' : ''}`,
  )
  try {
    const hit = await caches.default.match(cacheKey)
    if (hit) {
      /* edge copy is fine (version-keyed); browser must always revalidate */
      const h = new Headers(hit.headers)
      h.set('cache-control', 'public, max-age=0, must-revalidate')
      return new Response(hit.body, { status: hit.status, headers: h })
    }
  } catch {
    /* cache unavailable → render fresh */
  }

  /* strip tags we are replacing, then inject our block after <head> */
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+(?=[^>]*\bproperty="og:)[^>]*>/gi, '')
    .replace(/<meta\s+(?=[^>]*\bname="twitter:)[^>]*>/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>/gi, '')

  const ogType = patch.ogType ?? 'website'
  const block = [
    GV_META,
    `<title>${attr(patch.title)}</title>`,
    `<meta name="description" content="${attr(patch.description)}">`,
    patch.noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    patch.canonical ? `<link rel="canonical" href="${attr(patch.canonical)}">` : '',
    `<meta property="og:site_name" content="${attr(SITE_NAME)}">`,
    `<meta property="og:title" content="${attr(patch.title)}">`,
    `<meta property="og:description" content="${attr(patch.description)}">`,
    `<meta property="og:type" content="${attr(ogType)}">`,
    patch.canonical ? `<meta property="og:url" content="${attr(patch.canonical)}">` : '',
    patch.ogImage ? `<meta property="og:image" content="${attr(patch.ogImage)}">` : '',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(patch.title)}">`,
    `<meta name="twitter:description" content="${attr(patch.description)}">`,
    patch.ogImage ? `<meta name="twitter:image" content="${attr(patch.ogImage)}">` : '',
    ...([] as object[])
      .concat(patch.jsonLd ?? [])
      .map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`),
  ]
    .filter(Boolean)
    .join('\n')

  html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${block}`)

  /* Edge copy keeps a real TTL (version-keyed → self-invalidating on deploy);
     the browser copy always revalidates so a fresh deploy can never leave a
     user with HTML that references deleted chunk hashes.                  */
  const edgeRes = new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${ttl}`,
      'x-robots-tag': patch.noindex ? 'noindex, nofollow' : 'index, follow',
      'x-seo': 'ui-head',
    },
  })
  try {
    await caches.default.put(cacheKey, edgeRes.clone())
  } catch {
    /* best-effort */
  }
  const browserHeaders = new Headers(edgeRes.headers)
  browserHeaders.set('cache-control', 'public, max-age=0, must-revalidate')
  return new Response(edgeRes.body, { status: 200, headers: browserHeaders })
}

/* ── sitemap ─────────────────────────────────────────────────────────── */

async function sitemap(env: Env, origin: string): Promise<Response> {
  /* :v2 — an early build cached this payload as text/html; a versioned key
     abandons the stale entry (it expires on its own) and the guard below
     makes the cache self-healing even if a wrong type ever gets stored. */
  const cacheKey = new Request(`${CACHE_BASE}:sitemap:v2`)
  try {
    const hit = await caches.default.match(cacheKey)
    if (hit && (hit.headers.get('content-type') ?? '').includes('xml')) return hit
  } catch {
    /* render fresh */
  }

  const today = new Date().toISOString().slice(0, 10)
  const urls = new Map<string, string>() // path → lastmod

  urls.set('/', today)
  urls.set('/movies', today)
  urls.set('/tv', today)
  urls.set('/anime', today)
  for (const slug of Object.keys(GENRE_SLUGS)) urls.set(`/genre/${slug}`, today)

  const lists = await Promise.all([
    getList(env, 'list=trending'),
    getList(env, 'list=popular-movies'),
    getList(env, 'list=popular-tv'),
    getList(env, 'list=anime'),
    getList(env, 'list=top-rated'),
    getList(env, 'list=new-releases'),
  ])
  for (const items of lists) {
    for (const m of items) {
      if (urls.size >= MAX_SITEMAP_URLS) break
      /* skip thin entries: no poster, no synopsis, or virtually unrated */
      if (!m.posterPath || !m.overview || m.overview.trim().length < 40) continue
      if ((m.voteCount ?? 0) < 5) continue
      const path = `/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}`
      if (!urls.has(path)) urls.set(path, today)
    }
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    Array.from(urls.entries())
      .map(([p, lm]) => `  <url><loc>${esc(origin)}${esc(p)}</loc><lastmod>${lm}</lastmod></url>`)
      .join('\n') +
    `\n</urlset>\n`

  const res = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': `public, max-age=${SITEMAP_TTL}`,
      'x-seo': 'sitemap',
    },
  })
  try {
    await caches.default.put(cacheKey, res.clone())
  } catch {
    /* best-effort */
  }
  return res
}

/* ── route table ─────────────────────────────────────────────────────── */

export async function handleSEO(req: Request, env: Env): Promise<Response | null> {
  if (req.method !== 'GET' || !env.ASSETS) return null
  const url = new URL(req.url)
  const rawPath = url.pathname
  const path = rawPath.replace(/\/+$/, '') || '/'
  /* production is always HTTPS — upgrade http origins (dev/route rewrites)
     unless it's a true local loopback host */
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(url.hostname)
  const origin = !isLoopback && url.protocol === 'http:' ? url.origin.replace('http:', 'https:') : url.origin
  const bot = isCrawler(req.headers.get('user-agent') ?? '')
  const region = ((req as Request & { cf?: { country?: string } }).cf?.country ?? 'US').toUpperCase()

  initVerificationMeta(env) // arm the Search Console meta before any render path

  /* 1 — sitemap (same for bots & browsers) */
  if (path === '/sitemap.xml') return sitemap(env, origin)

  /* 1b — robots.txt: crawl directives + sitemap ref (single source of truth) */
  if (path === '/robots.txt') {
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /search',
      'Disallow: /watch',
      'Disallow: /library',
      'Disallow: /settings',
      'Disallow: /privacy',
      'Disallow: /api/',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ].join('\n')
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': `public, max-age=${SITEMAP_TTL}`, 'x-seo': 'robots' },
    })
  }

  /* 2 — title pages: /movie/{num} · /tv/{num} */
  const titleM = /^\/(movie|tv)\/(\d+)$/.exec(path)
  if (titleM) {
    const type = titleM[1] as 'movie' | 'tv'
    const num = titleM[2]

    const m = await getDetail(env, type, num)
    if (!m || !m.title) {
      /* REAL 404 — no soft-404 shell */
      if (bot) {
        return new Response(notFoundPageBot(origin), {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'public, max-age=600' },
        })
      }
      return shellWithHead(
        env,
        req,
        { title: `Page not found | ${SITE_NAME}`, description: 'The requested page does not exist.', noindex: true },
        `nf-${path}`,
        600,
      ).then((r) => new Response(r.body, { status: 404, headers: r.headers }))
    }

    const thin = !m.overview.trim() && m.cast.length === 0

    if (bot) {
      /* similar + providers in parallel with nothing blocking the render */
      const [similar, providers] = await Promise.all([getSimilar(env, m), fetchWatchProviders(env, type, num, region)])
      const html = titlePageBot(m, origin, region, providers, similar)
      const res = new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': `public, max-age=${PAGE_TTL}`,
          'x-robots-tag': thin ? 'noindex, nofollow' : 'index, follow',
          'x-seo': 'bot-full',
        },
      })
      try {
        const cacheKey = new Request(`${CACHE_BASE}:page:${type}:${num}:bot`)
        await caches.default.put(cacheKey, res.clone())
      } catch {
        /* best-effort */
      }
      return res
    }

    /* human: SPA shell + per-URL head patch (Movie + Breadcrumb JSON-LD) */
    const { title, description, canonical, image } = metaParts(m, origin)
    return shellWithHead(
      env,
      req,
      {
        title,
        description,
        canonical,
        ogType: type === 'tv' ? 'video.tv_show' : 'video.movie',
        ogImage: image,
        jsonLd: [titleJsonLd(m, origin), breadcrumbJsonLd(m, origin)],
        noindex: thin,
      },
      `page:${type}:${num}:ui`,
      SHELL_TTL,
    )
  }

  /* 3 — invalid title-shaped URLs → real 404 (soft-404 guard) */
  const junkTitle = /^\/(movie|tv)\/[^/]+$/.exec(path)
  if (junkTitle) {
    if (bot) {
      return new Response(notFoundPageBot(origin), {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
      })
    }
    const r = await shellWithHead(
      env,
      req,
      { title: `Page not found | ${SITE_NAME}`, description: 'The requested page does not exist.', noindex: true },
      `nf-${path}`,
      600,
    )
    return new Response(r.body, { status: 404, headers: r.headers })
  }

  /* 4 — genre collections: /genre/{slug} */
  const genreM = /^\/genre\/([a-z0-9-]+)$/.exec(path)
  if (genreM) {
    const slug = genreM[1]
    const label = GENRE_SLUGS[slug]
    if (!label) return null // unknown genre → SPA fallback (404 hygiene at worker level)
    const items = (await getList(env, `list=genre&genre=${encodeURIComponent(label)}`)).slice(0, 24)
    if (bot) {
      const html = genrePageBot(slug, label, items, origin)
      const res = new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': `public, max-age=${PAGE_TTL}`,
          'x-robots-tag': items.length ? 'index, follow' : 'noindex, nofollow',
          'x-seo': 'bot-full',
        },
      })
      try {
        const cacheKey = new Request(`${CACHE_BASE}:genre:${slug}:bot`)
        await caches.default.put(cacheKey, res.clone())
      } catch {
        /* best-effort */
      }
      return res
    }
    return shellWithHead(
      env,
      req,
      {
        title: `Best ${label} Movies & Series — Watchlist Ideas | ${SITE_NAME}`,
        description: `Discover the most popular ${label.toLowerCase()} movies and TV series, ranked by live popularity and rating data. Updated continuously.`,
        canonical: `${origin}/genre/${slug}`,
        ogImage: items.find((x) => x.posterPath)
          ? `${origin}/api/img?p=${encodeURIComponent(items.find((x) => x.posterPath)!.posterPath!)}&s=w780`
          : undefined,
        jsonLd: items.length ? itemListJsonLd(items, origin, `Best ${label} movies & series`) : undefined,
        noindex: items.length === 0,
      },
      `genre:${slug}:ui`,
      SHELL_TTL,
    )
  }

  /* 5 — homepage: bots get a static discover page; browsers get head patch */
  if (path === '/') {
    const trending = await getList(env, 'list=trending')
    if (bot) {
      const res = new Response(homePageBot(trending, origin), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': `public, max-age=1800`,
          'x-robots-tag': 'index, follow',
          'x-seo': 'bot-full',
        },
      })
      try {
        /* ':gv' suffix invalidates pre-verification cached copies */
        const cacheKey = new Request(`${CACHE_BASE}:home:bot${GV_META ? ':gv' : ''}`)
        await caches.default.put(cacheKey, res.clone())
      } catch {
        /* best-effort */
      }
      return res
    }
    return shellWithHead(
      env,
      req,
      {
        title: `${SITE_NAME} — Discover Movies, TV Series & Anime`,
        description:
          'Browse movies, TV series and anime by genre, cast, release year and rating — with ratings, runtimes and legal streaming info on every title page.',
        canonical: `${origin}/`,
        ogImage: trending.find((x) => x.backdropPath)
          ? `${origin}/api/img?p=${encodeURIComponent(trending.find((x) => x.backdropPath)!.backdropPath!)}&s=w780`
          : undefined,
        jsonLd: websiteJsonLd(origin),
      },
      'home:ui',
      1800,
    )
  }

  /* 6 — browse hubs: /movies · /tv · /anime (indexable landing pages) */
  const browseM = /^\/(movies|tv|anime)$/.exec(path)
  if (browseM) {
    const kind = browseM[1]
    const conf =
      kind === 'movies'
        ? { list: 'popular-movies', label: 'Popular Movies', h1: 'Popular movies right now', kind: 'movie' as const }
        : kind === 'tv'
          ? { list: 'popular-tv', label: 'Popular TV Series', h1: 'Popular TV series right now', kind: 'tv' as const }
          : { list: 'anime', label: 'Popular Anime', h1: 'Popular anime right now', kind: 'tv' as const }
    const items = (await getList(env, `list=${conf.list}`)).filter((x) => (conf.kind === 'tv' ? true : x.mediaType === 'movie')).slice(0, 24)
    if (bot) {
      const html = collectionPageBot(conf.h1, conf.label, `${kind}`, items, origin)
      const res = new Response(html, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': `public, max-age=${PAGE_TTL}`,
          'x-robots-tag': items.length ? 'index, follow' : 'noindex, nofollow',
          'x-seo': 'bot-full',
        },
      })
      try {
        const cacheKey = new Request(`${CACHE_BASE}:browse:${kind}:bot`)
        await caches.default.put(cacheKey, res.clone())
      } catch {
        /* best-effort */
      }
      return res
    }
    return shellWithHead(
      env,
      req,
      {
        title: `${conf.label} — Stream & Discover | ${SITE_NAME}`,
        description: `Browse the ${conf.label.toLowerCase()} — ratings, runtimes, cast and legal streaming info on every title. Updated continuously from live popularity data.`,
        canonical: `${origin}/${kind}`,
        ogImage: items.find((x) => x.backdropPath || x.posterPath)
          ? `${origin}/api/img?p=${encodeURIComponent((items.find((x) => x.backdropPath || x.posterPath)!.backdropPath || items.find((x) => x.posterPath)!.posterPath)!)}&s=w780`
          : undefined,
        jsonLd: items.length ? itemListJsonLd(items, origin, conf.label) : undefined,
        noindex: items.length === 0,
      },
      `browse:${kind}:ui`,
      SHELL_TTL,
    )
  }

  /* 7 — search: utility route → noindex, own title (never home metadata) */
  if (path === '/search') {
    return shellWithHead(
      env,
      req,
      {
        title: `Search Movies & TV Shows | ${SITE_NAME}`,
        description: 'Search thousands of movies, TV series and anime by title, cast, genre or keyword.',
        canonical: `${origin}/search`,
        noindex: true,
      },
      'search:ui',
      SHELL_TTL,
    )
  }

  /* 8 — AI Discovery: personalized route → noindex, own title */
  if (path === '/ai') {
    return shellWithHead(
      env,
      req,
      {
        title: `AI Discovery — Personalized Picks | ${SITE_NAME}`,
        description: 'Describe what you are in the mood for and get personalized movie and series picks.',
        canonical: `${origin}/ai`,
        noindex: true,
      },
      'ai:ui',
      SHELL_TTL,
    )
  }

  /* 8b — Privacy Center: utility route → noindex, own title */
  if (path === '/privacy') {
    return shellWithHead(
      env,
      req,
      {
        title: `Privacy Center — Ad Shield, Secure DNS & Local Data | ${SITE_NAME}`,
        description: 'Built-in ad blocker, Cloudflare secure DNS setup, private session and a local data vault — everything stays on your device.',
        canonical: `${origin}/privacy`,
        noindex: true,
      },
      'privacy:ui',
      SHELL_TTL,
    )
  }

  return null // everything else → normal SPA flow
}
