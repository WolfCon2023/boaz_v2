import { getDb } from '../db.js';
const ARTICLES = [
    {
        title: 'FinHub Overview: Your Financial Command Center',
        tags: ['finhub', 'finhub:overview', 'financial', 'revenue'],
        category: 'FinHub',
        body: `# FinHub – Your Financial Command Center

## Overview
**FinHub** is the central hub for all financial operations and intelligence in BOAZ-OS. It combines GAAP-compliant accounting with AI-powered revenue analytics to give you complete visibility into your organization's financial health.

## Applications in FinHub

### Financial Intelligence
A comprehensive double-entry accounting system with:
- Chart of Accounts management
- Journal entries with full audit trail
- Financial statements (Balance Sheet, Income Statement, Cash Flow)
- KPI dashboards and variance analysis
- Accounting period management
- Automatic posting from CRM transactions

### Revenue Intelligence
AI-powered sales analytics including:
- Deal scoring and probability analysis
- Revenue forecasting with confidence intervals
- Rep performance tracking
- Pipeline health monitoring
- At-risk deal identification

## Getting Started
1. Request access to **FinHub** from your system administrator
2. Navigate to **Marketplace → FinHub** to access the app
3. Start with **Financial Intelligence** to set up your Chart of Accounts
4. Use **Revenue Intelligence** to analyze your sales pipeline

## Access Control
FinHub access is controlled by system administrators through the Admin Portal:
- Users must be granted FinHub app access
- Financial data is sensitive and access-controlled
- Both modules share the same access grant

## Integration with CRM
FinHub automatically integrates with CRM modules:
- **Invoices** → Revenue recognition journal entries
- **Payments** → Cash receipt journal entries
- **Expenses** → Expense journal entries when paid
- **Deals** → Pipeline forecasting and analytics
- **Time Entries** → Labor cost analysis

## Best Practices
- **Seed your Chart of Accounts first** before entering transactions
- **Create accounting periods** to enable journal entry posting
- **Review Revenue Intelligence weekly** to catch at-risk deals early
- **Close accounting periods monthly** for accurate financial statements
- **Use the KPI dashboard** to track key financial metrics`,
    },
    {
        title: 'Financial Intelligence: Complete Guide to GAAP-Compliant Accounting',
        tags: ['finhub', 'finhub:financial-intelligence', 'crm:financial', 'financial', 'accounting', 'gaap', 'journal-entries', 'financial-statements', 'kpi', 'expenses', 'chart-of-accounts'],
        category: 'FinHub',
        body: `# Financial Intelligence – GAAP-Compliant Accounting & Financial Statements

## Overview
The **Financial Intelligence** module provides a comprehensive, GAAP-compliant double-entry accounting system integrated directly into BOAZ-OS. It automates financial record-keeping from your CRM transactions and delivers real-time financial statements, KPIs, and AI-powered insights.

## Key Features
- **Chart of Accounts (COA)**: Full asset, liability, equity, revenue, and expense account structure
- **Double-Entry Journal Entries**: Immutable audit trail with automatic balancing validation
- **Accounting Periods**: Fiscal year management with period open/close/lock workflow
- **Financial Statements**: Balance Sheet, Income Statement, Cash Flow Statement
- **KPI Dashboard**: Key financial metrics with trend analysis
- **Auto-Posting**: Automatic journal entries from invoices, payments, time entries, expenses

---

## Getting Started

### Step 1: Seed the Chart of Accounts
1. Navigate to **FinHub → Financial Intelligence**
2. On the Dashboard tab, click **"Seed Default Chart of Accounts"**
3. This creates 50+ standard accounts organized by type:
   - **Assets** (1000-1999): Cash, AR, Inventory, Fixed Assets
   - **Liabilities** (2000-2999): AP, Accrued Expenses, Loans
   - **Equity** (3000-3999): Retained Earnings, Owner's Equity
   - **Revenue** (4000-4999): Service Revenue, Product Revenue
   - **Expenses** (5000-7999): COGS, Operating Expenses, Other Expenses

### Step 2: Create Accounting Periods
1. Go to the **Accounting Periods** tab
2. Click **"Create Period"**
3. Enter period details:
   - **Name**: e.g., "January 2026" or "Q1 2026"
   - **Start Date**: First day of the period
   - **End Date**: Last day of the period
   - **Fiscal Year**: e.g., "2026"
4. Status defaults to **Open** (ready for transactions)

### Step 3: Enable Auto-Posting
Auto-posting automatically creates journal entries from CRM transactions:
- **Invoices**: DR Accounts Receivable, CR Revenue
- **Payments**: DR Cash, CR Accounts Receivable
- **Time Entries**: DR Labor Cost, CR Unbilled Labor
- **Expenses**: DR Expense Account(s), CR Cash (when paid)

---

## Chart of Accounts

### Account Types
| Type | Number Range | Description | Normal Balance |
|------|--------------|-------------|----------------|
| **Asset** | 1000-1999 | What you own | Debit |
| **Liability** | 2000-2999 | What you owe | Credit |
| **Equity** | 3000-3999 | Owner's investment | Credit |
| **Revenue** | 4000-4999 | Income earned | Credit |
| **Expense** | 5000-7999 | Costs incurred | Debit |

### Managing Accounts
**Creating an Account:**
1. Go to **Chart of Accounts** tab
2. Click **"Create Account"**
3. Enter:
   - **Account Number**: Unique identifier (e.g., "1050")
   - **Name**: Descriptive name (e.g., "Petty Cash")
   - **Type**: Asset, Liability, Equity, Revenue, or Expense
   - **Sub-Type**: Optional categorization
   - **Description**: Optional notes
4. Click **Save**

**Editing an Account:**
- Click on any account row to edit
- Change name, description, or sub-type
- Account number and type cannot be changed after creation

---

## Journal Entries

### Creating Manual Journal Entries
1. Go to **Journal Entries** tab
2. Click **"New Journal Entry"**
3. Fill in header information:
   - **Date**: Transaction date
   - **Memo**: Description of the entry
   - **Reference**: Optional reference number
4. Add line items:
   - Select **Account** from dropdown
   - Enter **Debit** or **Credit** amount (not both)
   - Add **Description** for the line
5. Ensure **Debits = Credits** (system validates this)
6. Click **Post Entry**

### Understanding Debits and Credits
| Account Type | Increases With | Decreases With |
|--------------|----------------|----------------|
| Asset | Debit | Credit |
| Liability | Credit | Debit |
| Equity | Credit | Debit |
| Revenue | Credit | Debit |
| Expense | Debit | Credit |

### Auto-Posted Entries
The system automatically creates journal entries for:

**Invoice Created:**
\`\`\`
DR: Accounts Receivable (1200)    $1,000
CR: Service Revenue (4100)        $1,000
\`\`\`

**Payment Received:**
\`\`\`
DR: Cash (1010)                   $1,000
CR: Accounts Receivable (1200)    $1,000
\`\`\`

**Expense Paid:**
\`\`\`
DR: [Expense Category Account]    $500
CR: Cash (1010)                   $500
\`\`\`

---

## Accounting Periods

### Period Statuses
| Status | Description | Allowed Actions |
|--------|-------------|-----------------|
| **Open** | Active period | Post new entries |
| **Closed** | Period ended | No new entries |
| **Locked** | Audit complete | Read-only |

### Period Workflow
1. **Open**: Create and post journal entries
2. **Close**: End-of-period, run financial statements
3. **Lock**: After audit, prevent any changes

### Best Practices
- Create periods at the start of each month
- Close periods within 5-10 business days after month-end
- Lock periods after management review
- Keep at least one period open for current transactions

---

## Financial Statements

### Balance Sheet
Shows your financial position at a point in time:
- **Assets**: Cash, receivables, inventory, equipment
- **Liabilities**: Payables, loans, accrued expenses
- **Equity**: Owner's investment and retained earnings

Formula: **Assets = Liabilities + Equity**

### Income Statement (P&L)
Shows profitability over a period:
- **Revenue**: All income earned
- **Expenses**: All costs incurred
- **Net Income**: Revenue - Expenses

### Cash Flow Statement
Shows cash movement over a period:
- **Operating**: Cash from business operations
- **Investing**: Cash from asset purchases/sales
- **Financing**: Cash from loans/equity

---

## KPI Dashboard

### Key Metrics
| KPI | Description | Formula |
|-----|-------------|---------|
| **Gross Margin** | Revenue minus COGS | (Revenue - COGS) / Revenue |
| **Net Margin** | Revenue minus all expenses | Net Income / Revenue |
| **Current Ratio** | Liquidity measure | Current Assets / Current Liabilities |
| **Quick Ratio** | Immediate liquidity | (Cash + AR) / Current Liabilities |
| **DSO** | Days Sales Outstanding | (AR / Revenue) × Days |
| **Working Capital** | Operating liquidity | Current Assets - Current Liabilities |

### Trend Analysis
- View KPIs over time with period-over-period comparisons
- Identify trends and anomalies
- Set alerts for threshold breaches

---

## Integration with CRM

### Auto-Posting Sources
| Source | Trigger | Journal Entry |
|--------|---------|---------------|
| **Invoice** | Invoice created | DR AR, CR Revenue |
| **Payment** | Payment received | DR Cash, CR AR |
| **Expense** | Expense marked paid | DR Expense, CR Cash |
| **Time Entry** | Time logged | DR Labor Cost, CR Unbilled |
| **Renewal** | Renewal invoiced | DR AR, CR Deferred Revenue |

### Reconciliation
- Match CRM transactions to journal entries
- Identify missing or duplicate entries
- Review auto-posting accuracy monthly

---

## Best Practices

### Monthly Close Process
1. Ensure all transactions are recorded
2. Reconcile bank statements
3. Review auto-posted entries
4. Post any manual adjustments
5. Run financial statements
6. Close the accounting period
7. Review KPIs and variances

### Data Integrity
- Never delete journal entries (void instead)
- Document all manual entries with clear memos
- Review auto-posting rules quarterly
- Lock periods after audit completion

### Compliance
- Follow GAAP principles for revenue recognition
- Maintain supporting documentation for entries
- Keep audit trail intact
- Review financial statements monthly with management`,
    },
    {
        title: 'Revenue Intelligence: AI-Powered Deal Analytics and Forecasting',
        tags: ['finhub', 'finhub:revenue-intelligence', 'crm:revenue-intelligence', 'revenue', 'forecasting', 'ai', 'analytics', 'deals', 'pipeline'],
        category: 'FinHub',
        body: `# Revenue Intelligence – AI-Powered Deal Analytics & Forecasting

## Overview
**Revenue Intelligence** uses AI to score deals, forecast revenue with confidence intervals, and predict rep performance. It helps sales leaders make data-driven decisions and identify risks and opportunities in the pipeline.

## Key Features
- **AI Deal Scoring**: 0-100 score predicting deal likelihood
- **Revenue Forecasting**: Pessimistic, Likely, and Optimistic projections
- **Pipeline Analytics**: Visual breakdown by stage, rep, and probability
- **At-Risk Detection**: Automatic identification of deals needing attention
- **Rep Performance**: Individual and team performance metrics
- **Configurable Scoring**: Customize AI weights for your sales process

---

## Getting Started

### Accessing Revenue Intelligence
1. Navigate to **FinHub → Revenue Intelligence**
2. Requires FinHub app access (granted by system administrator)
3. Dashboard shows current period forecast by default

### Understanding the Interface
- **Forecast Summary**: Pipeline value with pessimistic/likely/optimistic ranges
- **Pipeline Breakdown**: Deals by stage with visual bars
- **Rep Leaderboard**: Performance ranking by rep
- **At-Risk Deals**: Flagged deals requiring attention
- **Scoring Settings**: AI configuration (admin only)

---

## AI Deal Scoring

### How It Works
The AI analyzes multiple factors to generate a 0-100 deal score:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Stage** | 30% | Further stages = higher score |
| **Days in Stage** | 20% | Stuck deals penalized |
| **Activity** | 20% | Recent engagement boosts score |
| **Deal Size** | 10% | Larger deals may have lower probability |
| **Rep History** | 10% | Past performance influences scoring |
| **Data Quality** | 10% | Complete data improves score |

### Score Ranges
| Score | Confidence | Interpretation |
|-------|------------|----------------|
| 80-100 | High | Very likely to close |
| 60-79 | Medium-High | Good probability |
| 40-59 | Medium | Needs attention |
| 20-39 | Medium-Low | At risk |
| 0-19 | Low | Unlikely to close |

### Confidence Levels
- **High**: Strong data, consistent history, advanced stage
- **Medium**: Moderate data, some uncertainty
- **Low**: Incomplete data, early stage, or conflicting signals

---

## Revenue Forecasting

### Forecast Ranges
| Range | Description | Use Case |
|-------|-------------|----------|
| **Pessimistic** | Conservative estimate | Budget planning |
| **Likely** | Expected outcome | Target setting |
| **Optimistic** | Best case scenario | Stretch goals |

### Calculation Method
The forecast uses weighted probability based on:
- **Commit**: Deals in final stages (90%+ probability)
- **Best Case**: High-scoring deals (70-89% probability)
- **Pipeline**: All other active deals (weighted by score)

### Period Selection
- **This Month**: Current month forecast
- **This Quarter**: Current quarter forecast
- **Next Month/Quarter**: Future period projections
- **This Year/Next Year**: Annual forecasts
- **Custom Range**: Specific date range

### Exclude Overdue Deals
Enable **"Exclude overdue"** to remove open deals past their expected close date from forecasts.

---

## Pipeline Analytics

### Pipeline by Stage
Visual breakdown showing:
- Number of deals per stage
- Total value per stage
- Conversion rates between stages
- Average time in each stage

### Pipeline by Rep
Compare rep performance:
- Pipeline value per rep
- Number of deals per rep
- Win rate by rep
- Average deal size

### Pipeline Health Metrics
| Metric | Healthy Range | Warning Signs |
|--------|---------------|---------------|
| **Coverage Ratio** | 3-4x quota | Below 2x |
| **Win Rate** | >25% | Below 15% |
| **Avg Cycle Time** | Industry norm | 2x+ longer |
| **Stage Distribution** | Even spread | Bottlenecks |

---

## At-Risk Deal Detection

### Risk Indicators
Deals are flagged as at-risk when:
- **No Activity**: No engagement for 14+ days
- **Stuck in Stage**: Same stage for 30+ days
- **Stale Close Date**: Pushed back multiple times
- **Missing Data**: Key fields incomplete
- **Low Score**: AI score below threshold

### Managing At-Risk Deals
1. Review flagged deals in the **At-Risk** section
2. Click on a deal to see detailed risk factors
3. Take action: update, engage, or remove from forecast
4. Track recovery over time

### Risk Thresholds (Configurable)
| Threshold | Default | Description |
|-----------|---------|-------------|
| Activity Days | 14 | Days without activity |
| Stage Days | 30 | Days stuck in stage |
| Score Threshold | 40 | Minimum acceptable score |

---

## Rep Performance

### Performance Metrics
| Metric | Description |
|--------|-------------|
| **Closed Won** | Total value closed this period |
| **Win Rate** | Won deals / Total deals |
| **Avg Deal Size** | Average closed deal value |
| **Sales Velocity** | Revenue per day |
| **Pipeline Value** | Current open pipeline |
| **Forecast Accuracy** | Actual vs predicted |

### Leaderboard
- Ranked by closed revenue or pipeline value
- Filterable by period (month, quarter, year)
- Drill-down to individual rep details

### Coaching Opportunities
Identify reps who need support based on:
- Below-average win rates
- Declining deal scores
- High at-risk deal counts
- Forecast accuracy gaps

---

## Scoring Settings (Admin)

### Accessing Settings
1. Click **"Scoring Settings"** in the page header
2. Only visible to users with admin permissions

### Simple Editor
Adjust common settings without JSON:
- **Stage Weights**: Positive/negative by stage
- **Activity Threshold**: Days for "no activity" flag
- **At-Risk Threshold**: Days for "stuck in stage" flag
- **Score Weights**: Factor importance percentages

### Advanced Editor
JSON configuration for:
- Custom scoring formulas
- Additional risk factors
- Rep-specific adjustments
- Industry-specific weights

### Testing Changes
1. Make adjustments in settings
2. Click **"Preview"** to see score changes
3. Review impacted deals
4. Click **"Apply"** to save

---

## Best Practices

### For Sales Managers
- **Review weekly**: Check forecasts and at-risk deals
- **Focus on pipeline health**: Maintain 3-4x coverage
- **Coach based on data**: Use metrics to guide reps
- **Validate forecasts**: Compare AI predictions to reality
- **Adjust thresholds**: Tune for your sales cycle

### For Sales Reps
- **Keep data current**: Update deal stages and close dates
- **Log activities**: Engagement improves scores
- **Review your scores**: Understand what drives probability
- **Address at-risk early**: Don't let deals go stale
- **Be realistic**: Accurate data improves forecasting

### For Executives
- **Use pessimistic for planning**: Conservative budgeting
- **Track forecast accuracy**: Hold teams accountable
- **Monitor trends**: Look for patterns over time
- **Drill into variance**: Understand misses and beats
- **Align compensation**: Reward accurate forecasting

---

## Integration with Financial Intelligence

Revenue Intelligence connects to Financial Intelligence for:
- **Revenue Recognition**: Closed deals → Journal entries
- **Cash Flow Forecasting**: Expected payment timing
- **Budget vs Actual**: Forecast → Actual comparison
- **KPI Alignment**: Sales metrics → Financial metrics

---

## Troubleshooting

### Common Issues

**Scores seem off:**
- Check deal data completeness
- Verify stage mapping in settings
- Review activity logging

**Forecast too high/low:**
- Adjust probability weights
- Check excluded deals
- Verify close date accuracy

**Missing deals:**
- Check filter settings
- Verify deal ownership
- Confirm stage inclusion

### Getting Help
- Click the **?** icon for contextual help
- Contact your system administrator
- Review the FinHub Overview article`,
    },
    {
        title: 'Understanding Financial Statements in BOAZ-OS',
        tags: ['finhub', 'finhub:financial-intelligence', 'financial-statements', 'balance-sheet', 'income-statement', 'cash-flow'],
        category: 'FinHub',
        body: `# Understanding Financial Statements

## Overview
BOAZ-OS Financial Intelligence generates three primary financial statements following GAAP (Generally Accepted Accounting Principles):

1. **Balance Sheet**: Financial position at a point in time
2. **Income Statement**: Profitability over a period
3. **Cash Flow Statement**: Cash movement over a period

---

## Balance Sheet

### What It Shows
The Balance Sheet (Statement of Financial Position) shows what your business:
- **Owns** (Assets)
- **Owes** (Liabilities)
- **Is worth** to owners (Equity)

### The Accounting Equation
**Assets = Liabilities + Equity**

This equation must always balance. If it doesn't, there's an error in your books.

### Asset Categories
| Category | Examples | Account Range |
|----------|----------|---------------|
| **Current Assets** | Cash, AR, Inventory | 1000-1199 |
| **Fixed Assets** | Equipment, Vehicles | 1200-1499 |
| **Other Assets** | Deposits, Intangibles | 1500-1999 |

### Liability Categories
| Category | Examples | Account Range |
|----------|----------|---------------|
| **Current Liabilities** | AP, Accrued Expenses | 2000-2199 |
| **Long-term Liabilities** | Loans, Leases | 2200-2999 |

### Equity Categories
| Category | Examples | Account Range |
|----------|----------|---------------|
| **Owner's Equity** | Capital Contributions | 3000-3199 |
| **Retained Earnings** | Accumulated Profits | 3200-3999 |

---

## Income Statement

### What It Shows
The Income Statement (Profit & Loss Statement) shows:
- **Revenue**: Money earned from operations
- **Expenses**: Costs incurred to generate revenue
- **Net Income**: Profit or loss (Revenue - Expenses)

### Structure
\`\`\`
Revenue
  - Service Revenue
  - Product Revenue
  - Other Revenue
= Total Revenue

Cost of Goods Sold (COGS)
  - Direct Labor
  - Materials
  - Subcontractors
= Gross Profit (Revenue - COGS)

Operating Expenses
  - Salaries & Wages
  - Rent & Utilities
  - Marketing
  - Professional Services
= Operating Income (Gross Profit - OpEx)

Other Income/Expenses
  - Interest Income
  - Interest Expense
= Net Income Before Taxes

Taxes
= Net Income
\`\`\`

### Key Margins
| Margin | Formula | Target |
|--------|---------|--------|
| **Gross Margin** | Gross Profit / Revenue | 50-70% (services) |
| **Operating Margin** | Operating Income / Revenue | 15-25% |
| **Net Margin** | Net Income / Revenue | 10-20% |

---

## Cash Flow Statement

### What It Shows
The Cash Flow Statement shows how cash moved in and out of your business:

### Three Sections

**Operating Activities:**
- Cash from customers
- Cash paid to suppliers
- Cash paid to employees
- Net cash from operations

**Investing Activities:**
- Purchase of equipment
- Sale of assets
- Investments made/sold

**Financing Activities:**
- Loan proceeds
- Loan repayments
- Owner contributions/distributions

### Cash vs Accrual
| Accrual Basis | Cash Basis |
|---------------|------------|
| Revenue when earned | Revenue when received |
| Expenses when incurred | Expenses when paid |
| Shows profitability | Shows cash position |

The Cash Flow Statement reconciles accrual-based income to actual cash movement.

---

## Running Financial Statements

### In Financial Intelligence
1. Go to **FinHub → Financial Intelligence**
2. Select the **Reports** tab
3. Choose report type:
   - Balance Sheet
   - Income Statement
   - Cash Flow Statement
4. Select period or date range
5. Click **Generate**

### Period Selection
- **Balance Sheet**: As of a specific date
- **Income Statement**: For a period (month, quarter, year)
- **Cash Flow**: For a period

### Export Options
- **PDF**: Formatted for printing/sharing
- **Excel**: For further analysis
- **CSV**: For data import

---

## Best Practices

### Monthly Review
1. Generate all three statements
2. Compare to prior month/period
3. Compare to budget
4. Investigate variances
5. Document findings

### Common Red Flags
| Statement | Warning Sign | Possible Cause |
|-----------|--------------|----------------|
| Balance Sheet | Assets ≠ Liabilities + Equity | Posting errors |
| Balance Sheet | Negative cash | Cash management |
| Income Statement | Negative gross margin | Pricing issues |
| Cash Flow | Negative operating cash | AR collection |

### Statement Relationships
- Net Income flows to Retained Earnings
- Cash from Cash Flow matches Balance Sheet cash
- Changes in AR/AP appear on Cash Flow

---

## Glossary

| Term | Definition |
|------|------------|
| **GAAP** | Generally Accepted Accounting Principles |
| **Accrual Basis** | Recording when earned/incurred |
| **Cash Basis** | Recording when received/paid |
| **Working Capital** | Current Assets - Current Liabilities |
| **Liquidity** | Ability to pay short-term obligations |
| **Solvency** | Ability to pay long-term obligations |`,
    },
    {
        title: 'Expense Management and Auto-Posting in FinHub',
        tags: ['finhub', 'finhub:financial-intelligence', 'crm:expenses', 'expenses', 'auto-posting', 'journal-entries', 'approval-workflow'],
        category: 'FinHub',
        body: `# Expense Management and Auto-Posting

## Overview
BOAZ-OS provides a complete expense management workflow that integrates CRM Expenses with Financial Intelligence. When expenses are paid, they automatically post to the General Ledger.

---

## Expense Workflow

### Status Flow
\`\`\`
Draft → Pending Approval → Approved → Paid
                        ↘ Rejected → (Edit & Resubmit)
\`\`\`

### Status Definitions
| Status | Description | Actions Available |
|--------|-------------|-------------------|
| **Draft** | Being created | Edit, Submit, Delete |
| **Pending Approval** | Awaiting manager review | Approve, Reject |
| **Approved** | Ready for payment | Mark Paid |
| **Rejected** | Needs revision | Edit, Resubmit |
| **Paid** | Completed and posted | View Only |
| **Void** | Canceled | View Only |

---

## Creating Expenses

### In CRM Expenses
1. Go to **CRM Hub → Expenses**
2. Click **"New Expense"**
3. Fill in details:
   - **Date**: When expense occurred
   - **Vendor**: Select from vendor list (optional)
   - **Payee**: If not a vendor
   - **Description**: Brief summary
   - **Line Items**: Category, amount, notes
   - **Payment Method**: ACH, Check, Credit Card, etc.
   - **Reference Number**: Check number, transaction ID
   - **Notes**: Additional details
4. Click **Create** (saves as Draft)

### Expense Categories
Each category maps to a Chart of Accounts expense account:

| Category | Account # | Description |
|----------|-----------|-------------|
| Cost of Services | 5000 | Direct service costs |
| Contractor Costs | 5200 | Subcontractors |
| Hosting & Infrastructure | 5300 | Cloud services |
| Salaries & Wages | 6000 | Employee compensation |
| Rent | 6200 | Office space |
| Software Subscriptions | 6300 | SaaS tools |
| Marketing & Advertising | 6400 | Promotion |
| Professional Services | 6500 | Legal, accounting |
| Travel & Entertainment | 6600 | Business travel |
| Office Supplies | 6800 | Supplies |
| Other Expense | 6900 | Miscellaneous |

---

## Approval Workflow

### Submitting for Approval
1. Open a Draft expense
2. Review all details for accuracy
3. Click **"Submit for Approval"**
4. Status changes to Pending Approval

### Approving/Rejecting (Admin Only)
1. Navigate to **CRM Hub → Expenses**
2. Filter by **"Pending Approval"** status
3. Review expense details
4. Click **"Approve"** or **"Reject"**
5. If rejecting, provide a reason

### Resubmitting Rejected Expenses
1. Open the rejected expense
2. Review the rejection reason
3. Click **"Edit & Resubmit"**
4. Make necessary corrections
5. Submit again for approval

---

## Marking Expenses as Paid

### Payment Process
1. Open an Approved expense
2. Verify payment has been made (bank transfer, check, etc.)
3. Click **"Mark Paid"**
4. System automatically:
   - Updates status to Paid
   - Creates journal entry
   - Links journal entry to expense

### Auto-Posted Journal Entry
When an expense is marked paid, the system creates:

\`\`\`
Expense: Office Supplies - $500

Journal Entry:
  DR: Office Supplies (6800)     $500
  CR: Cash (1010)                $500
  Memo: Expense #1001 - Office supplies purchase
\`\`\`

### Multi-Line Expenses
For expenses with multiple categories:

\`\`\`
Expense: Monthly Services - $1,500
  Line 1: Hosting ($800)
  Line 2: Software ($700)

Journal Entry:
  DR: Hosting & Infrastructure (5300)  $800
  DR: Software Subscriptions (6300)    $700
  CR: Cash (1010)                      $1,500
\`\`\`

---

## Viewing Posted Expenses

### In CRM Expenses
- Paid expenses show a **"Posted to GL"** indicator
- Click to view linked journal entry ID

### In Financial Intelligence
1. Go to **FinHub → Financial Intelligence**
2. Navigate to **Journal Entries** tab
3. Filter by reference or search for expense number
4. View complete journal entry details

---

## Requirements for Auto-Posting

### Open Accounting Period
Journal entries can only post to open accounting periods:
- If no open period exists, payment succeeds but no journal entry is created
- Create accounting periods before marking expenses as paid
- Period date must include the expense date

### Chart of Accounts
Required accounts must exist:
- Expense category accounts (5000-6999)
- Cash account (1010)

### Run "Seed Default Chart of Accounts" if accounts are missing

---

## Best Practices

### For Submitters
- Include detailed descriptions
- Attach receipts when possible
- Select correct expense category
- Enter accurate payment information
- Submit promptly for approval

### For Approvers
- Verify expense legitimacy
- Check budget availability
- Review category accuracy
- Approve promptly to maintain cash flow visibility
- Provide clear rejection reasons

### For Finance
- Mark expenses paid promptly
- Reconcile with bank statements
- Review auto-posted entries monthly
- Close accounting periods timely

---

## Troubleshooting

### "No open accounting period"
- Create an accounting period that includes the expense date
- Ensure period status is "Open"

### Journal entry missing
- Verify expense status is "Paid"
- Check for open accounting period
- Confirm Chart of Accounts has required accounts

### Wrong account posted
- Review expense category selection
- Check category-to-account mapping
- Contact admin to correct if needed`,
    },
];
async function seed() {
    const db = await getDb();
    if (!db) {
        console.error('Could not connect to database');
        process.exit(1);
    }
    console.log('Seeding FinHub KB articles...');
    const collection = db.collection('kb_articles');
    let created = 0;
    let updated = 0;
    for (const article of ARTICLES) {
        const existing = await collection.findOne({ title: article.title });
        if (existing) {
            // Update existing article
            await collection.updateOne({ _id: existing._id }, {
                $set: {
                    body: article.body,
                    tags: article.tags,
                    category: article.category,
                    updatedAt: new Date()
                }
            });
            updated++;
            console.log(`  Updated: ${article.title}`);
        }
        else {
            // Create new article
            await collection.insertOne({
                title: article.title,
                body: article.body,
                tags: article.tags,
                category: article.category,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            created++;
            console.log(`  Created: ${article.title}`);
        }
    }
    console.log(`\nFinHub KB seeding complete: ${created} created, ${updated} updated`);
    process.exit(0);
}
seed().catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
});
