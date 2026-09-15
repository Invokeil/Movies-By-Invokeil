'use client'

/* ── CinemaOS theme registry ──────────────────────────────────────────
   Each theme is a set of CSS variables applied via <html data-theme>.
   The no-flash inline script in layout.tsx applies the persisted theme
   before first paint; applyTheme() keeps it in sync after that.        */

export interface ThemeMeta {
  id: string
  name: string
  dark: boolean
  swatch: [string, string, string] // bg, accent, accent-2 for the picker chip
  description: string
}

export const THEMES: ThemeMeta[] = [
  { id: 'obsidian',        name: 'Obsidian',        dark: true,  swatch: ['#0b0b10', '#f45b7a', '#ff9e80'], description: 'Near-black cinema hall with a rose glow — the signature look' },
  { id: 'midnight',        name: 'Midnight',        dark: true,  swatch: ['#0d0916', '#a78bfa', '#f472b6'], description: 'Deep violet night sky, soft and easy on the eyes' },
  { id: 'evergreen',       name: 'Evergreen',       dark: true,  swatch: ['#07120d', '#34d399', '#a3e635'], description: 'Forest dark with fresh emerald accents' },
  { id: 'sunset',          name: 'Sunset',          dark: true,  swatch: ['#140e08', '#fbbf24', '#fb7185'], description: 'Warm amber dusk tones for late-night sessions' },
  { id: 'royal-amethyst',  name: 'Royal Amethyst',  dark: true,  swatch: ['#100a1c', '#c084fc', '#f0abfc'], description: 'Regal purple with a luxurious sheen' },
  { id: 'charcoal',        name: 'Charcoal',        dark: true,  swatch: ['#111113', '#e4e4e7', '#a1a1aa'], description: 'Pure monochrome, zero color distraction' },
  { id: 'arctic-dawn',     name: 'Arctic Dawn',     dark: false, swatch: ['#eef1f6', '#e14d68', '#f97362'], description: 'Bright, crisp light theme with a rose accent' },
  { id: 'nordic-frost',    name: 'Nordic Frost',    dark: false, swatch: ['#eaf2f1', '#0f9d8f', '#34c3b0'], description: 'Cool teal daylight — clean and focused' },
]

export const DEFAULT_THEME = 'obsidian'

export function isThemeId(id: string): boolean {
  return THEMES.some((t) => t.id === id)
}

export function themeMeta(id: string): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** Apply theme to <html> + sync browser UI color. Safe to call anytime. */
export function applyTheme(id: string) {
  if (typeof document === 'undefined') return
  const theme = themeMeta(id)
  document.documentElement.setAttribute('data-theme', theme.id)
  document.documentElement.classList.toggle('dark', theme.dark)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = theme.swatch[0]
}

/** Called from prefs loader & theme picker */
export function setTheme(id: string): string {
  const theme = themeMeta(id)
  applyTheme(theme.id)
  return theme.id
}
