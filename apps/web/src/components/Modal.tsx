import * as React from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, PictureInPicture2, Pin } from 'lucide-react'

type ModalMode = 'default' | 'popout' | 'fullscreen'

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
 * Shared Modal component with fullscreen toggle and pop-out capability.
 *
 * Features:
 * - Three modes: default (centered), pop-out (draggable + resizable), fullscreen
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
  const [mode, setMode] = React.useState<ModalMode>('default')
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null)

  // Drag state for pop-out mode
  const [dragPos, setDragPos] = React.useState<{ x: number; y: number } | null>(null)
  const dragRef = React.useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const modalBoxRef = React.useRef<HTMLDivElement>(null)

  // Reset state when modal closes
  React.useEffect(() => {
    if (!open) {
      setMode('default')
      setDragPos(null)
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

  // Drag handlers for pop-out mode
  const handleDragStart = React.useCallback(
    (e: React.MouseEvent) => {
      if (mode !== 'popout') return
      // Only drag from left mouse button; ignore clicks on buttons/inputs inside the header
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest('button') || target.closest('input') || target.closest('a')) return

      e.preventDefault()
      const box = modalBoxRef.current
      if (!box) return

      const rect = box.getBoundingClientRect()
      const currentX = dragPos?.x ?? rect.left
      const currentY = dragPos?.y ?? rect.top

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: currentX,
        originY: currentY,
      }

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        setDragPos({
          x: dragRef.current.originX + dx,
          y: dragRef.current.originY + dy,
        })
      }

      const handleUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [mode, dragPos],
  )

  // When entering pop-out, initialise position to current centered position
  const enterPopout = React.useCallback(() => {
    setMode('popout')
    // Position will be set after render via the ref; start with null so we center first
    setDragPos(null)
  }, [])

  // Initialise drag position on first pop-out render
  React.useEffect(() => {
    if (mode === 'popout' && dragPos === null && modalBoxRef.current) {
      const rect = modalBoxRef.current.getBoundingClientRect()
      setDragPos({ x: rect.left, y: rect.top })
    }
  }, [mode, dragPos])

  if (!open || !portalEl) return null

  // Build modal container classes & styles per mode
  const isPopout = mode === 'popout'
  const isFullscreen = mode === 'fullscreen'

  const containerClasses = [
    isFullscreen
      ? 'w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]'
      : isPopout
        ? ''
        : `w-[min(90vw,${width})] max-h-[90vh]`,
    'rounded-2xl border border-[color:var(--color-border)]',
    'bg-[color:var(--color-panel)] p-4 shadow-2xl',
    isPopout ? '' : 'transition-all duration-300 ease-in-out',
    isPopout ? 'overflow-hidden' : 'overflow-y-auto',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const containerStyle: React.CSSProperties = isPopout
    ? {
        position: 'absolute',
        left: dragPos?.x ?? undefined,
        top: dragPos?.y ?? undefined,
        width: `min(90vw, ${width})`,
        height: '70vh',
        minWidth: 320,
        minHeight: 200,
        maxWidth: 'calc(100vw - 1rem)',
        maxHeight: 'calc(100vh - 1rem)',
        resize: 'both' as const,
      }
    : {}

  const modalContent = (
    <div className="fixed inset-0" style={{ zIndex: 2147483647 }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 transition-opacity duration-200 ${isPopout ? 'bg-black/30' : 'bg-black/60'}`}
        onClick={onClose}
      />

      {/* Modal positioning wrapper */}
      <div
        className={
          isPopout
            ? 'absolute inset-0 pointer-events-none'
            : 'absolute inset-0 flex items-center justify-center p-4'
        }
      >
        <div
          ref={modalBoxRef}
          className={`${containerClasses} ${isPopout ? 'pointer-events-auto' : ''}`}
          style={containerStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showFullscreenToggle || headerActions) && (
            <div
              className={`mb-3 flex items-start justify-between gap-2 ${isPopout ? 'cursor-move select-none' : ''}`}
              onMouseDown={handleDragStart}
            >
              <div className="flex-1 min-w-0">
                {title && <div className="text-base font-semibold">{title}</div>}
                {subtitle && (
                  <div className="text-[11px] text-[color:var(--color-text-muted)] mt-0.5">{subtitle}</div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {headerActions}
                {showFullscreenToggle && mode === 'default' && (
                  <>
                    <button
                      type="button"
                      onClick={enterPopout}
                      className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                      title="Pop out"
                    >
                      <PictureInPicture2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('fullscreen')}
                      className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                      title="Fullscreen"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {showFullscreenToggle && mode === 'popout' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('default')
                        setDragPos(null)
                      }}
                      className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                      title="Dock"
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('fullscreen')
                        setDragPos(null)
                      }}
                      className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                      title="Fullscreen"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {showFullscreenToggle && mode === 'fullscreen' && (
                  <button
                    type="button"
                    onClick={() => setMode('default')}
                    className="rounded-full border border-[color:var(--color-border)] p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                    title="Exit fullscreen"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
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
          <div
            className={
              isFullscreen
                ? 'h-[calc(100%-3rem)] overflow-y-auto'
                : isPopout
                  ? 'h-[calc(100%-3rem)] overflow-y-auto'
                  : ''
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, portalEl)
}

/**
 * Hook to manage modal state with fullscreen and pop-out support.
 * Useful when you need more control over the modal state.
 */
export function useModal() {
  const [isOpen, setIsOpen] = React.useState(false)
  const [mode, setMode] = React.useState<ModalMode>('default')

  // Keep legacy boolean accessors for backward compatibility
  const isFullscreen = mode === 'fullscreen'
  const isPopout = mode === 'popout'

  const open = React.useCallback(() => setIsOpen(true), [])
  const close = React.useCallback(() => {
    setIsOpen(false)
    setMode('default')
  }, [])
  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), [])
  const toggleFullscreen = React.useCallback(
    () => setMode((prev) => (prev === 'fullscreen' ? 'default' : 'fullscreen')),
    [],
  )

  return {
    isOpen,
    isFullscreen,
    isPopout,
    mode,
    open,
    close,
    toggle,
    toggleFullscreen,
    setIsOpen,
    setMode,
    // Legacy setter – maps boolean to mode for backward compat
    setIsFullscreen: (val: boolean | ((prev: boolean) => boolean)) => {
      if (typeof val === 'function') {
        setMode((prev) => {
          const wasFull = prev === 'fullscreen'
          return val(wasFull) ? 'fullscreen' : 'default'
        })
      } else {
        setMode(val ? 'fullscreen' : 'default')
      }
    },
  }
}
