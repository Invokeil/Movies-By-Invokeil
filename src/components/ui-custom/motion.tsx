'use client'

import {
  motion,
  MotionConfig,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/* ── Motion primitives — Motion for React (motion/react) ──────────────
   The animation vocabulary of the Porcelain redesign:
   · orchestrated entrance (one staggered reveal per section)
   · motion that ANSWERS actions (press, hover, open) — never noise
   · prefers-reduced-motion is honored globally via MotionConfig        */

/* Shared easing — RIVR-style soft glide */
export const EASE = [0.22, 1, 0.36, 1] as const

/* Parent container that staggers its children in on mount */
export function Stagger({
  children, className, delay = 0, gap = 0.06,
}: {
  children: ReactNode
  className?: string
  delay?: number
  gap?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap, delayChildren: delay } },
      }}
    >
      {children}
    </motion.div>
  )
}

/* Default child of <Stagger> — gentle rise */
export const riseVariant: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
}

export function FadeUp({
  children, className, delay = 0, y = 22, once = true,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  once?: boolean
}) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-40px' }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/* Button press micro-interaction wrapper — spreads onto any button class */
export const pressable = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: { type: 'spring' as const, stiffness: 400, damping: 26 },
}

export function Pressable({
  children, className, onClick, ariaLabel, disabled, type = 'button',
}: {
  children: ReactNode
  className?: string
  onClick?: (e: React.MouseEvent) => void
  ariaLabel?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <motion.button
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn('inline-flex items-center justify-center gap-2', className)}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
    >
      {children}
    </motion.button>
  )
}

/* Page-level transition — keyed wrapper used by the SPA router outlet */
export function PageTransition({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  if (reduce) return <div key={pageKey}>{children}</div>
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.26, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/* Hover-lift wrapper for posters/cards (compositor-friendly) */
export function Lift({
  children, className, amount = 6,
}: {
  children: ReactNode
  className?: string
  amount?: number
}) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -amount }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      {children}
    </motion.div>
  )
}

export { motion, AnimatePresence, MotionConfig }
