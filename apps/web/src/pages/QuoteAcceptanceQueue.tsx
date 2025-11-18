import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { CheckCircle, FileText, Search } from 'lucide-react'

type Acceptance = {
  _id: string
  quoteId: string
  quote?: {
    _id: string
    quoteNumber?: number
    title?: string
    total?: number
    status?: string
  }
  quoteNumber?: number
  quoteTitle?: string
  signerName?: string
  signerEmail?: string
  acceptedAt: string
  notes?: string
  status: string
}

export default function QuoteAcceptanceQueue() {
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'accepted'>('all')
  const [q, setQ] = React.useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['quote-acceptance-queue', statusFilter, q],
    queryFn: async () => {
      const params: any = {}
      if (statusFilter !== 'all') {
        params.status = statusFilter
      }
      if (q.trim()) {
        params.q = q.trim()
      }
      const res = await http.get('/api/crm/quotes/acceptance-queue', { params })
      return res.data as { data: { items: Acceptance[] } }
    },
    retry: false,
  })

  const acceptances = data?.data.items ?? []

  // Handle access denied error
  if (error) {
    const errorMsg = (error as any)?.response?.data?.error
    if (errorMsg === 'manager_access_required') {
      return (
        <div className="space-y-4">
          <CRMNav />
          <div className="flex min-h-[60vh] items-center justify-center">
            <div className="w-[min(90vw,28rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
              <h1 className="mb-3 text-xl font-semibold">Access Denied</h1>
              <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
                You must have the manager role to access the acceptance queue.
              </p>
            </div>
          </div>
        </div>
      )
    }
  }

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quote Acceptance Queue</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Search..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg border border-[color:var(--color-border)] bg-transparent text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'accepted')}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm text-[color:var(--color-text)]"
          >
            <option value="all">All Statuses</option>
            <option value="accepted">Accepted</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--color-primary-600)] border-t-transparent"></div>
            <p className="text-sm text-[color:var(--color-text-muted)]">Loading acceptance queue...</p>
          </div>
        </div>
      ) : acceptances.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-[color:var(--color-text-muted)]" />
          <p className="text-sm text-[color:var(--color-text-muted)]">
            {statusFilter === 'all'
              ? 'No quote acceptances found.'
              : `No ${statusFilter} acceptances found.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[color:var(--color-text-muted)] border-b border-[color:var(--color-border)]">
                <tr>
                  <th className="px-4 py-3">Quote</th>
                  <th className="px-4 py-3">Signer</th>
                  <th className="px-4 py-3">Accepted At</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {acceptances.map((acceptance) => (
                  <tr
                    key={acceptance._id}
                    className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {acceptance.quoteNumber ? `#${acceptance.quoteNumber}` : 'N/A'} - {acceptance.quoteTitle || 'Untitled Quote'}
                      </div>
                      {acceptance.quote?.total !== undefined && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          ${acceptance.quote.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {acceptance.signerName && (
                        <div className="font-medium">{acceptance.signerName}</div>
                      )}
                      {acceptance.signerEmail && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          {acceptance.signerEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTime(acceptance.acceptedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {acceptance.notes ? (
                        <div className="max-w-xs truncate" title={acceptance.notes}>
                          {acceptance.notes}
                        </div>
                      ) : (
                        <span className="text-[color:var(--color-text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                        <CheckCircle className="h-3 w-3" />
                        Accepted
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

