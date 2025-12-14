import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { formatDateOnly } from '@/lib/dateFormat'

type Overview = {
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
  }
}

export default function CRMReportingPrint() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const startDate = sp.get('startDate') || ''
  const endDate = sp.get('endDate') || ''
  const printedRef = React.useRef(false)

  const q = useQuery({
    queryKey: ['crm-reporting-overview-print', startDate, endDate],
    queryFn: async () => {
      const res = await http.get('/api/crm/reporting/overview', {
        params: { startDate: startDate || undefined, endDate: endDate || undefined },
      })
      return res.data as { data: Overview }
    },
  })

  const data = q.data?.data

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value || 0)

  React.useEffect(() => {
    if (!data) return
    if (printedRef.current) return
    printedRef.current = true
    const t = setTimeout(() => window.print(), 250)
    return () => clearTimeout(t)
  }, [data])

  const k = data?.kpis || {}

  return (
    <div>
      {/* Print-specific styling */}
      <style>{`
        :root { --fg:#0f172a; --muted:#475569; --border:#e2e8f0; --panel:#ffffff; --bg:#f8fafc; --brand:#2563eb; }
        .rp-body { margin: 0; padding: 32px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: var(--fg); background: var(--bg); }
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
        .toolbar { position: sticky; top: 0; z-index: 10; background: rgba(248,250,252,.9); backdrop-filter: blur(6px); border-bottom: 1px solid var(--border); }
        .toolbarInner { max-width: 980px; margin: 0 auto; padding: 10px 32px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
        .btn { border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 8px 10px; font-size: 12px; cursor: pointer; }
        .btnPrimary { border-color: rgba(37,99,235,.4); background: rgba(37,99,235,.08); }
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
          <div className="text-sm" style={{ color: 'var(--muted)' }}>
            BOAZ Report PDF Preview
          </div>
          <div className="flex gap-2">
            <button className="btn" type="button" onClick={() => navigate('/apps/crm/reporting')}>
              Back
            </button>
            <button className="btn btnPrimary" type="button" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      <div className="rp-body">
        <div className="page">
          {!data && (
            <div className="section">
              <div className="sectionTitle">{q.isError ? 'Failed to load report' : 'Preparing report…'}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
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
                    <span className="pill">Range</span> {formatDateOnly(data.range.startDate)} → {formatDateOnly(data.range.endDate)}
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
                    {(data.lists.topPipeline || []).map((d) => (
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


