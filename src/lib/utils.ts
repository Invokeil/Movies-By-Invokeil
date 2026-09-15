import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ── Client-side tab title sync ───────────────────────────────────────
   Bots already get per-URL titles from the worker SEO layer; this keeps
   the human-visible browser tab just as descriptive. Views call it in
   an effect and reset with no argument on cleanup.                    */
export const DEFAULT_TAB_TITLE = 'Movies by InvokeIL — Discover Movies, TV Series & Anime'

export function setPageTitle(title?: string): void {
  if (typeof document === 'undefined') return
  document.title = title ? `${title} | Movies by InvokeIL` : DEFAULT_TAB_TITLE
}
