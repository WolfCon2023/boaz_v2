import { Outlet } from 'react-router-dom'
import { LayoutShell } from '@/components/LayoutShell'
import { PreferencesProvider } from '@/components/PreferencesProvider'

function App() {
  return (
    <PreferencesProvider>
      <LayoutShell>
        <Outlet />
      </LayoutShell>
    </PreferencesProvider>
  )
}

export default App
