import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Building2, Users } from 'lucide-react'

export default function InvoiceAccess() {
  const { id } = useParams()

  const invoiceId = (id || '').trim()
  const hasCustomerToken = React.useMemo(() => {
    try {
      return Boolean(localStorage.getItem('customer_portal_token'))
    } catch {
      return false
    }
  }, [])

  const customerHref = invoiceId
    ? hasCustomerToken
      ? `/customer/invoices?invoiceId=${encodeURIComponent(invoiceId)}`
      : `/customer/login?next=${encodeURIComponent('/customer/invoices')}&invoiceId=${encodeURIComponent(invoiceId)}`
    : '/customer/login'

  const internalHref = invoiceId ? `/apps/crm/invoices/${encodeURIComponent(invoiceId)}/print` : '/apps/crm/invoices'

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-0">
      <div className="mb-8 text-center">
        <div className="text-2xl font-semibold">Open Invoice</div>
        <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">
          Choose how you’d like to access this invoice.
        </div>
        {invoiceId && (
          <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
            Invoice ID: <span className="font-mono">{invoiceId}</span>
          </div>
        )}
      </div>

      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href={customerHref}
          className="group block w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 text-left shadow-sm transition hover:bg-[color:var(--color-muted)]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-2">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Customer Portal</div>
                <ArrowRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Customers can log in or create an account to view invoices and payment options.
              </div>
              <div className="mt-3 text-xs font-medium text-[color:var(--color-primary-600)]">
                Continue as customer
              </div>
            </div>
          </div>
        </a>

        <a
          href={internalHref}
          className="group block w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5 text-left shadow-sm transition hover:bg-[color:var(--color-muted)]"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-2">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Staff Portal</div>
                <ArrowRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                Internal users can sign in (or register) to access the full CRM invoice view.
              </div>
              <div className="mt-3 text-xs font-medium text-[color:var(--color-primary-600)]">
                Continue as staff
              </div>
            </div>
          </div>
        </a>
      </div>

      <div className="mt-8 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-4 text-xs text-[color:var(--color-text-muted)]">
        <div className="font-semibold text-[color:var(--color-text)]">Tip</div>
        <div className="mt-1">
          If you’re a customer and don’t have an account yet, choose <span className="font-semibold">Customer Portal</span>{' '}
          and click <span className="font-semibold">Create account</span>.
        </div>
        <div className="mt-2">
          Already logged in? You can go straight to{' '}
          <Link className="underline" to="/customer/invoices">
            My Invoices
          </Link>
          .
        </div>
      </div>
    </div>
  )
}


