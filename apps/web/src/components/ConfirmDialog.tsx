import * as React from 'react'
import { createPortal } from 'react-dom'

type ConfirmDialogProps = {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  confirmColor?: 'primary' | 'danger' | 'success'
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel',
  confirmColor = 'primary',
}: ConfirmDialogProps) {
  const confirmColors = {
    primary: 'bg-[color:var(--color-primary-600)] hover:bg-[color:var(--color-primary-700)]',
    danger: 'bg-red-600 hover:bg-red-700',
    success: 'bg-green-600 hover:bg-green-700',
  }

  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      style={{ zIndex: 2147483647 }}
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onCancel()
        }
      }}
    >
      <div 
        className="bg-[color:var(--color-panel)] rounded-2xl shadow-2xl border border-[color:var(--color-border)] w-[min(90vw,24rem)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)] mb-1.5">
            BOAZ says
          </div>
          <p className="text-sm text-[color:var(--color-text)]">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          {cancelText && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-sm hover:bg-[color:var(--color-muted)] transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`rounded-lg px-3 py-2 text-sm text-white font-medium transition-colors ${confirmColors[confirmColor]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Hook to use confirm dialog
export function useConfirm() {
  const [confirmState, setConfirmState] = React.useState<{
    message: string
    onConfirm: () => void
    onCancel: () => void
    confirmText?: string
    cancelText?: string
    confirmColor?: 'primary' | 'danger' | 'success'
  } | null>(null)

  const confirm = React.useCallback((
    message: string,
    options?: {
      confirmText?: string
      cancelText?: string
      confirmColor?: 'primary' | 'danger' | 'success'
    }
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      // If cancelText is explicitly set to empty string, don't show cancel button (for alerts)
      // If cancelText is undefined, default to 'Cancel'
      const cancelTextValue = options?.cancelText === '' 
        ? undefined 
        : (options?.cancelText !== undefined ? options.cancelText : 'Cancel')
      
      setConfirmState({
        message,
        onConfirm: () => {
          setConfirmState(null)
          resolve(true)
        },
        onCancel: () => {
          setConfirmState(null)
          resolve(false)
        },
        confirmText: options?.confirmText || 'OK',
        cancelText: cancelTextValue,
        confirmColor: options?.confirmColor || 'primary',
      })
    })
  }, [])

  // Render dialog whenever confirmState changes
  const ConfirmDialogComponent = confirmState ? (
    <ConfirmDialog
      key={confirmState.message} // Force re-render when message changes
      message={confirmState.message}
      onConfirm={confirmState.onConfirm}
      onCancel={confirmState.onCancel}
      confirmText={confirmState.confirmText}
      cancelText={confirmState.cancelText}
      confirmColor={confirmState.confirmColor}
    />
  ) : null

  return { confirm, ConfirmDialog: ConfirmDialogComponent }
}

