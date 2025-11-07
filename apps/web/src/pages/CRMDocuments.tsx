import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { formatDateTime } from '@/lib/dateFormat'
import { useToast } from '@/components/Toast'
import { FileText, Upload, Download, Trash2, Eye, Users, Plus, X, Search, History, Lock, Unlock, HelpCircle, BookOpen } from 'lucide-react'

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
  checkedOutBy?: string
  checkedOutByName?: string
  checkedOutByEmail?: string
  checkedOutAt?: string
  createdAt: string
  updatedAt: string
  userPermission?: {
    userId: string
    permission: 'view' | 'edit' | 'delete'
  }
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
  const [showHistory, setShowHistory] = React.useState(false)
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

  // Fetch accounts for linking and display
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; accountNumber?: number }> } }
    },
  })

  // Fetch deals for linking and display
  const { data: dealsData } = useQuery({
    queryKey: ['deals-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/deals', { params: { limit: 1000, sort: 'title', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; dealNumber?: number }> } }
    },
  })

  // Fetch contacts for linking and display
  const { data: contactsData } = useQuery({
    queryKey: ['contacts-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/contacts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; email?: string }> } }
    },
  })

  // Fetch quotes for linking and display
  const { data: quotesData } = useQuery({
    queryKey: ['quotes-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/quotes', { params: { limit: 1000, sort: 'title', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; quoteNumber?: number }> } }
    },
  })

  // Fetch invoices for linking and display
  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-pick-docs'],
    queryFn: async () => {
      const res = await http.get('/api/crm/invoices', { params: { limit: 1000, sort: 'title', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; title?: string; invoiceNumber?: number }> } }
    },
  })

  // Create lookup maps for entity names
  const accountMap = React.useMemo(() => {
    const map = new Map<string, string>()
    accountsData?.data.items.forEach(acc => {
      map.set(acc._id, acc.name || `Account #${acc.accountNumber || acc._id}`)
    })
    return map
  }, [accountsData])

  const dealMap = React.useMemo(() => {
    const map = new Map<string, string>()
    dealsData?.data.items.forEach(deal => {
      map.set(deal._id, deal.title || `Deal #${deal.dealNumber || deal._id}`)
    })
    return map
  }, [dealsData])

  const contactMap = React.useMemo(() => {
    const map = new Map<string, string>()
    contactsData?.data.items.forEach(contact => {
      map.set(contact._id, contact.name || contact.email || 'Unnamed Contact')
    })
    return map
  }, [contactsData])

  const quoteMap = React.useMemo(() => {
    const map = new Map<string, string>()
    quotesData?.data.items.forEach(quote => {
      map.set(quote._id, quote.title || `Quote #${quote.quoteNumber || quote._id}`)
    })
    return map
  }, [quotesData])

  const invoiceMap = React.useMemo(() => {
    const map = new Map<string, string>()
    invoicesData?.data.items.forEach(invoice => {
      map.set(invoice._id, invoice.title || `Invoice #${invoice.invoiceNumber || invoice._id}`)
    })
    return map
  }, [invoicesData])

  // Helper function to get related entity name
  const getRelatedEntityName = (doc: Document) => {
    if (!doc.relatedTo) return null
    const { type, id } = doc.relatedTo
    switch (type) {
      case 'account':
        return accountMap.get(id) || `Account ${id}`
      case 'contact':
        return contactMap.get(id) || `Contact ${id}`
      case 'deal':
        return dealMap.get(id) || `Deal ${id}`
      case 'quote':
        return quoteMap.get(id) || `Quote ${id}`
      case 'invoice':
        return invoiceMap.get(id) || `Invoice ${id}`
      default:
        return `${type} ${id}`
    }
  }

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
    // Force refetch when selectedDoc changes
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    // Don't use stale data - always fetch fresh when document ID changes
    staleTime: 0,
    // Don't cache - always fetch fresh
    gcTime: 0,
  })

  // Force refetch when selectedDoc._id changes
  React.useEffect(() => {
    if (selectedDoc?._id) {
      refetchDetail()
    }
  }, [selectedDoc?._id, refetchDetail])

  // Fetch document history
  const historyQ = useQuery({
    queryKey: ['document-history', selectedDoc?._id, showHistory],
    queryFn: async () => {
      if (!selectedDoc?._id) return null
      const res = await http.get(`/api/crm/documents/${selectedDoc._id}/history`)
      return res.data as { data: { history: Array<{ _id: string; eventType: string; description: string; userName?: string; userEmail?: string; createdAt: string; oldValue?: any; newValue?: any; metadata?: any }>; createdAt: string; document: { _id: string; name: string; createdAt: string } } }
    },
    enabled: !!selectedDoc?._id && showHistory,
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
      qc.invalidateQueries({ queryKey: ['document-history'] })
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
      qc.invalidateQueries({ queryKey: ['document-history'] })
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
      qc.invalidateQueries({ queryKey: ['document-history'] })
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
      qc.invalidateQueries({ queryKey: ['document-history'] })
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
      qc.invalidateQueries({ queryKey: ['document-history'] })
      toast.showToast('Permission removed successfully', 'success')
    },
  })

  // Check if user is admin and get user ID - this endpoint returns userId and email
  const { data: rolesData, isLoading: isLoadingRoles } = useQuery<{ roles: Array<{ name: string; permissions: string[] }>; isAdmin?: boolean; userId?: string; email?: string }>({
    queryKey: ['user', 'roles'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me/roles')
      console.log('Roles data loaded:', res.data)
      return res.data
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const isAdmin = rolesData?.roles?.some(r => r.permissions.includes('*')) || rolesData?.isAdmin || false

  // Get current user ID - use the same query key as Topbar to share cache
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<{ _id: string; email: string }>({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const res = await http.get('/api/auth/me')
      console.log('Current user loaded:', res.data)
      return res.data
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })

  // Use rolesData as primary source since it's more reliable and includes userId/email
  // Fallback to currentUser if rolesData isn't available yet
  const currentUserId = rolesData?.userId || currentUser?._id
  const currentUserEmail = rolesData?.email || currentUser?.email
  
  // Debug: Log user info to see what we have
  React.useEffect(() => {
    console.log('User info for checkout/checkin:', {
      currentUserId,
      currentUserEmail,
      rolesDataUserId: rolesData?.userId,
      rolesDataEmail: rolesData?.email,
      currentUser_Id: currentUser?._id,
      currentUserEmailFromUser: currentUser?.email,
      isLoadingRoles,
      isLoadingUser
    })
  }, [currentUserId, currentUserEmail, rolesData, currentUser, isLoadingRoles, isLoadingUser])


  // Checkout mutation
  const checkout = useMutation({
    mutationFn: async (docId: string) => {
      const res = await http.post(`/api/crm/documents/${docId}/checkout`)
      return res.data
    },
    onSuccess: (_, docId) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['document', docId] })
      qc.invalidateQueries({ queryKey: ['document'] })
      qc.invalidateQueries({ queryKey: ['document-history'] })
      // If this is the currently selected document, refetch its details
      if (selectedDoc?._id === docId) {
        refetchDetail()
      }
      toast.showToast('Document checked out successfully', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to check out document'
      const details = err?.response?.data?.details
      if (errorMsg === 'already_checked_out') {
        const checkedOutBy = details?.checkedOutBy || 'another user'
        toast.showToast(`Document is already checked out by ${checkedOutBy}. Please wait for them to check it in.`, 'error')
      } else if (errorMsg === 'access_denied' || err?.response?.status === 403) {
        toast.showToast('You do not have permission to check out this document. You need edit permission.', 'error')
      } else {
        toast.showToast(`Failed to check out: ${errorMsg}`, 'error')
      }
    },
  })

  // Check-in mutation
  const checkin = useMutation({
    mutationFn: async (docId: string) => {
      const res = await http.post(`/api/crm/documents/${docId}/checkin`)
      return res.data
    },
    onSuccess: (_, docId) => {
      qc.invalidateQueries({ queryKey: ['documents'] })
      qc.invalidateQueries({ queryKey: ['document', docId] })
      qc.invalidateQueries({ queryKey: ['document'] })
      qc.invalidateQueries({ queryKey: ['document-history'] })
      // If this is the currently selected document, refetch its details
      if (selectedDoc?._id === docId) {
        refetchDetail()
      }
      toast.showToast('Document checked in successfully', 'success')
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.error || 'Failed to check in document'
      toast.showToast(errorMsg, 'error')
    },
  })

  // Deletion request mutation
  const requestDeletion = useMutation({
    mutationFn: async (docId: string) => {
      const res = await http.post(`/api/crm/documents/${docId}/request-deletion`)
      return res.data as { data: { ok: boolean; ticketNumber: number } }
    },
    onSuccess: (data) => {
      toast.showToast(`Deletion request submitted. Ticket #${data.data.ticketNumber} created.`, 'success')
    },
    onError: (err: any) => {
      toast.showToast(`Failed to submit deletion request: ${err?.response?.data?.error || 'Unknown error'}`, 'error')
    },
  })

  // Download handler
  const handleDownload = async (doc: Document, versionId?: string) => {
    try {
      const url = versionId
        ? `/api/crm/documents/${doc._id}/download/${versionId}`
        : `/api/crm/documents/${doc._id}/download`
      
      // Use http client to include auth headers
      const response = await http.get(url, {
        responseType: 'blob',
      })
      
      // Check if response is actually an error (Axios returns error responses as blobs too)
      if (response.data instanceof Blob && response.data.type === 'application/json') {
        const text = await response.data.text()
        try {
          const errorData = JSON.parse(text)
          if (errorData.error) {
            toast.showToast(`Download failed: ${errorData.error}`, 'error')
            return
          }
        } catch {
          // Not JSON, continue with download
        }
      }
      
      // Get filename from content-disposition header or use document name
      const contentDisposition = response.headers['content-disposition'] || response.headers['Content-Disposition']
      let filename = doc.name
      if (contentDisposition) {
        // Match filename="..." or filename=...
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i)
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '')
        }
      }
      
      // response.data is already a Blob when using responseType: 'blob'
      const blob = response.data
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(blobUrl)
    } catch (err: any) {
      // Handle error responses that might be blobs
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text()
          const errorData = JSON.parse(text)
          toast.showToast(`Download failed: ${errorData.error || 'Unknown error'}`, 'error')
        } catch {
          toast.showToast(`Download failed: ${err?.response?.status === 401 ? 'Unauthorized' : 'Unknown error'}`, 'error')
        }
      } else {
        toast.showToast(`Download failed: ${err?.response?.data?.error || err?.message || 'Unknown error'}`, 'error')
      }
    }
  }

  // View document details
  const handleView = async (doc: Document) => {
    // First, invalidate any existing document queries to clear stale data
    qc.invalidateQueries({ queryKey: ['document'] })
    // Set the selected doc - this will trigger the query to fetch fresh data
    setSelectedDoc(doc as any)
    setShowVersions(true)
    // Force refetch after a brief delay to ensure state is updated
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['document', doc._id] })
    }, 100)
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

        {/* Document Deletion Notice */}
        <div className="mb-6 p-4 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <BookOpen size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-blue-900 dark:text-blue-100 mb-1">Document Deletion Process</div>
              <div className="text-sm text-blue-800 dark:text-blue-200">
                Documents can only be deleted by administrators. To request document deletion, click the "Request Deletion" button on any document. 
                A helpdesk ticket will be automatically created for review. 
                <a 
                  href="/apps/crm/support/kb" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-1 underline hover:no-underline font-medium"
                >
                  Learn more about the deletion process
                </a>
              </div>
            </div>
          </div>
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
                      {doc.checkedOutBy && (
                        <span className="ml-2 px-2 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-medium">
                          🔒 Checked out by {doc.checkedOutByName || doc.checkedOutByEmail}
                          {doc.checkedOutAt && ` (${formatDateTime(doc.checkedOutAt)})`}
                        </span>
                      )}
                      {doc.relatedTo && (() => {
                        const entityName = getRelatedEntityName(doc)
                        return entityName ? (
                          <span> • Linked to: {doc.relatedTo.type.charAt(0).toUpperCase() + doc.relatedTo.type.slice(1)} - {entityName}</span>
                        ) : (
                          <span> • Linked to: {doc.relatedTo.type.charAt(0).toUpperCase() + doc.relatedTo.type.slice(1)}</span>
                        )
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => checkout.mutate(doc._id)}
                  disabled={!!(doc.checkedOutBy && currentUserId && currentUserEmail && 
                    String(doc.checkedOutBy) !== String(currentUserId) && 
                    doc.checkedOutByEmail?.toLowerCase() !== currentUserEmail.toLowerCase() && 
                    !isAdmin)}
                    className="p-2 rounded hover:bg-[color:var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                    title={doc.checkedOutBy && currentUserId && String(doc.checkedOutBy) !== String(currentUserId) && !isAdmin 
                      ? `Cannot check out - checked out by ${doc.checkedOutByName || doc.checkedOutByEmail}` 
                      : "Check out this document"}
                  >
                    <Lock size={16} />
                  </button>
                  {(() => {
                    // Normalize both IDs to strings for comparison
                    const checkedOutById = doc.checkedOutBy ? String(doc.checkedOutBy) : null
                    const myUserId = currentUserId ? String(currentUserId) : null
                    const myUserEmail = currentUserEmail
                    
                    // Check if checked out by current user - compare by ID or email as fallback
                    // Allow check-in if either ID matches OR email matches
                    const isCheckedOutByMe = checkedOutById && (
                      (myUserId && checkedOutById === myUserId) || 
                      (doc.checkedOutByEmail && myUserEmail && doc.checkedOutByEmail.toLowerCase() === myUserEmail.toLowerCase())
                    )
                    const isCheckedOutByOther = checkedOutById && !isCheckedOutByMe
                    
                    if (isCheckedOutByMe) {
                      return (
                        <button
                          onClick={() => {
                            if (confirm('Check in this document?')) {
                              checkin.mutate(doc._id)
                            }
                          }}
                          className="p-2 rounded hover:bg-[color:var(--color-muted)] text-green-600"
                          title="Check in (you have this checked out)"
                        >
                          <Unlock size={16} />
                        </button>
                      )
                    } else if (isCheckedOutByOther && isAdmin) {
                      return (
                        <button
                          onClick={() => {
                            if (confirm(`Force check-in? This document is checked out by ${doc.checkedOutByName || doc.checkedOutByEmail}.`)) {
                              checkin.mutate(doc._id)
                            }
                          }}
                          className="p-2 rounded hover:bg-[color:var(--color-muted)] text-orange-600"
                          title={`Force check-in (checked out by ${doc.checkedOutByName || doc.checkedOutByEmail})`}
                        >
                          <Unlock size={16} />
                        </button>
                      )
                    } else if (isCheckedOutByOther) {
                      return (
                        <button
                          disabled
                          className="p-2 rounded opacity-50 cursor-not-allowed text-[color:var(--color-text-muted)]"
                          title={`Cannot check in - checked out by ${doc.checkedOutByName || doc.checkedOutByEmail}. You must wait for them to check it in.`}
                        >
                          <Unlock size={16} />
                        </button>
                      )
                    } else {
                      return (
                        <button
                          disabled
                          className="p-2 rounded opacity-50 cursor-not-allowed text-[color:var(--color-text-muted)]"
                          title="Document is not checked out"
                        >
                          <Unlock size={16} />
                        </button>
                      )
                    }
                  })()}
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
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
                          remove.mutate(doc._id)
                        }
                      }}
                      className="p-2 rounded hover:bg-[color:var(--color-muted)] text-red-400"
                      title="Delete (Admin only)"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm('Request deletion of this document? A helpdesk ticket will be created for review.')) {
                          requestDeletion.mutate(doc._id)
                        }
                      }}
                      className="p-2 rounded hover:bg-[color:var(--color-muted)] text-orange-400"
                      title="Request Deletion"
                    >
                      <HelpCircle size={16} />
                    </button>
                  )}
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
          <div className="bg-[color:var(--color-panel)] rounded-lg border p-6 w-[min(90vw,40rem)] max-h-[90vh] overflow-y-auto mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-[color:var(--color-panel)] pb-2 border-b mb-4 -mx-6 px-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Upload Document</h2>
                <button onClick={() => setShowUpload(false)} className="p-1 rounded hover:bg-[color:var(--color-muted)]">
                  <X size={20} />
                </button>
              </div>
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
      {selectedDoc && (showVersions || showHistory || showPermissions) && docDetail && docDetail.data && docDetail.data._id === selectedDoc._id && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowVersions(false); setShowHistory(false); setShowPermissions(false); setSelectedDoc(null) }}>
          <div className="bg-[color:var(--color-panel)] rounded-lg border p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-bold">{docDetail.data.name}</h2>
                {docDetail.data.checkedOutBy && (
                  <div className="text-sm text-yellow-600 mt-1">
                    🔒 Checked out by {docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail}
                    {docDetail.data.checkedOutAt && ` (${formatDateTime(docDetail.data.checkedOutAt)})`}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => checkout.mutate(docDetail.data._id)}
                  disabled={!!(docDetail.data.checkedOutBy && currentUserId && currentUserEmail && 
                    String(docDetail.data.checkedOutBy) !== String(currentUserId) && 
                    docDetail.data.checkedOutByEmail?.toLowerCase() !== currentUserEmail.toLowerCase() && 
                    !isAdmin)}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                  title={docDetail.data.checkedOutBy && currentUserId && String(docDetail.data.checkedOutBy) !== String(currentUserId) && !isAdmin 
                    ? `Cannot check out - checked out by ${docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail}` 
                    : "Check out this document"}
                >
                  <Lock size={16} />
                </button>
                {(() => {
                  // CRITICAL: Ensure we're comparing against the correct document
                  // Only proceed if docDetail matches the currently selected document
                  if (!docDetail?.data || docDetail.data._id !== selectedDoc._id) {
                    return null
                  }
                  
                  // Normalize both IDs to strings for comparison
                  const checkedOutById = docDetail.data.checkedOutBy ? String(docDetail.data.checkedOutBy) : null
                  const myUserId = currentUserId ? String(currentUserId) : null
                  const myUserEmail = currentUserEmail
                  
                  // Check if checked out by current user - compare by ID or email as fallback
                  // Allow check-in if either ID matches OR email matches
                  const isCheckedOutByMe = checkedOutById && (
                    (myUserId && checkedOutById === myUserId) || 
                    (docDetail.data.checkedOutByEmail && myUserEmail && docDetail.data.checkedOutByEmail.toLowerCase() === myUserEmail.toLowerCase())
                  )
                  const isCheckedOutByOther = checkedOutById && !isCheckedOutByMe
                  
                  // Always show check-in button, but enable/disable based on state
                  return (
                    <button
                      onClick={() => {
                        if (isCheckedOutByMe) {
                          if (confirm('Check in this document?')) {
                            checkin.mutate(docDetail.data._id)
                          }
                        } else if (isCheckedOutByOther && isAdmin) {
                          if (confirm(`Force check-in? This document is checked out by ${docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail}.`)) {
                            checkin.mutate(docDetail.data._id)
                          }
                        }
                      }}
                      disabled={!isCheckedOutByMe && !(isCheckedOutByOther && isAdmin)}
                      className={`p-2 rounded ${
                        isCheckedOutByMe 
                          ? 'hover:bg-[color:var(--color-muted)] text-green-600' 
                          : isCheckedOutByOther && isAdmin
                          ? 'hover:bg-[color:var(--color-muted)] text-orange-600'
                          : 'opacity-50 cursor-not-allowed text-[color:var(--color-text-muted)]'
                      }`}
                      title={
                        isCheckedOutByMe 
                          ? 'Check in (you have this checked out)'
                          : isCheckedOutByOther && isAdmin
                          ? `Force check-in (checked out by ${docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail})`
                          : isCheckedOutByOther
                          ? `Cannot check in - checked out by ${docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail}. You must wait for them to check it in.`
                          : 'Document is not checked out'
                      }
                    >
                      <Unlock size={16} />
                    </button>
                  )
                })()}
                <button
                  onClick={() => {
                    setShowHistory(!showHistory)
                    setShowVersions(false)
                    setShowPermissions(false)
                  }}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                  title="History"
                >
                  <History size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowPermissions(!showPermissions)
                    setShowVersions(false)
                    setShowHistory(false)
                  }}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                  title="Permissions"
                >
                  <Users size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowVersions(false)
                    setShowHistory(false)
                    setShowPermissions(false)
                    setSelectedDoc(null)
                  }}
                  className="p-2 rounded hover:bg-[color:var(--color-muted)]"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {showHistory && historyQ.data && (
              <div className="space-y-4">
                <h3 className="font-medium">Document History</h3>
                {historyQ.data.data.history && historyQ.data.data.history.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {historyQ.data.data.history.map((entry) => {
                      const getEventIcon = (type: string) => {
                        switch (type) {
                          case 'created': return '✨'
                          case 'updated': return '📝'
                          case 'version_uploaded': return '📤'
                          case 'version_downloaded': return '📥'
                          case 'permission_added': return '➕'
                          case 'permission_updated': return '🔄'
                          case 'permission_removed': return '➖'
                          case 'deleted': return '🗑️'
                          case 'field_changed': return '📋'
                          case 'checked_out': return '🔒'
                          case 'checked_in': return '🔓'
                          default: return '📌'
                        }
                      }
                      const getEventColor = (type: string) => {
                        switch (type) {
                          case 'created': return 'text-blue-600'
                          case 'updated': return 'text-gray-600'
                          case 'version_uploaded': return 'text-green-600'
                          case 'version_downloaded': return 'text-blue-500'
                          case 'permission_added': return 'text-green-500'
                          case 'permission_updated': return 'text-yellow-600'
                          case 'permission_removed': return 'text-red-500'
                          case 'deleted': return 'text-red-600'
                          case 'field_changed': return 'text-gray-600'
                          case 'checked_out': return 'text-yellow-600'
                          case 'checked_in': return 'text-green-600'
                          default: return 'text-gray-600'
                        }
                      }
                      return (
                        <div
                          key={entry._id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-[color:var(--color-panel)]"
                        >
                          <span className="text-xl flex-shrink-0">{getEventIcon(entry.eventType)}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium ${getEventColor(entry.eventType)}`}>
                              {entry.description}
                            </div>
                            <div className="text-xs text-[color:var(--color-text-muted)] mt-1">
                              {entry.userName || entry.userEmail || 'System'} • {formatDateTime(entry.createdAt)}
                            </div>
                            {entry.oldValue && entry.newValue && (
                              <div className="text-xs text-[color:var(--color-text-muted)] mt-1">
                                Changed from "{String(entry.oldValue)}" to "{String(entry.newValue)}"
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-[color:var(--color-text-muted)]">No history available</div>
                )}
              </div>
            )}

            {showVersions && !showHistory && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-[color:var(--color-text-muted)] mb-2">
                    {docDetail.data.description && <div className="mb-1">{docDetail.data.description}</div>}
                    <div>
                      Owner: {docDetail.data.ownerName || docDetail.data.ownerEmail} • 
                      {docDetail.data.isPublic ? ' Public' : ' Private'} • 
                      Created: {formatDateTime(docDetail.data.createdAt)} • 
                      Updated: {formatDateTime(docDetail.data.updatedAt)}
                      {docDetail.data.relatedTo && (() => {
                        const entityName = getRelatedEntityName(docDetail.data as Document)
                        return entityName ? (
                          <span> • Linked to: {docDetail.data.relatedTo.type.charAt(0).toUpperCase() + docDetail.data.relatedTo.type.slice(1)} - {entityName}</span>
                        ) : (
                          <span> • Linked to: {docDetail.data.relatedTo.type.charAt(0).toUpperCase() + docDetail.data.relatedTo.type.slice(1)}</span>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Versions ({docDetail.data.versions.length})</h3>
                  <button
                    onClick={() => {
                      if (docDetail.data.checkedOutBy && docDetail.data.checkedOutBy !== currentUserId && !isAdmin) {
                        toast.showToast(`Document is checked out by ${docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail}. Please check it in first.`, 'error')
                        return
                      }
                      setUploadingVersion(true)
                    }}
                    className="flex items-center gap-2 px-3 py-1 rounded border text-sm hover:bg-[color:var(--color-muted)]"
                    disabled={!!(docDetail.data.checkedOutBy && docDetail.data.checkedOutBy !== currentUserId && !isAdmin)}
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
                    {(() => {
                      const checkedOutById = docDetail.data.checkedOutBy ? String(docDetail.data.checkedOutBy) : null
                      const myUserId = currentUserId ? String(currentUserId) : null
                      const myUserEmail = currentUserEmail
                      const isCheckedOutByMe = checkedOutById && (
                        (myUserId && checkedOutById === myUserId) || 
                        (docDetail.data.checkedOutByEmail && myUserEmail && docDetail.data.checkedOutByEmail.toLowerCase() === myUserEmail.toLowerCase())
                      )
                      if (docDetail.data.checkedOutBy && !isCheckedOutByMe && !isAdmin) {
                        return (
                          <div className="text-sm text-red-600 mb-2">
                            ⚠️ This document is checked out by {docDetail.data.checkedOutByName || docDetail.data.checkedOutByEmail}. 
                            You cannot upload a new version until it is checked in.
                          </div>
                        )
                      }
                      return (
                        <>
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
                        </>
                      )
                    })()}
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

