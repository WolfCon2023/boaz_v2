import type { HTMLAttributes } from 'react'
import { cn } from './cn'

type Tone = 'neutral'|'info'|'success'|'warning'|'danger'

const toneClasses: Record<Tone, string> = {
  neutral: 'border-[color:var(--color-border)] text-[color:var(--color-text-muted)]',
  info: 'border-[color:var(--color-info)] text-[color:var(--color-info)]',
  success: 'border-[color:var(--color-success)] text-[color:var(--color-success)]',
  warning: 'border-[color:var(--color-warning)] text-[color:var(--color-warning)]',
  danger: 'border-[color:var(--color-danger)] text-[color:var(--color-danger)]',
}

export function Badge({ className, tone = 'neutral', ...props }: { className?: string; tone?: Tone } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('inline-flex items-center rounded-lg border px-2 py-0.5 text-xs', toneClasses[tone], className)} {...props} />
  )
}


