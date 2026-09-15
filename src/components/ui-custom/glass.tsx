'use client'

import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

/* ── CinemaOS primitives (theme-aware; tokens come from globals.css) ── */

export function GlassPanel({
  children, className, variant = 'base',
}: {
  children: ReactNode
  className?: string
  variant?: 'base' | 'strong' | 'subtle'
}) {
  return (
    <div
      className={cn(
        'rounded-2xl',
        variant === 'base' && 'glass',
        variant === 'strong' && 'glass-strong',
        variant === 'subtle' && 'glass-subtle',
        className
      )}
    >
      {children}
    </div>
  )
}

export function GlassButton({
  children, onClick, className, variant = 'glass', ariaLabel, disabled, style,
}: {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  className?: string
  variant?: 'glass' | 'rose' | 'ghost' | 'mint'
  ariaLabel?: string
  disabled?: boolean
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variant === 'glass' && 'glass glass-hover text-ink',
        variant === 'rose' && 'bg-gradient-rose text-white shadow-lg hover:brightness-110 active:scale-95',
        variant === 'mint' && 'bg-gradient-mint text-black shadow-lg hover:brightness-110 active:scale-95',
        variant === 'ghost' && 'text-ink-soft hover:text-ink hover:bg-white/5 transition-colors',
        className
      )}
    >
      {children}
    </button>
  )
}

export function SectionTitle({
  title, subtitle, action, onWhy,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  onWhy?: () => void
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-ink md:text-2xl">
          <span className="hidden h-6 w-1 rounded-full bg-gradient-rose sm:block" aria-hidden />
          {title}
          {onWhy && (
            <button
              onClick={onWhy}
              className="glass-subtle rounded-full p-1.5 text-mauve transition-colors hover:text-ink"
              aria-label="Why am I seeing this?"
              title="Why am I seeing this?"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.55-1.5 1.1-1.5 2.4" />
                <circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
              </svg>
            </button>
          )}
        </h2>
        {subtitle && <p className="mt-0.5 pl-0 text-sm text-mauve sm:pl-[13px]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Chip({
  children, className, active, onClick,
}: {
  children: ReactNode
  className?: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all',
        active
          ? 'border-transparent bg-gradient-rose text-white shadow-md'
          : 'border-white/10 bg-white/5 text-ink-soft hover:bg-white/10 hover:text-ink',
        !onClick && 'pointer-events-none',
        className
      )}
    >
      {children}
    </button>
  )
}

export function RatingBadge({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[11px] font-extrabold text-white backdrop-blur-md',
        className
      )}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--rose)" stroke="none">
        <path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.4 1.15 6.8L12 17.2l-5.9 3.3 1.15-6.8L2.5 9.3l6.6-1.04L12 2z" />
      </svg>
      {/* audit rule: missing ratings show "NR" — never a fake 0.0 */}
      {rating > 0 ? rating.toFixed(1) : 'NR'}
    </span>
  )
}

export function EmptyState({
  icon, title, body, action,
}: {
  icon: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <GlassPanel variant="subtle" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="glass rounded-full p-4 text-rose">{icon}</div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-mauve">{body}</p>
      {action}
    </GlassPanel>
  )
}
