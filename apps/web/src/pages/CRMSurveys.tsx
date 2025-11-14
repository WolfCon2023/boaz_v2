import * as React from 'react'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'

type SurveyProgram = {
  id: string
  name: string
  type: 'NPS' | 'CSAT' | 'Post‑interaction'
  channel: 'Email' | 'In‑app' | 'Link'
  status: 'Draft' | 'Active' | 'Paused'
  lastSentAt?: string
  responseRate?: number
}

const samplePrograms: SurveyProgram[] = [
  {
    id: 'nps-main',
    name: 'Quarterly NPS – All Customers',
    type: 'NPS',
    channel: 'Email',
    status: 'Active',
    lastSentAt: new Date().toISOString(),
    responseRate: 42,
  },
  {
    id: 'csat-support',
    name: 'Post‑ticket CSAT – Support',
    type: 'CSAT',
    channel: 'Email',
    status: 'Active',
    lastSentAt: new Date().toISOString(),
    responseRate: 63,
  },
  {
    id: 'post-demo',
    name: 'Post‑demo feedback – Sales',
    type: 'Post‑interaction',
    channel: 'Link',
    status: 'Paused',
    responseRate: 31,
  },
]

export default function CRMSurveys() {
  const [typeFilter, setTypeFilter] = React.useState<'all' | 'NPS' | 'CSAT' | 'Post‑interaction'>('all')
  const programs = samplePrograms.filter((p) => (typeFilter === 'all' ? true : p.type === typeFilter))

  return (
    <div className="space-y-4">
      <CRMNav />
      <div className="px-4 pb-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Surveys &amp; Feedback</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              Configure NPS and CSAT programs, and send post‑interaction surveys after tickets, demos, and other touchpoints.
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[color:var(--color-text)] font-medium">Filter by type:</span>
          <select
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-2 py-1 text-sm text-[color:var(--color-text)] font-semibold"
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as 'all' | 'NPS' | 'CSAT' | 'Post‑interaction')
            }
          >
            <option value="all">All</option>
            <option value="NPS">NPS</option>
            <option value="CSAT">CSAT</option>
            <option value="Post‑interaction">Post‑interaction</option>
          </select>
        </div>

        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-md font-semibold">Survey programs</h2>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-primary-600)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-700)]"
            >
              New survey program
            </button>
          </div>

          {programs.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-muted)]">
              No survey programs match this filter yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Channel</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">Last Sent</th>
                    <th className="px-2 py-1">Response Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <tr key={p.id} className="border-b border-[color:var(--color-border)] last:border-b-0">
                      <td className="px-2 py-1">{p.name}</td>
                      <td className="px-2 py-1">{p.type}</td>
                      <td className="px-2 py-1">{p.channel}</td>
                      <td className="px-2 py-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            p.status === 'Active'
                              ? 'bg-green-100 text-green-800'
                              : p.status === 'Paused'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        {p.lastSentAt ? formatDateTime(p.lastSentAt) : '—'}
                      </td>
                      <td className="px-2 py-1">
                        {typeof p.responseRate === 'number' ? `${p.responseRate}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


