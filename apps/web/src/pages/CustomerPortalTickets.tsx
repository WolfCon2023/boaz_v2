/**
 * Customer Portal Tickets
 * 
 * View support tickets and add comments
 */

import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '../lib/http'
import { ArrowLeft, Ticket, MessageSquare, Send, AlertCircle } from 'lucide-react'
import { formatDateTime } from '../lib/dateFormat'
import { useToast } from '../components/ToastProvider'

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
  const { addToast } = useToast()
  const qc = useQueryClient()
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('customer_portal_token')
    if (!token) {
      navigate('/portal/login')
    }
  }, [navigate])

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
      addToast('Comment added successfully', 'success')
    },
  })

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTicket || !newComment.trim()) return
    addCommentMutation.mutate({ ticketId: selectedTicket, body: newComment })
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <Link to="/portal/dashboard" className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Dashboard</span>
            </Link>
            <div className="hidden sm:block w-px h-6 bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900 hidden sm:block">My Tickets</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {ticketsQ.isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="mt-2 text-gray-600">Loading tickets...</p>
          </div>
        ) : ticketsQ.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-2" />
              <p className="text-red-800">Failed to load tickets</p>
            </div>
          </div>
        ) : !ticketsQ.data || ticketsQ.data.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <Ticket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Tickets Found</h3>
            <p className="text-gray-600">You don't have any support tickets yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tickets List */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">All Tickets</h2>
              
              {ticketsQ.data.map((t) => (
                <div
                  key={t.id}
                  className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border cursor-pointer ${
                    selectedTicket === t.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200'
                  }`}
                  onClick={() => setSelectedTicket(t.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        Ticket #{t.ticketNumber}
                      </h3>
                      <p className="text-sm text-gray-600">{t.shortDescription}</p>
                    </div>
                    <div className="flex flex-col items-end space-y-1">
                      {getStatusBadge(t.status)}
                      {getPriorityBadge(t.priority)}
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">{t.description}</p>

                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Created: {new Date(t.createdAt).toLocaleDateString()}</span>
                    {t.comments.length > 0 && (
                      <span className="flex items-center">
                        <MessageSquare className="w-3 h-3 mr-1" />
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
                <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900">Ticket #{ticket.ticketNumber}</h3>
                      <div className="flex flex-col items-end space-y-1">
                        {getStatusBadge(ticket.status)}
                        {getPriorityBadge(ticket.priority)}
                      </div>
                    </div>
                    
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">{ticket.shortDescription}</h4>
                    <p className="text-gray-700 mb-4">{ticket.description}</p>

                    <div className="text-sm text-gray-600">
                      <p>Created: {formatDateTime(new Date(ticket.createdAt))}</p>
                      <p>Last Updated: {formatDateTime(new Date(ticket.updatedAt))}</p>
                      {ticket.slaDueAt && (
                        <p>SLA Due: {formatDateTime(new Date(ticket.slaDueAt))}</p>
                      )}
                    </div>
                  </div>

                  {/* Comments */}
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Comments</h4>
                    
                    {ticket.comments.length === 0 ? (
                      <p className="text-sm text-gray-500 mb-4">No comments yet</p>
                    ) : (
                      <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                        {ticket.comments.map((comment, idx) => (
                          <div key={idx} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-gray-900">{comment.author}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(comment.at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{comment.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Comment Form */}
                    <form onSubmit={handleAddComment} className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Add a Comment
                      </label>
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        rows={3}
                        placeholder="Type your comment here..."
                        required
                      />
                      <button
                        type="submit"
                        disabled={addCommentMutation.isPending || !newComment.trim()}
                        className="mt-2 flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        <span>{addCommentMutation.isPending ? 'Sending...' : 'Send Comment'}</span>
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md p-12 text-center border border-gray-200">
                  <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">Select a ticket to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

