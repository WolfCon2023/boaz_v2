type CRMHelpButtonProps = {
  tag: string
  className?: string
}

import { KBHelpButton } from '@/components/KBHelpButton'

export function CRMHelpButton({ tag, className }: CRMHelpButtonProps) {
  const href = `/apps/crm/support/kb?tag=${encodeURIComponent(tag)}`

  return <KBHelpButton href={href} className={className} />
}


