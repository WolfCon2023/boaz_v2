import { Search, Clock, CheckCircle, XCircle, FileText } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { formatDateTime } from '@/lib/dateFormat'
import { catalog } from '@/lib/apps'

type ApplicationAccessRequest = {
  id: string
  userId: string
  userEmail: string
  userName?: string
  appKey: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: number
  reviewedAt?: number
  reviewedBy?: string
}

export default function RequestStatus() {
  const [searchRequestId, setSearchRequestId] = useState('')
  const [searchedRequestId, setSearchedRequestId] = useState<string | null>(null)

  // Get all user's requests
  const { data: allRequestsData, isLoading: isLoadingAll } = useQuery<{ requests: ApplicationAccessRequest[] }>({
    queryKey: ['user', 'app-access-requests'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/app-access-requests')
      return res.data
    },
    staleTime: 30 * 1000,
  })

  // Get specific request by ID
  const { data: specificRequestData, isLoading: isLoadingSpecific } = useQuery<{ request: ApplicationAccessRequest }>({
    queryKey: ['user', 'app-access-requests', searchedRequestId],
    queryFn: async () => {
      const res = await http.get(`/api/auth/me/app-access-requests/${searchedRequestId}`)
      return res.data
    },
    enabled: !!searchedRequestId,
    staleTime: 30 * 1000,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchRequestId.trim()) {
      setSearchedRequestId(searchRequestId.trim())
    }
  }

  const getAppName = (appKey: string) => {
    const app = catalog.find((a) => a.key === appKey)
    return app?.name || appKey
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-800">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            Pending
          </span>
        )
      case 'approved':
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
            Approved
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Rejected
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Check Request Status</h1>
      </div>

      {/* Search by Request Number */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <h2 className="mb-4 text-lg font-semibold">Search by Request Number</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchRequestId}
            onChange={(e) => setSearchRequestId(e.target.value)}
            placeholder="Enter request number..."
            className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm focus:border-[color:var(--color-primary-600)] focus:outline-none"
          />
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>

        {/* Specific Request Results */}
        {searchedRequestId && (
          <div className="mt-4">
            {isLoadingSpecific ? (
              <div className="py-4 text-center text-sm text-[color:var(--color-text-muted)]">Loading...</div>
            ) : specificRequestData?.request ? (
              <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{getAppName(specificRequestData.request.appKey)}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">Request #{specificRequestData.request.id}</div>
                  </div>
                  {getStatusBadge(specificRequestData.request.status)}
                </div>
                <div className="space-y-2 text-sm text-[color:var(--color-text-muted)]">
                  <div>
                    <strong>Requested:</strong> {formatDateTime(specificRequestData.request.requestedAt)}
                  </div>
                  {specificRequestData.request.reviewedAt && (
                    <div>
                      <strong>Reviewed:</strong> {formatDateTime(specificRequestData.request.reviewedAt)}
                    </div>
                  )}
                  {specificRequestData.request.status === 'approved' && (
                    <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      Your request has been approved! You can now install and use this application from the Marketplace.
                    </div>
                  )}
                  {specificRequestData.request.status === 'rejected' && (
                    <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      Your request has been rejected. Please contact an administrator if you believe this is an error.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Request not found. Please check the request number and try again.
              </div>
            )}
          </div>
        )}
      </div>

      {/* All User Requests */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <h2 className="mb-4 text-lg font-semibold">My Access Requests</h2>
        {isLoadingAll ? (
          <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">Loading...</div>
        ) : !allRequestsData?.requests || allRequestsData.requests.length === 0 ? (
          <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
            You haven't submitted any access requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {allRequestsData.requests.map((request) => (
              <div
                key={request.id}
                className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{getAppName(request.appKey)}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">Request #{request.id}</div>
                  </div>
                  {getStatusBadge(request.status)}
                </div>
                <div className="space-y-2 text-sm text-[color:var(--color-text-muted)]">
                  <div>
                    <strong>Requested:</strong> {formatDateTime(request.requestedAt)}
                  </div>
                  {request.reviewedAt && (
                    <div>
                      <strong>Reviewed:</strong> {formatDateTime(request.reviewedAt)}
                    </div>
                  )}
                  {request.status === 'pending' && (
                    <div className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
                      Your request is pending review. You will receive an email notification once your request has been reviewed.
                    </div>
                  )}
                  {request.status === 'approved' && (
                    <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">
                      Your request has been approved! You can now install and use this application from the Marketplace.
                    </div>
                  )}
                  {request.status === 'rejected' && (
                    <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      Your request has been rejected. Please contact an administrator if you believe this is an error.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

