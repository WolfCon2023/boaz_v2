/**
 * Customer Portal Dashboard
 * 
 * Main dashboard for external customers showing their invoices, tickets, and quotes
 * Matches BOAZ-OS design system
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '../lib/http'
import { CustomerPortalThemeToggle } from '../components/CustomerPortalThemeToggle'

type CustomerUser = {
  id: string
  email: string
  name: string
  company?: string
  accountId?: string
}

type DashboardData = {
  invoices: {
    total: number
    unpaid: number
    overdue: number
  }
  tickets: {
    total: number
    open: number
  }
  quotes: {
    total: number
    pending: number
  }
}

export default function CustomerPortalDashboard() {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<CustomerUser | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('customer_portal_token')
    const userStr = localStorage.getItem('customer_portal_user')
    
    if (!token || !userStr) {
      navigate('/customer/login')
      return
    }

    try {
      const user = JSON.parse(userStr)
      setCustomer(user)
    } catch (err) {
      navigate('/customer/login')
    }
  }, [navigate])

  const dashboardQ = useQuery({
    queryKey: ['customer-portal-dashboard'],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get('/api/customer-portal/data/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data as DashboardData
    },
    enabled: !!customer,
  })

  function handleLogout() {
    localStorage.removeItem('customer_portal_token')
    localStorage.removeItem('customer_portal_user')
    navigate('/customer/login')
  }

  if (!customer) {
    return <div className="flex min-h-screen items-center justify-center bg-[color:var(--color-bg)]">Loading...</div>
  }

  const data = dashboardQ.data

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      {/* Header */}
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[color:var(--color-text)]">Customer Portal</h1>
              <p className="text-sm text-[color:var(--color-text-muted)]">{customer.company || 'Welcome'}</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-[color:var(--color-text)]">{customer.name}</p>
                <p className="text-xs text-[color:var(--color-text-muted)]">{customer.email}</p>
              </div>
              <CustomerPortalThemeToggle />
              <button
                onClick={handleLogout}
                className="rounded-lg px-4 py-2 text-sm text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-[color:var(--color-text)] mb-2">
            Welcome back, {customer.name.split(' ')[0]}!
          </h2>
          <p className="text-[color:var(--color-text-muted)]">
            Access your invoices, support tickets, and contracts all in one place.
          </p>
        </div>

        {/* Stats Grid */}
        {dashboardQ.isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-[color:var(--color-primary-600)]"></div>
            <p className="mt-2 text-[color:var(--color-text-muted)]">Loading dashboard...</p>
          </div>
        ) : dashboardQ.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 mb-6">
            <p className="text-sm text-red-800">Failed to load dashboard data</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Invoices Card */}
              <Link
                to="/customer/invoices"
                className="block rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-[color:var(--color-text-muted)]">Invoices</span>
                </div>
                <h3 className="mb-2 text-3xl font-semibold text-[color:var(--color-text)]">{data?.invoices.total || 0}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[color:var(--color-text-muted)]">Unpaid</span>
                    <span className={`font-semibold ${data?.invoices.unpaid ? 'text-orange-500' : 'text-[color:var(--color-text)]'}`}>
                      {data?.invoices.unpaid || 0}
                    </span>
                  </div>
                  {data?.invoices.overdue ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[color:var(--color-text-muted)]">Overdue</span>
                      <span className="font-semibold text-red-500">{data.invoices.overdue}</span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 text-sm font-medium text-[color:var(--color-primary-600)]">
                  View all invoices →
                </div>
              </Link>

              {/* Tickets Card */}
              <Link
                to="/customer/tickets"
                className="block rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-[color:var(--color-text-muted)]">Tickets</span>
                </div>
                <h3 className="mb-2 text-3xl font-semibold text-[color:var(--color-text)]">{data?.tickets.total || 0}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[color:var(--color-text-muted)]">Open</span>
                    <span className={`font-semibold ${data?.tickets.open ? 'text-blue-500' : 'text-[color:var(--color-text)]'}`}>
                      {data?.tickets.open || 0}
                    </span>
                  </div>
                </div>
                <div className="mt-4 text-sm font-medium text-[color:var(--color-primary-600)]">
                  View all tickets →
                </div>
              </Link>

              {/* Quotes Card */}
              <Link
                to="/customer/quotes"
                className="block rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-[color:var(--color-text-muted)]">Quotes</span>
                </div>
                <h3 className="mb-2 text-3xl font-semibold text-[color:var(--color-text)]">{data?.quotes.total || 0}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[color:var(--color-text-muted)]">Pending</span>
                    <span className={`font-semibold ${data?.quotes.pending ? 'text-purple-500' : 'text-[color:var(--color-text)]'}`}>
                      {data?.quotes.pending || 0}
                    </span>
                  </div>
                </div>
                <div className="mt-4 text-sm font-medium text-[color:var(--color-primary-600)]">
                  View all quotes →
                </div>
              </Link>

              {/* Payments Card */}
              <Link
                to="/customer/payments"
                className="block rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase text-[color:var(--color-text-muted)]">Payments</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-600 bg-green-50 px-2 py-0.5 text-[8px] font-semibold text-green-700">
                    🔒 SECURE
                  </span>
                </div>
                <h3 className="mb-2 text-2xl font-semibold text-[color:var(--color-text)]">
                  Pay Invoices
                </h3>
                <div className="space-y-1">
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    Secure online payment processing
                  </div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    PCI DSS compliant • 256-bit encryption
                  </div>
                </div>
                <div className="mt-4 text-sm font-medium text-[color:var(--color-primary-600)]">
                  Make a payment →
                </div>
              </Link>
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
              <h3 className="mb-4 text-lg font-semibold text-[color:var(--color-text)]">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Link
                  to="/customer/invoices"
                  className="flex items-center space-x-3 rounded-lg border border-[color:var(--color-border)] p-4 hover:bg-[color:var(--color-muted)] transition-colors"
                >
                  <span className="font-medium text-[color:var(--color-text)]">View Invoices</span>
                </Link>
                <Link
                  to="/customer/tickets"
                  className="flex items-center space-x-3 rounded-lg border border-[color:var(--color-border)] p-4 hover:bg-[color:var(--color-muted)] transition-colors"
                >
                  <span className="font-medium text-[color:var(--color-text)]">My Tickets</span>
                </Link>
                <Link
                  to="/customer/quotes"
                  className="flex items-center space-x-3 rounded-lg border border-[color:var(--color-border)] p-4 hover:bg-[color:var(--color-muted)] transition-colors"
                >
                  <span className="font-medium text-[color:var(--color-text)]">My Quotes</span>
                </Link>
                <Link
                  to="/customer/payments"
                  className="flex items-center space-x-3 rounded-lg border border-green-500 bg-green-50 p-4 hover:bg-green-100 transition-colors"
                >
                  <span className="font-medium text-green-900">🔒 Make Payment</span>
                </Link>
              </div>
            </div>

            {/* Info Banner */}
            {!customer.accountId && (
              <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900 font-medium mb-1">Account Linking Pending</p>
                <p className="text-sm text-blue-800">
                  Your account is not yet linked to a company account. Some features may be limited. 
                  Please contact support for assistance.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-sm text-[color:var(--color-text-muted)]">
        <p>© 2025 Wolf Consulting Group, LLC. All rights reserved.</p>
        <p className="mt-1">
          Need help? Contact us at{' '}
          <a href="mailto:contactwcg@wolfconsultingnc.com" className="text-[color:var(--color-primary-600)] hover:text-[color:var(--color-primary-700)] underline">
            contactwcg@wolfconsultingnc.com
          </a>
        </p>
      </footer>
    </div>
  )
}
