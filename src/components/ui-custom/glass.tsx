'use client'

import { cn } from '@/lib/utils'
import { type ReactNode } from 'react'

/* ── Glass primitives ────────────────────────────────────────────────── */

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
  children, onClick, className, variant = 'glass', ariaLabel, disabled,
}: {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  className?: string
  variant?: 'glass' | 'rose' | 'ghost' | 'mint'
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variant === 'glass' && 'glass glass-hover text-ink',
        variant === 'rose' && 'bg-gradient-rose text-ink shadow-lg shadow-rose/30 hover:brightness-105 active:scale-95',
        variant === 'mint' && 'bg-gradient-mint text-ink shadow-lg shadow-mint/40 hover:brightness-105 active:scale-95',
        variant === 'ghost' && 'text-ink-soft hover:text-ink hover:bg-white/40 transition-colors',
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
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink md:text-2xl">
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
        {subtitle && <p className="mt-0.5 text-sm text-mauve">{subtitle}</p>}
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
          ? 'border-transparent bg-gradient-rose text-ink shadow-md shadow-rose/25'
          : 'border-white/60 bg-white/40 text-ink-soft backdrop-blur-sm hover:bg-white/70 hover:text-ink',
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
        'inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold text-ink backdrop-blur-sm',
        className
      )}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#F4ACB7" stroke="#9D8189" strokeWidth="1.4">
        <path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.4 1.15 6.8L12 17.2l-5.9 3.3 1.15-6.8L2.5 9.3l6.6-1.04L12 2z" />
      </svg>
      {rating.toFixed(1)}
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
      <div className="glass rounded-full p-4 text-mauve">{icon}</div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-mauve">{body}</p>
      {action}
    </GlassPanel>
  )
}
