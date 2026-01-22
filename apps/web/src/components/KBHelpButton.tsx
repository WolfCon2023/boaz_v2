type KBHelpButtonProps = {
  href: string
  className?: string
  title?: string
  ariaLabel?: string
}

export function KBHelpButton({ href, className, title, ariaLabel }: KBHelpButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ||
        'inline-flex items-center justify-center rounded-lg border border-[color:var(--color-border)] px-2 py-1 text-[11px] text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)]'
      }
      aria-label={ariaLabel || 'Open Knowledge Base for this page'}
      title={title || 'Knowledge Base'}
    >
      <span className="text-[color:var(--color-primary-600)] font-semibold">?</span>
    </a>
  )
}

