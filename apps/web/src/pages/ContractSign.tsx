import * as React from 'react'
import { useParams } from 'react-router-dom'
import { http } from '@/lib/http'
import { formatDate } from '@/lib/dateFormat'

type PublicSlaContract = {
  _id: string
  accountId: string
  contractNumber?: number | null
  name: string
  type?: string
  status?: string
  effectiveDate?: string | null
  startDate?: string | null
  endDate?: string | null
  autoRenew?: boolean
  renewalDate?: string | null
  billingFrequency?: string | null
  currency?: string | null
  invoiceDueDays?: number | null
  uptimeTargetPercent?: number | null
  supportHours?: string | null
  slaExclusionsSummary?: string | null
  responseTargetMinutes?: number | null
  resolutionTargetMinutes?: number | null
  serviceScopeSummary?: string | null
  limitationOfLiability?: string | null
  indemnificationSummary?: string | null
  confidentialitySummary?: string | null
  dataProtectionSummary?: string | null
  ipOwnershipSummary?: string | null
  terminationConditions?: string | null
  customerLegalName?: string | null
  providerLegalName?: string | null
}

type SignerInfo = {
  email: string
  name: string
  title: string
}

type ContractSignGetResponse =
  | {
      data: {
        requiresOtp: true
        role: 'customerSigner' | 'providerSigner'
        signer: SignerInfo
      }
      error: null | string
    }
  | {
      data: {
        requiresOtp?: boolean
        contract: PublicSlaContract
        role: 'customerSigner' | 'providerSigner'
        signer: SignerInfo
      }
      error: null | string
    }

