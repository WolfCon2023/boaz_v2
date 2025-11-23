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

Best practices
1. Keep contract status and dates accurate so renewals and health dashboards are reliable.
2. Align SLA targets and summaries in the app with the signed legal document.
3. Use covered asset and service tags for better integration with Assets, Renewals, and Success.
4. Use the Email and history panel in the contract editor to see when contracts were sent, signed, and which copies were delivered.`,
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

