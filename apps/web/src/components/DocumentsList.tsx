import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http, getApiUrl } from '@/lib/http'
import { formatDate, formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { FileText, Upload, Download, Trash2, Eye, X, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

type Document = {
  _id: string
  name: string
  description?: string
  category?: string
  tags?: string[]
  currentVersion: number
  versionCount: number
  latestVersion?: {
    _id: string
    originalFilename: string
    size: number
    uploadedAt: string
  }
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

type DocumentsListProps = {
  relatedToType: 'account' | 'contact' | 'deal' | 'quote' | 'invoice'
  relatedToId: string
  relatedToName?: string
  compact?: boolean
}

export function DocumentsList({ relatedToType, relatedToId, relatedToName, compact = false }: DocumentsListProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [showUpload, setShowUpload] = React.useState(false)

  // Fetch documents for this entity
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['documents', relatedToType, relatedToId],
    queryFn: async () => {
      const res = await http.get('/api/crm/documents', {
        params: { relatedTo: relatedToType, relatedId: relatedToId, limit: 100 },
      })
      return res.data as { data: { items: Document[] } }
    },
  })

  const documents = data?.data.items ?? []

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

  // Delete document mutation
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/documents/${id}`)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      toast.showToast('Document deleted successfully', 'success')
    },
  })

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const tagsStr = formData.get('tags') as string
    if (tagsStr) {
      const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)
      formData.delete('tags')
      formData.append('tags', JSON.stringify(tags))
    }
    
    // Always link to the related entity
    formData.append('relatedTo', JSON.stringify({ type: relatedToType, id: relatedToId }))
    
    upload.mutate(formData)
  }

  const handleDownload = async (doc: Document) => {
    try {
      const url = `/api/crm/documents/${doc._id}/download`
      const fullUrl = getApiUrl(url)
      window.open(fullUrl, '_blank')
    } catch (err: any) {
      toast.showToast(`Download failed: ${err?.message || 'Unknown error'}`, 'error')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Documents ({documents.length})</h3>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded border hover:bg-[color:var(--color-muted)]"
          >
            <Plus size={12} /> Upload
          </button>
        </div>
        {isLoading ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">Loading...</div>
        ) : documents.length === 0 ? (
          <div className="text-xs text-[color:var(--color-text-muted)]">No documents</div>
        ) : (
          <div className="space-y-1">
            {documents.slice(0, 5).map((doc) => (
              <div key={doc._id} className="flex items-center justify-between p-2 rounded border bg-[color:var(--color-panel)] text-xs">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText size={14} className="text-[color:var(--color-text-muted)] flex-shrink-0" />
                  <span className="truncate">{doc.name}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                    title="Download"
                  >
                    <Download size={12} />
                  </button>
                  <button
                    onClick={() => navigate(`/apps/crm/documents?relatedTo=${relatedToType}&relatedId=${relatedToId}`)}
                    className="p-1 rounded hover:bg-[color:var(--color-muted)]"
                    title="View all"
                  >
                    <Eye size={12} />
                  </button>
                </div>
              </div>
            ))}
            {documents.length > 5 && (
              <button
                onClick={() => navigate(`/apps/crm/documents?relatedTo=${relatedToType}&relatedId=${relatedToId}`)}
                className="text-xs text-blue-600 hover:underline w-full text-left"
              >
                View all {documents.length} documents →
              </button>
            )}
          </div>
        )}

        {/* Compact Upload Modal */}
        {showUpload && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUpload(false)}>
            <div className="bg-[color:var(--color-panel)] rounded-lg border p-4 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Upload Document{relatedToName && ` for ${relatedToName}`}</h3>
                <button onClick={() => setShowUpload(false)} className="p-1 rounded hover:bg-[color:var(--color-muted)]">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleUpload} className="space-y-3">
                <input type="file" name="file" required className="w-full rounded-lg border px-2 py-1 text-sm bg-transparent" />
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Document name"
                  className="w-full rounded-lg border px-2 py-1 text-sm bg-transparent"
                />
                <textarea
                  name="description"
                  placeholder="Description (optional)"
                  className="w-full rounded-lg border px-2 py-1 text-sm bg-transparent h-16"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUpload(false)}
                    className="px-3 py-1 text-xs rounded border hover:bg-[color:var(--color-muted)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={upload.isPending}
                    className="px-3 py-1 text-xs rounded border bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {upload.isPending ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Documents ({documents.length})</h3>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-3 py-1 text-sm rounded border hover:bg-[color:var(--color-muted)]"
        >
          <Upload size={14} /> Upload Document
        </button>
      </div>
      {isLoading ? (
        <div className="text-sm text-[color:var(--color-text-muted)]">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-sm text-[color:var(--color-text-muted)]">No documents linked to this {relatedToType}.</div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc._id}
              className="flex items-center justify-between p-3 rounded-lg border bg-[color:var(--color-panel)]"
            >
              <div className="flex items-center gap-3 flex-1">
                <FileText size={18} className="text-[color:var(--color-text-muted)]" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{doc.name}</div>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {doc.description && `${doc.description} • `}
                    {doc.latestVersion && `${formatFileSize(doc.latestVersion.size)} • `}
                    v{doc.currentVersion} • {formatDate(doc.updatedAt)} • {doc.ownerName || doc.ownerEmail}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                  title="Download"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => navigate(`/apps/crm/documents?relatedTo=${relatedToType}&relatedId=${relatedToId}`)}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                  title="View details"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this document?')) {
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

      {/* Full Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowUpload(false)}>
          <div className="bg-[color:var(--color-panel)] rounded-lg border p-6 max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Upload Document{relatedToName && ` for ${relatedToName}`}</h2>
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
    </div>
  )
}

