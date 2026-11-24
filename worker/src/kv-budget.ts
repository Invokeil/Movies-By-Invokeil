/* ── KV write budget (isolate-local, self-refilling) ──────────────────────
   Workers KV on the free plan allows 1,000 writes/day. A crawler storm of
   unique-but-well-formed queries (titles, ids) can still burn that cap in
   1-2 h, after which every cache put 429s until the daily reset.

   This module is a cheap second line of defence AROUND the per-IP rate
   limiter in worker.ts: an isolate-local token budget that caps how many
   KV writes each isolate may make per minute. It deliberately uses NO KV,
   DO or binding of its own — guarding the quota never costs quota.

   Trade-off: under sustained bot pressure, some legitimate cache misses
   will skip the KV write (serving from upstream instead) rather than
   exhausting the daily budget. Reads are never blocked by this module.  */

/* ~50/min per isolate ≈ far above any real user's write demand (cache
   writes only happen on first lookups), yet caps a runaway isolate at
   ~3k/day worst-case instead of unbounded. */
const BUDGET_PER_MINUTE = 50
const WINDOW_MS = 60_000

let windowStart = 0
let used = 0

export function kvWriteAllowed(): boolean {
  const now = Date.now()
  if (now - windowStart > WINDOW_MS) {
    windowStart = now
    used = 0
  }
  if (used >= BUDGET_PER_MINUTE) return false
  used++
  return true
}
