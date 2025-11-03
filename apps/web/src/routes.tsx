import { createBrowserRouter } from 'react-router-dom'
import App from '@/App'
// Home removed from initial routes; Dashboard is the index
import NotFound from '@/pages/NotFound'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ForgotUsername from '@/pages/ForgotUsername'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import ChangePassword from '@/pages/ChangePassword'
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
import Support from '@/pages/Support'
import Marketing from '@/pages/Marketing'
import { RequireAuth, RequireApplication } from '@/components/Auth'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <RequireAuth><RequireApplication appKey="dashboard"><Dashboard /></RequireApplication></RequireAuth> },
      { path: 'marketplace', element: <RequireAuth><RequireApplication appKey="marketplace"><Marketplace /></RequireApplication></RequireAuth> },
      { path: 'workspace/me', element: <RequireAuth><RequireApplication appKey="workspace"><Workspace /></RequireApplication></RequireAuth> },
      { path: 'settings', element: <RequireAuth><Settings /></RequireAuth> },
      { path: 'admin', element: <RequireAuth><AdminPortal /></RequireAuth> },
      // login is defined as a top-level route wrapped in PublicShell
      { path: 'register', element: <Register /> },
      { path: 'dashboard', element: <RequireAuth><RequireApplication appKey="dashboard"><Dashboard /></RequireApplication></RequireAuth> },
      { path: 'apps/crm', element: <RequireAuth><RequireApplication appKey="crm"><CRMHub /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/contacts', element: <RequireAuth><RequireApplication appKey="crm"><CRMContacts /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/accounts', element: <RequireAuth><RequireApplication appKey="crm"><CRMAccounts /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/quotes', element: <RequireAuth><RequireApplication appKey="crm"><CRMQuotes /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/invoices', element: <RequireAuth><RequireApplication appKey="crm"><CRMInvoices /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/invoices/:id/print', element: <RequireAuth><RequireApplication appKey="crm"><CRMInvoicePrint /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/deals', element: <RequireAuth><RequireApplication appKey="crm"><CRMDeals /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/outreach/templates', element: <RequireAuth><RequireApplication appKey="crm"><CRMOutreachTemplates /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/outreach/sequences', element: <RequireAuth><RequireApplication appKey="crm"><CRMOutreachSequences /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/outreach/events', element: <RequireAuth><RequireApplication appKey="crm"><CRMOutreachEvents /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/marketing', element: <RequireAuth><RequireApplication appKey="crm"><Marketing /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/support/tickets', element: <RequireAuth><RequireApplication appKey="crm"><SupportTickets /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/support/kb', element: <RequireAuth><RequireApplication appKey="crm"><KnowledgeBase /></RequireApplication></RequireAuth> },
      { path: 'apps/helpdesk', element: <RequireAuth><RequireApplication appKey="helpdesk"><Helpdesk /></RequireApplication></RequireAuth> },
      { path: 'apps/support', element: <RequireAuth><Support /></RequireAuth> },
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
  {
    path: '/change-password',
    element: <ChangePassword />,
  },
  // Direct access fallback removed to avoid conflicting route matching
  { path: '*', element: <NotFound /> },
])
