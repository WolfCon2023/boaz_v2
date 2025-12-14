import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'

type DetailedReport = {
  overview: {
    range: { startDate: string; endDate: string }
    kpis: Record<string, any>
    lists: {
      topPipeline: Array<{
        id: string
        dealNumber: number | null
        title: string
        stage: string | null
        amount: number
        forecastedCloseDate: string | null
      }>
      engagedSegments?: Array<{ id: string; name: string; emailCount: number; updatedAt: string | null }>
    }
  }
  details: {
    financial: {
      invoiced: { subtotal: number; discounts: number; tax: number; total: number; count: number }
      cashCollected: number
      refundsIssued: number
      netCash: number
      topOverdueInvoices: Array<{
        invoiceId: string
        invoiceNumber: number | null
        title: string
        accountName: string | null
        balance: number
        status: string | null
        dueDate: string | null
        issuedAt: string | null
        daysOverdue: number | null
      }>
      paymentsByMethod?: Record<string, number>
      topPaidInvoices?: Array<{
        invoiceId: string
        invoiceNumber: number | null
        title: string
        accountName: string | null
        totalPaid: number
        paymentCount: number
      }>
      refundEvents?: Array<{
        invoiceId: string
        invoiceNumber: number | null
        title: string
        accountName: string | null
        amount: number
        reason: string | null
        refundedAt: string
      }>
    }
    renewals: {
      dueInRange: Array<{ id: string; name: string; accountName: string | null; status: string; renewalDate: string | null; mrr: number; arr: number; churnRisk: string | null }>
      highChurnRisk: Array<{ id: string; name: string; accountName: string | null; status: string; renewalDate: string | null; mrr: number; arr: number; churnRisk: string | null }>
    }
    support: {
      backlog: Array<{ id: string; ticketNumber: number | null; shortDescription: string; priority: string; status: string; slaDueAt: string | null; updatedAt: string | null; requesterName: string | null; requesterEmail: string | null }>
      breached: Array<{ id: string; ticketNumber: number | null; shortDescription: string; priority: string; status: string; slaDueAt: string | null; updatedAt: string | null; requesterName: string | null; requesterEmail: string | null }>
    }
  }
}

