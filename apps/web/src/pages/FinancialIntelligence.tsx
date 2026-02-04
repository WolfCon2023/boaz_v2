import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/http'
import { FinNav } from '@/components/FinNav'
import { FinHubHelpButton } from '@/components/FinHubHelpButton'

// Types
type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
type AccountSubType = string
type NormalBalance = 'Debit' | 'Credit'

type Account = {
  id: string
  accountNumber: string
  name: string
  type: AccountType
  subType: AccountSubType
  normalBalance: NormalBalance
  parentAccountId: string | null
  isActive: boolean
  description: string | null
  taxCode: string | null
  createdAt: string
  updatedAt: string
}

type AccountingPeriod = {
  id: string
  name: string
  startDate: string
  endDate: string
  fiscalYear: number
  fiscalQuarter: number
  fiscalMonth: number
  status: 'open' | 'closed' | 'locked'
  closedAt: string | null
  closedBy: string | null
}

type JournalEntryLine = {
  accountId: string
  accountNumber?: string
  accountName?: string
  debit: number
  credit: number
  description?: string
  departmentId?: string
  projectId?: string
}

type JournalEntry = {
  id: string
  entryNumber: number
  date: string
  postingDate: string | null
  periodId: string | null
  description: string
  sourceType: string
  sourceId: string | null
  lines: JournalEntryLine[]
  status: 'draft' | 'posted' | 'reversed'
  totalDebits: number
  totalCredits: number
  createdAt: string
  createdBy: string
}

type TrialBalanceAccount = {
  accountId: string
  accountNumber: string
  accountName: string
  type: AccountType
  subType: string
  normalBalance: NormalBalance
  totalDebits: number
  totalCredits: number
  balance: number
}

type TrialBalance = {
  asOfDate: string
  periodId: string | null
  accounts: TrialBalanceAccount[]
  totals: {
    debits: number
    credits: number
    difference: number
    isBalanced: boolean
  }
}

type IncomeStatementItem = {
  accountId: string
  accountNumber: string
  accountName: string
  subType: string
  amount: number
}

type IncomeStatement = {
  period: { startDate: string; endDate: string }
  revenue: { items: IncomeStatementItem[]; total: number }
  costOfGoodsSold: { items: IncomeStatementItem[]; total: number }
  grossProfit: number
  operatingExpenses: { items: IncomeStatementItem[]; total: number }
  operatingIncome: number
  otherRevenue: { items: IncomeStatementItem[]; total: number }
  otherExpenses: { items: IncomeStatementItem[]; total: number }
  netIncome: number
}

type BalanceSheetCategory = {
  items: IncomeStatementItem[]
  total: number
}

type BalanceSheet = {
  asOfDate: string
  assets: {
    currentAssets: BalanceSheetCategory
    fixedAssets: BalanceSheetCategory
    otherAssets: BalanceSheetCategory
    total: number
  }
  liabilities: {
    currentLiabilities: BalanceSheetCategory
    longTermLiabilities: BalanceSheetCategory
    total: number
  }
  equity: { items: IncomeStatementItem[]; total: number }
  totalLiabilitiesAndEquity: number
  isBalanced: boolean
}

type CashFlowStatement = {
  period: { startDate: string; endDate: string }
  operatingActivities: {
    netIncome: number
    adjustments: {
      accountsReceivable: number
      accountsPayable: number
      accruedExpenses: number
      deferredRevenue: number
    }
    total: number
  }
  investingActivities: {
    capitalExpenditures: number
    total: number
  }
  financingActivities: {
    debtAndEquityChanges: number
    total: number
  }
  netCashChange: number
  totalFromActivities: number
}

