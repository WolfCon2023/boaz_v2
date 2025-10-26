import { createBrowserRouter } from 'react-router-dom'
import App from '@/App'
// Home removed from initial routes; Dashboard is the index
import NotFound from '@/pages/NotFound'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import Marketplace from '@/pages/Marketplace'
import Workspace from '@/pages/Workspace'
import CRMContacts from '@/pages/CRMContacts'
import CRMAccounts from '@/pages/CRMAccounts'
import CRMDeals from '@/pages/CRMDeals'
import CRMHub from '@/pages/CRMHub'
import CRMQuotes from '@/pages/CRMQuotes'
import CRMInvoices from '@/pages/CRMInvoices'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'marketplace', element: <Marketplace /> },
      { path: 'workspace/me', element: <Workspace /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'apps/crm', element: <CRMHub /> },
      { path: 'apps/crm/contacts', element: <CRMContacts /> },
      { path: 'apps/crm/accounts', element: <CRMAccounts /> },
      { path: 'apps/crm/quotes', element: <CRMQuotes /> },
      { path: 'apps/crm/invoices', element: <CRMInvoices /> },
      { path: 'apps/crm/deals', element: <CRMDeals /> },
    ],
  },
  { path: '*', element: <NotFound /> },
])
