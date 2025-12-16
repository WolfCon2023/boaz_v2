import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { CRMNav } from '@/components/CRMNav'
import { CRMHelpButton } from '@/components/CRMHelpButton'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/ConfirmDialog'

type Webhook = {
  _id: string
  name: string
  url: string
  events: string[]
  isActive: boolean
  secret?: string | null
  lastDeliveryAt?: string | null
  lastDeliveryOk?: boolean | null
  lastDeliveryStatus?: number | null
  lastDeliveryError?: string | null
}

type ApiKeyRow = {
  _id: string
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  createdByEmail?: string | null
  lastUsedAt?: string | null
}

export default function CRMIntegrations() {
  const toast = useToast()
  const qc = useQueryClient()
  const { confirm, ConfirmDialog } = useConfirm()

  const eventsQ = useQuery({
    queryKey: ['crm', 'integrations', 'events'],
    queryFn: async () => {
      const res = await http.get('/api/crm/integrations/events')
      return res.data as { data: { events: string[] } }
    },
  })

  const webhooksQ = useQuery({
    queryKey: ['crm', 'integrations', 'webhooks'],
    queryFn: async () => {
      const res = await http.get('/api/crm/integrations/webhooks')
      return res.data as { data: { items: Webhook[] } }
    },
  })

  const apiKeysQ = useQuery({
    queryKey: ['crm', 'integrations', 'api-keys'],
    queryFn: async () => {
      const res = await http.get('/api/crm/integrations/api-keys')
      return res.data as { data: { items: ApiKeyRow[] } }
    },
  })

  const [newWebhook, setNewWebhook] = React.useState({
    name: '',
    url: '',
    secret: '',
    eventsCsv: 'test.ping,support.ticket.created,crm.invoice.paid',
    isActive: true,
  })

  const createWebhookM = useMutation({
    mutationFn: async () => {
      const events = newWebhook.eventsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await http.post('/api/crm/integrations/webhooks', {
        name: newWebhook.name,
        url: newWebhook.url,
        secret: newWebhook.secret.trim() ? newWebhook.secret.trim() : null,
        events,
        isActive: newWebhook.isActive,
      })
      return res.data
    },
    onSuccess: async () => {
      toast.showToast('Webhook created', 'success')
      setNewWebhook((v) => ({ ...v, name: '', url: '' }))
      await qc.invalidateQueries({ queryKey: ['crm', 'integrations', 'webhooks'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to create webhook', 'error'),
  })

  const testWebhookM = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/crm/integrations/webhooks/${id}/test`)
      return res.data
    },
    onSuccess: () => toast.showToast('Test event queued', 'success'),
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to test webhook', 'error'),
  })

  const toggleWebhookM = useMutation({
    mutationFn: async (row: Webhook) => {
      const res = await http.put(`/api/crm/integrations/webhooks/${row._id}`, { isActive: !row.isActive })
      return res.data
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['crm', 'integrations', 'webhooks'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to update webhook', 'error'),
  })

  const deleteWebhookM = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/integrations/webhooks/${id}`)
      return res.data
    },
    onSuccess: async () => {
      toast.showToast('Webhook deleted', 'success')
      await qc.invalidateQueries({ queryKey: ['crm', 'integrations', 'webhooks'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to delete webhook', 'error'),
  })

  const [newKeyName, setNewKeyName] = React.useState('')
  const [lastCreatedKey, setLastCreatedKey] = React.useState<string | null>(null)

  const createKeyM = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/crm/integrations/api-keys', { name: newKeyName, scopes: ['integrations:write'] })
      return res.data as { data: { apiKey: string } }
    },
    onSuccess: async (data) => {
      const key = (data as any)?.data?.apiKey as string | undefined
      setLastCreatedKey(key || null)
      setNewKeyName('')
      toast.showToast('API key created (copy it now — shown once)', 'success')
      await qc.invalidateQueries({ queryKey: ['crm', 'integrations', 'api-keys'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to create API key', 'error'),
  })

  const revokeKeyM = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.delete(`/api/crm/integrations/api-keys/${id}`)
      return res.data
    },
    onSuccess: async () => {
      toast.showToast('API key revoked', 'success')
      await qc.invalidateQueries({ queryKey: ['crm', 'integrations', 'api-keys'] })
    },
    onError: (err: any) => toast.showToast(err?.response?.data?.error || 'Failed to revoke API key', 'error'),
  })

  const supportedEvents = eventsQ.data?.data.events ?? []
  const hooks = webhooksQ.data?.data.items ?? []
  const keys = apiKeysQ.data?.data.items ?? []

  return (
    <div className="space-y-6">
      <CRMNav />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Integrations</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            Connect BOAZ to external systems using webhooks and API keys.
          </p>
        </div>
        <CRMHelpButton tag="crm:integrations" />
      </div>

      {/* Quick start / step-by-step for non-technical users */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Quick Start (non‑technical)</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
              A webhook is just a “notification link.” BOAZ sends a message to your URL when something happens (like a ticket being created).
            </p>
          </div>
          <a
            className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)]"
            href="/apps/crm/support/kb?tag=crm%3Aintegrations"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open full guide
          </a>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
            <div className="text-xs font-semibold">Step 1</div>
            <div className="mt-1 text-sm font-medium">Get a webhook URL</div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Use a tool like Webhook.site, Zapier “Catch Hook”, or Make “Custom Webhook” to get a URL.
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
            <div className="text-xs font-semibold">Step 2</div>
            <div className="mt-1 text-sm font-medium">Create a BOAZ webhook</div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Paste the URL below, keep events as default (or <code>*</code>), then click <b>Create Webhook</b>.
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
            <div className="text-xs font-semibold">Step 3</div>
            <div className="mt-1 text-sm font-medium">Send a test</div>
            <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Click <b>Send test</b> on your webhook and confirm you received <code>test.ping</code>.
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-[color:var(--color-text-muted)]">
          After that, create a ticket to see <code>support.ticket.created</code>, or pay an invoice in full to see <code>crm.invoice.paid</code>.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Webhooks */}
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="text-base font-semibold">Webhooks</h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            BOAZ will POST events to your URL. Optional signing headers: <code>x-boaz-timestamp</code> and{' '}
            <code>x-boaz-signature</code>.
          </p>

          <div className="mt-4 grid gap-3">
            <input
              value={newWebhook.name}
              onChange={(e) => setNewWebhook((v) => ({ ...v, name: e.target.value }))}
              placeholder="Webhook name (e.g. Zapier / Slack)"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              value={newWebhook.url}
              onChange={(e) => setNewWebhook((v) => ({ ...v, url: e.target.value }))}
              placeholder="Destination URL (https://...)"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              value={newWebhook.secret}
              onChange={(e) => setNewWebhook((v) => ({ ...v, secret: e.target.value }))}
              placeholder="Signing secret (optional)"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              value={newWebhook.eventsCsv}
              onChange={(e) => setNewWebhook((v) => ({ ...v, eventsCsv: e.target.value }))}
              placeholder="Events (comma-separated) or *"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newWebhook.isActive}
                  onChange={(e) => setNewWebhook((v) => ({ ...v, isActive: e.target.checked }))}
                />
                Active
              </label>
              <button
                onClick={() => createWebhookM.mutate()}
                disabled={createWebhookM.isPending}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
              >
                Create Webhook
              </button>
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              <div className="font-medium">Supported events:</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(supportedEvents.length ? supportedEvents : ['…loading']).map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-2 py-0.5"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Configured webhooks</h3>
            {webhooksQ.isLoading ? (
              <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">Loading…</div>
            ) : hooks.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">No webhooks yet.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {hooks.map((h) => (
                  <div key={h._id} className="rounded-xl border border-[color:var(--color-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">{h.name}</div>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${
                              h.isActive
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                                : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-200'
                            }`}
                          >
                            {h.isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-[color:var(--color-text-muted)]">{h.url}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(h.events?.length ? h.events : ['*']).map((ev) => (
                            <span
                              key={ev}
                              className="inline-flex items-center rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-2 py-0.5 text-[10px]"
                            >
                              {ev}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px] text-[color:var(--color-text-muted)]">
                          Last delivery:{' '}
                          {h.lastDeliveryAt ? (
                            <>
                              {new Date(h.lastDeliveryAt).toLocaleString()} —{' '}
                              {h.lastDeliveryOk ? (
                                <span className="text-emerald-300">OK</span>
                              ) : (
                                <span className="text-rose-300">
                                  Failed{h.lastDeliveryStatus ? ` (${h.lastDeliveryStatus})` : ''}{' '}
                                  {h.lastDeliveryError ? `— ${h.lastDeliveryError}` : ''}
                                </span>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          onClick={() => testWebhookM.mutate(h._id)}
                          disabled={testWebhookM.isPending}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                        >
                          Send test
                        </button>
                        <button
                          onClick={() => toggleWebhookM.mutate(h)}
                          disabled={toggleWebhookM.isPending}
                          className="rounded-lg border border-[color:var(--color-border)] px-3 py-1.5 text-xs hover:bg-[color:var(--color-muted)] disabled:opacity-50"
                        >
                          {h.isActive ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm(`Delete webhook "${h.name}"?`, { confirmText: 'Delete', confirmColor: 'danger' })
                            if (!ok) return
                            deleteWebhookM.mutate(h._id)
                          }}
                          disabled={deleteWebhookM.isPending}
                          className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* API Keys */}
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="text-base font-semibold">API Keys</h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            Generate keys for server-to-server integrations (Inbound API). Keys are shown **once** at creation.
          </p>

          <div className="mt-4 flex gap-2">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key name (e.g. HubSpot sync)"
              className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
            />
            <button
              onClick={() => createKeyM.mutate()}
              disabled={createKeyM.isPending || !newKeyName.trim()}
              className="shrink-0 rounded-lg bg-[color:var(--color-primary-600)] px-3 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
            >
              Create
            </button>
          </div>

          {lastCreatedKey && (
            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <div className="text-xs font-semibold text-amber-100">Copy this key now (shown once)</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="block w-full overflow-auto rounded-lg bg-black/30 px-3 py-2 text-[11px] text-amber-100">
                  {lastCreatedKey}
                </code>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lastCreatedKey)
                      toast.showToast('Copied', 'success')
                    } catch {
                      toast.showToast('Copy failed', 'error')
                    }
                  }}
                  className="rounded-lg border border-[color:var(--color-border)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold">Active keys</h3>
            {apiKeysQ.isLoading ? (
              <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">Loading…</div>
            ) : keys.length === 0 ? (
              <div className="mt-2 text-sm text-[color:var(--color-text-muted)]">No API keys yet.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {keys.map((k) => (
                  <div key={k._id} className="rounded-xl border border-[color:var(--color-border)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{k.name}</div>
                        <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                          Prefix: <code>{k.prefix}</code>
                        </div>
                        <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">
                          Created: {new Date(k.createdAt).toLocaleString()}
                          {k.createdByEmail ? ` by ${k.createdByEmail}` : ''}
                        </div>
                        <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">
                          Last used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : '—'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          ;(async () => {
                            const ok = await confirm(`Revoke API key "${k.name}"?`, { confirmText: 'Revoke', confirmColor: 'danger' })
                            if (!ok) return
                            revokeKeyM.mutate(k._id)
                          })()
                        }}
                        disabled={revokeKeyM.isPending}
                        className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/15 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Inbound API (push data into BOAZ) */}
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
          <h2 className="text-base font-semibold">Inbound (Push data into BOAZ)</h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            Use an API key to upsert records from external systems. Idempotency is based on <code>externalSource</code> +{' '}
            <code>externalId</code>.
          </p>

          <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
            <div className="text-xs font-semibold">Auth header</div>
            <code className="mt-2 block overflow-auto rounded-lg bg-black/30 px-3 py-2 text-[11px]">
              x-boaz-api-key: boaz_sk_************************
            </code>
            <div className="mt-2 text-[11px] text-[color:var(--color-text-muted)]">
              Scope required: <code>integrations:write</code>. (Keys created above default to this scope.)
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
              <div className="text-xs font-semibold">Accounts</div>
              <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">POST</div>
              <code className="mt-2 block overflow-auto rounded-lg bg-black/30 px-3 py-2 text-[11px]">
                /api/integrations/inbound/accounts
              </code>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
              <div className="text-xs font-semibold">Contacts</div>
              <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">POST</div>
              <code className="mt-2 block overflow-auto rounded-lg bg-black/30 px-3 py-2 text-[11px]">
                /api/integrations/inbound/contacts
              </code>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
              <div className="text-xs font-semibold">Deals</div>
              <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">POST</div>
              <code className="mt-2 block overflow-auto rounded-lg bg-black/30 px-3 py-2 text-[11px]">
                /api/integrations/inbound/deals
              </code>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
              <div className="text-xs font-semibold">Tickets</div>
              <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">POST</div>
              <code className="mt-2 block overflow-auto rounded-lg bg-black/30 px-3 py-2 text-[11px]">
                /api/integrations/inbound/tickets
              </code>
            </div>
          </div>

          <div className="mt-4 text-xs text-[color:var(--color-text-muted)]">
            Tip: Start by sending an <b>Account</b>, then a <b>Contact</b> referencing <code>accountExternalId</code>, then a{' '}
            <b>Deal</b> referencing <code>accountExternalId</code>.
          </div>
        </div>
      </div>
      {ConfirmDialog}
    </div>
  )
}


