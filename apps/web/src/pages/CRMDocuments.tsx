import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http, getApiUrl } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { FileText, Upload, Download, Trash2, Eye, Users, Plus, X, Search } from 'lucide-react'

type DocumentVersion = {
  _id: string
  version: number
  filename: string
  originalFilename: string
  contentType: string
  size: number
  uploadedBy: string
  uploadedByName?: string
  uploadedByEmail?: string
  uploadedAt: string
  description?: string
}

type DocumentPermission = {
  userId: string
  userName?: string
  userEmail?: string
  permission: 'view' | 'edit' | 'delete'
  grantedBy: string
  grantedAt: string
}

type Document = {
  _id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  currentVersion: number
  versionCount: number
  latestVersion?: DocumentVersion
  ownerId: string
  ownerName?: string
  ownerEmail?: string
  isPublic: boolean
  relatedTo?: {
    type: 'account' | 'contact' | 'deal' | 'quote' | 'invoice'
    id: string
  }
  createdAt: string
  updatedAt: string
}

type DocumentDetail = Document & {
  versions: DocumentVersion[]
  permissions: DocumentPermission[]
}

type User = {
  _id: string
  name?: string
  email: string
}

export default function CRMDocuments() {
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [tag, setTag] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [pageSize] = React.useState(25)
  const [sort, setSort] = React.useState<'name' | 'updatedAt' | 'createdAt'>('updatedAt')
  const [dir, setDir] = React.useState<'asc' | 'desc'>('desc')
  const [showUpload, setShowUpload] = React.useState(false)
  const [selectedDoc, setSelectedDoc] = React.useState<DocumentDetail | null>(null)
  const [showPermissions, setShowPermissions] = React.useState(false)
  const [showVersions, setShowVersions] = React.useState(false)
  const [uploadingVersion, setUploadingVersion] = React.useState(false)
  const [relatedToType, setRelatedToType] = React.useState<'account' | 'contact' | 'deal' | 'quote' | 'invoice' | ''>('')
  const [relatedToId, setRelatedToId] = React.useState('')
  
  // Get URL params for pre-filling related entity
  const [searchParams] = React.useState(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      relatedTo: params.get('relatedTo') as 'account' | 'contact' | 'deal' | 'quote' | 'invoice' | null,
      relatedId: params.get('relatedId') || null,
    }
  })

  React.useEffect(() => {
    if (searchParams.relatedTo && searchParams.relatedId) {
      setRelatedToType(searchParams.relatedTo)
      setRelatedToId(searchParams.relatedId)
    }
  }, [])

  // Fetch documents
  const { data, isLoading } = useQuery({
    queryKey: ['documents', q, category, tag, page, pageSize, sort, dir, relatedToType, relatedToId],
    queryFn: async () => {
      const params: any = { page, limit: pageSize, sort, dir }
      if (q) params.q = q
      if (category) params.category = category
      if (tag) params.tag = tag
      if (relatedToType && relatedToId) {
        params.relatedTo = relatedToType
        params.relatedId = relatedToId
      }
      const res = await http.get('/api/crm/documents', { params })
      return res.data as { data: { items: Document[]; page: number; pageSize: number; total: number } }
    },
  })

  // Fetch accounts for linking
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; accountNumber?: number }> } }
    },
    enabled: relatedToType === 'account' || showUpload,
  })

  // Fetch deals for linking
  const { data: dealsData } = useQuery({
    queryKey: ['deals-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', { params: { limit: 1000, sort: 'title', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; dealNumber?: number }> } }
    },
    enabled: relatedToType === 'deal' || showUpload,
  })

  // Fetch contacts for linking
  const { data: contactsData } = useQuery({
    queryKey: ['contacts-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/contacts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; email?: string }> } }
    },
    enabled: relatedToType === 'contact' || showUpload,
  })

  // Fetch quotes for linking
  const { data: quotesData } = useQuery({
    queryKey: ['quotes-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/quotes', { params: { limit: 1000, sort: 'title', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; quoteNumber?: number }> } }
    },
    enabled: relatedToType === 'quote' || showUpload,
  })

  // Fetch invoices for linking
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/invoices', { params: { limit: 1000, sort: 'title', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; invoiceNumber?: number }> } }
    },
    enabled: relatedToType === 'invoice' || showUpload,
  })

  // Fetch users for permission management
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await http.get('/api/auth/admin/users')
      return res.data as { data: { items: User[] } }
    },
    enabled: showPermissions,
  })

  // Fetch document details
  const { data: docDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['document', selectedDoc?._id],
    queryFn: async () => {
      if (!selectedDoc?._id) return null
      const res = await http.get(`/api/crm/documents/${selectedDoc._id}`)
      return res.data as { data: DocumentDetail }
    },
    enabled: !!selectedDoc?._id,
  })

  const items = data?.data.items ?? []
  const total = data?.data.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  // Upload document mutation
  const upload = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await http.post('/api/crm/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data as { data: Document }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      setShowUpload(false)
      toast.showToast('Document uploaded successfully', 'success')
    },
    onError: (err: any) => {
      toast.showToast(`Upload failed: ${err?.response?.data?.error || 'Unknown error'}`, 'error')
    },
  })

  // Upload new version mutation
  const uploadVersion = useMutation({
    mutationFn: async ({ docId, formData }: { docId: string; formData: FormData }) => {
      const res = await http.post(`/api/crm/documents/${docId}/versions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data as { data: { version: DocumentVersion } }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      refetchDetail()
      setUploadingVersion(false)
      toast.showToast('New version uploaded successfully', 'success')
    },
    onError: (err: any) => {
      toast.showToast(`Version upload failed: ${err?.response?.data?.error || 'Unknown error'}`, 'error')
    },
  })

  // Delete document mutation
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/documents/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      setSelectedDoc(null)
      toast.showToast('Document deleted successfully', 'success')
    },
    onError: (err: any) => {
      toast.showToast(`Delete failed: ${err?.response?.data?.error || 'Unknown error'}`, 'error')
    },
  })

  // Add permission mutation
  const addPermission = useMutation({
    mutationFn: async ({ docId, userId, permission }: { docId: string; userId: string; permission: 'view' | 'edit' | 'delete' }) => {
      const res = await http.post(`/api/crm/documents/${docId}/permissions`, { userId, permission })
      return res.data
    },
    onSuccess: () => {
      refetchDetail()
      toast.showToast('Permission added successfully', 'success')
    },
  })

  // Remove permission mutation
  const removePermission = useMutation({
    mutationFn: async ({ docId, userId }: { docId: string; userId: string }) => {
      const res = await http.delete(`/api/crm/documents/${docId}/permissions/${userId}`)
      return res.data
    },
    onSuccess: () => {
      refetchDetail()
      toast.showToast('Permission removed successfully', 'success')
    },
  })

  // Download handler
  const handleDownload = async (doc: Document, versionId?: string) => {
    try {
      const url = versionId
        ? `/api/crm/documents/${doc._id}/download/${versionId}`
        : `/api/crm/documents/${doc._id}/download`
      const fullUrl = getApiUrl(url)
      window.open(fullUrl, '_blank')
    } catch (err: any) {
      toast.showToast(`Download failed: ${err?.message || 'Unknown error'}`, 'error')
    }
  }

  // View document details
  const handleView = async (doc: Document) => {
    setSelectedDoc(doc as any)
    setShowVersions(true)
  }

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const tagsStr = formData.get('tags') as string
    if (tagsStr) {
      const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
      formData.delete('tags')
      formData.append('tags', JSON.stringify(tags))
    }
    
    // Add related entity if selected
    const relatedType = (formData.get('relatedToType') as string) || relatedToType
    const relatedId = (formData.get('relatedToId') as string) || relatedToId
    if (relatedType && relatedId) {
      formData.append('relatedTo', JSON.stringify({ type: relatedType, id: relatedId }))
    }
    
    upload.mutate(formData)
  }

  const handleUploadVersion = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedDoc) return
    const formData = new FormData(e.currentTarget)
    uploadVersion.mutate({ docId: selectedDoc._id, formData })
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      <CRMNav />
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Documents & Files</h1>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 hover:bg-[color:var(--color-muted)]"
          >
            <Upload size={16} /> Upload Document
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-lg border bg-[color:var(--color-panel)]">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search size={16} className="text-[color:var(--color-text-muted)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search documents by name, description, submitter..."
              className="flex-1 rounded-lg border px-3 py-2 text-sm bg-transparent"
            />
          </div>
          {(relatedToType || relatedToId) && (
            <div className="flex items-center gap-2 px-3 py-1 rounded bg-blue-100 text-blue-800 text-sm">
              <span>Filtered by: {relatedToType} {relatedToId}</span>
              <button
                onClick={() => {
                  setRelatedToType('')
                  setRelatedToId('')
                }}
                className="ml-2 hover:underline"
              >
                Clear
              </button>
            </div>
          )}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
          >
            <option value="">All Categories</option>
            <option value="Contracts & Agreements">Contracts & Agreements</option>
            <option value="Proposals">Proposals</option>
            <option value="Quotes">Quotes</option>
            <option value="Invoices & Receipts">Invoices & Receipts</option>
            <option value="Product Documentation">Product Documentation</option>
            <option value="Marketing Materials">Marketing Materials</option>
            <option value="Support Documentation">Support Documentation</option>
            <option value="Legal Documents">Legal Documents</option>
            <option value="Financial Documents">Financial Documents</option>
            <option value="NDAs & Confidentiality">NDAs & Confidentiality</option>
            <option value="Reports & Analytics">Reports & Analytics</option>
            <option value="Templates">Templates</option>
            <option value="Certificates & Licenses">Certificates & Licenses</option>
            <option value="Compliance">Compliance</option>
            <option value="Training Materials">Training Materials</option>
            <option value="Policies & Procedures">Policies & Procedures</option>
            <option value="Forms">Forms</option>
            <option value="Account Documents">Account Documents</option>
            <option value="Contact Information">Contact Information</option>
            <option value="Deal Documents">Deal Documents</option>
            <option value="Knowledge Base">Knowledge Base</option>
            <option value="Other">Other</option>
          </select>
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag"
            className="rounded-lg border px-3 py-2 text-sm bg-transparent w-32"
          />
          <select
            value={`${sort}:${dir}`}
            onChange={(e) => {
              const [s, d] = e.target.value.split(':')
              setSort(s as any)
              setDir(d as any)
            }}
            className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
          >
            <option value="updatedAt:desc">Recently Updated</option>
            <option value="updatedAt:asc">Oldest Updated</option>
            <option value="createdAt:desc">Recently Created</option>
            <option value="createdAt:asc">Oldest Created</option>
            <option value="name:asc">Name A-Z</option>
            <option value="name:desc">Name Z-A</option>
          </select>
        </div>

        {/* Documents List */}
        {isLoading ? (
          <div className="text-center py-12 text-[color:var(--color-text-muted)]">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-[color:var(--color-text-muted)]">
            No documents found. Upload your first document to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((doc) => (
              <div
                key={doc._id}
                className="flex items-center justify-between p-4 rounded-lg border bg-[color:var(--color-panel)] hover:bg-[color:var(--color-muted)]"
              >
                <div className="flex items-center gap-4 flex-1">
                  <FileText size={20} className="text-[color:var(--color-text-muted)]" />
                  <div className="flex-1">
                    <div className="font-medium">{doc.name}</div>
                    <div className="text-sm text-[color:var(--color-text-muted)]">
                      {doc.description && `${doc.description} • `}
                      {doc.latestVersion && `${formatFileSize(doc.latestVersion.size)} • `}
                      v{doc.currentVersion} • {doc.versionCount} version{doc.versionCount !== 1 ? 's' : ''} • {doc.isPublic ? 'Public' : 'Private'}
                      {doc.category && ` • ${doc.category}`}
                      {doc.tags && doc.tags.length > 0 && ` • ${doc.tags.join(', ')}`}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-muted)] mt-1">
                      Submitter: {doc.ownerName || doc.ownerEmail} • Updated: {formatDateTime(doc.updatedAt)}
                      {doc.relatedTo && (
                        <span> • Linked to: {doc.relatedTo.type.charAt(0).toUpperCase() + doc.relatedTo.type.slice(1)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleView(doc)}
                    className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                    title="View details"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                    title="Download"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this document?')) {
                        remove.mutate(doc._id)
                      }
                    }}
                    className="p-2 rounded hover:bg-[color:var(--color-muted)] text-red-400"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-[color:var(--color-text-muted)]">
              Page {page + 1} of {totalPages} • {total} total documents
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded border disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded border disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUpload(false)}>
          <div className="bg-[color:var(--color-panel)] rounded-lg border p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Upload Document</h2>
              <button onClick={() => setShowUpload(false)} className="p-1 rounded hover:bg-[color:var(--color-muted)]">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">File *</label>
                <input type="file" name="file" required className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                  placeholder="Document name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  name="description"
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent h-24"
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select
                    name="category"
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="">Select a category...</option>
                    <option value="Contracts & Agreements">Contracts & Agreements</option>
                    <option value="Proposals">Proposals</option>
                    <option value="Quotes">Quotes</option>
                    <option value="Invoices & Receipts">Invoices & Receipts</option>
                    <option value="Product Documentation">Product Documentation</option>
                    <option value="Marketing Materials">Marketing Materials</option>
                    <option value="Support Documentation">Support Documentation</option>
                    <option value="Legal Documents">Legal Documents</option>
                    <option value="Financial Documents">Financial Documents</option>
                    <option value="NDAs & Confidentiality">NDAs & Confidentiality</option>
                    <option value="Reports & Analytics">Reports & Analytics</option>
                    <option value="Templates">Templates</option>
                    <option value="Certificates & Licenses">Certificates & Licenses</option>
                    <option value="Compliance">Compliance</option>
                    <option value="Training Materials">Training Materials</option>
                    <option value="Policies & Procedures">Policies & Procedures</option>
                    <option value="Forms">Forms</option>
                    <option value="Account Documents">Account Documents</option>
                    <option value="Contact Information">Contact Information</option>
                    <option value="Deal Documents">Deal Documents</option>
                    <option value="Knowledge Base">Knowledge Base</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    name="tags"
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
                    placeholder="tag1, tag2, tag3"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Link to Entity (Optional)</label>
                  <select
                    name="relatedToType"
                    value={relatedToType}
                    onChange={(e) => {
                      setRelatedToType(e.target.value as any)
                      setRelatedToId('')
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                  >
                    <option value="">None</option>
                    <option value="account">Account</option>
                    <option value="contact">Contact</option>
                    <option value="deal">Deal</option>
                    <option value="quote">Quote</option>
                    <option value="invoice">Invoice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Select Entity</label>
                  {relatedToType === 'account' && (
                    <select
                      name="relatedToId"
                      value={relatedToId}
                      onChange={(e) => setRelatedToId(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    >
                      <option value="">Select account...</option>
                      {accountsData?.data.items.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.accountNumber ? `#${acc.accountNumber} - ` : ''}{acc.name || 'Unnamed'}
                        </option>
                      ))}
                    </select>
                  )}
                  {relatedToType === 'contact' && (
                    <select
                      name="relatedToId"
                      value={relatedToId}
                      onChange={(e) => setRelatedToId(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    >
                      <option value="">Select contact...</option>
                      {contactsData?.data.items.map((contact) => (
                        <option key={contact._id} value={contact._id}>
                          {contact.name || contact.email || 'Unnamed'}
                        </option>
                      ))}
                    </select>
                  )}
                  {relatedToType === 'deal' && (
                    <select
                      name="relatedToId"
                      value={relatedToId}
                      onChange={(e) => setRelatedToId(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    >
                      <option value="">Select deal...</option>
                      {dealsData?.data.items.map((deal) => (
                        <option key={deal._id} value={deal._id}>
                          {deal.dealNumber ? `#${deal.dealNumber} - ` : ''}{deal.title || 'Unnamed'}
                        </option>
                      ))}
                    </select>
                  )}
                  {relatedToType === 'quote' && (
                    <select
                      name="relatedToId"
                      value={relatedToId}
                      onChange={(e) => setRelatedToId(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    >
                      <option value="">Select quote...</option>
                      {quotesData?.data.items.map((quote) => (
                        <option key={quote._id} value={quote._id}>
                          {quote.quoteNumber ? `#${quote.quoteNumber} - ` : ''}{quote.title || 'Unnamed'}
                        </option>
                      ))}
                    </select>
                  )}
                  {relatedToType === 'invoice' && (
                    <select
                      name="relatedToId"
                      value={relatedToId}
                      onChange={(e) => setRelatedToId(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                    >
                      <option value="">Select invoice...</option>
                      {invoicesData?.data.items.map((invoice) => (
                        <option key={invoice._id} value={invoice._id}>
                          {invoice.invoiceNumber ? `#${invoice.invoiceNumber} - ` : ''}{invoice.title || 'Unnamed'}
                        </option>
                      ))}
                    </select>
                  )}
                  {!relatedToType && (
                    <input
                      type="text"
                      disabled
                      className="w-full rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-muted)] opacity-50"
                      placeholder="Select entity type first"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isPublic" id="isPublic" className="rounded" />
                <label htmlFor="isPublic" className="text-sm">Make this document public (all users can view)</label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="px-4 py-2 rounded-lg border hover:bg-[color:var(--color-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={upload.isPending}
                  className="px-4 py-2 rounded-lg border bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {upload.isPending ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Details Modal */}
      {selectedDoc && showVersions && docDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowVersions(false); setSelectedDoc(null) }}>
          <div className="bg-[color:var(--color-panel)] rounded-lg border p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{docDetail.data.name}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowPermissions(!showPermissions)
                    setShowVersions(false)
                  }}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                  title="Permissions"
                >
                  <Users size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowVersions(false)
                    setSelectedDoc(null)
                  }}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {showVersions && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-[color:var(--color-text-muted)] mb-2">
                    {docDetail.data.description && <div className="mb-1">{docDetail.data.description}</div>}
                    <div>
                      Owner: {docDetail.data.ownerName || docDetail.data.ownerEmail} • 
                      {docDetail.data.isPublic ? ' Public' : ' Private'} • 
                      Created: {formatDateTime(docDetail.data.createdAt)} • 
                      Updated: {formatDateTime(docDetail.data.updatedAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Versions ({docDetail.data.versions.length})</h3>
                  <button
                    onClick={() => setUploadingVersion(true)}
                    className="flex items-center gap-2 px-3 py-1 rounded border text-sm hover:bg-[color:var(--color-muted)]"
                  >
                    <Plus size={14} /> Upload New Version
                  </button>
                </div>

                <div className="space-y-2">
                  {docDetail.data.versions
                    .slice()
                    .reverse()
                    .map((version) => (
                      <div
                        key={version._id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-[color:var(--color-panel)]"
                      >
                        <div>
                          <div className="font-medium">
                            Version {version.version} {version.version === docDetail.data.currentVersion && '(Current)'}
                          </div>
                          <div className="text-sm text-[color:var(--color-text-muted)]">
                            {version.originalFilename} • {formatFileSize(version.size)} • 
                            Uploaded by {version.uploadedByName || version.uploadedByEmail} on {formatDateTime(version.uploadedAt)}
                            {version.description && ` • ${version.description}`}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload(selectedDoc, version._id)}
                          className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                          title="Download this version"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    ))}
                </div>

                {uploadingVersion && (
                  <div className="mt-4 p-4 rounded-lg border bg-[color:var(--color-muted)]">
                    <h4 className="font-medium mb-2">Upload New Version</h4>
                    <form onSubmit={handleUploadVersion} className="space-y-3">
                      <input type="file" name="file" required className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent" />
                      <textarea
                        name="description"
                        className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent h-20"
                        placeholder="Version description (optional)"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setUploadingVersion(false)}
                          className="px-3 py-1 rounded border text-sm hover:bg-[color:var(--color-panel)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={uploadVersion.isPending}
                          className="px-3 py-1 rounded border bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                        >
                          {uploadVersion.isPending ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}

            {showPermissions && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">Permissions</h3>
                  <div className="text-sm text-[color:var(--color-text-muted)] mb-4">
                    Owner: {docDetail.data.ownerName || docDetail.data.ownerEmail} (Full access)
                  </div>
                </div>

                <div className="space-y-2">
                  {docDetail.data.permissions.map((perm) => (
                    <div
                      key={perm.userId}
                      className="flex items-center justify-between p-3 rounded-lg border bg-[color:var(--color-panel)]"
                    >
                      <div>
                        <div className="font-medium">{perm.userName || perm.userEmail}</div>
                        <div className="text-sm text-[color:var(--color-text-muted)]">
                          {perm.permission} permission • Granted {formatDateTime(perm.grantedAt)}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (confirm('Remove this permission?')) {
                            removePermission.mutate({ docId: selectedDoc._id, userId: perm.userId })
                          }
                        }}
                        className="p-2 rounded hover:bg-[color:var(--color-muted)] text-red-400"
                        title="Remove permission"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {usersData && (
                  <div className="mt-4 p-4 rounded-lg border bg-[color:var(--color-muted)]">
                    <h4 className="font-medium mb-2">Add Permission</h4>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const formData = new FormData(e.currentTarget)
                        const userId = formData.get('userId') as string
                        const permission = formData.get('permission') as 'view' | 'edit' | 'delete'
                        if (userId && permission) {
                          addPermission.mutate({ docId: selectedDoc._id, userId, permission })
                          e.currentTarget.reset()
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <select
                        name="userId"
                        required
                        className="flex-1 rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                      >
                        <option value="">Select user...</option>
                        {usersData.data.items
                          .filter((u) => u._id !== docDetail.data.ownerId && !docDetail.data.permissions.some((p) => p.userId === u._id))
                          .map((u) => (
                            <option key={u._id} value={u._id}>
                              {u.name || u.email}
                            </option>
                          ))}
                      </select>
                      <select
                        name="permission"
                        required
                        className="rounded-lg border px-3 py-2 text-sm bg-[color:var(--color-panel)]"
                      >
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                        <option value="delete">Delete</option>
                      </select>
                      <button
                        type="submit"
                        className="px-3 py-2 rounded border bg-blue-600 text-white text-sm hover:bg-blue-700"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

