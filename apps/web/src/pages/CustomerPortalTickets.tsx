/**
 * Customer Portal Tickets
 * 
 * View support tickets and add comments
 * Now includes ability to create new tickets
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { ArrowLeft, Ticket, MessageSquare, Send, AlertCircle, Plus, X } from 'lucide-react'
import { formatDateTime } from '../lib/dateFormat'
import { useToast } from '../components/Toast'
import { CustomerPortalThemeToggle } from '../components/CustomerPortalThemeToggle'

type SupportTicket = {
  id: string
  ticketNumber: number
  shortDescription: string
  description: string
  status: string
  priority: string
  createdAt: string
  updatedAt: string
  slaDueAt?: string
  comments: Array<{ author: string; body: string; at: string }>
}

export default function CustomerPortalTickets() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const qc = useQueryClient()
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  // New ticket form
  const [newSubject, setNewSubject] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState('normal')
  const [newRequesterName, setNewRequesterName] = useState('')
  const [newRequesterEmail, setNewRequesterEmail] = useState('')
  const [newRequesterPhone, setNewRequesterPhone] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('customer_portal_token')
    if (!token) {
      navigate('/customer/login')
    }
  }, [navigate])

  function handleLogout() {
    localStorage.removeItem('customer_portal_token')
    localStorage.removeItem('customer_portal_user')
    navigate('/customer/login')
  }

  const ticketsQ = useQuery({
    queryKey: ['customer-portal-tickets'],
    queryFn: async () => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.get('/api/customer-portal/data/tickets', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data.items as SupportTicket[]
    },
  })

  const addCommentMutation = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.post(
        `/api/customer-portal/data/tickets/${ticketId}/comments`,
        { body },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-portal-tickets'] })
      setNewComment('')
      showToast('Comment added successfully', 'success')
    },
  })

  const createTicketMutation = useMutation({
    mutationFn: async (data: { shortDescription: string; description: string; priority: string; requesterName: string; requesterEmail: string; requesterPhone: string }) => {
      const token = localStorage.getItem('customer_portal_token')
      const res = await http.post(
        '/api/customer-portal/data/tickets',
        data,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.data.error) throw new Error(res.data.error)
      return res.data.data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['customer-portal-tickets'] })
      qc.invalidateQueries({ queryKey: ['customer-portal-dashboard'] })
      setShowCreateForm(false)
      setNewSubject('')
      setNewDescription('')
      setNewPriority('normal')
      setNewRequesterName('')
      setNewRequesterEmail('')
      setNewRequesterPhone('')
      showToast(`Ticket #${data.ticketNumber} created successfully`, 'success')
    },
  })

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTicket || !newComment.trim()) return
    addCommentMutation.mutate({ ticketId: selectedTicket, body: newComment })
  }

  function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubject.trim() || !newDescription.trim() || !newRequesterName.trim() || !newRequesterEmail.trim() || !newRequesterPhone.trim()) return
    createTicketMutation.mutate({
      shortDescription: newSubject,
      description: newDescription,
      priority: newPriority,
      requesterName: newRequesterName,
      requesterEmail: newRequesterEmail,
      requesterPhone: newRequesterPhone,
    })
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      open: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      resolved: 'bg-green-100 text-green-800',
      closed: 'bg-gray-100 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase().replace('_', ' ')}
      </span>
    )
  }

  function getPriorityBadge(priority: string) {
    const styles: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      normal: 'bg-blue-100 text-blue-800',
      low: 'bg-gray-100 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[priority] || 'bg-gray-100 text-gray-800'}`}>
        {priority.toUpperCase()}
      </span>
    )
  }

  const ticket = ticketsQ.data?.find(t => t.id === selectedTicket)

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-panel)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/customer/dashboard" className="flex items-center space-x-2 text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </Link>
              <div className="hidden sm:block h-6 w-px bg-[color:var(--color-border)]"></div>
              <h1 className="text-xl font-semibold text-[color:var(--color-text)] hidden sm:block">My Tickets</h1>
            </div>
            <div className="flex items-center space-x-3">
              <CustomerPortalThemeToggle />
              <button
                onClick={handleLogout}
                className="rounded-lg px-4 py-2 text-sm text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
              >
                Logout
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>New Ticket</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-900">
            💡 <strong>Tip:</strong> Need quick anonymous support? Visit our{' '}
            <a href="/portal" target="_blank" className="underline font-medium">
              Support Portal
            </a>{' '}
            to submit tickets without logging in.
          </p>
        </div>

        {ticketsQ.isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-[color:var(--color-primary-600)]"></div>
            <p className="mt-2 text-[color:var(--color-text-muted)]">Loading tickets...</p>
          </div>
        ) : ticketsQ.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="mt-0.5 mr-2 h-5 w-5 flex-shrink-0 text-red-600" />
              <p className="text-sm text-red-800">Failed to load tickets</p>
            </div>
          </div>
        ) : !ticketsQ.data || ticketsQ.data.length === 0 ? (
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-12 text-center">
            <Ticket className="mx-auto mb-4 h-16 w-16 text-[color:var(--color-text-muted)] opacity-50" />
            <h3 className="mb-2 text-lg font-semibold text-[color:var(--color-text)]">No Tickets Found</h3>
            <p className="mb-4 text-[color:var(--color-text-muted)]">You don't have any support tickets yet.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
            >
              <Plus className="h-4 w-4" />
              <span>Create Your First Ticket</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Tickets List */}
            <div className="space-y-4">
              <h2 className="mb-4 text-2xl font-semibold text-[color:var(--color-text)]">All Tickets</h2>
              
              {ticketsQ.data.map((t) => (
                <div
                  key={t.id}
                  className={`cursor-pointer rounded-lg border p-6 transition-all ${
                    selectedTicket === t.id 
                      ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-panel)] ring-2 ring-[color:var(--color-primary-600)] ring-opacity-20' 
                      : 'border-[color:var(--color-border)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-primary-600)]'
                  }`}
                  onClick={() => setSelectedTicket(t.id)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-[color:var(--color-text)]">
                        Ticket #{t.ticketNumber}
                      </h3>
                      <p className="text-sm text-[color:var(--color-text-muted)]">{t.shortDescription}</p>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {getStatusBadge(t.status)}
                      {getPriorityBadge(t.priority)}
                    </div>
                  </div>

                  <p className="mb-3 line-clamp-2 text-sm text-[color:var(--color-text-muted)]">{t.description}</p>

                  <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                    <span>Created: {new Date(t.createdAt).toLocaleDateString()}</span>
                    {t.comments.length > 0 && (
                      <span className="flex items-center">
                        <MessageSquare className="mr-1 h-3 w-3" />
                        {t.comments.length} {t.comments.length === 1 ? 'comment' : 'comments'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Ticket Detail */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              {ticket ? (
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
                  <div className="mb-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-xl font-semibold text-[color:var(--color-text)]">Ticket #{ticket.ticketNumber}</h3>
                      <div className="flex flex-col items-end space-y-1">
                        {getStatusBadge(ticket.status)}
                        {getPriorityBadge(ticket.priority)}
                      </div>
                    </div>
                    
                    <h4 className="mb-2 text-lg font-semibold text-[color:var(--color-text)]">{ticket.shortDescription}</h4>
                    <p className="mb-4 text-[color:var(--color-text-muted)]">{ticket.description}</p>

                    <div className="text-sm text-[color:var(--color-text-muted)]">
                      <p>Created: {formatDateTime(new Date(ticket.createdAt))}</p>
                      <p>Last Updated: {formatDateTime(new Date(ticket.updatedAt))}</p>
                      {ticket.slaDueAt && (
                        <p>SLA Due: {formatDateTime(new Date(ticket.slaDueAt))}</p>
                      )}
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="border-t border-[color:var(--color-border)] pt-4">
                    <h4 className="mb-3 font-semibold text-[color:var(--color-text)]">Comments</h4>
                    
                    {ticket.comments.length === 0 ? (
                      <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">No comments yet</p>
                    ) : (
                      <div className="mb-4 max-h-96 space-y-3 overflow-y-auto">
                        {ticket.comments.map((comment, idx) => (
                          <div key={idx} className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] p-3">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-sm font-medium text-[color:var(--color-text)]">{comment.author}</span>
                              <span className="text-xs text-[color:var(--color-text-muted)]">
                                {new Date(comment.at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-[color:var(--color-text-muted)]">{comment.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Comment Form */}
                    <form onSubmit={handleAddComment} className="mt-4">
                      <label className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">
                        Add a Comment
                      </label>
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent p-3 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent"
                        rows={3}
                        placeholder="Type your comment here..."
                        required
                      />
                      <button
                        type="submit"
                        disabled={addCommentMutation.isPending || !newComment.trim()}
                        className="mt-2 flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      >
                        <Send className="h-4 w-4" />
                        <span>{addCommentMutation.isPending ? 'Sending...' : 'Send Comment'}</span>
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-12 text-center">
                  <Ticket className="mx-auto mb-3 h-12 w-12 text-[color:var(--color-text-muted)] opacity-50" />
                  <p className="text-[color:var(--color-text-muted)]">Select a ticket to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Create Ticket Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 sm:p-6 lg:p-8">
          <div className="relative w-full max-w-4xl rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-2xl">
            <div className="max-h-[90vh] overflow-y-auto p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-[color:var(--color-text)]">Create New Ticket</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg p-1.5 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateTicket} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">Your Name *</span>
                  <input
                    type="text"
                    value={newRequesterName}
                    onChange={(e) => setNewRequesterName(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2.5 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent transition-colors"
                    placeholder="Your full name"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">Email Address *</span>
                  <input
                    type="email"
                    value={newRequesterEmail}
                    onChange={(e) => setNewRequesterEmail(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2.5 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent transition-colors"
                    placeholder="your.email@example.com"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">Phone Number *</span>
                  <input
                    type="tel"
                    value={newRequesterPhone}
                    onChange={(e) => setNewRequesterPhone(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2.5 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent transition-colors"
                    placeholder="(123) 456-7890"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">Subject *</span>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2.5 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent transition-colors"
                    placeholder="Brief description of the issue"
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">Description *</span>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent p-4 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent transition-colors resize-y"
                    rows={6}
                    placeholder="Please describe your issue in detail..."
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--color-text-muted)]">Priority</span>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-2.5 text-sm text-[color:var(--color-text)] focus:ring-2 focus:ring-[color:var(--color-primary-600)] focus:border-transparent transition-colors"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>

                <div className="flex gap-3 pt-4 border-t border-[color:var(--color-border)] mt-6">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 rounded-lg border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-text)] hover:bg-[color:var(--color-muted)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTicketMutation.isPending}
                    className="flex-1 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {createTicketMutation.isPending ? 'Creating...' : 'Create Ticket'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
