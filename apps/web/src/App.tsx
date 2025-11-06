import { Outlet } from 'react-router-dom'
import { LayoutShell } from '@/components/LayoutShell'
import { PreferencesProvider } from '@/components/PreferencesProvider'
import { ToastProvider } from '@/components/Toast'

function App() {
  return (
    <PreferencesProvider>
      <ToastProvider>
        <LayoutShell>
          <Outlet />
        </LayoutShell>
      </ToastProvider>
    </PreferencesProvider>
  )
}

export default App