export default function ContractSign() {
  const { token } = useParams<{ token: string }>()

  const [otpCode, setOtpCode] = React.useState('')
  const [loginId, setLoginId] = React.useState('')
  const [banner, setBanner] = React.useState<string | null>(null)
  const [signerName, setSignerName] = React.useState('')
  const [signerTitle, setSignerTitle] = React.useState('')
  const [signerEmail, setSignerEmail] = React.useState('')
  const [agreedTerms, setAgreedTerms] = React.useState(false)
  const [authorized, setAuthorized] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [response, setResponse] = React.useState<ContractSignGetResponse | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const res = await http.get(`/api/public/contracts/sign/${token}`)
        if (cancelled) return
        setResponse(res.data as ContractSignGetResponse)
      } catch (err: any) {
        if (cancelled) return
        const msg = err?.response?.data?.error || err?.message || 'failed_to_load_contract'
        setLoadError(msg)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, reloadKey])

  async function handleVerifyOtp() {
    try {
      const res = await http.post(`/api/public/contracts/sign/${token}/otp`, { loginId, otpCode })
      const payload = res.data as { data: { ok: boolean }; error: string | null }
      if (payload.error) {
        setBanner(`BOAZ says: ${payload.error}`)
        return
      }
      setBanner('BOAZ says: Security code verified.')
      setReloadKey((k) => k + 1)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'otp_failed'
      setBanner(`BOAZ says: ${msg}`)
    }
  }

  async function handleSign() {
    try {
      const payload = {
        name: signerName.trim(),
        title: signerTitle.trim() || undefined,
        email: signerEmail.trim(),
      }
      const res = await http.post(`/api/public/contracts/sign/${token}`, payload)
      const data = res.data as { data: { contract: PublicSlaContract; role: string } | null; error: string | null }
      if (data.error) {
        setBanner(`BOAZ says: ${data.error}`)
        return
      }
      setBanner('BOAZ says: Contract signed successfully.')
      setReloadKey((k) => k + 1)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'sign_failed'
      setBanner(`BOAZ says: ${msg}`)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-[color:var(--color-primary)]" />
          <p className="text-sm text-[color:var(--color-text-muted)]">Loading contract…</p>
        </div>
      </div>
    )
  }

  if (loadError || !response) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
          <h1 className="mb-2 text-base font-semibold">Contract link not available</h1>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            This contract link is invalid, expired, or has already been used. Please contact the sender for a new link.
          </p>
        </div>
      </div>
    )
  }

  const resp = response.data as any
  const requiresOtp: boolean = !!resp?.requiresOtp && !resp.contract
  const contract: PublicSlaContract | null = resp?.contract ?? null

  if (requiresOtp) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-xl">
          <div className="mb-4">
            <div className="text-xs font-semibold text-[color:var(--color-primary)]">BOAZ says</div>
            <h1 className="text-base font-semibold">Enter your signing username &amp; security code</h1>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              We&apos;ve emailed you a temporary signing username and a one‑time security code for this contract. Enter
              both below to unlock the contract details and continue to signing.
            </p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!loginId.trim()) {
                setBanner('BOAZ says: Please enter your signing username.')
                return
              }
              if (!otpCode.trim()) {
                setBanner('BOAZ says: Please enter your security code.')
                return
              }
              handleVerifyOtp()
            }}
          >
            <div className="space-y-1">
              <label className="block text-xs font-medium">Signing username</label>
              <input
                className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm font-mono"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="Paste the username from your email"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium">Security code</label>
              <input
                className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm tracking-[0.3em] font-mono"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-[color:var(--color-text-muted)]">
              <span>Codes expire after a short time for your security.</span>
              <button
                type="submit"
                className="rounded-xl bg-[color:var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-soft)]"
              >
                Verify code
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 text-center">
          <h1 className="mb-2 text-base font-semibold">Contract not available</h1>
          <p className="text-sm text-[color:var(--color-text-muted)]">
            We were not able to load the contract details. The link may be invalid or expired.
          </p>
        </div>
      </div>
    )
  }

  const fmtDate = (d?: string | null) => (d ? formatDate(d) : 'N/A')

  return (
    <div className="mx-auto max-w-5xl py-8 space-y-6">
      {banner && (
        <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] px-4 py-2 text-xs text-[color:var(--color-text)]">
          {banner}
        </div>
      )}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] px-3 py-1 text-[11px] text-[color:var(--color-text-muted)]">
              <span>BOAZ‑OS Contract</span>
              {contract.status && (
                <span className="rounded-full bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  {contract.status}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-lg font-semibold">
              {contract.contractNumber != null ? `Contract #${contract.contractNumber} · ` : ''}
              {contract.name}
            </h1>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              Type: {contract.type || 'N/A'}
            </p>
          </div>
          <div className="text-right text-xs text-[color:var(--color-text-muted)]">
            <div>Customer</div>
            <div className="font-medium text-[color:var(--color-text)]">
              {contract.customerLegalName || 'N/A'}
            </div>
            <div className="mt-2">Provider</div>
            <div className="font-medium text-[color:var(--color-text)]">
              {contract.providerLegalName || 'N/A'}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-xs md:grid-cols-3">
          <div className="space-y-1 rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
            <div className="text-[color:var(--color-text-muted)]">Effective</div>
            <div className="font-medium text-[color:var(--color-text)]">{fmtDate(contract.effectiveDate)}</div>
            <div className="mt-2 text-[color:var(--color-text-muted)]">Term</div>
            <div className="font-medium text-[color:var(--color-text)]">
              {fmtDate(contract.startDate)} – {fmtDate(contract.endDate)}
            </div>
          </div>
          <div className="space-y-1 rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
            <div className="text-[color:var(--color-text-muted)]">Renewal</div>
            <div className="font-medium text-[color:var(--color-text)]">
              {fmtDate(contract.renewalDate)}{' '}
              {contract.autoRenew ? '· Auto‑renew' : ''}
            </div>
            <div className="mt-2 text-[color:var(--color-text-muted)]">Billing</div>
            <div className="font-medium text-[color:var(--color-text)]">
              {contract.billingFrequency || 'N/A'} {contract.currency ? `· ${contract.currency}` : ''}
            </div>
          </div>
          <div className="space-y-1 rounded-xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-bg-elevated)] p-3">
            <div className="text-[color:var(--color-text-muted)]">SLA summary</div>
            <div className="text-[color:var(--color-text)]">
              {contract.responseTargetMinutes != null && (
                <span className="mr-2 inline-block rounded-full bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                  Response: {contract.responseTargetMinutes} min
                </span>
              )}
              {contract.resolutionTargetMinutes != null && (
                <span className="mr-2 inline-block rounded-full bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                  Resolution: {contract.resolutionTargetMinutes} min
                </span>
              )}
              {contract.uptimeTargetPercent != null && (
                <span className="inline-block rounded-full bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                  Uptime: {contract.uptimeTargetPercent}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 text-xs">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
              Service scope &amp; SLAs
            </h2>
            <p className="mb-2 text-[color:var(--color-text)]">
              {contract.serviceScopeSummary || 'No service scope summary provided.'}
            </p>
            {contract.slaExclusionsSummary && (
              <p className="mt-2 text-[color:var(--color-text-muted)]">
                <span className="font-medium text-[color:var(--color-text)]">SLA exclusions:</span>{' '}
                {contract.slaExclusionsSummary}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 text-xs">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
              Key legal summaries
            </h2>
            <ul className="space-y-1">
              <li>
                <span className="font-medium text-[color:var(--color-text)]">Liability:</span>{' '}
                {contract.limitationOfLiability || 'Not specified.'}
              </li>
              <li>
                <span className="font-medium text-[color:var(--color-text)]">Indemnification:</span>{' '}
                {contract.indemnificationSummary || 'Not specified.'}
              </li>
              <li>
                <span className="font-medium text-[color:var(--color-text)]">Confidentiality:</span>{' '}
                {contract.confidentialitySummary || 'Not specified.'}
              </li>
              <li>
                <span className="font-medium text-[color:var(--color-text)]">Data protection:</span>{' '}
                {contract.dataProtectionSummary || 'Not specified.'}
              </li>
              <li>
                <span className="font-medium text-[color:var(--color-text)]">IP ownership:</span>{' '}
                {contract.ipOwnershipSummary || 'Not specified.'}
              </li>
              <li>
                <span className="font-medium text-[color:var(--color-text)]">Termination conditions:</span>{' '}
                {contract.terminationConditions || 'Not specified.'}
              </li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 text-xs">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
              Digital signature
            </h2>
            <p className="mb-3 text-[color:var(--color-text-muted)]">
              Please review the contract details on the left, then complete the fields below to apply your digital
              signature.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!signerName.trim()) {
                  setBanner('BOAZ says: Please enter your full name.')
                  return
                }
                if (!signerEmail.trim()) {
                  setBanner('BOAZ says: Please enter your email address.')
                  return
                }
                if (!agreedTerms || !authorized) {
                  setBanner('BOAZ says: Please confirm the checkboxes before signing.')
                  return
                }
                handleSign()
              }}
            >
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Full name <span className="text-[color:var(--color-danger)]">*</span>
                </label>
                <input
                  className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Type your full legal name"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium">Title</label>
                <input
                  className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  placeholder="e.g., CEO, Director of IT"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium">
                  Email <span className="text-[color:var(--color-danger)]">*</span>
                </label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1.5 text-sm"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-2 pt-2">
                <label className="flex items-start gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    className="mt-[2px]"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                  />
                  <span>
                    I have read and agree to the terms of this agreement and understand that submitting this form
                    constitutes my electronic signature.
                  </span>
                </label>
                <label className="flex items-start gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    className="mt-[2px]"
                    checked={authorized}
                    onChange={(e) => setAuthorized(e.target.checked)}
                  />
                  <span>
                    I am authorized to sign this agreement on behalf of my organization (or myself if acting as an
                    individual).
                  </span>
                </label>
              </div>
              <div className="pt-3 text-right">
                <button
                  type="submit"
                  className="rounded-xl bg-[color:var(--color-primary)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-primary-soft)]"
                >
                  Sign contract
                </button>
              </div>
            </form>
          </div>
          <div className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 text-[11px] text-[color:var(--color-text-muted)]">
            By signing electronically, you agree that your typed name is the legal equivalent of your handwritten
            signature. BOAZ‑OS records the time, IP address, and technical fingerprint of this session for audit
            purposes.
          </div>
        </div>
      </div>
    </div>
  )
}


