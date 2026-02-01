import { Link } from 'react-router-dom'
import { FinNav } from '@/components/FinNav'
import { FinHubHelpButton } from '@/components/FinHubHelpButton'

export default function FinHub() {
  const items: { label: string; desc: string; href: string }[] = [
    {
      label: 'Financial Intelligence',
      desc: 'GAAP-compliant accounting, journal entries, chart of accounts, and financial statements',
      href: '/apps/finhub/financial-intelligence',
    },
    {
      label: 'Revenue Intelligence',
      desc: 'AI-powered deal scoring, pipeline forecasting, and rep performance analytics',
      href: '/apps/finhub/revenue-intelligence',
    },
  ]

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      <FinNav />

      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">FinHub</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
              Financial operations center – accounting, forecasting, and revenue analytics
            </p>
          </div>
          <FinHubHelpButton tag="finhub:overview" />
        </div>

        {/* Quick Stats */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <svg className="h-6 w-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-sm text-[color:var(--color-text-muted)]">Financial Intelligence</div>
                <div className="text-lg font-semibold">Accounting & Statements</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-blue-500/10 p-3">
                <svg className="h-6 w-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <div className="text-sm text-[color:var(--color-text-muted)]">Revenue Intelligence</div>
                <div className="text-lg font-semibold">Forecasting & Analytics</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-500/20 p-3">
                <svg className="h-6 w-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <div className="text-sm text-amber-400">Access Controlled</div>
                <div className="text-lg font-semibold text-amber-300">Sensitive Financial Data</div>
              </div>
            </div>
          </div>
        </div>

        {/* Module Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          {items.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="group rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 transition-all hover:border-[color:var(--color-primary-600)] hover:shadow-lg"
            >
              <h2 className="text-xl font-semibold group-hover:text-[color:var(--color-primary-400)]">
                {item.label}
              </h2>
              <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">{item.desc}</p>
              <div className="mt-4 flex items-center text-sm text-[color:var(--color-primary-500)]">
                <span>Open module</span>
                <svg className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Info Panel */}
        <div className="mt-8 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h3 className="text-lg font-semibold mb-3">About FinHub</h3>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            FinHub is your centralized financial operations hub. Access to this application is controlled by system administrators.
            This module contains sensitive financial data including:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-[color:var(--color-text-muted)]">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              GAAP-compliant double-entry accounting with audit trails
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              Financial statements (Income Statement, Balance Sheet, Cash Flow)
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
              AI-powered deal scoring and pipeline forecasting
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
              Rep performance analytics and revenue projections
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              Employee labor costs and billing rates
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
