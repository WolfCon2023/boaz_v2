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

  return (
    <div className="flex h-screen bg-[color:var(--color-bg)]">
      <CRMNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-[color:var(--color-text)] mb-2">
                Quote Acceptance Queue
              </h1>
              <p className="text-sm text-[color:var(--color-text-muted)]">
                View quotes that have been accepted by external signers
              </p>
            </div>

            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-4 items-center">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[color:var(--color-text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search by quote number, title, signer name or email..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-[color:var(--color-text)] placeholder-[color:var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary-500)]"
                  />
                </div>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'accepted')}
                className="px-4 py-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-[color:var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary-500)]"
              >
                <option value="all">All Statuses</option>
                <option value="accepted">Accepted</option>
              </select>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[color:var(--color-primary-600)] mx-auto mb-4"></div>
                <p className="text-[color:var(--color-text-muted)]">Loading acceptances...</p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-red-800">Failed to load acceptance queue. Please try again.</p>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && acceptances.length === 0 && (
              <div className="bg-[color:var(--color-panel)] rounded-lg border border-[color:var(--color-border)] p-12 text-center">
                <FileText className="h-12 w-12 text-[color:var(--color-text-muted)] mx-auto mb-4" />
                <p className="text-[color:var(--color-text-muted)]">No quote acceptances found.</p>
              </div>
            )}

            {/* Acceptance List */}
            {!isLoading && !error && acceptances.length > 0 && (
              <div className="bg-[color:var(--color-panel)] rounded-lg border border-[color:var(--color-border)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[color:var(--color-muted)] border-b border-[color:var(--color-border)]">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--color-text-muted)] uppercase tracking-wider">
                          Quote
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--color-text-muted)] uppercase tracking-wider">
                          Signer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--color-text-muted)] uppercase tracking-wider">
                          Accepted At
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--color-text-muted)] uppercase tracking-wider">
                          Notes
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[color:var(--color-text-muted)] uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                      {acceptances.map((acceptance) => (
                        <tr key={acceptance._id} className="hover:bg-[color:var(--color-muted)] transition-colors">
                          <td className="px-4 py-4">
                            <div>
                              <div className="font-medium text-[color:var(--color-text)]">
                                {acceptance.quoteTitle || 'Untitled Quote'}
                              </div>
                              {acceptance.quoteNumber && (
                                <div className="text-sm text-[color:var(--color-text-muted)]">
                                  #{acceptance.quoteNumber}
                                </div>
                              )}
                              {acceptance.quote?.total !== undefined && (
                                <div className="text-sm font-semibold text-[color:var(--color-text)] mt-1">
                                  ${acceptance.quote.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              {acceptance.signerName && (
                                <div className="font-medium text-[color:var(--color-text)]">
                                  {acceptance.signerName}
                                </div>
                              )}
                              {acceptance.signerEmail && (
                                <div className="text-sm text-[color:var(--color-text-muted)]">
                                  {acceptance.signerEmail}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-[color:var(--color-text)]">
                            {formatDateTime(acceptance.acceptedAt)}
                          </td>
                          <td className="px-4 py-4">
                            {acceptance.notes ? (
                              <div className="text-sm text-[color:var(--color-text)] max-w-xs truncate" title={acceptance.notes}>
                                {acceptance.notes}
                              </div>
                            ) : (
                              <span className="text-sm text-[color:var(--color-text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
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
        </div>
      </div>
    </div>
  )
}

