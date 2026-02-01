import { KBHelpButton } from '@/components/KBHelpButton'

type FinHubHelpButtonProps = {
  tag: string
  className?: string
}

export function FinHubHelpButton({ tag, className }: FinHubHelpButtonProps) {
  // FinHub KB articles use the CRM support KB with finhub-specific tags
  const href = `/apps/crm/support/kb?tag=${encodeURIComponent(tag)}`

  return <KBHelpButton href={href} className={className} />
}