type AccountDrillDown = {
  account: {
    id: string
    accountNumber: string
    name: string
    type: AccountType
    subType: string
    normalBalance: string
  }
  transactions: Array<{
    id: string
    entryNumber: number
    date: string
    description: string
    sourceType: string
    debit: number
    credit: number
    balance: number
  }>
  summary: {
    totalTransactions: number
    endingBalance: number
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Expense types
type ExpenseStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'void'

type Expense = {
  id: string
  expenseNumber: number
  vendorId: string | null
  vendorName: string | null
  date: string
  dueDate: string | null
  description: string
  category: string
  lines: Array<{
    accountId: string
    accountNumber?: string
    accountName?: string
    amount: number
    description?: string
  }>
  subtotal: number
  tax: number
  total: number
  status: ExpenseStatus
  paymentMethod: string | null
  journalEntryId: string | null
  createdAt: string
}

type FinancialKPIs = {
  period: { startDate: string; endDate: string }
  profitability: {
    ytdRevenue: number
    ytdCOGS: number
    ytdGrossProfit: number
    ytdOperatingExpenses: number
    ytdNetIncome: number
    grossMargin: number
    operatingMargin: number
    netMargin: number
  }
  liquidity: {
    currentRatio: number
    quickRatio: number
    currentAssets: number
    currentLiabilities: number
  }
  efficiency: {
    dso: number
    accountsReceivable: number
  }
  leverage: {
    debtToEquity: number
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
  }
  trend: Array<{
    period: string
    revenue: number
    expenses: number
    netIncome: number
  }>
  forecast: {
    nextPeriodRevenue: number
    confidence: string
  }
  insights: Array<{
    type: 'positive' | 'warning' | 'info'
    title: string
    description: string
  }>
}

export default function FinancialIntelligence() {
  const queryClient = useQueryClient()

  const [view, setView] = React.useState<'dashboard' | 'coa' | 'periods' | 'journal' | 'statements' | 'expenses'>('dashboard')
  const [showNewAccount, setShowNewAccount] = React.useState(false)
  const [showNewPeriod, setShowNewPeriod] = React.useState(false)
  const [showNewEntry, setShowNewEntry] = React.useState(false)
  const [showNewExpense, setShowNewExpense] = React.useState(false)
  const [editingAccountId, setEditingAccountId] = React.useState<string | null>(null)
  const [coaTypeFilter, setCoaTypeFilter] = React.useState<AccountType | ''>('')
  const [statementType, setStatementType] = React.useState<'income' | 'balance' | 'trial' | 'cashflow'>('trial')
  const [drillDownAccountId, setDrillDownAccountId] = React.useState<string | null>(null)

  // New account form state
  const [newAccount, setNewAccount] = React.useState({
    accountNumber: '',
    name: '',
    type: 'Asset' as AccountType,
    subType: 'Current Asset',
    description: '',
    taxCode: '',
  })

  // New period form state
  const [newPeriodYear, setNewPeriodYear] = React.useState(new Date().getFullYear())

  // New journal entry form state
  const [newEntry, setNewEntry] = React.useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    lines: [
      { accountId: '', debit: 0, credit: 0, description: '' },
      { accountId: '', debit: 0, credit: 0, description: '' },
    ] as Array<{ accountId: string; debit: number; credit: number; description: string }>,
  })

  // New expense form state
  const [newExpense, setNewExpense] = React.useState({
    date: new Date().toISOString().split('T')[0],
    vendorName: '',
    description: '',
    category: 'Office Expenses',
    lines: [
      { accountId: '', amount: 0, description: '' },
    ] as Array<{ accountId: string; amount: number; description: string }>,
    tax: 0,
    paymentMethod: 'Check',
  })

  // Queries
  const coaQ = useQuery<{ data: { items: Account[] } }>({
    queryKey: ['fi-coa', coaTypeFilter],
    queryFn: async () => {
      const params: any = { includeInactive: 'true' }
      if (coaTypeFilter) params.type = coaTypeFilter
      const res = await http.get('/api/financial/chart-of-accounts', { params })
      return res.data
    },
  })

  const periodsQ = useQuery<{ data: { items: AccountingPeriod[] } }>({
    queryKey: ['fi-periods'],
    queryFn: async () => {
      const res = await http.get('/api/financial/periods')
      return res.data
    },
  })

  const journalQ = useQuery<{ data: { items: JournalEntry[]; total: number } }>({
    queryKey: ['fi-journal'],
    queryFn: async () => {
      const res = await http.get('/api/financial/journal-entries', { params: { limit: 100 } })
      return res.data
    },
    enabled: view === 'journal' || view === 'dashboard',
  })

  const trialBalanceQ = useQuery<{ data: TrialBalance }>({
    queryKey: ['fi-trial-balance'],
    queryFn: async () => {
      const res = await http.get('/api/financial/trial-balance')
      return res.data
    },
    enabled: view === 'statements' || view === 'dashboard',
  })

  const incomeStatementQ = useQuery<{ data: IncomeStatement }>({
    queryKey: ['fi-income-statement'],
    queryFn: async () => {
      const res = await http.get('/api/financial/income-statement')
      return res.data
    },
    enabled: view === 'statements',
  })

  const balanceSheetQ = useQuery<{ data: BalanceSheet }>({
    queryKey: ['fi-balance-sheet'],
    queryFn: async () => {
      const res = await http.get('/api/financial/balance-sheet')
      return res.data
    },
    enabled: view === 'statements',
  })

  const cashFlowQ = useQuery<{ data: CashFlowStatement }>({
    queryKey: ['fi-cash-flow'],
    queryFn: async () => {
      const res = await http.get('/api/financial/cash-flow-statement')
      return res.data
    },
    enabled: view === 'statements' && statementType === 'cashflow',
  })

  const drillDownQ = useQuery<{ data: AccountDrillDown }>({
    queryKey: ['fi-drill-down', drillDownAccountId],
    queryFn: async () => {
      const res = await http.get(`/api/financial/account-drill-down/${drillDownAccountId}`)
      return res.data
    },
    enabled: !!drillDownAccountId,
  })

  const kpisQ = useQuery<{ data: FinancialKPIs }>({
    queryKey: ['fi-kpis'],
    queryFn: async () => {
      const res = await http.get('/api/financial/analytics/kpis')
      return res.data
    },
    enabled: view === 'dashboard',
  })

  const expensesQ = useQuery<{ data: { items: Expense[]; total: number } }>({
    queryKey: ['fi-expenses'],
    queryFn: async () => {
      const res = await http.get('/api/financial/expenses', { params: { limit: 100 } })
      return res.data
    },
    enabled: view === 'expenses',
  })

  const expenseCategoriesQ = useQuery<{ data: { categories: string[] } }>({
    queryKey: ['fi-expense-categories'],
    queryFn: async () => {
      const res = await http.get('/api/financial/expense-categories')
      return res.data
    },
    enabled: view === 'expenses' || showNewExpense,
  })

  // Mutations
  const seedCoaMutation = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/financial/chart-of-accounts/seed-default')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-coa'] })
    },
  })

  // Auto-posting mutations
  const autoPostInvoicesMutation = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/financial/auto-post/invoices')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
    },
  })

  const autoPostPaymentsMutation = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/financial/auto-post/payments')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
    },
  })

  const autoPostTimeEntriesMutation = useMutation({
    mutationFn: async (hourlyRate: number = 75) => {
      const res = await http.post('/api/financial/auto-post/time-entries', { hourlyRate })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
    },
  })

  const autoPostRenewalsMutation = useMutation({
    mutationFn: async () => {
      const res = await http.post('/api/financial/auto-post/renewals')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
    },
  })

  // Expense mutations
  const createExpenseMutation = useMutation({
    mutationFn: async (data: typeof newExpense) => {
      const res = await http.post('/api/financial/expenses', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-expenses'] })
      setShowNewExpense(false)
      setNewExpense({
        date: new Date().toISOString().split('T')[0],
        vendorName: '',
        description: '',
        category: 'Office Expenses',
        lines: [{ accountId: '', amount: 0, description: '' }],
        tax: 0,
        paymentMethod: 'Check',
      })
    },
  })

  const approveExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/financial/expenses/${id}/approve`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-expenses'] })
    },
  })

  const payExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/financial/expenses/${id}/pay`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
    },
  })

  const voidExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/financial/expenses/${id}/void`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-expenses'] })
    },
  })

  const createAccountMutation = useMutation({
    mutationFn: async (data: typeof newAccount) => {
      const res = await http.post('/api/financial/chart-of-accounts', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-coa'] })
      setShowNewAccount(false)
      setNewAccount({ accountNumber: '', name: '', type: 'Asset', subType: 'Current Asset', description: '', taxCode: '' })
    },
  })

  const updateAccountMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; description?: string; isActive?: boolean }) => {
      const res = await http.patch(`/api/financial/chart-of-accounts/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-coa'] })
      setEditingAccountId(null)
    },
  })

  const generatePeriodsMutation = useMutation({
    mutationFn: async (fiscalYear: number) => {
      const res = await http.post('/api/financial/periods/generate-year', { fiscalYear })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-periods'] })
      setShowNewPeriod(false)
    },
  })

  const closePeriodMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.patch(`/api/financial/periods/${id}/close`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-periods'] })
    },
  })

  const reopenPeriodMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.patch(`/api/financial/periods/${id}/reopen`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-periods'] })
    },
  })

  const createEntryMutation = useMutation({
    mutationFn: async (data: typeof newEntry) => {
      const res = await http.post('/api/financial/journal-entries', {
        ...data,
        sourceType: 'manual',
        lines: data.lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0)),
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
      setShowNewEntry(false)
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        description: '',
        lines: [
          { accountId: '', debit: 0, credit: 0, description: '' },
          { accountId: '', debit: 0, credit: 0, description: '' },
        ],
      })
    },
  })

  const reverseEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await http.post(`/api/financial/journal-entries/${id}/reverse`)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fi-journal'] })
      queryClient.invalidateQueries({ queryKey: ['fi-trial-balance'] })
      queryClient.invalidateQueries({ queryKey: ['fi-income-statement'] })
      queryClient.invalidateQueries({ queryKey: ['fi-balance-sheet'] })
    },
  })

  const accounts = coaQ.data?.data?.items || []
  const periods = periodsQ.data?.data?.items || []
  const journalEntries = journalQ.data?.data?.items || []
  const trialBalance = trialBalanceQ.data?.data
  const incomeStatement = incomeStatementQ.data?.data
  const balanceSheet = balanceSheetQ.data?.data
  const cashFlow = cashFlowQ.data?.data
  const drillDown = drillDownQ.data?.data
  const kpis = kpisQ.data?.data
  const expenses = expensesQ.data?.data?.items || []
  const expenseCategories = expenseCategoriesQ.data?.data?.categories || []

  // Expense form totals
  const expenseSubtotal = newExpense.lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0)
  const expenseTotal = expenseSubtotal + (Number(newExpense.tax) || 0)

  // Sub-type options based on account type
  const subTypeOptions: Record<AccountType, string[]> = {
    Asset: ['Current Asset', 'Non-Current Asset', 'Fixed Asset'],
    Liability: ['Current Liability', 'Long-Term Liability'],
    Equity: ['Equity', 'Retained Earnings'],
    Revenue: ['Operating Revenue', 'Other Revenue'],
    Expense: ['COGS', 'Operating Expense', 'Other Expense'],
  }

  // Calculate totals for new entry validation
  const entryTotalDebits = newEntry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const entryTotalCredits = newEntry.lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
  const entryIsBalanced = Math.abs(entryTotalDebits - entryTotalCredits) < 0.01

  return (
    <div className="min-h-screen bg-[color:var(--color-bg)]">
      <FinNav />

      <div className="mx-auto max-w-7xl p-4 md:p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">Financial Intelligence</h1>
              <p className="text-sm text-[color:var(--color-text-muted)]">GAAP-compliant accounting with full audit trail</p>
            </div>
            <FinHubHelpButton tag="finhub:financial-intelligence" />
          </div>
        </div>

        {/* View Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {(['dashboard', 'coa', 'periods', 'journal', 'expenses', 'statements'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
                view === v
                  ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                  : 'border-[color:var(--color-border)] bg-[color:var(--color-panel)] hover:bg-[color:var(--color-muted)]'
              }`}
            >
              {v === 'coa' ? 'Chart of Accounts' : v === 'journal' ? 'Journal Entries' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Dashboard View */}
        {view === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                <div className="text-xs text-[color:var(--color-text-muted)]">Total Accounts</div>
                <div className="mt-1 text-2xl font-semibold">{accounts.length}</div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{accounts.filter(a => a.isActive).length} active</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                <div className="text-xs text-[color:var(--color-text-muted)]">Journal Entries</div>
                <div className="mt-1 text-2xl font-semibold">{journalEntries.length}</div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{journalEntries.filter(e => e.status === 'posted').length} posted</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                <div className="text-xs text-[color:var(--color-text-muted)]">Open Periods</div>
                <div className="mt-1 text-2xl font-semibold">{periods.filter(p => p.status === 'open').length}</div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">of {periods.length} total</div>
              </div>
              <div className={`rounded-2xl border p-4 ${trialBalance?.totals?.isBalanced ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                <div className={`text-xs ${trialBalance?.totals?.isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>Trial Balance</div>
                <div className={`mt-1 text-2xl font-semibold ${trialBalance?.totals?.isBalanced ? 'text-emerald-300' : 'text-red-300'}`}>
                  {trialBalance?.totals?.isBalanced ? 'Balanced' : 'Unbalanced'}
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {trialBalance?.totals?.difference !== undefined && trialBalance.totals.difference !== 0
                    ? `Diff: ${formatCurrency(trialBalance.totals.difference)}`
                    : 'Debits = Credits'}
                </div>
              </div>
            </div>

            {/* Financial KPIs */}
            {kpis && (
              <div className="space-y-4">
                {/* Profitability Metrics */}
                <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                  <h2 className="mb-4 text-sm font-semibold">Profitability (YTD)</h2>
                  <div className="grid gap-4 md:grid-cols-5">
                    <div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">Revenue</div>
                      <div className="mt-1 text-xl font-semibold text-emerald-400">{formatCurrency(kpis.profitability.ytdRevenue)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">COGS</div>
                      <div className="mt-1 text-xl font-semibold text-red-400">{formatCurrency(kpis.profitability.ytdCOGS)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">Gross Profit</div>
                      <div className={`mt-1 text-xl font-semibold ${kpis.profitability.ytdGrossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(kpis.profitability.ytdGrossProfit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">Operating Expenses</div>
                      <div className="mt-1 text-xl font-semibold text-amber-400">{formatCurrency(kpis.profitability.ytdOperatingExpenses)}</div>
                    </div>
                    <div className={`rounded-xl p-3 ${kpis.profitability.ytdNetIncome >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                      <div className={`text-xs ${kpis.profitability.ytdNetIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Net Income</div>
                      <div className={`mt-1 text-xl font-bold ${kpis.profitability.ytdNetIncome >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {formatCurrency(kpis.profitability.ytdNetIncome)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-center">
                      <div className="text-xs text-[color:var(--color-text-muted)]">Gross Margin</div>
                      <div className={`text-lg font-semibold ${kpis.profitability.grossMargin >= 50 ? 'text-emerald-400' : kpis.profitability.grossMargin >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                        {kpis.profitability.grossMargin}%
                      </div>
                    </div>
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-center">
                      <div className="text-xs text-[color:var(--color-text-muted)]">Operating Margin</div>
                      <div className={`text-lg font-semibold ${kpis.profitability.operatingMargin >= 20 ? 'text-emerald-400' : kpis.profitability.operatingMargin >= 10 ? 'text-amber-400' : 'text-red-400'}`}>
                        {kpis.profitability.operatingMargin}%
                      </div>
                    </div>
                    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3 text-center">
                      <div className="text-xs text-[color:var(--color-text-muted)]">Net Margin</div>
                      <div className={`text-lg font-semibold ${kpis.profitability.netMargin >= 15 ? 'text-emerald-400' : kpis.profitability.netMargin >= 5 ? 'text-amber-400' : 'text-red-400'}`}>
                        {kpis.profitability.netMargin}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Financial Health Ratios */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                    <h2 className="mb-3 text-sm font-semibold">Liquidity</h2>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[color:var(--color-text-muted)]">Current Ratio</span>
                        <span className={`text-lg font-semibold ${kpis.liquidity.currentRatio >= 2 ? 'text-emerald-400' : kpis.liquidity.currentRatio >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                          {kpis.liquidity.currentRatio.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[color:var(--color-text-muted)]">Quick Ratio</span>
                        <span className={`text-lg font-semibold ${kpis.liquidity.quickRatio >= 1.5 ? 'text-emerald-400' : kpis.liquidity.quickRatio >= 1 ? 'text-amber-400' : 'text-red-400'}`}>
                          {kpis.liquidity.quickRatio.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-2">
                        <span className="text-xs text-[color:var(--color-text-muted)]">Current Assets</span>
                        <span className="text-sm">{formatCurrency(kpis.liquidity.currentAssets)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[color:var(--color-text-muted)]">Current Liabilities</span>
                        <span className="text-sm">{formatCurrency(kpis.liquidity.currentLiabilities)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                    <h2 className="mb-3 text-sm font-semibold">Efficiency &amp; Leverage</h2>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[color:var(--color-text-muted)]">Days Sales Outstanding</span>
                        <span className={`text-lg font-semibold ${kpis.efficiency.dso <= 30 ? 'text-emerald-400' : kpis.efficiency.dso <= 45 ? 'text-amber-400' : 'text-red-400'}`}>
                          {kpis.efficiency.dso} days
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[color:var(--color-text-muted)]">Debt to Equity</span>
                        <span className={`text-lg font-semibold ${kpis.leverage.debtToEquity <= 1 ? 'text-emerald-400' : kpis.leverage.debtToEquity <= 2 ? 'text-amber-400' : 'text-red-400'}`}>
                          {kpis.leverage.debtToEquity.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-[color:var(--color-border)] pt-2">
                        <span className="text-xs text-[color:var(--color-text-muted)]">Total Equity</span>
                        <span className="text-sm">{formatCurrency(kpis.leverage.totalEquity)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[color:var(--color-text-muted)]">AR Balance</span>
                        <span className="text-sm">{formatCurrency(kpis.efficiency.accountsReceivable)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Revenue Trend */}
                {kpis.trend.length > 0 && (
                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold">Revenue &amp; Expense Trend</h2>
                      {kpis.forecast.nextPeriodRevenue > 0 && (
                        <div className="text-xs text-[color:var(--color-text-muted)]">
                          Forecast: {formatCurrency(kpis.forecast.nextPeriodRevenue)} <span className="opacity-60">({kpis.forecast.confidence} confidence)</span>
                        </div>
                      )}
                    </div>
                    {/* Summary totals */}
                    <div className="mb-4 grid grid-cols-3 gap-4 text-center">
                      <div className="rounded-lg bg-emerald-500/10 p-2">
                        <div className="text-[10px] text-emerald-400">Total Revenue</div>
                        <div className="text-sm font-semibold text-emerald-400">
                          {formatCurrency(kpis.trend.reduce((sum, t) => sum + t.revenue, 0))}
                        </div>
                      </div>
                      <div className="rounded-lg bg-red-500/10 p-2">
                        <div className="text-[10px] text-red-400">Total Expenses</div>
                        <div className="text-sm font-semibold text-red-400">
                          {formatCurrency(kpis.trend.reduce((sum, t) => sum + t.expenses, 0))}
                        </div>
                      </div>
                      <div className="rounded-lg bg-blue-500/10 p-2">
                        <div className="text-[10px] text-blue-400">Net Income</div>
                        <div className="text-sm font-semibold text-blue-400">
                          {formatCurrency(kpis.trend.reduce((sum, t) => sum + t.revenue - t.expenses, 0))}
                        </div>
                      </div>
                    </div>
                    {/* Bar chart with values */}
                    <div className="space-y-1">
                      {kpis.trend.map((t, idx) => {
                        const maxVal = Math.max(...kpis.trend.map(d => Math.max(d.revenue, d.expenses)), 1)
                        const revPct = Math.max(Math.round((t.revenue / maxVal) * 100), t.revenue > 0 ? 5 : 0)
                        const expPct = Math.max(Math.round((t.expenses / maxVal) * 100), t.expenses > 0 ? 5 : 0)
                        return (
                          <div key={idx} className="grid grid-cols-[60px_1fr_80px] gap-2 items-center text-xs">
                            <div className="text-[color:var(--color-text-muted)] text-right">{t.period.slice(-5)}</div>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-4 bg-emerald-600 rounded transition-all flex items-center justify-end pr-1"
                                  style={{ width: `${revPct}%`, minWidth: t.revenue > 0 ? '20px' : '0' }}
                                >
                                  {t.revenue > 0 && <span className="text-[9px] text-white font-medium">{formatCurrency(t.revenue)}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-4 bg-red-600 rounded transition-all flex items-center justify-end pr-1"
                                  style={{ width: `${expPct}%`, minWidth: t.expenses > 0 ? '20px' : '0' }}
                                >
                                  {t.expenses > 0 && <span className="text-[9px] text-white font-medium">{formatCurrency(t.expenses)}</span>}
                                </div>
                              </div>
                            </div>
                            <div className={`text-right font-mono ${t.revenue - t.expenses >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatCurrency(t.revenue - t.expenses)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-3 flex gap-4 justify-center text-[10px] border-t border-[color:var(--color-border)] pt-3">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600"></span> Revenue</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600"></span> Expenses</span>
                      <span className="flex items-center gap-1 text-[color:var(--color-text-muted)]">Net = Revenue - Expenses</span>
                    </div>
                  </div>
                )}

                {/* AI Insights */}
                {kpis.insights.length > 0 && (
                  <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                    <h2 className="mb-3 text-sm font-semibold">AI Insights</h2>
                    <div className="space-y-2">
                      {kpis.insights.map((insight, idx) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            insight.type === 'positive'
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : insight.type === 'warning'
                                ? 'border-amber-500/30 bg-amber-500/5'
                                : 'border-blue-500/30 bg-blue-500/5'
                          }`}
                        >
                          <span className={`mt-0.5 text-lg ${
                            insight.type === 'positive' ? 'text-emerald-400' : insight.type === 'warning' ? 'text-amber-400' : 'text-blue-400'
                          }`}>
                            {insight.type === 'positive' ? '↑' : insight.type === 'warning' ? '⚠' : 'ⓘ'}
                          </span>
                          <div className="flex-1">
                            <div className={`text-sm font-semibold ${
                              insight.type === 'positive' ? 'text-emerald-300' : insight.type === 'warning' ? 'text-amber-300' : 'text-blue-300'
                            }`}>
                              {insight.title}
                            </div>
                            <div className="text-xs text-[color:var(--color-text-muted)]">{insight.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Getting Started */}
            {accounts.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
                <h2 className="text-lg font-semibold">Get Started with Financial Intelligence</h2>
                <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
                  Seed the default Chart of Accounts to begin tracking your financial data with GAAP-compliant double-entry accounting.
                </p>
                <button
                  type="button"
                  onClick={() => seedCoaMutation.mutate()}
                  disabled={seedCoaMutation.isPending}
                  className="mt-4 rounded-lg bg-[color:var(--color-primary-600)] px-6 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                >
                  {seedCoaMutation.isPending ? 'Seeding...' : 'Seed Default Chart of Accounts'}
                </button>
                {seedCoaMutation.isSuccess && (
                  <div className="mt-2 text-sm text-emerald-400">
                    Chart of Accounts seeded successfully!
                  </div>
                )}
              </div>
            )}

            {/* Auto-Posting Panel */}
            {accounts.length > 0 && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                <h2 className="mb-3 text-sm font-semibold">Auto-Post Transactions</h2>
                <p className="mb-4 text-xs text-[color:var(--color-text-muted)]">
                  Automatically create journal entries from existing invoices, payments, time entries, and renewals.
                  Only unposted transactions will be processed.
                </p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                    <div className="text-xs font-medium mb-2">Invoices</div>
                    <button
                      type="button"
                      onClick={() => autoPostInvoicesMutation.mutate()}
                      disabled={autoPostInvoicesMutation.isPending}
                      className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {autoPostInvoicesMutation.isPending ? 'Posting...' : 'Post Invoices'}
                    </button>
                    {autoPostInvoicesMutation.isSuccess && autoPostInvoicesMutation.data?.data && (
                      <div className="mt-2 text-[10px] text-emerald-400">
                        Posted: {autoPostInvoicesMutation.data.data.posted}, Skipped: {autoPostInvoicesMutation.data.data.skipped}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                    <div className="text-xs font-medium mb-2">Payments</div>
                    <button
                      type="button"
                      onClick={() => autoPostPaymentsMutation.mutate()}
                      disabled={autoPostPaymentsMutation.isPending}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {autoPostPaymentsMutation.isPending ? 'Posting...' : 'Post Payments'}
                    </button>
                    {autoPostPaymentsMutation.isSuccess && autoPostPaymentsMutation.data?.data && (
                      <div className="mt-2 text-[10px] text-emerald-400">
                        Posted: {autoPostPaymentsMutation.data.data.posted}, Skipped: {autoPostPaymentsMutation.data.data.skipped}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                    <div className="text-xs font-medium mb-2">Time Entries</div>
                    <button
                      type="button"
                      onClick={() => autoPostTimeEntriesMutation.mutate(75)}
                      disabled={autoPostTimeEntriesMutation.isPending}
                      className="w-full rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {autoPostTimeEntriesMutation.isPending ? 'Posting...' : 'Post Time ($75/hr)'}
                    </button>
                    {autoPostTimeEntriesMutation.isSuccess && autoPostTimeEntriesMutation.data?.data && (
                      <div className="mt-2 text-[10px] text-emerald-400">
                        Posted: {autoPostTimeEntriesMutation.data.data.posted}, Skipped: {autoPostTimeEntriesMutation.data.data.skipped}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-3">
                    <div className="text-xs font-medium mb-2">Renewals</div>
                    <button
                      type="button"
                      onClick={() => autoPostRenewalsMutation.mutate()}
                      disabled={autoPostRenewalsMutation.isPending}
                      className="w-full rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {autoPostRenewalsMutation.isPending ? 'Posting...' : 'Post Renewals'}
                    </button>
                    {autoPostRenewalsMutation.isSuccess && autoPostRenewalsMutation.data?.data && (
                      <div className="mt-2 text-[10px] text-emerald-400">
                        Posted: {autoPostRenewalsMutation.data.data.posted}, Skipped: {autoPostRenewalsMutation.data.data.skipped}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Journal Entries */}
            {journalEntries.length > 0 && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-4">
                <h2 className="mb-4 text-sm font-semibold">Recent Journal Entries</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                        <th className="px-2 py-2 text-left">Entry #</th>
                        <th className="px-2 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-left">Description</th>
                        <th className="px-2 py-2 text-center">Source</th>
                        <th className="px-2 py-2 text-right">Debits</th>
                        <th className="px-2 py-2 text-right">Credits</th>
                        <th className="px-2 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalEntries.slice(0, 5).map((entry) => (
                        <tr key={entry.id} className="border-b border-[color:var(--color-border)]">
                          <td className="px-2 py-2 font-medium">JE-{entry.entryNumber}</td>
                          <td className="px-2 py-2">{formatDate(entry.date)}</td>
                          <td className="px-2 py-2 max-w-[200px] truncate">{entry.description}</td>
                          <td className="px-2 py-2 text-center">
                            <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                              {entry.sourceType}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">{formatCurrency(entry.totalDebits)}</td>
                          <td className="px-2 py-2 text-right">{formatCurrency(entry.totalCredits)}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                              entry.status === 'posted' ? 'bg-emerald-500/20 text-emerald-400' :
                              entry.status === 'reversed' ? 'bg-gray-500/20 text-gray-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chart of Accounts View */}
        {view === 'coa' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <select
                  value={coaTypeFilter}
                  onChange={(e) => setCoaTypeFilter(e.target.value as AccountType | '')}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-3 py-2 text-sm"
                >
                  <option value="">All Types</option>
                  <option value="Asset">Assets</option>
                  <option value="Liability">Liabilities</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expenses</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                {accounts.length === 0 && (
                  <button
                    type="button"
                    onClick={() => seedCoaMutation.mutate()}
                    disabled={seedCoaMutation.isPending}
                    className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-panel)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                  >
                    {seedCoaMutation.isPending ? 'Seeding...' : 'Seed Default COA'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNewAccount(true)}
                  className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)]"
                >
                  + New Account
                </button>
              </div>
            </div>

            {/* Accounts Table */}
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-[color:var(--color-muted)]">
                  <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                    <th className="px-3 py-3 text-left">Account #</th>
                    <th className="px-3 py-3 text-left">Name</th>
                    <th className="px-3 py-3 text-center">Type</th>
                    <th className="px-3 py-3 text-center">Sub-Type</th>
                    <th className="px-3 py-3 text-center">Normal Bal.</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-3 font-mono font-semibold">{account.accountNumber}</td>
                      <td className="px-3 py-3">
                        {editingAccountId === account.id ? (
                          <input
                            type="text"
                            defaultValue={account.name}
                            className="w-full rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 text-xs"
                            onBlur={(e) => {
                              if (e.target.value !== account.name) {
                                updateAccountMutation.mutate({ id: account.id, name: e.target.value })
                              } else {
                                setEditingAccountId(null)
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const input = e.target as HTMLInputElement
                                if (input.value !== account.name) {
                                  updateAccountMutation.mutate({ id: account.id, name: input.value })
                                } else {
                                  setEditingAccountId(null)
                                }
                              } else if (e.key === 'Escape') {
                                setEditingAccountId(null)
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span onClick={() => setEditingAccountId(account.id)} className="cursor-pointer hover:underline">
                            {account.name}
                          </span>
                        )}
                        {account.description && (
                          <div className="text-[10px] text-[color:var(--color-text-muted)]">{account.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                          account.type === 'Asset' ? 'bg-blue-500/20 text-blue-400' :
                          account.type === 'Liability' ? 'bg-red-500/20 text-red-400' :
                          account.type === 'Equity' ? 'bg-purple-500/20 text-purple-400' :
                          account.type === 'Revenue' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {account.type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-[10px] text-[color:var(--color-text-muted)]">{account.subType}</td>
                      <td className="px-3 py-3 text-center text-[10px] text-[color:var(--color-text-muted)]">{account.normalBalance}</td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => updateAccountMutation.mutate({ id: account.id, isActive: !account.isActive })}
                          className={`rounded-full px-2 py-0.5 text-[10px] ${account.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingAccountId(account.id)}
                          className="text-[10px] text-[color:var(--color-primary-600)] hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {accounts.length === 0 && (
                <div className="p-8 text-center text-sm text-[color:var(--color-text-muted)]">
                  No accounts found. Seed the default Chart of Accounts to get started.
                </div>
              )}
            </div>

            {/* New Account Modal */}
            {showNewAccount && (
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60">
                <div className="w-[min(90vw,32rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
                  <h2 className="mb-4 text-lg font-semibold">New Account</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Account Number</label>
                        <input
                          type="text"
                          value={newAccount.accountNumber}
                          onChange={(e) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                          placeholder="e.g., 1000"
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Type</label>
                        <select
                          value={newAccount.type}
                          onChange={(e) => {
                            const type = e.target.value as AccountType
                            setNewAccount({ ...newAccount, type, subType: subTypeOptions[type][0] })
                          }}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-gray-900"
                        >
                          <option value="Asset" className="bg-white text-gray-900">Asset</option>
                          <option value="Liability" className="bg-white text-gray-900">Liability</option>
                          <option value="Equity" className="bg-white text-gray-900">Equity</option>
                          <option value="Revenue" className="bg-white text-gray-900">Revenue</option>
                          <option value="Expense" className="bg-white text-gray-900">Expense</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Account Name</label>
                      <input
                        type="text"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                        placeholder="e.g., Cash"
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Sub-Type</label>
                      <select
                        value={newAccount.subType}
                        onChange={(e) => setNewAccount({ ...newAccount, subType: e.target.value })}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-gray-900"
                      >
                        {subTypeOptions[newAccount.type].map((st) => (
                          <option key={st} value={st} className="bg-white text-gray-900">{st}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Description (optional)</label>
                      <input
                        type="text"
                        value={newAccount.description}
                        onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewAccount(false)}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => createAccountMutation.mutate(newAccount)}
                      disabled={!newAccount.accountNumber || !newAccount.name || createAccountMutation.isPending}
                      className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    >
                      {createAccountMutation.isPending ? 'Creating...' : 'Create Account'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Accounting Periods View */}
        {view === 'periods' && (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewPeriod(true)}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)]"
              >
                + Generate Fiscal Year
              </button>
            </div>

            {/* Periods Grid */}
            <div className="grid gap-4 md:grid-cols-4">
              {periods.map((period) => (
                <div key={period.id} className={`rounded-2xl border p-4 ${
                  period.status === 'open' ? 'border-emerald-500/30 bg-emerald-500/5' :
                  period.status === 'closed' ? 'border-amber-500/30 bg-amber-500/5' :
                  'border-red-500/30 bg-red-500/5'
                }`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{period.name}</div>
                      <div className="text-xs text-[color:var(--color-text-muted)]">
                        FY{period.fiscalYear} Q{period.fiscalQuarter}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                      period.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' :
                      period.status === 'closed' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {period.status}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] text-[color:var(--color-text-muted)]">
                    {formatDate(period.startDate)} - {formatDate(period.endDate)}
                  </div>
                  {period.status !== 'locked' && (
                    <div className="mt-3">
                      {period.status === 'open' ? (
                        <button
                          type="button"
                          onClick={() => closePeriodMutation.mutate(period.id)}
                          className="text-xs text-amber-400 hover:underline"
                        >
                          Close Period
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reopenPeriodMutation.mutate(period.id)}
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          Reopen Period
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {periods.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
                <div className="text-sm text-[color:var(--color-text-muted)]">No accounting periods defined.</div>
                <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
                  Generate a fiscal year to create monthly accounting periods.
                </div>
              </div>
            )}

            {/* New Period Modal */}
            {showNewPeriod && (
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60">
                <div className="w-[min(90vw,24rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
                  <h2 className="mb-4 text-lg font-semibold">Generate Fiscal Year</h2>
                  <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
                    This will create 12 monthly accounting periods for the selected fiscal year.
                  </p>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Fiscal Year</label>
                    <select
                      value={newPeriodYear}
                      onChange={(e) => setNewPeriodYear(Number(e.target.value))}
                      className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-gray-900"
                    >
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                        <option key={year} value={year} className="bg-white text-gray-900">{year}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewPeriod(false)}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => generatePeriodsMutation.mutate(newPeriodYear)}
                      disabled={generatePeriodsMutation.isPending}
                      className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    >
                      {generatePeriodsMutation.isPending ? 'Generating...' : 'Generate Periods'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Journal Entries View */}
        {view === 'journal' && (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewEntry(true)}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)]"
              >
                + New Journal Entry
              </button>
            </div>

            {/* Journal Entries Table */}
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-[color:var(--color-muted)]">
                  <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                    <th className="px-3 py-3 text-left">Entry #</th>
                    <th className="px-3 py-3 text-left">Date</th>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3 text-center">Source</th>
                    <th className="px-3 py-3 text-right">Debits</th>
                    <th className="px-3 py-3 text-right">Credits</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {journalEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-3 font-mono font-semibold">JE-{entry.entryNumber}</td>
                      <td className="px-3 py-3">{formatDate(entry.date)}</td>
                      <td className="px-3 py-3 max-w-[200px] truncate" title={entry.description}>{entry.description}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                          {entry.sourceType}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{formatCurrency(entry.totalDebits)}</td>
                      <td className="px-3 py-3 text-right font-mono">{formatCurrency(entry.totalCredits)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                          entry.status === 'posted' ? 'bg-emerald-500/20 text-emerald-400' :
                          entry.status === 'reversed' ? 'bg-gray-500/20 text-gray-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {entry.status === 'posted' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Reverse JE-${entry.entryNumber}? This will create a reversing entry.`)) {
                                reverseEntryMutation.mutate(entry.id)
                              }
                            }}
                            className="text-[10px] text-red-400 hover:underline"
                          >
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {journalEntries.length === 0 && (
                <div className="p-8 text-center text-sm text-[color:var(--color-text-muted)]">
                  No journal entries found. Create one or wait for automatic entries from invoices, payments, and time entries.
                </div>
              )}
            </div>

            {/* New Entry Modal */}
            {showNewEntry && (
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 overflow-y-auto py-8">
                <div className="w-[min(90vw,48rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
                  <h2 className="mb-4 text-lg font-semibold">New Journal Entry</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Date</label>
                        <input
                          type="date"
                          value={newEntry.date}
                          onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Description</label>
                        <input
                          type="text"
                          value={newEntry.description}
                          onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                          placeholder="Enter description"
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium">Entry Lines</label>
                      <div className="space-y-2">
                        <div className="grid grid-cols-[1fr_100px_100px_auto] gap-2 text-[10px] uppercase text-[color:var(--color-text-muted)]">
                          <div>Account</div>
                          <div className="text-right">Debit</div>
                          <div className="text-right">Credit</div>
                          <div></div>
                        </div>
                        {newEntry.lines.map((line, idx) => (
                          <div key={idx} className="grid grid-cols-[1fr_100px_100px_auto] gap-2">
                            <select
                              value={line.accountId}
                              onChange={(e) => {
                                const lines = [...newEntry.lines]
                                lines[idx] = { ...lines[idx], accountId: e.target.value }
                                setNewEntry({ ...newEntry, lines })
                              }}
                              className="rounded-lg border border-[color:var(--color-border)] bg-white px-2 py-1.5 text-sm text-gray-900"
                            >
                              <option value="" className="bg-white text-gray-900">Select account...</option>
                              {accounts.filter(a => a.isActive).map((a) => (
                                <option key={a.id} value={a.id} className="bg-white text-gray-900">
                                  {a.accountNumber} - {a.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.debit || ''}
                              onChange={(e) => {
                                const lines = [...newEntry.lines]
                                lines[idx] = { ...lines[idx], debit: Number(e.target.value) || 0 }
                                setNewEntry({ ...newEntry, lines })
                              }}
                              placeholder="0.00"
                              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-right text-sm"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.credit || ''}
                              onChange={(e) => {
                                const lines = [...newEntry.lines]
                                lines[idx] = { ...lines[idx], credit: Number(e.target.value) || 0 }
                                setNewEntry({ ...newEntry, lines })
                              }}
                              placeholder="0.00"
                              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-right text-sm"
                            />
                            {newEntry.lines.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const lines = newEntry.lines.filter((_, i) => i !== idx)
                                  setNewEntry({ ...newEntry, lines })
                                }}
                                className="px-2 text-red-400 hover:text-red-300"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewEntry({
                            ...newEntry,
                            lines: [...newEntry.lines, { accountId: '', debit: 0, credit: 0, description: '' }],
                          })
                        }}
                        className="mt-2 text-xs text-[color:var(--color-primary-600)] hover:underline"
                      >
                        + Add Line
                      </button>
                    </div>

                    <div className={`rounded-lg p-3 text-sm ${entryIsBalanced ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                      <div className="flex justify-between">
                        <span>Total Debits:</span>
                        <span className="font-mono">{formatCurrency(entryTotalDebits)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Credits:</span>
                        <span className="font-mono">{formatCurrency(entryTotalCredits)}</span>
                      </div>
                      <div className="mt-1 pt-1 border-t border-[color:var(--color-border)] flex justify-between font-semibold">
                        <span>Difference:</span>
                        <span className={`font-mono ${entryIsBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(entryTotalDebits - entryTotalCredits)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewEntry(false)}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => createEntryMutation.mutate(newEntry)}
                      disabled={!newEntry.description || !entryIsBalanced || entryTotalDebits === 0 || createEntryMutation.isPending}
                      className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    >
                      {createEntryMutation.isPending ? 'Creating...' : 'Post Entry'}
                    </button>
                  </div>
                  {createEntryMutation.isError && (
                    <div className="mt-2 text-xs text-red-400">
                      Error: {(createEntryMutation.error as any)?.response?.data?.error || 'Failed to create entry'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expenses View */}
        {view === 'expenses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewExpense(true)}
                className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)]"
              >
                + New Expense
              </button>
            </div>

            {/* Expenses Table */}
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-[color:var(--color-muted)]">
                  <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                    <th className="px-3 py-3 text-left">Expense #</th>
                    <th className="px-3 py-3 text-left">Date</th>
                    <th className="px-3 py-3 text-left">Vendor</th>
                    <th className="px-3 py-3 text-left">Description</th>
                    <th className="px-3 py-3 text-center">Category</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="border-t border-[color:var(--color-border)]">
                      <td className="px-3 py-3 font-mono font-semibold">EXP-{exp.expenseNumber}</td>
                      <td className="px-3 py-3">{formatDate(exp.date)}</td>
                      <td className="px-3 py-3">{exp.vendorName || '-'}</td>
                      <td className="px-3 py-3 max-w-[200px] truncate" title={exp.description}>{exp.description}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{formatCurrency(exp.total)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                          exp.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                          exp.status === 'approved' ? 'bg-blue-500/20 text-blue-400' :
                          exp.status === 'void' ? 'bg-gray-500/20 text-gray-400' :
                          exp.status === 'pending_approval' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-purple-500/20 text-purple-400'
                        }`}>
                          {exp.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {exp.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => approveExpenseMutation.mutate(exp.id)}
                              disabled={approveExpenseMutation.isPending}
                              className="text-[10px] text-blue-400 hover:underline"
                            >
                              Approve
                            </button>
                          )}
                          {exp.status === 'approved' && (
                            <button
                              type="button"
                              onClick={() => payExpenseMutation.mutate(exp.id)}
                              disabled={payExpenseMutation.isPending}
                              className="text-[10px] text-emerald-400 hover:underline"
                            >
                              Pay
                            </button>
                          )}
                          {exp.status !== 'paid' && exp.status !== 'void' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Void expense EXP-${exp.expenseNumber}?`)) {
                                  voidExpenseMutation.mutate(exp.id)
                                }
                              }}
                              className="text-[10px] text-red-400 hover:underline"
                            >
                              Void
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenses.length === 0 && (
                <div className="p-8 text-center text-sm text-[color:var(--color-text-muted)]">
                  No expenses found. Create one to start tracking accounts payable.
                </div>
              )}
            </div>

            {/* New Expense Modal */}
            {showNewExpense && (
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 overflow-y-auto py-8">
                <div className="w-[min(90vw,40rem)] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 shadow-2xl">
                  <h2 className="mb-4 text-lg font-semibold">New Expense</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Date</label>
                        <input
                          type="date"
                          value={newExpense.date}
                          onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Vendor Name</label>
                        <input
                          type="text"
                          value={newExpense.vendorName}
                          onChange={(e) => setNewExpense({ ...newExpense, vendorName: e.target.value })}
                          placeholder="Enter vendor name"
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Description</label>
                      <input
                        type="text"
                        value={newExpense.description}
                        onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                        placeholder="What is this expense for?"
                        className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Category</label>
                        <select
                          value={newExpense.category}
                          onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-gray-900"
                        >
                          {(expenseCategories.length > 0 ? expenseCategories : ['Office Expenses']).map((cat) => (
                            <option key={cat} value={cat} className="bg-white text-gray-900">{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Payment Method</label>
                        <select
                          value={newExpense.paymentMethod}
                          onChange={(e) => setNewExpense({ ...newExpense, paymentMethod: e.target.value })}
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-gray-900"
                        >
                          <option value="Check" className="bg-white text-gray-900">Check</option>
                          <option value="Credit Card" className="bg-white text-gray-900">Credit Card</option>
                          <option value="ACH" className="bg-white text-gray-900">ACH Transfer</option>
                          <option value="Cash" className="bg-white text-gray-900">Cash</option>
                          <option value="Wire" className="text-gray-900">Wire Transfer</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium">Expense Lines (select expense accounts)</label>
                      <div className="space-y-2">
                        {newExpense.lines.map((line, idx) => (
                          <div key={idx} className="grid grid-cols-[1fr_120px_auto] gap-2">
                            <select
                              value={line.accountId}
                              onChange={(e) => {
                                const lines = [...newExpense.lines]
                                lines[idx] = { ...lines[idx], accountId: e.target.value }
                                setNewExpense({ ...newExpense, lines })
                              }}
                              className="rounded-lg border border-[color:var(--color-border)] bg-white px-2 py-1.5 text-sm text-gray-900"
                            >
                              <option value="" className="bg-white text-gray-900">Select expense account...</option>
                              {accounts.filter(a => a.isActive && a.type === 'Expense').map((a) => (
                                <option key={a.id} value={a.id} className="bg-white text-gray-900">
                                  {a.accountNumber} - {a.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.amount || ''}
                              onChange={(e) => {
                                const lines = [...newExpense.lines]
                                lines[idx] = { ...lines[idx], amount: Number(e.target.value) || 0 }
                                setNewExpense({ ...newExpense, lines })
                              }}
                              placeholder="Amount"
                              className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1.5 text-right text-sm"
                            />
                            {newExpense.lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const lines = newExpense.lines.filter((_, i) => i !== idx)
                                  setNewExpense({ ...newExpense, lines })
                                }}
                                className="px-2 text-red-400 hover:text-red-300"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewExpense({
                            ...newExpense,
                            lines: [...newExpense.lines, { accountId: '', amount: 0, description: '' }],
                          })
                        }}
                        className="mt-2 text-xs text-[color:var(--color-primary-600)] hover:underline"
                      >
                        + Add Line
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium">Subtotal</label>
                        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-3 py-2 text-sm font-mono">
                          {formatCurrency(expenseSubtotal)}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Tax</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newExpense.tax || ''}
                          onChange={(e) => setNewExpense({ ...newExpense, tax: Number(e.target.value) || 0 })}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm text-right"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium">Total</label>
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-mono font-semibold text-emerald-400">
                          {formatCurrency(expenseTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewExpense(false)}
                      className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => createExpenseMutation.mutate(newExpense)}
                      disabled={!newExpense.description || expenseTotal <= 0 || !newExpense.lines.some(l => l.accountId && l.amount > 0) || createExpenseMutation.isPending}
                      className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-primary-700)] disabled:opacity-50"
                    >
                      {createExpenseMutation.isPending ? 'Creating...' : 'Create Expense'}
                    </button>
                  </div>
                  {createExpenseMutation.isError && (
                    <div className="mt-2 text-xs text-red-400">
                      Error: {(createExpenseMutation.error as any)?.response?.data?.error || 'Failed to create expense'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Financial Statements View */}
        {view === 'statements' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {(['trial', 'income', 'balance', 'cashflow'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatementType(st)}
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    statementType === st
                      ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                      : 'border-[color:var(--color-border)] bg-[color:var(--color-panel)] hover:bg-[color:var(--color-muted)]'
                  }`}
                >
                  {st === 'trial' ? 'Trial Balance' : st === 'income' ? 'Income Statement' : st === 'balance' ? 'Balance Sheet' : 'Cash Flow'}
                </button>
              ))}
            </div>

            {/* Trial Balance */}
            {statementType === 'trial' && trialBalance && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
                <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-3">
                  <h2 className="font-semibold">Trial Balance</h2>
                  <div className="text-xs text-[color:var(--color-text-muted)]">As of {formatDate(trialBalance.asOfDate)}</div>
                </div>
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-[10px] uppercase text-[color:var(--color-text-muted)]">
                      <th className="px-4 py-2 text-left">Account #</th>
                      <th className="px-4 py-2 text-left">Account Name</th>
                      <th className="px-4 py-2 text-center">Type</th>
                      <th className="px-4 py-2 text-right">Debits</th>
                      <th className="px-4 py-2 text-right">Credits</th>
                      <th className="px-4 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance.accounts.map((acct) => (
                      <tr key={acct.accountId} className="border-b border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)] cursor-pointer" onClick={() => setDrillDownAccountId(acct.accountId)}>
                        <td className="px-4 py-2 font-mono">{acct.accountNumber}</td>
                        <td className="px-4 py-2 text-[color:var(--color-primary-600)] hover:underline">{acct.accountName}</td>
                        <td className="px-4 py-2 text-center text-[10px] text-[color:var(--color-text-muted)]">{acct.type}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatCurrency(acct.totalDebits)}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatCurrency(acct.totalCredits)}</td>
                        <td className={`px-4 py-2 text-right font-mono font-semibold ${acct.balance < 0 ? 'text-red-400' : ''}`}>
                          {formatCurrency(acct.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[color:var(--color-muted)]">
                    <tr className="font-semibold">
                      <td className="px-4 py-3" colSpan={3}>Totals</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(trialBalance.totals.debits)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(trialBalance.totals.credits)}</td>
                      <td className={`px-4 py-3 text-right font-mono ${trialBalance.totals.isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                        {trialBalance.totals.isBalanced ? 'Balanced' : formatCurrency(trialBalance.totals.difference)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {trialBalance.accounts.length === 0 && (
                  <div className="p-8 text-center text-sm text-[color:var(--color-text-muted)]">
                    No transactions found. Post journal entries to see trial balance.
                  </div>
                )}
              </div>
            )}

            {/* Income Statement */}
            {statementType === 'income' && incomeStatement && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
                <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-3">
                  <h2 className="font-semibold">Income Statement (P&amp;L)</h2>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {formatDate(incomeStatement.period.startDate)} - {formatDate(incomeStatement.period.endDate)}
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {/* Revenue */}
                  <div>
                    <h3 className="font-semibold text-emerald-400">Revenue</h3>
                    {incomeStatement.revenue.items.map((item) => (
                      <div key={item.accountId} className="flex justify-between py-1 text-sm">
                        <span className="pl-4">{item.accountName}</span>
                        <span className="font-mono">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-1 text-sm font-semibold border-t border-[color:var(--color-border)] mt-1">
                      <span className="pl-4">Total Revenue</span>
                      <span className="font-mono text-emerald-400">{formatCurrency(incomeStatement.revenue.total)}</span>
                    </div>
                  </div>

                  {/* COGS */}
                  {incomeStatement.costOfGoodsSold.items.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-red-400">Cost of Goods Sold</h3>
                      {incomeStatement.costOfGoodsSold.items.map((item) => (
                        <div key={item.accountId} className="flex justify-between py-1 text-sm">
                          <span className="pl-4">{item.accountName}</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1 text-sm font-semibold border-t border-[color:var(--color-border)] mt-1">
                        <span className="pl-4">Total COGS</span>
                        <span className="font-mono text-red-400">{formatCurrency(incomeStatement.costOfGoodsSold.total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Gross Profit */}
                  <div className="flex justify-between py-2 font-semibold bg-[color:var(--color-muted)] rounded-lg px-4">
                    <span>Gross Profit</span>
                    <span className={`font-mono ${incomeStatement.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(incomeStatement.grossProfit)}
                    </span>
                  </div>

                  {/* Operating Expenses */}
                  {incomeStatement.operatingExpenses.items.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-amber-400">Operating Expenses</h3>
                      {incomeStatement.operatingExpenses.items.map((item) => (
                        <div key={item.accountId} className="flex justify-between py-1 text-sm">
                          <span className="pl-4">{item.accountName}</span>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1 text-sm font-semibold border-t border-[color:var(--color-border)] mt-1">
                        <span className="pl-4">Total Operating Expenses</span>
                        <span className="font-mono text-amber-400">{formatCurrency(incomeStatement.operatingExpenses.total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Operating Income */}
                  <div className="flex justify-between py-2 font-semibold bg-[color:var(--color-muted)] rounded-lg px-4">
                    <span>Operating Income</span>
                    <span className={`font-mono ${incomeStatement.operatingIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(incomeStatement.operatingIncome)}
                    </span>
                  </div>

                  {/* Net Income */}
                  <div className={`flex justify-between py-3 font-bold text-lg rounded-lg px-4 ${incomeStatement.netIncome >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    <span>Net Income</span>
                    <span className={`font-mono ${incomeStatement.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(incomeStatement.netIncome)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Balance Sheet */}
            {statementType === 'balance' && balanceSheet && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
                <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-3">
                  <h2 className="font-semibold">Balance Sheet</h2>
                  <div className="text-xs text-[color:var(--color-text-muted)]">As of {formatDate(balanceSheet.asOfDate)}</div>
                </div>
                <div className="p-4 grid gap-6 md:grid-cols-2">
                  {/* Assets */}
                  <div>
                    <h3 className="font-semibold text-blue-400 mb-2">ASSETS</h3>
                    
                    {balanceSheet.assets.currentAssets.items.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-xs uppercase text-[color:var(--color-text-muted)]">Current Assets</h4>
                        {balanceSheet.assets.currentAssets.items.map((item) => (
                          <div key={item.accountId} className="flex justify-between py-1 text-sm">
                            <span className="pl-2">{item.accountName}</span>
                            <span className="font-mono">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between py-1 text-xs font-semibold border-t border-[color:var(--color-border)]">
                          <span className="pl-2">Total Current Assets</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.currentAssets.total)}</span>
                        </div>
                      </div>
                    )}

                    {balanceSheet.assets.fixedAssets.items.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-xs uppercase text-[color:var(--color-text-muted)]">Fixed Assets</h4>
                        {balanceSheet.assets.fixedAssets.items.map((item) => (
                          <div key={item.accountId} className="flex justify-between py-1 text-sm">
                            <span className="pl-2">{item.accountName}</span>
                            <span className="font-mono">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between py-1 text-xs font-semibold border-t border-[color:var(--color-border)]">
                          <span className="pl-2">Total Fixed Assets</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.assets.fixedAssets.total)}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between py-2 font-semibold bg-blue-500/10 rounded-lg px-3 mt-2">
                      <span>TOTAL ASSETS</span>
                      <span className="font-mono text-blue-400">{formatCurrency(balanceSheet.assets.total)}</span>
                    </div>
                  </div>

                  {/* Liabilities & Equity */}
                  <div>
                    <h3 className="font-semibold text-red-400 mb-2">LIABILITIES</h3>
                    
                    {balanceSheet.liabilities.currentLiabilities.items.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-xs uppercase text-[color:var(--color-text-muted)]">Current Liabilities</h4>
                        {balanceSheet.liabilities.currentLiabilities.items.map((item) => (
                          <div key={item.accountId} className="flex justify-between py-1 text-sm">
                            <span className="pl-2">{item.accountName}</span>
                            <span className="font-mono">{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between py-1 text-xs font-semibold border-t border-[color:var(--color-border)]">
                          <span className="pl-2">Total Current Liabilities</span>
                          <span className="font-mono">{formatCurrency(balanceSheet.liabilities.currentLiabilities.total)}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between py-2 font-semibold bg-red-500/10 rounded-lg px-3 mb-4">
                      <span>Total Liabilities</span>
                      <span className="font-mono text-red-400">{formatCurrency(balanceSheet.liabilities.total)}</span>
                    </div>

                    <h3 className="font-semibold text-purple-400 mb-2">EQUITY</h3>
                    {balanceSheet.equity.items.map((item) => (
                      <div key={item.accountId} className="flex justify-between py-1 text-sm">
                        <span className="pl-2">{item.accountName}</span>
                        <span className="font-mono">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-semibold bg-purple-500/10 rounded-lg px-3 mt-2">
                      <span>Total Equity</span>
                      <span className="font-mono text-purple-400">{formatCurrency(balanceSheet.equity.total)}</span>
                    </div>

                    <div className={`flex justify-between py-2 font-bold rounded-lg px-3 mt-4 ${balanceSheet.isBalanced ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                      <span>TOTAL L + E</span>
                      <span className={`font-mono ${balanceSheet.isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(balanceSheet.totalLiabilitiesAndEquity)}
                      </span>
                    </div>
                  </div>
                </div>

                {balanceSheet.isBalanced ? (
                  <div className="border-t border-[color:var(--color-border)] bg-emerald-500/5 px-4 py-2 text-center text-sm text-emerald-400">
                    ✓ Balance Sheet is balanced (Assets = Liabilities + Equity)
                  </div>
                ) : (
                  <div className="border-t border-[color:var(--color-border)] bg-red-500/5 px-4 py-2 text-center text-sm text-red-400">
                    ✗ Balance Sheet is NOT balanced - difference: {formatCurrency(balanceSheet.assets.total - balanceSheet.totalLiabilitiesAndEquity)}
                  </div>
                )}
              </div>
            )}

            {/* Cash Flow Statement */}
            {statementType === 'cashflow' && cashFlow && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] overflow-hidden">
                <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-3">
                  <h2 className="font-semibold">Cash Flow Statement</h2>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {formatDate(cashFlow.period.startDate)} - {formatDate(cashFlow.period.endDate)} (Indirect Method)
                  </div>
                </div>
                <div className="p-4 space-y-6">
                  {/* Operating Activities */}
                  <div>
                    <h3 className="font-semibold text-blue-400 mb-2">CASH FROM OPERATING ACTIVITIES</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-2">Net Income</span>
                        <span className={`font-mono ${cashFlow.operatingActivities.netIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(cashFlow.operatingActivities.netIncome)}
                        </span>
                      </div>
                      <div className="text-xs text-[color:var(--color-text-muted)] pl-2 mt-2 mb-1">Adjustments for working capital changes:</div>
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-4">(Increase)/Decrease in Accounts Receivable</span>
                        <span className="font-mono">{formatCurrency(cashFlow.operatingActivities.adjustments.accountsReceivable)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-4">Increase/(Decrease) in Accounts Payable</span>
                        <span className="font-mono">{formatCurrency(cashFlow.operatingActivities.adjustments.accountsPayable)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-4">Increase/(Decrease) in Accrued Expenses</span>
                        <span className="font-mono">{formatCurrency(cashFlow.operatingActivities.adjustments.accruedExpenses)}</span>
                      </div>
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-4">Increase/(Decrease) in Deferred Revenue</span>
                        <span className="font-mono">{formatCurrency(cashFlow.operatingActivities.adjustments.deferredRevenue)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-semibold border-t border-[color:var(--color-border)] mt-2">
                        <span className="pl-2">Net Cash from Operating Activities</span>
                        <span className={`font-mono ${cashFlow.operatingActivities.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(cashFlow.operatingActivities.total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Investing Activities */}
                  <div>
                    <h3 className="font-semibold text-purple-400 mb-2">CASH FROM INVESTING ACTIVITIES</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-2">Capital Expenditures</span>
                        <span className="font-mono">{formatCurrency(cashFlow.investingActivities.capitalExpenditures)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-semibold border-t border-[color:var(--color-border)] mt-2">
                        <span className="pl-2">Net Cash from Investing Activities</span>
                        <span className={`font-mono ${cashFlow.investingActivities.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(cashFlow.investingActivities.total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financing Activities */}
                  <div>
                    <h3 className="font-semibold text-amber-400 mb-2">CASH FROM FINANCING ACTIVITIES</h3>
                    <div className="space-y-1">
                      <div className="flex justify-between py-1 text-sm">
                        <span className="pl-2">Debt and Equity Changes</span>
                        <span className="font-mono">{formatCurrency(cashFlow.financingActivities.debtAndEquityChanges)}</span>
                      </div>
                      <div className="flex justify-between py-2 font-semibold border-t border-[color:var(--color-border)] mt-2">
                        <span className="pl-2">Net Cash from Financing Activities</span>
                        <span className={`font-mono ${cashFlow.financingActivities.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(cashFlow.financingActivities.total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Net Change in Cash */}
                  <div className={`flex justify-between py-3 font-bold text-lg rounded-lg px-4 ${cashFlow.netCashChange >= 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    <span>NET CHANGE IN CASH</span>
                    <span className={`font-mono ${cashFlow.netCashChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(cashFlow.netCashChange)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {statementType === 'cashflow' && !cashFlow && cashFlowQ.isLoading && (
              <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-8 text-center">
                <div className="text-sm text-[color:var(--color-text-muted)]">Loading cash flow statement...</div>
              </div>
            )}
          </div>
        )}

        {/* Account Drill-Down Modal */}
        {drillDownAccountId && drillDown && (
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/60 overflow-y-auto py-8">
            <div className="w-[min(90vw,56rem)] max-h-[80vh] rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] shadow-2xl flex flex-col">
              <div className="border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)] px-4 py-3 flex items-center justify-between rounded-t-2xl">
                <div>
                  <h2 className="font-semibold">{drillDown.account.accountNumber} - {drillDown.account.name}</h2>
                  <div className="text-xs text-[color:var(--color-text-muted)]">
                    {drillDown.account.type} • {drillDown.account.subType} • Normal Balance: {drillDown.account.normalBalance}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrillDownAccountId(null)}
                  className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-1 text-sm hover:bg-[color:var(--color-muted)]"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-[color:var(--color-text-muted)]">
                    {drillDown.summary.totalTransactions} transactions
                  </div>
                  <div className={`text-sm font-semibold ${drillDown.summary.endingBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Ending Balance: {formatCurrency(drillDown.summary.endingBalance)}
                  </div>
                </div>
                <table className="min-w-full text-xs">
                  <thead className="bg-[color:var(--color-muted)]">
                    <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                      <th className="px-3 py-2 text-left">Entry #</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center">Source</th>
                      <th className="px-3 py-2 text-right">Debit</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.transactions.map((tx) => (
                      <tr key={tx.id} className="border-t border-[color:var(--color-border)]">
                        <td className="px-3 py-2 font-mono">JE-{tx.entryNumber}</td>
                        <td className="px-3 py-2">{formatDate(tx.date)}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate" title={tx.description}>{tx.description}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-0.5 text-[10px]">
                            {tx.sourceType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{tx.debit > 0 ? formatCurrency(tx.debit) : '-'}</td>
                        <td className="px-3 py-2 text-right font-mono">{tx.credit > 0 ? formatCurrency(tx.credit) : '-'}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${tx.balance >= 0 ? '' : 'text-red-400'}`}>
                          {formatCurrency(tx.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {drillDown.transactions.length === 0 && (
                  <div className="p-8 text-center text-sm text-[color:var(--color-text-muted)]">
                    No transactions found for this account.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
