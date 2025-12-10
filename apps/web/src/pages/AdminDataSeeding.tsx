/**
 * Admin: Data Seeding Tools
 * 
 * Trigger data seeding operations
 */

import { useState } from 'react'
import { http } from '../lib/http'
import { useToast } from '../components/Toast'
import { Database, Play, CheckCircle, Loader } from 'lucide-react'

export default function AdminDataSeeding() {
  const { showToast } = useToast()
  
  const [seedingRoles, setSeedingRoles] = useState(false)
  const [seedingKB, setSeedingKB] = useState(false)
  const [seedingTicketsKB, setSeedingTicketsKB] = useState(false)
  const [seedingApprovalKB, setSeedingApprovalKB] = useState(false)
  const [seedingAcceptanceKB, setSeedingAcceptanceKB] = useState(false)
  const [seedingDealApprovalKB, setSeedingDealApprovalKB] = useState(false)
  const [seedingCustomerSuccessKB, setSeedingCustomerSuccessKB] = useState(false)
  const [seedingPaymentPortalKB, setSeedingPaymentPortalKB] = useState(false)
  const [seedingOutreachSequencesKB, setSeedingOutreachSequencesKB] = useState(false)
  const [seedingOutreachTemplatesKB, setSeedingOutreachTemplatesKB] = useState(false)
  
  const [rolesResult, setRolesResult] = useState<any>(null)
  const [kbResult, setKBResult] = useState<any>(null)
  const [ticketsKBResult, setTicketsKBResult] = useState<any>(null)
  const [approvalKBResult, setApprovalKBResult] = useState<any>(null)
  const [acceptanceKBResult, setAcceptanceKBResult] = useState<any>(null)
  const [dealApprovalKBResult, setDealApprovalKBResult] = useState<any>(null)
  const [customerSuccessKBResult, setCustomerSuccessKBResult] = useState<any>(null)
  const [paymentPortalKBResult, setPaymentPortalKBResult] = useState<any>(null)
  const [outreachSequencesKBResult, setOutreachSequencesKBResult] = useState<any>(null)
  const [outreachTemplatesKBResult, setOutreachTemplatesKBResult] = useState<any>(null)

  async function seedITRoles() {
    setSeedingRoles(true)
    setRolesResult(null)
    try {
      const res = await http.post('/api/admin/seed/it-roles')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setRolesResult(res.data.data)
        showToast('IT roles seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed roles', 'error')
    } finally {
      setSeedingRoles(false)
    }
  }

  async function seedRolesKB() {
    setSeedingKB(true)
    setKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/roles-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setKBResult(res.data.data)
        showToast('KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed KB', 'error')
    } finally {
      setSeedingKB(false)
    }
  }

  async function seedTicketsKB() {
    setSeedingTicketsKB(true)
    setTicketsKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/tickets-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setTicketsKBResult(res.data.data)
        showToast('Tickets KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Tickets KB', 'error')
    } finally {
      setSeedingTicketsKB(false)
    }
  }

  async function seedApprovalQueueKB() {
    setSeedingApprovalKB(true)
    setApprovalKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/approval-queue-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setApprovalKBResult(res.data.data)
        showToast('Approval Queue KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Approval Queue KB', 'error')
    } finally {
      setSeedingApprovalKB(false)
    }
  }

  async function seedAcceptanceQueueKB() {
    setSeedingAcceptanceKB(true)
    setAcceptanceKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/acceptance-queue-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setAcceptanceKBResult(res.data.data)
        showToast('Acceptance Queue KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Acceptance Queue KB', 'error')
    } finally {
      setSeedingAcceptanceKB(false)
    }
  }

  async function seedDealApprovalKB() {
    setSeedingDealApprovalKB(true)
    setDealApprovalKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/deal-approval-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setDealApprovalKBResult(res.data.data)
        showToast('Deal Approval KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Deal Approval KB', 'error')
    } finally {
      setSeedingDealApprovalKB(false)
    }
  }

  async function seedCustomerSuccessKB() {
    setSeedingCustomerSuccessKB(true)
    setCustomerSuccessKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/customer-success-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setCustomerSuccessKBResult(res.data.data)
        showToast('Customer Success KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Customer Success KB', 'error')
    } finally {
      setSeedingCustomerSuccessKB(false)
    }
  }

  async function seedPaymentPortalKB() {
    setSeedingPaymentPortalKB(true)
    setPaymentPortalKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/payment-portal-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setPaymentPortalKBResult(res.data.data)
        showToast('Payment Portal KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Payment Portal KB', 'error')
    } finally {
      setSeedingPaymentPortalKB(false)
    }
  }

  async function seedOutreachSequencesKB() {
    setSeedingOutreachSequencesKB(true)
    setOutreachSequencesKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/outreach-sequences-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setOutreachSequencesKBResult(res.data.data)
        showToast('Outreach Sequences KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Outreach Sequences KB', 'error')
    } finally {
      setSeedingOutreachSequencesKB(false)
    }
  }

  async function seedOutreachTemplatesKB() {
    setSeedingOutreachTemplatesKB(true)
    setOutreachTemplatesKBResult(null)
    try {
      const res = await http.post('/api/admin/seed/outreach-templates-kb')
      if (res.data.error) {
        showToast(res.data.error, 'error')
      } else {
        setOutreachTemplatesKBResult(res.data.data)
        showToast('Outreach Templates KB article seeded successfully', 'success')
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to seed Outreach Templates KB', 'error')
    } finally {
      setSeedingOutreachTemplatesKB(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--color-text)]">Data Seeding Tools</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
          Trigger data seeding operations for roles and knowledge base articles
        </p>
      </div>

      {/* Seed IT Roles */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">IT Roles</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Add IT and IT Manager roles to the system. Safe to run multiple times.
            </p>
            <button
              onClick={seedITRoles}
              disabled={seedingRoles}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingRoles ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed IT Roles</span>
                </>
              )}
            </button>
          </div>
        </div>

        {rolesResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{rolesResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>IT Role: {rolesResult.results.it}</p>
                  <p>IT Manager Role: {rolesResult.results.it_manager}</p>
                  <p className="mt-2">Total Roles in System: {rolesResult.totalRoles}</p>
                  {rolesResult.roles && (
                    <div className="mt-2">
                      <p className="font-medium">All Roles:</p>
                      <ul className="ml-4 mt-1">
                        {rolesResult.roles.map((r: any) => (
                          <li key={r.name}>
                            {r.name} ({r.permissions} permissions)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Roles & Permissions KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article explaining all system roles. Updates if already exists.
            </p>
            <button
              onClick={seedRolesKB}
              disabled={seedingKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed KB Article</span>
                </>
              )}
            </button>
          </div>
        </div>

        {kbResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{kbResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {kbResult.title}</p>
                  <p>Slug: {kbResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={kbResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {kbResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Tickets KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Support Tickets KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for the Support Tickets app. Updates if already exists.
            </p>
            <button
              onClick={seedTicketsKB}
              disabled={seedingTicketsKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingTicketsKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Tickets KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {ticketsKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{ticketsKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {ticketsKBResult.title}</p>
                  <p>Slug: {ticketsKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={ticketsKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {ticketsKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Approval Queue KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Approval Queue KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for the Approval Queue. Updates if already exists.
            </p>
            <button
              onClick={seedApprovalQueueKB}
              disabled={seedingApprovalKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingApprovalKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Approval Queue KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {approvalKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{approvalKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {approvalKBResult.title}</p>
                  <p>Slug: {approvalKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={approvalKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {approvalKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Acceptance Queue KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Acceptance Queue KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for the Acceptance Queue. Updates if already exists.
            </p>
            <button
              onClick={seedAcceptanceQueueKB}
              disabled={seedingAcceptanceKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingAcceptanceKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Acceptance Queue KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {acceptanceKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{acceptanceKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {acceptanceKBResult.title}</p>
                  <p>Slug: {acceptanceKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={acceptanceKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {acceptanceKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Deal Approval Queue KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Deal Approval Queue KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for the Deal Approval Queue. Updates if already exists.
            </p>
            <button
              onClick={seedDealApprovalKB}
              disabled={seedingDealApprovalKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingDealApprovalKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Deal Approval KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {dealApprovalKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{dealApprovalKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {dealApprovalKBResult.title}</p>
                  <p>Slug: {dealApprovalKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={dealApprovalKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {dealApprovalKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Customer Success KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Customer Success KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for Customer Success. Updates if already exists.
            </p>
            <button
              onClick={seedCustomerSuccessKB}
              disabled={seedingCustomerSuccessKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingCustomerSuccessKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Customer Success KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {customerSuccessKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{customerSuccessKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {customerSuccessKBResult.title}</p>
                  <p>Slug: {customerSuccessKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={customerSuccessKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {customerSuccessKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Payment Portal KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Payment Portal KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for the Payment Portal. Updates if already exists.
            </p>
            <button
              onClick={seedPaymentPortalKB}
              disabled={seedingPaymentPortalKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingPaymentPortalKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Payment Portal KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {paymentPortalKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{paymentPortalKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {paymentPortalKBResult.title}</p>
                  <p>Slug: {paymentPortalKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={paymentPortalKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {paymentPortalKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Outreach Sequences KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Outreach Sequences KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for Outreach Sequences. Updates if already exists.
            </p>
            <button
              onClick={seedOutreachSequencesKB}
              disabled={seedingOutreachSequencesKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingOutreachSequencesKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Outreach Sequences KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {outreachSequencesKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{outreachSequencesKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {outreachSequencesKBResult.title}</p>
                  <p>Slug: {outreachSequencesKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={outreachSequencesKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {outreachSequencesKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Seed Outreach Templates KB Article */}
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[color:var(--color-primary-600)]" />
              <h3 className="text-lg font-semibold text-[color:var(--color-text)]">Outreach Templates KB Article</h3>
            </div>
            <p className="text-sm text-[color:var(--color-text-muted)] mb-4">
              Create comprehensive knowledge base article for Outreach Templates. Updates if already exists.
            </p>
            <button
              onClick={seedOutreachTemplatesKB}
              disabled={seedingOutreachTemplatesKB}
              className="flex items-center space-x-2 rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {seedingOutreachTemplatesKB ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Seeding...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Seed Outreach Templates KB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {outreachTemplatesKBResult && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900 mb-2">{outreachTemplatesKBResult.message}</p>
                <div className="text-xs text-green-800">
                  <p>Title: {outreachTemplatesKBResult.title}</p>
                  <p>Slug: {outreachTemplatesKBResult.slug}</p>
                  <p className="mt-2">
                    <a 
                      href={outreachTemplatesKBResult.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline hover:text-blue-700"
                    >
                      View Article: {outreachTemplatesKBResult.url}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>ℹ️ Note:</strong> These seeding operations run on the server where MongoDB is accessible. They are safe to run multiple times and will skip existing data.
        </p>
      </div>
    </div>
  )
}

