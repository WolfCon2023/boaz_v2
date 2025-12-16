import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { CreditCard, Building2, Globe, DollarSign, CheckSquare } from 'lucide-react'

export default function CRMInvoicePrint() {
  const { id } = useParams()
  const { data } = useQuery({
    queryKey: ['invoice', id],
    enabled: Boolean(id),
    queryFn: async () => {
      try {
        const res = await http.get(`/api/crm/invoices/${id}`)
        return res.data as { data: any }
      } catch (e: any) {
        // Fallback for older API deploys without GET /:id: search in list
        if (e?.response?.status === 404) {
          const list = await http.get('/api/crm/invoices')
          const found = (list.data?.data?.items ?? []).find((x: any) => String(x._id) === String(id))
          if (found) return { data: found }
        }
        throw e
      }
    },
  })
  const inv = data?.data

  // Fetch accounts to display account name/number
  const accountsQ = useQuery({
    queryKey: ['accounts-pick-for-print'],
    queryFn: async () => {
      const res = await http.get('/api/crm/accounts', { params: { limit: 1000, sort: 'name', dir: 'asc' } })
      return res.data as { data: { items: Array<{ _id: string; name?: string; accountNumber?: number }> } }
    },
  })
  const acct = React.useMemo(() => {
    const items = accountsQ.data?.data.items ?? []
    return inv?.accountId ? items.find((a) => a._id === inv.accountId) : undefined
  }, [accountsQ.data, inv?.accountId])

  const company = {
    name: 'Wolf Consulting Group, LLC',
    address: '2114 Willowcrest Drive, Waxhaw, NC 28173',
    email: 'billing@wolfconsultingnc.com',
    phone: '704-803-0934',
  }

  return (
    <div className="mx-auto my-6 w-[min(100%,900px)] bg-white p-8 text-black print:w-auto print:p-0" style={{ color: 'black' }}>
      <div className="mb-4 print:hidden">
        <a href="/apps/crm/invoices" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100">Back to Invoices</a>
      </div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="text-2xl font-bold">{company.name}</div>
          <div className="text-sm">{company.address}</div>
          <div className="text-sm">{company.email}</div>
          <div className="text-sm">{company.phone}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold">INVOICE</div>
          <div className="text-sm">Invoice #: {inv?.invoiceNumber ?? '-'}</div>
          <div className="text-sm">Status: {inv?.status ?? '-'}</div>
          <div className="text-sm">Issued: {inv?.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '-'}</div>
          <div className="text-sm">Due: {inv?.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '-'}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-300 p-4">
          <div className="mb-1 text-sm font-semibold">Bill To</div>
          <div className="text-sm">
            {acct ? (
              <>
                <div>{acct.name ?? 'Account'}</div>
                <div>Account #: {acct.accountNumber ?? '-'}</div>
              </>
            ) : (
              <>
                <div>{inv?.accountNumber ? `Account #: ${inv.accountNumber}` : '-'}</div>
              </>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-300 p-4">
          <div className="mb-1 text-sm font-semibold">Summary</div>
          <div className="text-sm">Title: {inv?.title ?? '-'}</div>
          <div className="text-sm">Total: ${Number(inv?.total ?? 0).toLocaleString()}</div>
          <div className="text-sm">Balance: ${Number(inv?.balance ?? inv?.total ?? 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-300">
        <table className="w-full text-sm">
          <thead className="bg-neutral-100">
            <tr>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv?.items ?? [{ description: inv?.title ?? 'Invoice item', amount: inv?.subtotal ?? inv?.total ?? 0 }]).map((it: any, idx: number) => (
              <tr key={idx} className="border-t border-neutral-200">
                <td className="px-4 py-2">{it.description ?? inv?.title ?? `Item ${idx+1}`}</td>
                <td className="px-4 py-2 text-right">${Number(it.amount ?? 0).toLocaleString()}</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-300">
              <td className="px-4 py-2 text-right font-semibold">Subtotal</td>
              <td className="px-4 py-2 text-right">${Number(inv?.subtotal ?? 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-semibold">Tax</td>
              <td className="px-4 py-2 text-right">${Number(inv?.tax ?? 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-bold">Total</td>
              <td className="px-4 py-2 text-right font-bold">${Number(inv?.total ?? 0).toLocaleString()}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-right font-semibold">Balance</td>
              <td className="px-4 py-2 text-right">${Number(inv?.balance ?? inv?.total ?? 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Payment Options Section */}
      <div className="mb-8 rounded-lg border-2 border-blue-200 bg-blue-50 p-6 print:border print:border-neutral-300 print:bg-white">
        <h3 className="mb-4 text-lg font-bold text-blue-900 print:text-black">💳 Payment Options</h3>
        <p className="mb-4 text-sm text-blue-800 print:text-neutral-600">
          Choose your preferred payment method below. Payment is due by{' '}
          <strong>{inv?.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'the due date'}</strong>.
        </p>

        {/* Quick Pay Buttons - Hide on print */}
        <div className="mb-6 flex flex-wrap gap-3 print:hidden">
          <a 
            href={`https://buy.stripe.com/test_placeholder?client_reference_id=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-700"
          >
            <CreditCard className="h-4 w-4" />
            Pay with Card
          </a>
          <a 
            href={`https://www.paypal.com/paypalme/wolfconsultinggroup/${Number(inv?.balance ?? inv?.total ?? 0).toFixed(2)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0070ba] px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-[#005ea6]"
          >
            <DollarSign className="h-4 w-4" />
            Pay with PayPal
          </a>
        </div>

        {/* All Payment Methods */}
        <div className="space-y-4">
          {/* Credit/Debit Card */}
          <div className="rounded-lg border border-blue-300 bg-white p-4 print:border-neutral-300">
            <div className="mb-2 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600 print:text-black" />
              <h4 className="font-semibold">Credit or Debit Card</h4>
              <span className="ml-auto text-xs text-neutral-500">Instant • 2.9% + $0.30</span>
            </div>
            <p className="mb-2 text-sm text-neutral-600">
              Pay securely with Visa, Mastercard, American Express, or Discover
            </p>
            <p className="text-xs text-neutral-500 print:block">
              <strong>Instructions:</strong> Click the "Pay with Card" button above (or visit the payment link in your email) to complete your payment securely through our payment processor.
            </p>
          </div>

          {/* ACH Bank Transfer */}
          <div className="rounded-lg border border-blue-300 bg-white p-4 print:border-neutral-300">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600 print:text-black" />
              <h4 className="font-semibold">ACH Bank Transfer</h4>
              <span className="ml-auto text-xs text-neutral-500">2-3 business days • No fee</span>
            </div>
            <p className="mb-2 text-sm text-neutral-600">
              Direct bank transfer via ACH (US only)
            </p>
            <div className="mt-2 space-y-1 rounded bg-neutral-50 p-3 text-xs print:bg-white">
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Bank Name:</strong>
                <span>First Citizens Bank</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Routing Number:</strong>
                <span className="font-mono">053100300</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Account Number:</strong>
                <span className="font-mono">****7890</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Account Name:</strong>
                <span>Wolf Consulting Group, LLC</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Reference:</strong>
                <span className="font-semibold">Invoice #{inv?.invoiceNumber ?? id}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Please allow 2-3 business days for processing.
            </p>
          </div>

          {/* Wire Transfer */}
          <div className="rounded-lg border border-blue-300 bg-white p-4 print:border-neutral-300">
            <div className="mb-2 flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600 print:text-black" />
              <h4 className="font-semibold">Wire Transfer</h4>
              <span className="ml-auto text-xs text-neutral-500">1-5 business days • Bank fees may apply</span>
            </div>
            <p className="mb-2 text-sm text-neutral-600">
              International and domestic wire transfers
            </p>
            <div className="mt-2 space-y-1 rounded bg-neutral-50 p-3 text-xs print:bg-white">
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Bank Name:</strong>
                <span>First Citizens Bank</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Bank Address:</strong>
                <span>123 Main Street, Charlotte, NC 28202</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">SWIFT/BIC Code:</strong>
                <span className="font-mono">FCBIUS33</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Routing Number:</strong>
                <span className="font-mono">053100300</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Account Number:</strong>
                <span className="font-mono">****7890</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Account Name:</strong>
                <span>Wolf Consulting Group, LLC</span>
              </div>
              <div className="flex items-start gap-2">
                <strong className="min-w-[120px]">Reference:</strong>
                <span className="font-semibold">Invoice #{inv?.invoiceNumber ?? id}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Wire transfers typically process within 1-2 business days. International wires may take 3-5 business days.
            </p>
          </div>

          {/* PayPal */}
          <div className="rounded-lg border border-blue-300 bg-white p-4 print:border-neutral-300">
            <div className="mb-2 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600 print:text-black" />
              <h4 className="font-semibold">PayPal</h4>
              <span className="ml-auto text-xs text-neutral-500">Instant • 3.49% + $0.49</span>
            </div>
            <p className="mb-2 text-sm text-neutral-600">
              Pay with your PayPal account or PayPal Credit
            </p>
            <p className="text-xs text-neutral-500">
              <strong>Instructions:</strong> Click the "Pay with PayPal" button above to complete your payment securely through PayPal.
            </p>
          </div>

          {/* Check */}
          <div className="rounded-lg border border-blue-300 bg-white p-4 print:border-neutral-300">
            <div className="mb-2 flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-blue-600 print:text-black" />
              <h4 className="font-semibold">Check</h4>
              <span className="ml-auto text-xs text-neutral-500">7-10 business days • No fee</span>
            </div>
            <p className="mb-2 text-sm text-neutral-600">
              Mail a check or money order
            </p>
            <div className="mt-2 rounded bg-neutral-50 p-3 text-xs print:bg-white">
              <p className="mb-1">Please make checks payable to:</p>
              <div className="font-semibold">
                <div>Wolf Consulting Group, LLC</div>
                <div>123 Business Drive</div>
                <div>Charlotte, NC 28202</div>
              </div>
              <p className="mt-2">Please include your invoice number on the check memo line: <strong>Invoice #{inv?.invoiceNumber ?? id}</strong></p>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Checks typically take 7-10 business days to process.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-900 print:bg-white print:text-neutral-600">
          <strong>⚠️ Important:</strong> Please include your invoice number (#{inv?.invoiceNumber ?? id}) with all payments to ensure proper credit to your account.
        </div>
      </div>

      <div className="mb-4 text-xs text-neutral-600 print:hidden">
        For questions about this invoice or payment options, please contact us at {company.email} or call (704) 555-1234.
      </div>

      <div className="print:hidden">
        <button onClick={() => window.print()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100">Print / Save as PDF</button>
      </div>
    </div>
  )
}
