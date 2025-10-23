import { cn } from './cn'

export function Divider({
  soft = false,
  className,
  ...props
}: { soft?: boolean } & React.ComponentPropsWithoutRef<'hr'>) {
  return (
    <hr
      role="presentation"
      {...props}
      className={cn(
        className,
        'w-full border-t border-[color:var(--color-border)]',
        soft && 'opacity-50'
      )}
    />
  )
}

