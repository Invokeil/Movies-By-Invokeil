/* API base: same-origin in production (Cloudflare Worker serves both app + API).
   In sandbox dev, .env.development points this at the deployed Worker.
   Empty string ⇒ relative fetches (same origin).                              */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''
