import * as React from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'

export type ModalProps = {
  /** Whether the modal is open */
  open: boolean
  /** Called when the modal should close (backdrop click or close button) */
  onClose: () => void
  /** Optional title displayed in the header */
  title?: React.ReactNode
  /** Default width when not fullscreen (e.g., "40rem", "48rem") */
  width?: string
  /** Whether to show the fullscreen toggle button (default: true) */
  showFullscreenToggle?: boolean
  /** Additional className for the modal content container */
  className?: string
  /** Modal content */
  children: React.ReactNode
  /** Optional header actions (buttons, etc.) rendered before the fullscreen toggle */
  headerActions?: React.ReactNode
  /** Optional subtitle displayed below the title */
  subtitle?: React.ReactNode
}

/**
 * Shared Modal component with fullscreen toggle capability.
 * 
 * Features:
 * - Toggle between default size and fullscreen
 * - Smooth transition animations
 * - Click outside to close
 * - Consistent styling across the app
 * - Portal rendering to document.body
 */
export function Modal({
  open,
  onClose,
  title,
  width = '40rem',
  showFullscreenToggle = true,
  className = '',
  children,
  headerActions,
  subtitle,
}: ModalProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)

  // Reset fullscreen state when modal closes
  React.useEffect(() => {
    if (!open) {
      setIsFullscreen(false)
    }
  }, [open])

  // Setup portal element
  React.useEffect(() => {
    setPortalEl(document.body)
  }, [])

  // Handle escape key to close modal
  React.useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !portalEl) return null

  const modalContent = (
    <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 transition-opacity duration-200" 
        onClick={onClose} 
      />
      
      {/* Modal container */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={`
            ${isFullscreen 
              ? 'w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]' 
              : `w-[min(90vw,${width})] max-h-[90vh]`
            }
            overflow-y-auto rounded-2xl border border-[color:var(--color-border)] 
            bg-[color:var(--color-panel)] p-4 shadow-2xl
            transition-all duration-300 ease-in-out
            ${className}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showFullscreenToggle || headerActions) && (
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {title && (
                  <div className="text-base font-semibold">{title}</div>
                )}
                {subtitle && (
                  <div className="text-[11px] text-[color:var(--color-text-muted)] mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {headerActions}
                {showFullscreenToggle && (
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-[color:var(--color-border)] px-2 py-1 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          
          {/* Content */}
          <div className={isFullscreen ? 'h-[calc(100%-3rem)] overflow-y-auto' : ''}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, portalEl)
}

/**
 * Hook to manage modal state with fullscreen support.
 * Useful when you need more control over the modal state.
 */
export function useModal() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)

  const open = React.useCallback(() => setIsOpen(true), [])
  const close = React.useCallback(() => {
    setIsOpen(false)
    setIsFullscreen(false)
  }, [])
  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), [])
  const toggleFullscreen = React.useCallback(() => setIsFullscreen((prev) => !prev), [])

  return {
    isOpen,
    isFullscreen,
    open,
    close,
    toggle,
    toggleFullscreen,
    setIsOpen,
    setIsFullscreen,
  }
}