export default function CRMReportingPrint() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const startDate = sp.get('startDate') || ''
  const endDate = sp.get('endDate') || ''
  const autoPrint = sp.get('autoprint') === '1'
  const printedRef = React.useRef(false)
  const [isReadyToPrint, setIsReadyToPrint] = React.useState(false)
  const [isFallbackBasic, setIsFallbackBasic] = React.useState(false)

  const q = useQuery({
    queryKey: ['crm-reporting-overview-print', startDate, endDate],
    queryFn: async () => {
      setIsFallbackBasic(false)
      try {
        const res = await http.get('/api/crm/reporting/report', {
          params: { startDate: startDate || undefined, endDate: endDate || undefined },
        })
        return res.data as { data: DetailedReport }
      } catch (e: any) {
        const status = e?.response?.status
        if (status !== 404) throw e

        // Backwards-compatible fallback for older API deployments
        setIsFallbackBasic(true)
        const res2 = await http.get('/api/crm/reporting/overview', {
          params: { startDate: startDate || undefined, endDate: endDate || undefined },
        })
        const overview = (res2.data as any)?.data
        const fallback: DetailedReport = {
          overview,
          details: {
            financial: {
              invoiced: { subtotal: 0, discounts: 0, tax: 0, total: 0, count: 0 },
              cashCollected: 0,
              refundsIssued: 0,
              netCash: 0,
              topOverdueInvoices: [],
            },
            renewals: { dueInRange: [], highChurnRisk: [] },
            support: { backlog: [], breached: [] },
          },
        }
        return { data: fallback }
      }
    },
    retry: (failureCount, err: any) => {
      // Don't spam retries on 404 "endpoint not deployed yet"
      const status = err?.response?.status
      if (status === 404) return false
      return failureCount < 2
    },
  })

  const data = q.data?.data

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value || 0)

  // Mark "ready" only after the data is loaded and the browser had a chance to lay out the page.
  React.useEffect(() => {
    if (!data) return
    let cancelled = false
    const run = async () => {
      // wait for fonts if supported
      try {
        const anyDoc = document as any
        if (anyDoc?.fonts?.ready) await anyDoc.fonts.ready
      } catch {}
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => setTimeout(r, 50))
      if (!cancelled) setIsReadyToPrint(true)
    }
    run()
    return () => { cancelled = true }
  }, [data])

  // Auto-print (used by "Export PDF" button) — never print the placeholder.
  React.useEffect(() => {
    if (!autoPrint) return
    if (!isReadyToPrint) return
    if (printedRef.current) return
    printedRef.current = true
    const t = setTimeout(() => window.print(), 150)
    return () => clearTimeout(t)
  }, [autoPrint, isReadyToPrint])

  const o = data?.overview
  const k = o?.kpis || {}
  const fin = data?.details.financial
  const ren = data?.details.renewals
  const sup = data?.details.support

  return (
    <div>
      {/* Print-specific styling */}
      <style>{`
        :root { --fg:#0f172a; --muted:#475569; --border:#e2e8f0; --panel:#ffffff; --bg:#f8fafc; --brand:#2563eb; }
        /* Ensure the print preview page has its own high-contrast canvas (avoid dark-mode bleed-through). */
        .rp-body { margin: 0; padding: 32px; min-height: 100vh; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: var(--fg); background: var(--bg); }
        .page { max-width: 980px; margin: 0 auto; }
        .header { display:flex; align-items:flex-start; justify-content:space-between; gap: 16px; margin-bottom: 16px; }
        .brand { font-weight: 800; letter-spacing: .02em; color: var(--brand); font-size: 18px; }
        .h1 { font-size: 28px; font-weight: 800; margin: 6px 0 0; }
        .sub { color: var(--muted); font-size: 12px; margin-top: 6px; }
        .meta { text-align:right; color: var(--muted); font-size: 12px; }
        .cardGrid { display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
        .label { color: var(--muted); font-size: 11px; }
        .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
        .note { color: var(--muted); font-size: 11px; margin-top: 4px; }
        .section { margin-top: 14px; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
        .sectionTitle { font-size: 13px; font-weight: 800; margin: 0 0 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border-bottom: 1px solid var(--border); padding: 8px 6px; font-size: 11px; text-align: left; vertical-align: top; }
        th { color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
        .right { text-align: right; }
        .pill { display:inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; font-size: 10px; color: var(--muted); }
        /* High-contrast toolbar so Back/Print are always visible even in dark mode */
        .toolbar { position: sticky; top: 0; z-index: 10; background: #0b1220; border-bottom: 1px solid rgba(148,163,184,.25); }
        .toolbarInner { max-width: 980px; margin: 0 auto; padding: 10px 32px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
        .btn { border: 1px solid rgba(148,163,184,.35); background: rgba(15,23,42,.35); color: #e5e7eb; border-radius: 10px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
        .btn:hover { background: rgba(15,23,42,.55); }
        .btnPrimary { border-color: rgba(37,99,235,.7); background: rgba(37,99,235,.22); color: #ffffff; }
        .btnPrimary:hover { background: rgba(37,99,235,.35); }
        @media print {
          .toolbar { display:none !important; }
          .rp-body { background: #fff; padding: 0; }
          .page { max-width: none; margin: 0; }
          .section, .card { break-inside: avoid; }
          @page { margin: 14mm; }
        }
      `}</style>

      <div className="toolbar">
        <div className="toolbarInner">
          <div className="text-sm" style={{ color: '#e5e7eb', fontWeight: 700, letterSpacing: '.01em' }}>
            BOAZ Report PDF Preview
          </div>
          {isFallbackBasic && (
            <div className="text-xs" style={{ color: '#cbd5e1' }}>
              Showing basic report (API not updated yet)
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn" type="button" onClick={() => navigate('/apps/crm/reporting')}>
              Back
            </button>
            <button
              className="btn btnPrimary"
              type="button"
              disabled={!isReadyToPrint}
              onClick={() => window.print()}
              title={!isReadyToPrint ? 'Please wait for the report to finish loading' : 'Print / Save as PDF'}
              style={!isReadyToPrint ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      <div className="rp-body">
        <div className="page">
          {!data && (
            <div
              className="section"
              style={{
                background: '#ffffff',
                borderColor: '#e2e8f0',
                color: '#0f172a',
              }}
            >
              <div className="sectionTitle">{q.isError ? 'Failed to load report' : 'Preparing report…'}</div>
              <div style={{ color: '#475569', fontSize: 12 }}>
                {q.isError ? 'Please go back and try again.' : 'This will automatically open the print dialog.'}
              </div>
            </div>
          )}

          {data && (
            <>
              <div className="header">
                <div>
                  <div className="brand">BOAZ-OS</div>
                  <div className="h1">Executive Report</div>
                  <div className="sub">Competitive-edge KPIs across pipeline, service, marketing, and cashflow.</div>
                </div>
                <div className="meta">
                  <div>
                    <span className="pill">Range</span> {formatDateOnly(o!.range.startDate)} → {formatDateOnly(o!.range.endDate)}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span className="pill">Generated</span> {new Date().toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="cardGrid">
                <div className="card">
                  <div className="label">Open Pipeline</div>
                  <div className="value">{formatCurrency(Number(k.pipelineValue || 0))}</div>
                  <div className="note">{Number(k.pipelineDeals || 0)} deals</div>
                </div>
                <div className="card">
                  <div className="label">Closed Won</div>
                  <div className="value">{formatCurrency(Number(k.closedWonValue || 0))}</div>
                  <div className="note">{Number(k.closedWonDeals || 0)} deals</div>
                </div>
                <div className="card">
                  <div className="label">Support</div>
                  <div className="value">{Number(k.openTickets || 0)} open</div>
                  <div className="note">{Number(k.breachedTickets || 0)} SLA-breached</div>
                </div>
                <div className="card">
                  <div className="label">Receivables (AR)</div>
                  <div className="value">{formatCurrency(Number(k.receivablesOutstanding || 0))}</div>
                  <div className="note">Overdue {formatCurrency(Number(k.receivablesOverdue || 0))}</div>
                </div>
              </div>

              <div className="section">
                <div className="sectionTitle">Financial Summary (range)</div>
                <div className="twoCol">
                  <div className="card">
                    <div className="label">Invoiced</div>
                    <div className="value">{formatCurrency(Number(fin?.invoiced.total || 0))}</div>
                    <div className="note">
                      {Number(fin?.invoiced.count || 0)} invoices • Subtotal {formatCurrency(Number(fin?.invoiced.subtotal || 0))} • Discounts {formatCurrency(Number(fin?.invoiced.discounts || 0))} • Tax {formatCurrency(Number(fin?.invoiced.tax || 0))}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Cash Collected</div>
                    <div className="value">{formatCurrency(Number(fin?.cashCollected || 0))}</div>
                    <div className="note">
                      Refunds {formatCurrency(Number(fin?.refundsIssued || 0))} • Net {formatCurrency(Number(fin?.netCash || 0))}
                    </div>
                  </div>
                </div>
                <div style={{ height: 10 }} />
                <div className="twoCol">
                  <div className="card">
                    <div className="label">Payments by method (range)</div>
                    <div className="note">
                      {fin?.paymentsByMethod && Object.keys(fin.paymentsByMethod).length > 0
                        ? Object.entries(fin.paymentsByMethod)
                            .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
                            .slice(0, 6)
                            .map(([m, amt]) => `${m}: ${formatCurrency(Number(amt || 0))}`)
                            .join(' • ')
                        : '—'}
                    </div>
                  </div>
                  <div className="card">
                    <div className="label">Refunds (range)</div>
                    <div className="value">{formatCurrency(Number(fin?.refundsIssued || 0))}</div>
                    <div className="note">{(fin?.refundEvents ?? []).length} refund events</div>
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="sectionTitle">Top Overdue Invoices</div>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Account</th>
                      <th className="right">Balance</th>
                      <th>Due</th>
                      <th className="right">Days overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fin?.topOverdueInvoices ?? []).slice(0, 20).map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td>
                          <div style={{ fontWeight: 700 }}>#{inv.invoiceNumber ?? '—'} {inv.title}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 10 }}>{inv.status ?? '—'}</div>
                        </td>
                        <td>{inv.accountName ?? '—'}</td>
                        <td className="right" style={{ fontWeight: 700 }}>{formatCurrency(Number(inv.balance || 0))}</td>
                        <td>{inv.dueDate ? formatDateOnly(inv.dueDate) : '—'}</td>
                        <td className="right">{inv.daysOverdue ?? '—'}</td>
                      </tr>
                    ))}
                    {(fin?.topOverdueInvoices ?? []).length === 0 && (
                      <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No overdue invoices found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="section">
                <div className="sectionTitle">Top Paid Invoices (range)</div>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Account</th>
                      <th className="right">Paid</th>
                      <th className="right">Payments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fin?.topPaidInvoices ?? []).slice(0, 15).map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td><div style={{ fontWeight: 700 }}>#{inv.invoiceNumber ?? '—'} {inv.title}</div></td>
                        <td>{inv.accountName ?? '—'}</td>
                        <td className="right" style={{ fontWeight: 700 }}>{formatCurrency(Number(inv.totalPaid || 0))}</td>
                        <td className="right">{Number(inv.paymentCount || 0)}</td>
                      </tr>
                    ))}
                    {(fin?.topPaidInvoices ?? []).length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No payments found in selected range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="section">
                <div className="sectionTitle">Refund Events (range)</div>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Account</th>
                      <th className="right">Amount</th>
                      <th>When</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fin?.refundEvents ?? []).slice(0, 20).map((r, idx) => (
                      <tr key={`${r.invoiceId}-${r.refundedAt}-${idx}`}>
                        <td><div style={{ fontWeight: 700 }}>#{r.invoiceNumber ?? '—'} {r.title}</div></td>
                        <td>{r.accountName ?? '—'}</td>
                        <td className="right" style={{ fontWeight: 700 }}>{formatCurrency(Number(r.amount || 0))}</td>
                        <td>{r.refundedAt ? new Date(r.refundedAt).toLocaleString() : '—'}</td>
                        <td>{r.reason ?? '—'}</td>
                      </tr>
                    ))}
                    {(fin?.refundEvents ?? []).length === 0 && (
                      <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No refunds found in selected range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="section">
                <div className="sectionTitle">Top Pipeline Deals</div>
                <table>
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Stage</th>
                      <th className="right">Amount</th>
                      <th>Forecast Close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(o?.lists.topPipeline || []).map((d) => (
                      <tr key={d.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{d.title || 'Untitled'}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 10 }}>#{d.dealNumber ?? '—'}</div>
                        </td>
                        <td>{d.stage ?? '—'}</td>
                        <td className="right" style={{ fontWeight: 700 }}>
                          {formatCurrency(Number(d.amount || 0))}
                        </td>
                        <td>{d.forecastedCloseDate ? formatDateOnly(d.forecastedCloseDate) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="section">
                <div className="sectionTitle">Renewals</div>
                <div className="twoCol">
                  <div className="card">
                    <div className="label">Due in range</div>
                    <div className="value">{Number(ren?.dueInRange.length || 0)}</div>
                    <div className="note">MRR due: {formatCurrency((ren?.dueInRange ?? []).reduce((s, r) => s + Number(r.mrr || 0), 0))}</div>
                  </div>
                  <div className="card">
                    <div className="label">High churn risk</div>
                    <div className="value">{Number(ren?.highChurnRisk.length || 0)}</div>
                    <div className="note">Prioritize outreach + renewals plays</div>
                  </div>
                </div>
                <div style={{ height: 10 }} />
                <table>
                  <thead>
                    <tr>
                      <th>Renewal</th>
                      <th>Account</th>
                      <th>Renewal date</th>
                      <th className="right">MRR</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ren?.dueInRange ?? []).slice(0, 15).map((r) => (
                      <tr key={r.id}>
                        <td><div style={{ fontWeight: 700 }}>{r.name}</div><div style={{ color: 'var(--muted)', fontSize: 10 }}>{r.status}</div></td>
                        <td>{r.accountName ?? '—'}</td>
                        <td>{r.renewalDate ? formatDateOnly(r.renewalDate) : '—'}</td>
                        <td className="right" style={{ fontWeight: 700 }}>{formatCurrency(Number(r.mrr || 0))}</td>
                        <td>{r.churnRisk ?? '—'}</td>
                      </tr>
                    ))}
                    {(ren?.dueInRange ?? []).length === 0 && (
                      <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No renewals due in selected range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="section">
                <div className="sectionTitle">Support Operations</div>
                <div className="twoCol">
                  <div className="card">
                    <div className="label">Backlog (open/in progress)</div>
                    <div className="value">{Number(sup?.backlog.length || 0)}</div>
                    <div className="note">Breached SLAs: {Number(sup?.breached.length || 0)}</div>
                  </div>
                  <div className="card">
                    <div className="label">Ticket Priority Mix</div>
                    <div className="value">{Object.keys((k.ticketsOpenByPriority || {}) as any).length}</div>
                    <div className="note">See dashboard for breakdown</div>
                  </div>
                </div>
                <div style={{ height: 10 }} />
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>SLA Due</th>
                      <th>Requester</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sup?.breached ?? []).slice(0, 15).map((t) => (
                      <tr key={t.id}>
                        <td><div style={{ fontWeight: 700 }}>#{t.ticketNumber ?? '—'} {t.shortDescription}</div><div style={{ color: 'var(--muted)', fontSize: 10 }}>{t.updatedAt ? new Date(t.updatedAt).toLocaleString() : '—'}</div></td>
                        <td>{t.priority}</td>
                        <td>{t.status}</td>
                        <td>{t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : '—'}</td>
                        <td>{t.requesterEmail || t.requesterName || '—'}</td>
                      </tr>
                    ))}
                    {(sup?.breached ?? []).length === 0 && (
                      <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No breached tickets found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="section" style={{ color: 'var(--muted)', fontSize: 11 }}>
                Tip: In the print dialog, choose <b>Save as PDF</b>. For best results, enable background graphics.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


