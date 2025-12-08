/**
 * Customer Portal Dashboard
 * 
 * Main dashboard for external customers showing their invoices, tickets, and contracts
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '../lib/http'
import { FileText, Ticket, FileSignature, DollarSign, AlertCircle, LogOut, Building2 } from 'lucide-react'

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
    // Check if logged in
    const token = localStorage.getItem('customer_portal_token')
    const userStr = localStorage.getItem('customer_portal_user')
    
    if (!token || !userStr) {
      navigate('/portal/login')
      return
    }

    try {
      const user = JSON.parse(userStr)
      setCustomer(user)
    } catch (err) {
      navigate('/portal/login')
    }
  }, [navigate])

  // Fetch dashboard data
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
    navigate('/portal/login')
  }

  if (!customer) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  const data = dashboardQ.data

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Customer Portal</h1>
                <p className="text-sm text-gray-600">{customer.company || 'Welcome'}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                <p className="text-xs text-gray-600">{customer.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {customer.name.split(' ')[0]}!
          </h2>
          <p className="text-gray-600">
            Access your invoices, support tickets, and contracts all in one place.
          </p>
        </div>

        {/* Stats Grid */}
        {dashboardQ.isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-gray-600">Loading dashboard...</p>
          </div>
        ) : dashboardQ.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <p className="text-red-800">Failed to load dashboard data</p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Invoices Card */}
              <Link
                to="/portal/invoices"
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Invoices</span>
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{data?.invoices.total || 0}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Unpaid</span>
                    <span className={`font-semibold ${data?.invoices.unpaid ? 'text-orange-600' : 'text-gray-900'}`}>
                      {data?.invoices.unpaid || 0}
                    </span>
                  </div>
                  {data?.invoices.overdue ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Overdue</span>
                      <span className="font-semibold text-red-600">{data.invoices.overdue}</span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 text-sm text-indigo-600 font-medium">
                  View all invoices →
                </div>
              </Link>

              {/* Tickets Card */}
              <Link
                to="/portal/tickets"
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Ticket className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Tickets</span>
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{data?.tickets.total || 0}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Open</span>
                    <span className={`font-semibold ${data?.tickets.open ? 'text-blue-600' : 'text-gray-900'}`}>
                      {data?.tickets.open || 0}
                    </span>
                  </div>
                </div>
                <div className="mt-4 text-sm text-indigo-600 font-medium">
                  View all tickets →
                </div>
              </Link>

              {/* Quotes Card */}
              <Link
                to="/portal/quotes"
                className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 border border-gray-100"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                    <FileSignature className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Quotes</span>
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{data?.quotes.total || 0}</h3>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Pending</span>
                    <span className={`font-semibold ${data?.quotes.pending ? 'text-purple-600' : 'text-gray-900'}`}>
                      {data?.quotes.pending || 0}
                    </span>
                  </div>
                </div>
                <div className="mt-4 text-sm text-indigo-600 font-medium">
                  View all quotes →
                </div>
              </Link>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link
                  to="/portal/invoices"
                  className="flex items-center space-x-3 p-4 bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 rounded-lg transition-colors"
                >
                  <FileText className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-gray-900">View Invoices</span>
                </Link>
                <Link
                  to="/portal/tickets"
                  className="flex items-center space-x-3 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-lg transition-colors"
                >
                  <Ticket className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-gray-900">My Tickets</span>
                </Link>
                <Link
                  to="/portal/quotes"
                  className="flex items-center space-x-3 p-4 bg-gradient-to-br from-purple-50 to-pink-50 hover:from-purple-100 hover:to-pink-100 rounded-lg transition-colors"
                >
                  <FileSignature className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-gray-900">My Quotes</span>
                </Link>
              </div>
            </div>

            {/* Info Banner */}
            {!customer.accountId && (
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-blue-800 font-medium mb-1">Account Linking Pending</p>
                    <p className="text-sm text-blue-700">
                      Your account is not yet linked to a company account. Some features may be limited. 
                      Please contact support for assistance.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-sm text-gray-600">
        <p>© 2025 Wolf Consulting Group, LLC. All rights reserved.</p>
        <p className="mt-1">
          Need help? Contact us at{' '}
          <a href="mailto:contactwcg@wolfconsultingnc.com" className="text-indigo-600 hover:text-indigo-700">
            contactwcg@wolfconsultingnc.com
          </a>
        </p>
      </footer>
    </div>
  )
}

