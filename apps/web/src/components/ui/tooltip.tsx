import * as RT from '@radix-ui/react-tooltip'

export const TooltipProvider = RT.Provider
export const Tooltip = RT.Root
export const TooltipTrigger = RT.Trigger
export function TooltipContent({ children }: { children: React.ReactNode }) {
  return (
    <RT.Portal>
      <RT.Content className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-xs text-[color:var(--color-text)] shadow-[var(--shadow-2)]">
        {children}
        <RT.Arrow className="fill-[color:var(--color-panel)]" />
      </RT.Content>
    </RT.Portal>
  )
}


