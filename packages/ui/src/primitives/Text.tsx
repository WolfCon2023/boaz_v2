import { cn } from './cn'

export function Text({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      {...props}
      className={cn(className, 'text-base/6 text-[color:var(--color-text-muted)] sm:text-sm/6')}
    />
  )
}

export function Strong({ className, ...props }: React.ComponentPropsWithoutRef<'strong'>) {
  return <strong {...props} className={cn(className, 'font-medium text-[color:var(--color-text)]')} />
}

