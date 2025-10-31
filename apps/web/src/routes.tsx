import { createBrowserRouter, Navigate } from 'react-router-dom'
import App from '@/App'
// Home removed from initial routes; Dashboard is the index
import NotFound from '@/pages/NotFound'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotUsername from '@/pages/ForgotUsername'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Enroll from '@/pages/Enroll'
import Settings from '@/pages/Settings'
import AdminPortal from '@/pages/AdminPortal'
import Dashboard from '@/pages/Dashboard'
import Marketplace from '@/pages/Marketplace'
import Workspace from '@/pages/Workspace'
import CRMContacts from '@/pages/CRMContacts'
import CRMAccounts from '@/pages/CRMAccounts'
import CRMDeals from '@/pages/CRMDeals'
import CRMHub from '@/pages/CRMHub'
import CRMQuotes from '@/pages/CRMQuotes'
import CRMInvoices from '@/pages/CRMInvoices'
import CRMInvoicePrint from '@/pages/CRMInvoicePrint'
import CRMOutreachTemplates from '@/pages/CRMOutreachTemplates'
import CRMOutreachSequences from '@/pages/CRMOutreachSequences'
import CRMOutreachEvents from '@/pages/CRMOutreachEvents'
import SupportTickets from '@/pages/SupportTickets'
import KnowledgeBase from '@/pages/KnowledgeBase'
import SupportPortal from '@/pages/SupportPortal'
import { PublicShell } from '@/components/PublicShell'
import Helpdesk from '@/pages/Helpdesk'
import Marketing from '@/pages/Marketing'
import { RequireAuth } from '@/components/Auth'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: 'marketplace', element: <RequireAuth><Marketplace /></RequireAuth> },
      { path: 'workspace/me', element: <RequireAuth><Workspace /></RequireAuth> },
      { path: 'settings', element: <RequireAuth><Settings /></RequireAuth> },
      { path: 'admin', element: <RequireAuth><AdminPortal /></RequireAuth> },
      // login is defined as a top-level route wrapped in PublicShell
      { path: 'register', element: <Register /> },
      { path: 'dashboard', element: <RequireAuth><Dashboard /></RequireAuth> },
      { path: 'apps/crm', element: <RequireAuth><CRMHub /></RequireAuth> },
      { path: 'apps/crm/contacts', element: <RequireAuth><CRMContacts /></RequireAuth> },
      { path: 'apps/crm/accounts', element: <RequireAuth><CRMAccounts /></RequireAuth> },
      { path: 'apps/crm/quotes', element: <RequireAuth><CRMQuotes /></RequireAuth> },
      { path: 'apps/crm/invoices', element: <RequireAuth><CRMInvoices /></RequireAuth> },
      { path: 'apps/crm/invoices/:id/print', element: <RequireAuth><CRMInvoicePrint /></RequireAuth> },
      { path: 'apps/crm/deals', element: <RequireAuth><CRMDeals /></RequireAuth> },
      { path: 'apps/crm/outreach/templates', element: <RequireAuth><CRMOutreachTemplates /></RequireAuth> },
      { path: 'apps/crm/outreach/sequences', element: <RequireAuth><CRMOutreachSequences /></RequireAuth> },
      { path: 'apps/crm/outreach/events', element: <RequireAuth><CRMOutreachEvents /></RequireAuth> },
      { path: 'apps/crm/marketing', element: <RequireAuth><Marketing /></RequireAuth> },
      { path: 'apps/crm/support/tickets', element: <RequireAuth><SupportTickets /></RequireAuth> },
      { path: 'apps/crm/support/kb', element: <RequireAuth><KnowledgeBase /></RequireAuth> },
      { path: 'apps/helpdesk', element: <RequireAuth><Helpdesk /></RequireAuth> },
      { path: 'apps/support', element: <Navigate to="/apps/helpdesk" replace /> },
    ],
  },
  {
    path: '/portal',
    element: <PublicShell><SupportPortal /></PublicShell>,
  },
  {
    path: '/login',
    element: <PublicShell><Login /></PublicShell>,
  },
  {
    path: '/forgot-username',
    element: <PublicShell><ForgotUsername /></PublicShell>,
  },
  {
    path: '/forgot-password',
    element: <PublicShell><ForgotPassword /></PublicShell>,
  },
  {
    path: '/reset-password',
    element: <PublicShell><ResetPassword /></PublicShell>,
  },
  {
    path: '/enroll',
    element: <PublicShell><Enroll /></PublicShell>,
  },
  // Direct access fallback removed to avoid conflicting route matching
  { path: '*', element: <NotFound /> },
])
