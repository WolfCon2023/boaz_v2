import { getDb } from '../db.js'

type ArticleSeed = {
  title: string
  body: string
  tags: string[]
  category: string
}

const ARTICLES: ArticleSeed[] = [
  {
    title: 'Using the Projects & Delivery app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:projects', 'delivery'],
    category: 'Sales & Clients',
    body: `Projects & Delivery – Implementations and onboarding

Purpose
The Projects & Delivery app tracks customer implementations, onboarding work, and internal delivery projects tied to Accounts and Deals.

Opening the app
- Go to CRM Hub → Projects & Delivery

Core concepts
- Project: a delivery engagement or workstream for an account
- Type: implementation, onboarding, change request, or internal
- Status: not started, in progress, on hold, completed, or cancelled
- Health: on track, at risk, or off track

Working with projects
- Use filters for Status, Type, and Health to focus your view
- Link projects to Accounts and Deals for context
- Track start date, target end date, and actual end date for each project

Updating projects
- Use the New project button to add a project with name, type, dates, and health
- Edit projects to adjust scope, status, and progress percentage over time

Best practices
- Keep target end dates and health current so the team can see delivery risk early
- Link projects to the right Accounts and Deals so reporting and renewals stay accurate.`,
  },
  {
    title: 'Using the Contacts app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:contacts', 'getting-started'],
    category: 'Sales & Clients',
    body: `# Contacts – People and relationships

## Purpose
The **Contacts** app is the system of record for individual people you work with: buyers, end‑users, partners, and internal stakeholders.
It powers personalization, outreach, tasking, and reporting across the rest of the CRM.

## Opening the app
- Go to **CRM Hub → Contacts**
- Or use the global CRM navigation bar and choose **Contacts**

## Finding and filtering contacts
- Use the **search bar** at the top of the table to search by name, email, company, or phone
- Use **saved views** to store common filter/sort combinations (e.g. “New this month”)
- Columns can be **shown/hidden and reordered** from the **Columns** menu

## Creating a contact
1. Use the form at the top of the page (Name, Email, Company, Mobile phone, Office phone)
2. Optionally mark the record as **Primary contact** and choose a **Primary phone**
3. Click **Add contact**

## Inline editing
- Click **Edit** in a row to edit key fields inline (Name, Email, Company, phones)
- Use **Save** / **Cancel** to commit or discard changes

## Tasks, surveys, and outreach
- The **Tasks** column shows how many open tasks are linked to each contact
  - Use **Open** to jump into the Tasks & Activities app filtered to this contact
  - Use **Add** to create a quick task (todo) tied to the contact
- The **Survey** column surfaces recent NPS/CSAT activity
- From the contact drawer you can:
  - Enroll the contact into **Outreach sequences**
  - Send a one‑off email
  - View survey history and outreach events

## Contact drawer
Click **Open** on any row to see the full contact drawer:
- Core details (emails, phones, company)
- Outreach enrollments and events
- Related tasks and documents
- Survey programs and one‑click survey sending

## Best practices
- Keep one **primary contact** per account when possible
- Use **tasks** instead of free‑form notes for anything that requires follow‑up
- Use **saved views** (e.g. “Key buying committee”) to track high‑value contacts.`,
  },
  {
    title: 'Using the Accounts app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:accounts', 'getting-started'],
    category: 'Sales & Clients',
    body: `# Accounts – Companies and organizations

## Purpose
The **Accounts** app tracks companies, organizations, or customers.
It is the anchor for contacts, deals, quotes, invoices, renewals, tasks, and assets.

## Opening the app
- Go to **CRM Hub → Accounts**
- Or use the main CRM navigation bar and choose **Accounts**

## Searching and views
- Use the **Search accounts…** box to search by name, company, primary contact, email, or phone
- Sort by **Name, Company, or Account #**
- Use **Saved views** to store reusable filters (e.g. “Key accounts”, “New this month”)
- Use the **Columns** menu to pick which fields appear and drag to reorder columns

## Creating an account
1. Fill out the quick‑add form (Account name, Company name, Primary contact details)
2. Click **Add account**
3. The new account appears at the top of the table

## Inline editing
- Click **Edit** in the row’s Actions column to edit the main fields directly in the table
- Use **Save** / **Cancel** to commit or discard

## Tasks and survey badges
- The **Tasks** column shows open task counts
  - **Open** jumps to the Tasks & Activities app, opening the oldest open task when possible
  - **Add** creates a quick todo task tied to the account
- The **Survey** column summarizes recent NPS/CSAT feedback for the account

## Account drawer
Click **Open** on any row to enter the full‑screen account drawer:
- Edit all core account information
- See **Renewals & Subscriptions** quick‑link for the account
- View an **Installed Base** card with environments, installed products, and upcoming license renewals
- Browse related **Deals, Quotes, Invoices, Activities, Documents, and Tasks**

## Installed Base and asset risk
- The **Installed Base** card shows environment count, product count, and upcoming renewals
- An **Asset risk** badge on the table summarizes expiring licenses and products needing upgrade

## Best practices
- Keep Accounts as the **single source of truth** for company‑level data
- Use the **Tasks** integration to drive follow‑ups instead of external to‑do lists
- Use **Installed Base** and **Renewals** views when planning QBRs or renewal conversations.`,
  },
  {
    title: 'Using the Deals app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:deals', 'pipeline'],
    category: 'Sales & Clients',
    body: `# Deals – Pipeline and opportunities

## Purpose
The **Deals** app tracks sales opportunities from qualification through close.
It supports forecasting, approvals, and links to quotes and invoices.

## Opening the app
- Go to **CRM Hub → Deals**

## Core concepts
- **Deal**: a potential revenue opportunity for an account
- **Stage**: where the deal sits in your sales process
- **Amount**: expected revenue (can be tied to quotes)
- **Owner**: primary salesperson responsible

## Working with deals
- Use filters and sorting to focus on the right stage, owner, or close date range
- Inline‑edit key fields like **Title, Amount, Stage, and Close date**
- Open the deal drawer to:
  - See related **Quotes, Invoices, Tasks, and Documents**
  - View the approval / acceptance history

## Approval queues
- The **Deal Approval Queue** surfaces deals that require management approval
- Use the queue pages to review, approve, or reject deals as part of your governance process

## Best practices
- Keep stage and close date accurate to maintain forecast quality
- Use **Tasks & Activities** on deals instead of external notes to ensure accountability.`,
  },
  {
    title: 'Using the Tasks & Activities app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:tasks', 'productivity'],
    category: 'Sales & Clients',
    body: `# Tasks & Activities – Work management for CRM records

## Purpose
The **Tasks & Activities** app is a unified to‑do list for CRM work:
calls, meetings, emails, and internal todos tied to Contacts, Accounts, Deals, Quotes, and more.

## Opening the app
- Go to **CRM Hub → Tasks & Activities**
- Or click **Open** from any Tasks badge in Contacts, Accounts, or Deals

## Views
- **List view** – spreadsheet‑style table with filters, sorting, and bulk actions
- **Board view** – Kanban board grouped by Status for drag‑and‑drop updates

## Creating tasks
- Use the **New task** form in the list header
- Choose:
  - **Type**: call, meeting, todo, email, note
  - **Subject** and optional **Description**
  - **Due date/time**
  - **Priority** (low, normal, high)
  - Optional **Related record** (contact, account, deal, quote, invoice)

## Editing and completing tasks
- Double‑click a row or click **Edit** to open the full‑screen task editor
- Update fields and save; due date/time is preserved and editable
- Use the **Mark done** bulk action or **Complete** button on a task to set it to **completed**

## Kanban board
- Switch to **Board** mode to see tasks by Status (Open, In progress, Completed, Cancelled)
- Drag cards between columns to update status
- Overdue tasks are highlighted for quick attention

## Integrations
- Contacts, Accounts, and Deals show **Tasks badges** with open counts
- Quick‑add and “Open oldest task” shortcuts are available directly from those list views

## Best practices
- Keep tasks linked to the right **related record** so work shows up in the right context
- Use the **Board view** for daily stand‑ups and pipeline reviews.`,
  },
  {
    title: 'Using the Assets / Installed Base app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:assets', 'installed-base'],
    category: 'Product / Service',
    body: `# Assets / Installed Base – Customer environments and deployed products

## Purpose
The **Assets / Installed Base** app tracks customer environments, installed products, and licenses.
It provides visibility into what each customer owns, where it is deployed, and renewal/health status.

## Opening the app
- Go to **CRM Hub → Assets / Installed Base**
- Or click **Open assets** from an Account drawer

## Main layout
- **Customer selector** – choose which account’s installed base to view
- **Summary cards** – environments, installed products, and upcoming renewals
- **Health & renewal alerts** – expiring licenses and products needing upgrade / renewal
- **Environments panel** – add/edit environments (Production, UAT, Dev, etc.)
- **Installed products table** – assets by environment, vendor, version, status, and support level
- **Licenses modal** – manage license counts, seats, expiration, and cost per product

## Managing environments
- Use **Add environment** to create Production, UAT, Dev, Sandbox, Retail Store, etc.
- For each environment you can track:
  - Name
  - Type
  - Location
  - Status (Active, Inactive, Planned, Retired)
  - Notes

## Managing installed products
- Use **Add installed product** to record software, hardware, integrations, or subscriptions
- Specify:
  - Environment
  - Product name and type
  - Vendor and version
  - Status (Active, Needs Upgrade, Pending Renewal, Retired)
  - Support level and deployment date

## Managing licenses
- Click **Licenses** on a product row to open the license modal
- Track:
  - License type (Subscription, Seat‑based, Device‑based, Perpetual)
  - Identifier / key
  - Licenses purchased vs. seats assigned
  - Expiration date and renewal status
  - Optional cost
- The system guards against over‑allocating seats beyond license count

## Health and renewal alerts
- The dashboard highlights:
  - Licenses expiring in the next 30/60/90 days
  - Products in **Needs Upgrade** or **Pending Renewal**
- CRM Hub also surfaces high‑level asset risk badges for quick scanning.

## Best practices
- Keep license expiration dates accurate to avoid surprise renewals
- Use **support level** and **status** to prioritize upgrades and project work.`,
  },
  {
    title: 'Using the Customer Success app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:success', 'health'],
    category: 'Sales & Clients',
    body: `Customer Success – Health scores, dashboards, timelines, and playbooks

Purpose
The Customer Success app turns signals from surveys, support tickets, assets, and projects into an account-level health score and clear playbook recommendations.
It helps you quickly see which customers are healthy, which are at risk, and where to focus proactive work.

Opening the app
- Go to CRM Hub → Customer Success.
- Or click the Success badge or the Customer success health card from an Account.

Main layout
- Header tiles showing counts of high-risk and medium-risk accounts.
- Filters for search and Success level so you can focus on the riskiest customers.
- Accounts table with columns for Success label, score, and key drivers.
- CSV export so you can share or analyze Success data outside the app.
- A compact success timeline in the Account drawer showing recent surveys, support load, projects, and renewals.

How the Success health score works
The Success health score is a risk score from 0–100. Higher scores mean more risk and therefore a Medium or High Success label.
It combines four main signal groups:

1. Surveys (from Surveys and Feedback)
- Score goes up when the last survey score is lower.
- Thresholds for the last survey score:
  - Last score less than or equal to 6 has a big impact on risk.
  - Last score less than or equal to 7.5 has a medium impact.
  - Last score less than or equal to 8.5 has a small impact.

2. Support tickets (from Support and Tickets)
- More open tickets increases risk.
- More high or urgent tickets increases risk further.
- Breached SLAs add additional risk.

3. Assets and Installed Base (from Assets and Renewals)
- The asset risk score feeds directly into Success and is scaled so it matters but does not dominate.
- Expired or expiring licenses add risk.
- Products marked Needs Upgrade or Pending Renewal add risk.

4. Projects (from Projects and Delivery)
- Projects with health equal to at_risk or off_track add risk.
- More at-risk or off-track projects means a higher Success risk score.

Thresholds for Success labels
- Score greater than or equal to 70 means the label is High (high risk).
- Score greater than or equal to 35 and less than 70 means the label is Medium.
- Score less than 35 means the label is Low or OK.

Where you see the Success label
- In the Accounts table Success column.
- In the Account drawer Customer success health card.
- In the Customer Success page, including filters, tiles, and CSV export.

Customer Success in the Account drawer
From the Account drawer you can:
- See the Success badge for that account.
- Review a Signals list summarizing surveys, support load, asset risk, and projects.
- See Suggested playbooks that describe recommended actions.
- Trigger playbook actions when Success is Medium or High, including creating follow-up tasks, scheduling QBR tasks, and opening Outreach sequences for targeted communication.

How to deliberately test Medium or High Success states
To see playbook actions and risk behavior in a demo or test environment you can intentionally drive an account to Medium or High Success (higher risk) by adding more negative signals in the four areas above:

- Surveys: send a survey to that account and record a low score, for example a score less than or equal to 6 or in the 6 to 7.5 range.
- Support tickets: create several tickets for the account, mark some as high or urgent, and let at least one breach its SLA.
- Assets and Installed Base: ensure the account owns assets with expired or soon-expiring licenses and products marked Needs Upgrade or Pending Renewal.
- Projects: create projects for that account and set some projects to At risk or Off track.

Once the combined score crosses the thresholds (score greater than or equal to 35 for Medium, or greater than or equal to 70 for High) you will see the updated label in the Accounts table Success column, the Account drawer Customer success health card, and the Customer Success page.
When Success is Medium or High the Account drawer will also surface playbook actions so teams can quickly create follow-up tasks or schedule QBRs.`,
  },
  {
    title: 'Using the Renewals & Subscriptions app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:renewals', 'subscriptions'],
    category: 'Sales & Clients',
    body: `# Renewals & Subscriptions – Managing recurring revenue

## Purpose
The **Renewals & Subscriptions** app tracks upcoming renewals, churn risk, and upsell potential.
It pulls data from Assets, Quotes, Invoices, and CRM Accounts.

## Typical workflows
- See which customers have renewals due in the next 30/60/90 days
- Identify accounts with at‑risk contracts (low adoption, open tickets, poor survey scores)
- Plan outreach and proposals ahead of renewal dates

## Best practices
- Use the Renewals app in tandem with **Assets / Installed Base** to understand what is renewing
- Pair renewals with **Tasks & Activities** and **Outreach** to orchestrate campaigns.`,
  },
  {
    title: 'Using the Products app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:products', 'catalog'],
    category: 'Product / Service',
    body: `# Products – Catalog, pricing, and margin

## Purpose
The **Products** app is your central catalog for items that appear on quotes and invoices.
It stores SKU, pricing, cost, margin, category, and status data.

## Working with the catalog
- Use search and filters to find products by name, SKU, category, or type
- Columns show Price, Cost, Margin, and Margin % with color highlighting
- Inline actions let you open and edit full details,
  including descriptions, billing terms, and default taxes/discounts.

## Best practices
- Keep **Cost** updated so margin reporting is accurate
- Use **Category** and **Status** to organize active vs. legacy offerings.`,
  },
  {
    title: 'Using the Vendors app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:vendors', 'catalog'],
    category: 'Product / Service',
    body: `# Vendors – Catalog of software, hardware, and service providers

## Purpose
The **Vendors** app is the catalog of companies that provide software, hardware, cloud services, or third party tools for your customers and internal teams.
It gives you a single source of truth for vendor contact details, categories, and support information, and feeds into the Assets / Installed Base app.

## Opening the app
- Go to **CRM Hub → Vendors**.
- Or use the CRM navigation bar and click **Vendors**.

## Main layout
- **Header filters** – quick search by name plus an Active or Inactive filter.
- **Vendor table** – list of vendors with columns for Name, Website, Support contact, Status, and Categories.
- **Add vendor** – opens a drawer to create a new vendor record.

## Creating and editing vendors
1. Click **Add vendor** (or **Edit** on an existing row).
2. Fill in:
   - **Name** – friendly name that appears in dropdowns.
   - **Legal name** – official legal entity name (optional).
   - **Website** – vendor website URL (optional).
   - **Support email** and **Support phone** – where teams should open tickets or get help.
   - **Categories** – comma separated values such as "CRM, Telephony, Infrastructure".
   - **Status** – Active for current vendors, Inactive for legacy or replaced vendors.
   - **Address** – address lines, city, state or region, postal code, country (optional).
   - **Notes** – internal notes or guidance about the vendor (optional).
3. Click **Save** to write the record to the vendor catalog.

## Categories
- Use **Categories** to group vendors by domain or responsibility.
- Examples: CRM, Billing, Telephony, Infrastructure, Integration, Security.
- Categories can be used later in reporting or filters.

## Using vendors in Assets / Installed Base
- When adding an installed product in **Assets / Installed Base**:
  - Use the **Vendor** dropdown to select from the Vendors catalog.
  - The vendor name is copied into the installed product for reporting.
  - You can still override the vendor name or type a custom vendor for one off tools.

## Best practices
- Keep **Status** accurate so inactive vendors do not clutter dropdowns.
- Use clear, consistent **Categories** so reports and filters stay readable.
- Store **support email and phone** for quick access when troubleshooting incidents.
- Use **Notes** to capture contract nuances or internal guidance on how to work with each vendor.`,
  },
  {
    title: 'Using Revenue Intelligence & Forecasting in BOAZ‑OS CRM',
    tags: ['crm', 'crm:revenue-intelligence', 'forecasting', 'ai', 'analytics'],
    category: 'Sales & Analytics',
    body: `# Revenue Intelligence & Forecasting – AI-powered pipeline analytics

## Purpose
The **Revenue Intelligence** app uses AI to score deals, forecast revenue with confidence intervals, and predict rep performance. It helps sales leaders make data driven decisions and identify risks and opportunities in the pipeline.

## Opening the app
- Go to **CRM Hub → Revenue Intelligence**.
- Or use the CRM navigation bar and click **Revenue Intelligence**.

## Core concepts
- **AI Deal Score** – a 0-100 score predicting deal likelihood based on multiple factors.
- **Confidence Level** – High, Medium, or Low based on data quality and deal characteristics.
- **Forecast Range** – Pessimistic, Likely, and Optimistic revenue projections.
- **Rep Performance Score** – a 0-100 score evaluating rep effectiveness.

## Understanding AI Deal Scoring
The AI analyzes each deal using multiple factors:
- **Deal stage progression** – later stages score higher
- **Deal age** – stale deals score lower
- **Activity recency** – recent engagement scores higher
- **Account maturity** – established accounts score higher
- **Time in current stage** – stuck deals score lower
- **Close date proximity** – closing soon with late stage scores higher

Each factor contributes positively or negatively to the overall score. You can view the detailed breakdown by clicking **View Score** on any deal.

## Pipeline Forecasting
The **Forecast** view shows:
- **Total Pipeline** – sum of all deal values in the period
- **Weighted Pipeline** – pipeline adjusted by AI scores
- **Closed Won** – revenue already closed
- **Forecast Range** – three scenarios based on confidence levels:
  - **Pessimistic** – conservative estimate (High confidence at 70%, Medium at 30%, Low at 10%)
  - **Likely** – most probable outcome (High at 85%, Medium at 50%, Low at 20%)
  - **Optimistic** – best case scenario (High at 95%, Medium at 70%, Low at 40%)

The forecast automatically accounts for deal confidence levels, so high confidence deals contribute more to the forecast than low confidence deals.

## Rep Performance Analytics
The **Rep Performance** view shows:
- **Performance Score** – 0-100 rating based on win rate, deal size, and pipeline activity
- **Forecasted Revenue** – closed won plus expected revenue from open pipeline
- **Win Rate** – percentage of closed deals that were won
- **Average Deal Size** – mean value of all deals
- **Pipeline metrics** – open deals, closed won, closed lost, total pipeline value

Reps are ranked by forecasted revenue to help identify top performers and those who may need coaching.

## Period Selection
Choose from:
- **Current Month** – deals closing this month
- **Current Quarter** – deals closing this quarter
- **Next Month** – deals closing next month
- **Next Quarter** – deals closing next quarter
- **Current Year** – deals closing this year

## What-If Scenarios (Coming Soon)
The **Scenario** view will allow you to model pipeline changes:
- Adjust deal stages, values, probabilities, and close dates
- See real time impact on forecast
- Compare baseline vs scenario side by side
- Test different strategies before committing

## Best practices
- Review AI scoring factors to understand what drives deal success.
- Focus coaching on reps with low performance scores.
- Use confidence levels to prioritize deals that need attention.
- Check forecast ranges weekly to spot trends early.
- Update deal data regularly (stage, activity, close date) for accurate AI scoring.
- Use the **Likely** forecast for planning, but prepare for the **Pessimistic** scenario.`,
  },
  {
    title: 'Using the Quotes app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:quotes', 'sales'],
    category: 'Sales & Clients',
    body: `# Quotes – Proposals and e‑sign

## Purpose
The **Quotes** app manages proposals sent to customers, including approvals and electronic signatures.

## Core flows
- Create a quote from a Deal or Account
- Add line items from the **Products** catalog
- Send for internal approval if needed
- Send to customer for e‑signature
- Track acceptance and convert to invoices or projects.

## Best practices
- Use standard product bundles and discounts instead of ad‑hoc lines
- Keep quote statuses and totals accurate to power pipeline and revenue forecasting.`,
  },
  {
    title: 'Using the Invoices app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:invoices', 'billing'],
    category: 'Finance',
    body: `# Invoices – Billing, payments, and refunds

## Purpose
The **Invoices** app manages billing documents, payment status, and refunds.

## Typical workflows
- Generate an invoice from an accepted quote or a closed deal
- Email invoices to the billing contact
- Track status (Draft, Sent, Paid, Overdue, Refunded)
- Export or integrate with your accounting system.

## Best practices
- Keep invoice statuses and due dates accurate to support AR reporting
- Use **Documents** to attach supporting files (POs, SOWs, contracts) to invoices.`,
  },
  {
    title: 'Using the Outreach & Sequences apps in BOAZ‑OS CRM',
    tags: ['crm', 'crm:outreach', 'email', 'sequences'],
    category: 'Marketing',
    body: `# Outreach & Sequences – Email/SMS programs

## Purpose
The **Outreach Templates** and **Outreach Sequences** apps let you design and run structured email/SMS cadences.

## Key pieces
- **Templates** – reusable messages with variables
- **Sequences** – multi‑step programs with delays and branching
- **Enrollments** – contacts or accounts enrolled into sequences

## Using sequences from Contacts/Accounts
- Select rows and use the **Enroll in sequence** bulk action
- Manage individual enrollments from contact and account drawers.

## Best practices
- Keep templates on‑brand and approved
- Use survey and ticket data to avoid over‑messaging unhappy customers.`,
  },
  {
    title: 'Using the Surveys & Feedback app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:surveys', 'nps', 'csat'],
    category: 'Support',
    body: `# Surveys & Feedback – NPS, CSAT, and post‑interaction

## Purpose
The **Surveys & Feedback** app manages NPS/CSAT programs and post‑interaction feedback.

## Capabilities
- Define survey **programs** (NPS, CSAT, transactional)
- Send survey emails to contacts and accounts
- Track response history at the contact and account level
- Surface recent scores in Contacts, Accounts, and Tickets.

## Best practices
- Use surveys to trigger follow‑up tasks when scores are low
- Combine survey data with **Renewals** and **Assets** to prioritize retention work.`,
  },
  {
    title: 'Using the Support Tickets app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:tickets', 'support'],
    category: 'Support',
    body: `# Tickets – Support cases and SLAs

## Purpose
The **Support Tickets** app tracks customer issues, incidents, and requests.

## Core flows
- Log new tickets manually or via customer portal
- Assign to owners and teams
- Track status, priority, and SLA timers
- Link tickets to Accounts, Contacts, and Assets so you know the impact.

## Best practices
- Keep ticket statuses and priorities accurate for triage
- Use **Knowledge Base** articles to resolve common issues faster.`,
  },
  {
    title: 'Using the Documents app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:documents', 'files'],
    category: 'Company & Operations',
    body: `# Documents – Files and knowledge assets

## Purpose
The **Documents** app stores files related to CRM entities (Accounts, Deals, Quotes, Invoices, Projects, etc.).

## Capabilities
- Upload and version‑control documents
- Link files to multiple CRM records
- Request deletion via a controlled process (see “Document Deletion Process” article)

## Best practices
- Use consistent naming conventions so documents are easy to find
- Prefer linking documents to **Accounts** and **Deals** as the primary anchor.`,
  },
  {
    title: 'Using the Contracts & SLAs app in BOAZ‑OS CRM',
    tags: ['crm', 'crm:slas', 'contracts'],
    category: 'Sales & Clients',
    body: `Contracts and SLAs – Legal agreements and service commitments

Overview
The Contracts and SLAs app is where you manage customer agreements, legal terms, and formal service level commitments. It centralizes who is covered by which contract, what you have promised, and whether the agreement is fully signed and active. The app integrates with Accounts, Deals, Assets, Renewals, Support, and Customer Success.

Opening the app
Go to CRM Hub → Contracts and SLAs or use the CRM navigation menu and choose Contracts and SLAs.

Main screen
The main table lists contracts with columns for Account, Contract name, Type, Status, dates, and SLA metrics. Filters let you narrow by account, type, and status. Use New SLA / contract to create a new record or click a contract name to edit.

Creating a contract
When you create a contract you should set:
1. Account for the agreement.
2. Name and Type such as Managed Services Agreement, Subscription, SOW, or NDA.
3. Status for example Draft, In review, Sent, or Active.
4. Effective date, Start date, End date, Renewal date, and whether the contract auto renews.
5. Renewal term in months and any notice period in days.

You can also capture Billing frequency, Currency, Base amount, and Invoice due days so commercial information is available alongside the legal data.

SLA and support targets
Use the SLA section to define:
1. Default response and resolution targets in minutes.
2. Uptime target percentage.
3. Support hours and SLA exclusions.
4. Optional per priority targets for P1 through P4 or other severities.
These values feed reporting and health indicators in Success and Support.

Parties, governance, and legal terms
The Parties and governance panels store customer and provider legal names and addresses, key contacts such as customer executive sponsor and technical contact, and provider account manager and CSM. The Legal terms section summarizes limitation of liability, indemnification, confidentiality, data protection, IP ownership, termination conditions, and change order process so non legal users can quickly understand the agreement.

Compliance and risk
The compliance panel records data classification, whether a data processing addendum is in place, audit rights, usage restrictions, and subprocessors. This information is used by risk and success dashboards to highlight sensitive contracts and accounts.

Links and covered scope
In the Links and playbooks block you can tie a contract to its primary quote and primary deal and record covered asset and service tags. Success playbook constraints describe any limits on outreach, interventions, or automation that should respect contractual terms.

Sending for review and signature
Use the Email action in the table to send a contract for signature. The system will:
1. Create a signing invite with an expiring token.
2. Email a temporary signing username and a one time security code in separate messages.
3. Email a third message with a secure signing link that requires the username and code before the contract is revealed.
The signing page shows the key fields and summaries from the contract so the signer can review before approving.

Signing and final copies
When a signer completes the digital signature the app:
1. Records the signer name, email, title, time, IP address, and user agent in the signature audit trail.
2. Marks the contract Active and sets the executed date when conditions are met.
3. Generates a final HTML and PDF snapshot of the contract summary.
4. Stores these as attachments on the contract and emails signed copies to the signer.

Working from Accounts and Deals
From an Account drawer you can see contracts and renewal information to support QBRs and renewal planning. From a Deal drawer you can see which contracts are tied to that opportunity.

Onboarding and implementation flows
You can use the Contracts and SLAs app together with Accounts, Projects, and Customer Success to run onboarding flows:
- From an Account drawer, use the onboarding wizard to create an onboarding project, then open Contracts and SLAs for that account to draft and send the primary agreement.
- After contracts are in place, use Customer Success to monitor health and trigger follow-up playbooks (for example QBR tasks) as the relationship evolves.

Best practices
1. Keep contract status and dates accurate so renewals and health dashboards are reliable.
2. Align SLA targets and summaries in the app with the signed legal document.
3. Use covered asset and service tags for better integration with Assets, Renewals, and Success.
4. Use the Email and history panel in the contract editor to see when contracts were sent, signed, and which copies were delivered.`,
  },
  {
    title: 'Using the Marketing Suite in BOAZ‑OS',
    tags: ['marketing', 'campaigns', 'segments', 'analytics', 'getting-started'],
    category: 'Marketing',
    body: `Marketing Suite – Email campaigns, segmentation, and analytics

Purpose
The Marketing Suite in BOAZ-OS provides a complete email marketing platform with campaign management, audience segmentation, analytics tracking, and unsubscribe management. Create professional email campaigns, target specific audiences, and measure performance all in one place.

Opening the app
- From the main menu, go to CRM Hub → Marketing
- Or navigate directly to /apps/crm/marketing
- The app opens to the Campaigns tab by default

Core concepts
The Marketing app has four main sections accessible via tabs at the top:
1. Campaigns – Create and send email campaigns using MJML or simple block builder
2. Segments – Define target audiences with rule-based filtering
3. Analytics – Track campaign performance with opens, clicks, and engagement metrics
4. Do Not Contact – Manage unsubscribed email addresses for compliance

Additionally, a Social Media button provides access to multi-platform social posting.

Section 1: Email Campaigns

Creating a campaign:
1. Click the Campaigns tab
2. Click "New campaign" button
3. Fill in campaign details:
   - Name: Internal reference name for the campaign
   - Subject: Email subject line (supports variables like {{name}})
   - Segment: Select which audience segment receives this campaign
   - Survey Program: (Optional) Link to a survey for feedback collection
4. Design your email using one of two methods:
   - Simple Builder: Drag and drop blocks (text, button, image, divider, columns)
   - MJML Editor: Write responsive email HTML using MJML syntax
5. Add footer text that appears after the copyright notice
6. Preview your email in the right panel
7. Send a test email to verify appearance
8. Click "Send campaign" when ready

Campaign builder options:
- Simple Builder: Add blocks, customize colors, alignment, and content
- MJML Editor: Full control with MJML markup language
- Template Library: Load pre-built templates (Basic, Hero, Survey)
- Load from Outreach Templates: Reuse templates from the Outreach app

Best practices for campaigns:
- Keep subject lines under 50 characters for mobile
- Use personalization variables ({{name}}, {{company}})
- Include a clear call-to-action button
- Test on multiple devices before sending
- A/B test subject lines for better open rates
- Send during business hours (Tuesday-Thursday, 10am-2pm typically best)

Section 2: Audience Segments

Creating a segment:
1. Click the Segments tab
2. Click "New segment" button
3. Name your segment (e.g., "Enterprise Customers")
4. Add filtering rules:
   - Field: Select from contact fields (name, email, company, title, etc.)
   - Operator: Choose Contains, Equals, or Starts With
   - Value: Enter the filter value
5. Add multiple rules for AND logic (all conditions must match)
6. Optionally add direct email addresses for one-off inclusions
7. Save the segment

Engagement-based segments (auto-generated)
BOAZ-OS can automatically build an audience segment based on **recipient engagement** (opens/clicks):
- When a recipient **opens** a campaign email (and does not unsubscribe), their email is added to an auto-generated segment named:
  - Engaged: <Campaign Name>
- When a recipient **clicks** a tracked link in the email (and does not unsubscribe), they are also added to the same segment.
- If a recipient is on the **Do Not Contact** list, they will not be added.

How to use the Engaged segment:
1. Send your campaign normally.
2. After recipients open/click, go to Marketing → Segments.
3. Select the Engaged: <Campaign Name> segment.
4. Use that segment as the audience for a follow-up campaign (e.g., “Thanks for reading” or “Book a demo”).

Segment best practices:
- Create segments for different customer types (prospects, customers, partners)
- Use job titles to target decision makers
- Segment by company size or industry for relevant messaging
- Keep segments updated as contact data changes
- Test segments with small sends before full campaigns

Section 3: Analytics

Viewing campaign performance:
1. Click the Analytics tab
2. Select date range to filter results
3. View metrics by campaign:
   - Sent: Total emails delivered
   - Opens: Unique recipients who opened (tracked via pixel)
   - Clicks: Link clicks within the email (tracked via redirect)
   - Open Rate: Opens divided by Sent (industry average: 15-25%)
   - Click Rate: Clicks divided by Sent (industry average: 2-5%)
4. Click "Refresh" to update metrics in real-time
5. Use the date range filter to analyze specific time periods

Understanding the metrics:
- Sent: Successfully delivered emails (excludes bounces and unsubscribes)
- Opens: Tracked when recipient loads images (may undercount if images blocked)
- Clicks: Every link is automatically tracked with unique tokens
- Open Rate: Higher is better; 20%+ is good for B2B
- Click Rate: Measures engagement; 3%+ is good for B2B
- Visits: Landing page visits from campaign links

Analytics best practices:
- Check analytics 24-48 hours after send for accurate results
- Compare campaigns to identify high-performing content
- Track click-through rates to measure call-to-action effectiveness
- Use date ranges to see trends over time
- Export data for deeper analysis in spreadsheets

Section 4: Do Not Contact List

Managing unsubscribes:
1. Click the Do Not Contact tab
2. View all unsubscribed email addresses
3. See which campaign triggered each unsubscribe
4. Search by email address
5. Sort by date, email, or campaign
6. (Admin only) Remove emails from DNC list if subscriber explicitly requests

How unsubscribes work:
- Every campaign email includes an automatic unsubscribe link in the footer
- When clicked, the email is added to the DNC list immediately
- Future campaigns automatically exclude DNC list emails
- Unsubscribe page shows a confirmation message
- No manual intervention needed for compliance

DNC list compliance:
- CAN-SPAM Act requires unsubscribe links in all marketing emails
- GDPR requires honoring unsubscribe requests immediately
- Never manually add someone to a campaign after they unsubscribe
- Only remove from DNC if subscriber explicitly requests re-subscription
- Keep records of unsubscribe requests for compliance audits

Section 5: Link Tracking

All links in campaigns are automatically tracked:
- System generates unique tracking tokens for each link
- Clicks are recorded with timestamp and recipient (when available)
- Links redirect through /api/marketing/r/:token
- UTM parameters are automatically added (utm_source=email, utm_medium=campaign)
- Click data appears in Analytics tab
- Integration with Google Analytics for full funnel tracking

Section 6: Integration with Other Apps

Marketing integrates with:
- Contacts: Pull audience segments from contact database
- Surveys: Link campaigns to survey programs for feedback
- Outreach Templates: Reuse templates across marketing and outreach
- Social Media: Coordinate campaigns across email and social channels
- Analytics: Unified view of all marketing performance

Section 7: Troubleshooting

Problem: Campaign not sending
Solution: Check that segment has contacts and is not empty. Verify email service is configured.

Problem: Low open rates
Solution: Improve subject lines, verify sender reputation, check spam folder placement, send at better times.

Problem: Images not displaying in preview
Solution: Ensure image URLs are absolute (not relative). Check that images are publicly accessible.

Problem: Unsubscribe link not working
Solution: Verify API endpoint /api/marketing/unsubscribe is accessible. Check that link is not wrapped by link tracking.

Problem: Analytics showing zero opens/clicks
Solution: Allow 24-48 hours for metrics to populate. Ensure tracking pixel and links are not blocked. Check that campaign status is "sent" not "draft".

Section 8: Best Practices Summary

Campaign strategy:
- Send consistently (weekly or bi-weekly newsletters)
- Segment audiences for relevant content
- Use A/B testing for subject lines and content
- Include clear calls-to-action
- Mobile-optimize all emails (60%+ open on mobile)
- Personalize with recipient name and company

Content strategy:
- 80% valuable content, 20% promotional
- Use storytelling and case studies
- Include social proof (testimonials, stats)
- Keep emails scannable with headers and bullets
- Use images strategically (not too many)
- Always include an unsubscribe link

Compliance:
- Honor unsubscribe requests immediately
- Include physical mailing address in footer
- Don't purchase email lists
- Get explicit consent before emailing
- Keep records of opt-ins
- Follow CAN-SPAM, GDPR, and CCPA regulations

Performance optimization:
- Clean your email list quarterly (remove bounces and inactive)
- Monitor sender reputation
- Avoid spam trigger words
- Test emails before sending
- Track metrics and iterate
- Benchmark against industry standards

Getting help:
- For campaign creation: Use templates as starting points
- For segmentation: Start with simple rules, add complexity gradually
- For analytics: Compare to industry benchmarks (15-25% open rate, 2-5% click rate)
- For compliance: Review CAN-SPAM and GDPR requirements
- For technical issues: Submit support ticket with campaign ID and error details

The Marketing Suite provides enterprise-grade email marketing capabilities integrated directly into BOAZ-OS, eliminating the need for external tools like Mailchimp or Constant Contact while keeping all your customer data in one place.`,
  },
  {
    title: 'Using the Social Media Management app in BOAZ‑OS Marketing',
    tags: ['marketing', 'social-media', 'facebook', 'twitter', 'linkedin', 'instagram', 'social:composer', 'social:analytics'],
    category: 'Marketing',
    body: `Social Media Management – Multi-platform posting and analytics

Purpose
The Social Media Management app enables you to create, schedule, publish, and analyze content across Facebook, Twitter, LinkedIn, and Instagram from a single unified interface. This eliminates the need to log into multiple platforms and provides centralized analytics and scheduling.

Opening the app
- From the Marketing page, click the Social Media button (gradient purple/pink button with 📱 icon)
- Or navigate directly to Marketing → Social Media
- The app opens to the Composer tab by default

Core concepts
The Social Media app has four main sections accessible via tabs at the top:
1. Composer – Create and publish posts across multiple platforms
2. Calendar – View and manage scheduled posts by date
3. Accounts – Connect and manage your social media accounts
4. Analytics – Track performance metrics across all platforms

Section 1: Connecting Social Media Accounts

Before you can post, you must connect at least one social media account.

How to connect an account:
1. Click the Accounts tab at the top
2. Click the Connect Account button (blue button in top right)
3. A connection form appears with these fields:
   - Platform: Select Facebook, Twitter, LinkedIn, or Instagram
   - Account Name: A friendly name for this account (e.g., "Company Facebook Page")
   - Account ID: The platform specific account identifier
   - Username: (Optional) Your @username or handle on that platform
4. Click Connect to save the account

Managing connected accounts:
- Each account displays as a card showing:
  - Platform icon and color coding (Facebook blue, Twitter sky blue, LinkedIn dark blue, Instagram gradient)
  - Account name and username
  - Current status: Active, Disconnected, Expired, or Error
  - Follower count (when available)
  - Last sync timestamp
- To disconnect an account: Click the Disconnect button on its card and confirm
- Active accounts appear in the Composer when creating posts

Account status indicators:
- Active (green): Account is connected and ready to post
- Disconnected (gray): Account connection was manually removed
- Expired (yellow): Access token has expired, requires reconnection
- Error (red): Authentication or API error, check credentials

Note: In production environments, accounts would connect via OAuth authentication. For demo/testing, accounts can be added manually with their platform IDs.

Section 2: Creating and Publishing Posts (Composer Tab)

The Composer is where you create content for one or multiple platforms simultaneously.

Creating a new post:
1. Go to the Composer tab (default view)
2. Select platforms: Click the platform buttons (Facebook, Twitter, LinkedIn, Instagram) you want to post to. Selected platforms highlight in blue.
3. Select accounts: For each platform selected, checkboxes appear for all connected accounts on that platform. Select which accounts should receive this post.
4. Write your content: Enter text in the large Content textarea. As you type, a character counter shows how many characters you have used relative to the strictest limit among selected platforms.
5. (Optional) Add a link: Enter a URL in the Link field. This will be included in the post with automatic UTM tracking.
6. (Optional) Add hashtags: Enter hashtags in the Hashtags field, separated by spaces or commas. The # symbol is optional; the system adds it automatically.
7. (Optional) Schedule for later: Use the Schedule date and time pickers to set when the post should go live. Leave blank to post immediately.
8. Choose an action:
   - Save as Draft: Saves the post without publishing (status = draft)
   - Schedule Post: Saves and queues for automatic publishing at the scheduled time
   - Publish Now: Publishes immediately to all selected accounts

Understanding character limits:
Different platforms have different maximum character lengths:
- Facebook: 63,206 characters
- Twitter/X: 280 characters
- LinkedIn: 3,000 characters
- Instagram: 2,200 characters

When you select multiple platforms, the character counter uses the strictest (lowest) limit. For example, if you select Twitter and LinkedIn, the limit is 280 characters because Twitter is more restrictive.

The character counter turns red if you exceed the limit, warning you before publishing.

Multi-platform posting best practices:
- Keep content concise if including Twitter (280 char limit)
- Use platform appropriate tone (LinkedIn = professional, Instagram = visual/casual)
- Hashtags work well on Instagram and Twitter, less so on LinkedIn
- Include links with clear calls to action
- Preview your post on each platform before publishing (see Preview panel)

Using the Preview panel:
The right sidebar shows real-time previews of how your post will appear on each selected platform:
- Each platform gets its own preview card
- Platform icon and name are shown at the top
- Your content appears as it will render
- Links show as clickable URL cards
- Hashtags appear styled in blue
- Character limits are respected in the preview

If no platforms are selected, the preview shows a message: "Select platforms to see preview"

Section 3: Managing Scheduled Posts (Calendar Tab)

The Calendar tab shows all posts with future scheduled dates, organized chronologically.

Viewing scheduled posts:
- Posts are grouped by date (e.g., "Monday, December 9, 2024")
- Within each date, posts are sorted by time (earliest first)
- Each post card shows:
  - Platform icons for where it will be published
  - Scheduled time (e.g., "9:00 AM")
  - Content preview (first 2 lines)
- If no posts are scheduled: "No scheduled posts. Create one in the Composer tab!"

Calendar best practices:
- Spread posts throughout the day to maximize reach
- Schedule posts during peak engagement hours (typically 9am-3pm on weekdays)
- Avoid over-posting to the same platform on the same day
- Review your calendar weekly to ensure consistent presence
- Plan campaigns and product launches in advance using scheduled posts

Section 4: Analyzing Performance (Analytics Tab)

The Analytics tab provides comprehensive performance metrics across all your social media accounts.

Summary metrics (top cards):
Four summary cards show high level engagement:
1. Total Posts: Number of published posts in the selected date range
2. Likes: Total likes/reactions across all platforms
3. Shares: Total shares/retweets/reposts
4. Comments: Total comments/replies received

Date range filtering:
- Use the Start Date and End Date pickers to filter metrics
- Leave blank to see all-time metrics
- Metrics automatically update when you change the date range

Performance by platform:
Below the summary cards, a detailed breakdown shows metrics for each platform you have posted to:
- Platform name and post count
- Detailed metrics for that platform:
  - Likes: Heart reactions or like buttons
  - Shares: Retweets (Twitter), shares (Facebook/LinkedIn), shares (Instagram Stories)
  - Comments: Direct replies and comments
  - Clicks: Link clicks and CTA button clicks
  - Reach: Unique users who saw your content
  - Impressions: Total times your content was displayed (includes repeat views)

Understanding the metrics:
- Likes: Direct engagement showing content resonated
- Shares: Strongest signal of value; users amplify your message
- Comments: Deep engagement; users taking time to respond
- Clicks: Measures call to action effectiveness
- Reach: Size of your actual audience
- Impressions: Frequency of exposure (impressions divided by reach = average views per person)

Engagement rate formula:
Engagement Rate = (Likes + Shares + Comments + Clicks) divided by Reach × 100%

A good engagement rate varies by platform:
- Facebook: 1-2%
- Twitter: 0.5-1%
- LinkedIn: 2-3%
- Instagram: 3-6%

Analytics best practices:
- Check analytics weekly to identify trends
- Compare platforms to see where your audience is most active
- Track engagement rate over time (not just absolute numbers)
- Note which post types get the most shares (that is your most valuable content)
- If reach is growing but engagement is flat, refocus on quality over quantity
- Use high performing posts as templates for future content

Section 5: Post Status Workflow

Every post has a status that determines its lifecycle:
1. Draft: Post is saved but not published or scheduled. Only visible to you.
2. Scheduled: Post will automatically publish at the specified date/time.
3. Published: Post is live on the selected platforms.
4. Failed: Post attempted to publish but encountered an error (network issue, expired credentials, etc.).

Status transitions:
- Draft can be edited freely, scheduled, or published
- Scheduled posts can be edited or deleted before their scheduled time
- Published posts cannot be edited or deleted (same as native platform behavior)
- Failed posts can be reviewed, edited, and retried

Section 6: Platform Specific Tips

Facebook posting tips:
- Optimal post length: 40-80 characters (despite 63K limit)
- Best times: Tuesday-Thursday, 1-3pm
- Use emojis, questions, and fill in the blank posts for engagement
- Video posts get 10x the engagement of text only posts
- Tag other pages/profiles to expand reach

Twitter/X posting tips:
- Optimal tweet length: 100-150 characters (despite 280 limit)
- Best times: Wednesday-Friday, 9am-12pm
- Use 1-2 hashtags (3+ reduces engagement)
- Include images or GIFs to increase retweets by 150%
- Threads (multiple connected tweets) get more engagement than single tweets

LinkedIn posting tips:
- Optimal post length: 150-300 characters
- Best times: Tuesday-Thursday, 7-9am or 12-1pm
- Professional tone; avoid excessive emojis
- Share industry insights, company updates, thought leadership
- Posts with "How to", "Future of", and "X reasons" perform well
- Native LinkedIn articles (vs external links) get more engagement

Instagram posting tips:
- Optimal caption length: 138-150 characters
- Best times: Monday-Friday, 11am or 1-2pm
- Use 9-11 hashtags for maximum reach (up to 30 allowed)
- High quality images are critical (Instagram is visual first)
- Include location tags to increase discoverability
- Stories have higher daily engagement than feed posts

Section 7: Advanced Features and Integrations

Campaign linking:
When creating a social post, you can optionally link it to a Marketing Campaign:
- This tracks social media as part of your broader marketing efforts
- Analytics roll up to the campaign level
- Useful for product launches, events, or seasonal promotions

Link tracking:
All links posted through the Social Media app are automatically tracked:
- Unique tracking parameters are added (UTM codes)
- Click through rates are recorded
- You can see which posts drive the most traffic to your website
- Integration with Marketing Analytics for unified reporting

Section 8: Troubleshooting

Problem: "No accounts connected" warning when trying to post
Solution: Go to the Accounts tab and connect at least one account for the platforms you want to post to.

Problem: Post failed to publish
Solution: Check these common issues:
1. Account status shows "Expired" or "Error": Reconnect the account
2. Content exceeds platform character limit: Edit to shorten
3. Network connectivity: Retry publishing
4. Platform API outage: Wait and retry later

Problem: Analytics showing zero engagement
Solution: 
1. Ensure posts are marked as "Published" not "Draft"
2. Allow 24-48 hours for metrics to populate from platforms
3. Check that platform API credentials are current
4. Metrics only update for posts made after account connection

Problem: Character counter is red but content looks short
Solution: The counter uses the strictest limit among selected platforms. If Twitter is selected, the limit is 280 characters even if other platforms allow more. Either shorten your content or deselect Twitter and create a separate Twitter optimized post.

Problem: Scheduled post did not publish at the set time
Solution: 
1. Check that the post status is "Scheduled" not "Draft"
2. Ensure the scheduled time is in the future (not past)
3. Verify account credentials are valid (not expired)
4. Background scheduling jobs run every 15 minutes; there may be a slight delay

Section 9: Best Practices Summary

Content strategy:
1. Post consistently (aim for 3-5 posts per week per platform)
2. Vary content types (questions, tips, quotes, company news, industry trends)
3. Use the 80/20 rule: 80% valuable content, 20% promotional
4. Engage with comments within 1-2 hours for algorithm boost
5. Repost evergreen content every 3-6 months

Scheduling strategy:
1. Create a content calendar 2-4 weeks in advance
2. Schedule posts during peak hours for your audience
3. Use the Calendar tab to visualize your posting frequency
4. Batch create content (write 10 posts at once, schedule over 2 weeks)
5. Leave room for real time/breaking news posts

Analytics strategy:
1. Review analytics weekly
2. Identify top 3 performing posts each month
3. Create more content similar to high performers
4. Track engagement rate trend over time
5. Set monthly goals (example: increase LinkedIn engagement rate from 2% to 2.5%)
6. Compare your metrics to industry benchmarks

Efficiency tips:
1. Write posts in batches to save time
2. Create a swipe file of high performing posts to use as templates
3. Use the multi-platform posting feature to save time (write once, post everywhere)
4. Set up a regular content review meeting (weekly or biweekly)
5. Track which post types are easiest to create and highest performing, then focus there

Security and compliance:
1. Only grant account access to trusted team members
2. Review connected accounts quarterly and remove unused ones
3. Monitor for unauthorized posts (check Analytics for unexpected activity)
4. Follow each platform's terms of service and community guidelines
5. Avoid posting sensitive company information on social media

Getting help:
- For account connection issues: Check platform API documentation or contact support
- For content strategy questions: Refer to platform specific tips in Section 6
- For technical issues: Submit a support ticket with the post ID and error message
- For feature requests: Use the feedback form in Settings

This Social Media Management app provides enterprise grade multi-platform publishing with unified analytics, eliminating the need for external tools while keeping all your marketing data in one place within BOAZ-OS.`,
  },
]

async function main() {
  const db = await getDb()
  if (!db) {
    console.error('Database not available')
    process.exit(1)
  }

  for (const article of ARTICLES) {
    const existing = await db.collection('kb_articles').findOne({
      title: article.title,
    })

    if (existing) {
      console.log('KB article already exists, skipping:', article.title)
      continue
    }

    const cleanBody = article.body.replace(/[#*]/g, '')
    const doc = {
      ...article,
      body: cleanBody,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: 'system',
    }

    const result = await db.collection('kb_articles').insertOne(doc)
    console.log('Created KB article:', article.title, '→', result.insertedId)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => process.exit(0))

