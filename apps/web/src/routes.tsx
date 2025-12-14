import { createBrowserRouter, Outlet } from 'react-router-dom'
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
import AdminCustomerPortalUsers from '@/pages/AdminCustomerPortalUsers'
import AdminDataSeeding from '@/pages/AdminDataSeeding'
import Dashboard from '@/pages/Dashboard'
import Marketplace from '@/pages/Marketplace'
import Workspace from '@/pages/Workspace'
import CRMContacts from '@/pages/CRMContacts'
import CRMAccounts from '@/pages/CRMAccounts'
import CRMDeals from '@/pages/CRMDeals'
import CRMProjects from '@/pages/CRMProjects'
import CRMProjectsReport from '@/pages/CRMProjectsReport'
import CRMSuccess from '@/pages/CRMSuccess'
import CRMSLAs from '@/pages/CRMSLAs'
import CRMHub from '@/pages/CRMHub'
import CRMRenewals from '@/pages/CRMRenewals'
import CRMQuotes from '@/pages/CRMQuotes'
import CRMApprovalQueue from '@/pages/CRMApprovalQueue'
import CRMDealApprovalQueue from '@/pages/CRMDealApprovalQueue'
import CRMInvoices from '@/pages/CRMInvoices'
import PaymentPortal from '@/pages/PaymentPortal'
import SecurePaymentCheckout from '@/pages/SecurePaymentCheckout'
import CRMProducts from '@/pages/CRMProducts'
import CRMVendors from '@/pages/CRMVendors'
import CRMAssets from '@/pages/CRMAssets'
import CRMAssetsReport from '@/pages/CRMAssetsReport'
import CRMAssetsProductsReport from '@/pages/CRMAssetsProductsReport'
import CRMRevenueIntelligence from '@/pages/CRMRevenueIntelligence'
import CRMReporting from '@/pages/CRMReporting'
import CRMInvoicePrint from '@/pages/CRMInvoicePrint'
import CRMOutreachTemplates from '@/pages/CRMOutreachTemplates'
import CRMOutreachSequences from '@/pages/CRMOutreachSequences'
import CRMOutreachEvents from '@/pages/CRMOutreachEvents'
import CRMDocuments from '@/pages/CRMDocuments'
import CRMTasks from '@/pages/CRMTasks'
import CRMSurveys from '@/pages/CRMSurveys'
import CRMSurveysHelp from '@/pages/CRMSurveysHelp'
import SupportTickets from '@/pages/SupportTickets'
import KnowledgeBase from '@/pages/KnowledgeBase'
import SupportPortal from '@/pages/SupportPortal'
import ContractSign from '@/pages/ContractSign'
import { PublicShell } from '@/components/PublicShell'
import AboutBoazOs from '@/pages/AboutBoazOs'
import LegalEula from '@/pages/legal/Eula'
import LegalTerms from '@/pages/legal/Terms'
import LegalPrivacy from '@/pages/legal/Privacy'
import Helpdesk from '@/pages/Helpdesk'
import Support from '@/pages/Support'
import Marketing from '@/pages/Marketing'
import MarketingSocial from '@/pages/MarketingSocial'
import RequestStatus from '@/pages/RequestStatus'
import TermsReview from '@/pages/TermsReview'
import QuoteView from '@/pages/QuoteView'
import SurveyRespond from '@/pages/SurveyRespond'
import QuoteAcceptanceQueue from '@/pages/QuoteAcceptanceQueue'
import CustomerPortalLogin from '@/pages/CustomerPortalLogin'
import CustomerPortalDashboard from '@/pages/CustomerPortalDashboard'
import CustomerPortalInvoices from '@/pages/CustomerPortalInvoices'
import CustomerPortalTickets from '@/pages/CustomerPortalTickets'
import CustomerPortalQuotes from '@/pages/CustomerPortalQuotes'
import CustomerPortalPayments from '@/pages/CustomerPortalPayments'
import CustomerPortalVerifyEmail from '@/pages/CustomerPortalVerifyEmail'
import CustomerPortalResetPassword from '@/pages/CustomerPortalResetPassword'
import SecureCheckout from '@/pages/SecureCheckout'
import PaymentSuccess from '@/pages/PaymentSuccess'
import { RequireAuth, RequireApplication } from '@/components/Auth'
import { ToastProvider } from '@/components/Toast'
import { CustomerPortalThemeProvider } from '@/components/CustomerPortalThemeProvider'

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
      { path: 'admin/customer-portal-users', element: <RequireAuth><AdminCustomerPortalUsers /></RequireAuth> },
      { path: 'admin/seed-data', element: <RequireAuth><AdminDataSeeding /></RequireAuth> },
      // login is defined as a top-level route wrapped in PublicShell
      { path: 'register', element: <Register /> },
      { path: 'dashboard', element: <RequireAuth><RequireApplication appKey="dashboard"><Dashboard /></RequireApplication></RequireAuth> },
      { path: 'apps/crm', element: <RequireAuth><RequireApplication appKey="crm"><CRMHub /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/contacts', element: <RequireAuth><RequireApplication appKey="crm"><CRMContacts /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/accounts', element: <RequireAuth><RequireApplication appKey="crm"><CRMAccounts /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/quotes', element: <RequireAuth><RequireApplication appKey="crm"><CRMQuotes /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/quotes/approval-queue', element: <RequireAuth><RequireApplication appKey="crm"><CRMApprovalQueue /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/quotes/acceptance-queue', element: <RequireAuth><RequireApplication appKey="crm"><QuoteAcceptanceQueue /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/deals/approval-queue', element: <RequireAuth><RequireApplication appKey="crm"><CRMDealApprovalQueue /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/invoices', element: <RequireAuth><RequireApplication appKey="crm"><CRMInvoices /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/invoices/:id/print', element: <RequireAuth><RequireApplication appKey="crm"><CRMInvoicePrint /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/payments', element: <RequireAuth><RequireApplication appKey="crm"><PaymentPortal /></RequireApplication></RequireAuth> },
      { path: 'checkout', element: <SecureCheckout /> },
      { path: 'payment/checkout', element: <SecurePaymentCheckout /> },
      { path: 'apps/crm/deals', element: <RequireAuth><RequireApplication appKey="crm"><CRMDeals /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/projects', element: <RequireAuth><RequireApplication appKey="crm"><CRMProjects /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/projects/report', element: <RequireAuth><RequireApplication appKey="crm"><CRMProjectsReport /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/success', element: <RequireAuth><RequireApplication appKey="crm"><CRMSuccess /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/slas', element: <RequireAuth><RequireApplication appKey="crm"><CRMSLAs /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/renewals', element: <RequireAuth><RequireApplication appKey="crm"><CRMRenewals /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/revenue-intelligence', element: <RequireAuth><RequireApplication appKey="crm"><CRMRevenueIntelligence /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/reporting', element: <RequireAuth><RequireApplication appKey="crm"><CRMReporting /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/products', element: <RequireAuth><RequireApplication appKey="crm"><CRMProducts /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/vendors', element: <RequireAuth><RequireApplication appKey="crm"><CRMVendors /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/assets', element: <RequireAuth><RequireApplication appKey="crm"><CRMAssets /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/assets/report', element: <RequireAuth><RequireApplication appKey="crm"><CRMAssetsReport /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/assets/products-report', element: <RequireAuth><RequireApplication appKey="crm"><CRMAssetsProductsReport /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/outreach/templates', element: <RequireAuth><RequireApplication appKey="crm"><CRMOutreachTemplates /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/outreach/sequences', element: <RequireAuth><RequireApplication appKey="crm"><CRMOutreachSequences /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/outreach/events', element: <RequireAuth><RequireApplication appKey="crm"><CRMOutreachEvents /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/marketing', element: <RequireAuth><RequireApplication appKey="crm"><Marketing /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/marketing/social', element: <RequireAuth><RequireApplication appKey="crm"><MarketingSocial /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/support/tickets', element: <RequireAuth><RequireApplication appKey="crm"><SupportTickets /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/support/kb', element: <RequireAuth><RequireApplication appKey="crm"><KnowledgeBase /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/documents', element: <RequireAuth><RequireApplication appKey="crm"><CRMDocuments /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/tasks', element: <RequireAuth><RequireApplication appKey="crm"><CRMTasks /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/surveys/help', element: <RequireAuth><RequireApplication appKey="crm"><CRMSurveysHelp /></RequireApplication></RequireAuth> },
      { path: 'apps/crm/surveys', element: <RequireAuth><RequireApplication appKey="crm"><CRMSurveys /></RequireApplication></RequireAuth> },
      { path: 'apps/helpdesk', element: <RequireAuth><RequireApplication appKey="helpdesk"><Helpdesk /></RequireApplication></RequireAuth> },
      { path: 'apps/support', element: <RequireAuth><Support /></RequireAuth> },
      { path: 'request-status', element: <RequireAuth><RequestStatus /></RequireAuth> },
    ],
  },
  {
    path: '/about',
    element: <PublicShell><AboutBoazOs /></PublicShell>,
  },
  {
    path: '/legal/eula',
    element: <PublicShell><LegalEula /></PublicShell>,
  },
  {
    path: '/legal/terms',
    element: <PublicShell><LegalTerms /></PublicShell>,
  },
  {
    path: '/legal/privacy',
    element: <PublicShell><LegalPrivacy /></PublicShell>,
  },
  {
    path: '/portal',
    element: <PublicShell><SupportPortal /></PublicShell>,
  },
  {
    path: '/payment-success',
    element: <PaymentSuccess />,
  },
  {
    path: '/checkout',
    element: <SecureCheckout />,
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
    path: '/terms/review/:token',
    element: <PublicShell><TermsReview /></PublicShell>,
  },
  {
    path: '/quotes/view/:token',
    element: <PublicShell><QuoteView /></PublicShell>,
  },
  {
    path: '/contracts/sign/:token',
    element: <PublicShell><ContractSign /></PublicShell>,
  },
  {
    path: '/surveys/respond/:token',
    element: <PublicShell><SurveyRespond /></PublicShell>,
  },
  {
    path: '/change-password',
    element: <ChangePassword />,
  },
  // Customer Portal (external customer access - wrapped in ToastProvider for notifications)
  {
    path: '/customer',
    element: (
      <CustomerPortalThemeProvider>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </CustomerPortalThemeProvider>
    ),
    children: [
      { path: 'login', element: <CustomerPortalLogin /> },
      { path: 'verify-email', element: <CustomerPortalVerifyEmail /> },
      { path: 'reset-password', element: <CustomerPortalResetPassword /> },
      { path: 'dashboard', element: <CustomerPortalDashboard /> },
      { path: 'invoices', element: <CustomerPortalInvoices /> },
      { path: 'tickets', element: <CustomerPortalTickets /> },
      { path: 'quotes', element: <CustomerPortalQuotes /> },
      { path: 'payments', element: <CustomerPortalPayments /> },
      { path: 'checkout', element: <SecureCheckout /> },
      { path: 'payment-success', element: <PaymentSuccess /> },
    ],
  },
  // Direct access fallback removed to avoid conflicting route matching
  { path: '*', element: <NotFound /> },
])
