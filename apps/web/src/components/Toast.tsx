import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export type Toast = {
  id: string
  message: string
  type: ToastType
  duration?: number
}

type ToastContextType = {
  showToast: (message: string, type?: ToastType, duration?: number) => void
}

const ToastContext = React.createContext<ToastContextType | null>(null)

export function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    // Fallback to a no-op if used outside provider (for backwards compatibility)
    return {
      showToast: (message: string, type?: ToastType) => {
        console.warn('Toast used outside provider:', message)
        // Fallback to alert for backwards compatibility
        alert(`Message from BOAZ: ${message}`)
      }
    }
  }
  return context
}

// Global toast function that can be used anywhere
let globalToastContext: ToastContextType | null = null

export function setGlobalToastContext(context: ToastContextType) {
  globalToastContext = context
}

export function showToast(message: string, type: ToastType = 'info', duration: number = 5000) {
  if (globalToastContext) {
    globalToastContext.showToast(message, type, duration)
  } else {
    // Fallback to alert
    alert(`Message from BOAZ: ${message}`)
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const showToast = React.useCallback((message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const newToast: Toast = { id, message, type, duration }
    
    setToasts((prev) => [...prev, newToast])

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
    }
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  React.useEffect(() => {
    setGlobalToastContext({ showToast })
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [isExiting, setIsExiting] = React.useState(false)

  const handleRemove = React.useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onRemove(toast.id)
    }, 300)
  }, [toast.id, onRemove])

  React.useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleRemove()
      }, toast.duration)
      return () => clearTimeout(timer)
    }
  }, [toast.duration, handleRemove])

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  }

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  }

  const textColors = {
    success: 'text-green-900',
    error: 'text-red-900',
    warning: 'text-yellow-900',
    info: 'text-blue-900',
  }

  return (
    <div
      className={`
        pointer-events-auto
        min-w-[320px] max-w-[480px]
        rounded-xl border-2 shadow-lg
        ${bgColors[toast.type]}
        transform transition-all duration-300 ease-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        backdrop-blur-sm
      `}
      role="alert"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0 mt-0.5">
          {icons[toast.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${textColors[toast.type]}`}>
            Message from BOAZ
          </div>
          <div className={`text-sm font-medium ${textColors[toast.type]}`}>
            {toast.message}
          </div>
        </div>
        <button
          onClick={handleRemove}
          className={`
            flex-shrink-0
            rounded-lg p-1
            hover:bg-black/5
            transition-colors
            ${textColors[toast.type]}
          `}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {toast.duration && toast.duration > 0 && (
        <div className="h-1 bg-black/10 overflow-hidden rounded-b-xl">
          <div
            className={`h-full ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : toast.type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'}`}
            style={{
              animation: `shrink ${toast.duration}ms linear forwards`,
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  )
}

