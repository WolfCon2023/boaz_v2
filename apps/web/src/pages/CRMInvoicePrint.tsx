import * as React from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/lib/http'

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
    name: 'Boaz Demo Company',
    address: '1234 Demo Blvd, Demo, NC, 99999',
    email: 'billing@demo.com',
    phone: '999-999-9999',
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
          <div className="text-sm">Invoice #: {inv?.invoiceNumber ?? '—'}</div>
          <div className="text-sm">Status: {inv?.status ?? '—'}</div>
          <div className="text-sm">Issued: {inv?.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '—'}</div>
          <div className="text-sm">Due: {inv?.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-300 p-4">
          <div className="mb-1 text-sm font-semibold">Bill To</div>
          <div className="text-sm">
            {acct ? (
              <>
                <div>{acct.name ?? 'Account'}</div>
                <div>Account #: {acct.accountNumber ?? '—'}</div>
              </>
            ) : (
              <>
                <div>{inv?.accountNumber ? `Account #: ${inv.accountNumber}` : '—'}</div>
              </>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-300 p-4">
          <div className="mb-1 text-sm font-semibold">Summary</div>
          <div className="text-sm">Title: {inv?.title ?? '—'}</div>
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

      <div className="mb-8 text-xs text-neutral-600">
        Please remit payment by the due date. For questions, contact {company.email}.
      </div>

      <div className="no-print">
        <button onClick={() => window.print()} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100">Print / Save as PDF</button>
      </div>
    </div>
  )
}
