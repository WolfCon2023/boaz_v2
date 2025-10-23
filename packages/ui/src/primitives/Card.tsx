import type { ReactNode, HTMLAttributes } from 'react'
import { cn } from './cn'

export function Card({ className, children, ...props }: { className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-[var(--shadow-1)]', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...props }: { className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-3 border-b border-[color:var(--color-border)]', className)} {...props}>
      {children}
    </div>
  )
}

export function CardContent({ className, children, ...props }: { className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...props }: { className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-4 py-3 border-t border-[color:var(--color-border)]', className)} {...props}>
      {children}
    </div>
  )
}


