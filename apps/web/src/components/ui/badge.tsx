import { cn } from '@/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-lg border px-2 py-0.5 text-xs transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[color:var(--color-primary-600)] text-white',
        destructive: 'border-transparent bg-[color:var(--color-danger)] text-white',
        outline: 'border-[color:var(--color-border)] text-[color:var(--color-text)]',
        secondary: 'border-transparent bg-[color:var(--color-muted)] text-[color:var(--color-text)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}


