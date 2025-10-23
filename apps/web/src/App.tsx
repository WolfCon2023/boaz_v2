import { Outlet } from 'react-router-dom'
import { LayoutShell } from '@/components/LayoutShell'

function App() {
  return (
    <LayoutShell>
      <Outlet />
    </LayoutShell>
  )
}

export default App
