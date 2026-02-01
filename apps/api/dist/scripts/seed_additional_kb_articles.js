import { getDb } from '../db.js';
const ARTICLES = [
    {
        title: 'Using the Support Tickets app in BOAZ-OS CRM',
        tags: ['crm', 'crm:support', 'tickets', 'helpdesk'],
        category: 'Customer Support',
        body: `# Support Tickets – Help Desk and Issue Tracking

## Purpose
The **Support Tickets** app is your central hub for managing customer support requests, bug reports, and technical issues. It enables your team to track, prioritize, and resolve customer problems efficiently while maintaining SLA compliance.

## Opening the app
- Go to **CRM Hub → Help Desk → Support Tickets**
- Or navigate directly from the **Helpdesk** dashboard

## Core concepts
- **Ticket**: A support request or issue submitted by a customer or created internally
- **Status**: open, pending, in_progress, resolved, closed, canceled
- **Priority**: low, normal, high, urgent, critical
- **SLA**: Service Level Agreement tracking with due dates
- **Owner**: The team member responsible for the ticket
- **Assignee**: The team member currently working on the ticket

## Creating tickets
### Internal ticket creation:
1. Click **Create ticket** at the top of the page
2. Fill in required fields: Short description, Description, Status, Priority
3. Optionally assign an **Owner** and **Assignee** from your team
4. Set an **SLA due date** if needed
5. Add **Requester information** (name, email, phone) for customer-submitted issues
6. Click **Create**

### Customer-submitted tickets:
- Customers can submit tickets through the **Customer Portal** at /customer/tickets
- External tickets automatically include customer contact information
- Confirmation emails are sent to customers upon ticket creation

## Working with tickets
### Viewing tickets:
- Use **filters** to view tickets by status, priority, assignee, or SLA breach
- Click on any ticket to open the **ticket editor** with full details
- View customer contact information at the top of each ticket

### Editing tickets:
1. Click on a ticket row to open the editor
2. Update **Status**, **Priority**, **Owner**, or **Assignee**
3. Modify **Short description** and **Description** as needed
4. Adjust **SLA due date** if circumstances change
5. Click **Save** to commit changes

### Managing ticket assignment:
- **Owner**: Responsible for the ticket outcome
- **Assignee**: Currently working on the ticket (searchable dropdown)
- Use the search field to quickly find team members by name or email
- Both fields support the same contact search functionality

## Communication features
### Adding comments:
- Use the **Add comment** section to log internal notes or customer communications
- Comments are timestamped and attributed to the author
- All comments appear in the **History** section

### Sending updates to customers:
1. Open a ticket with customer contact information
2. Scroll to the **Send Update to Customer** section
3. Enter your update message
4. Optionally add **CC recipients** (comma-separated emails)
5. Click **Send Update to Customer**
6. The update is emailed to the customer and logged as a system comment

### Customer notifications:
- Customers receive automatic **confirmation emails** when they submit tickets
- Manual updates can be sent at any time with optional CC recipients
- All customer communications are tracked in the ticket history

## SLA management
### SLA tracking:
- **Breached SLA**: Tickets past their due date (red indicator)
- **Due next 60m**: Tickets due within the next hour (yellow indicator)
- Use dashboard metrics to monitor SLA performance

### Setting SLA dates:
- Set during ticket creation based on priority
- Adjust via the **SLA Due** field in the ticket editor
- Use inline SLA picker for quick updates

## Surveys and feedback
### Survey programs:
- Log **CSAT** or **NPS** responses directly from tickets
- Send survey emails to customers for post-interaction feedback
- View survey history and scores in the ticket drawer

### Logging surveys:
1. Select a **Survey program** from the dropdown
2. Enter the customer's **Score** (0-10)
3. Add optional **Comments**
4. Click **Log survey response**

## Advanced features
### Columns and views:
- Show/hide columns using the **Columns** menu
- Save custom **views** with specific filters and column configurations
- Share view URLs with team members

### Filtering and sorting:
- Filter by **Status**, **Priority**, **Breached SLA**, or **Due next 60m**
- Use **multi-status filters** (e.g., "open,pending") for combined views
- Sort by **Created**, **Updated**, **Ticket number**, **Priority**, or **SLA due**

### Bulk operations:
- Export tickets to **CSV** or **JSON** for reporting
- Copy ticket data to clipboard for external use

## Deleting tickets (Admin only)
1. Open the ticket in the editor
2. Click **Delete Ticket** (red button, bottom left)
3. Confirm the deletion
4. Note: This action cannot be undone

## Best practices
- **Set clear priorities** based on business impact, not just customer urgency
- **Update status regularly** to keep customers informed and dashboards accurate
- **Use Owner vs Assignee strategically**: Owner for accountability, Assignee for current work
- **Send proactive updates** to customers before SLA breaches
- **Log all customer interactions** as comments for complete history
- **Review breached SLAs daily** and adjust capacity or processes accordingly
- **Use CC recipients** to keep stakeholders informed on critical issues
- **Close tickets promptly** after resolution to maintain accurate metrics`,
    },
    {
        title: 'Using the Approval Queue in BOAZ-OS',
        tags: ['approvals', 'workflow', 'quotes', 'terms'],
        category: 'Operations & Workflow',
        body: `# Approval Queue – Quote and Terms Approvals

## Purpose
The **Approval Queue** is a centralized workflow hub where managers and executives review and approve quotes, terms agreements, and other business documents before they are sent to customers or finalized.

## Opening the app
- Go to **Apps → Approval Queue**
- Or navigate from the main dashboard if approvals are pending

## Core concepts
- **Approval request**: A quote or terms agreement requiring manager/executive sign-off
- **Status**: pending, approved, rejected
- **Requester**: The team member who submitted the item for approval
- **Approver**: The manager or executive who can approve/reject
- **Approval threshold**: Dollar amount or terms that trigger approval requirements

## What requires approval?
### Quotes:
- Quotes above a certain dollar threshold (configurable per org)
- Quotes with non-standard terms or discounts
- Quotes for strategic accounts

### Terms agreements:
- Custom contract terms
- Non-standard payment terms
- Special pricing arrangements

## Viewing pending approvals
### Your approval queue:
- Only approvals **assigned to you** or **your role** appear in your queue
- Items are sorted by **submission date** (oldest first)
- Use filters to view by **Type** (quote, terms) or **Requester**

### Queue columns:
- **Type**: Quote or Terms
- **Submitted by**: The team member requesting approval
- **Amount**: Total value (for quotes)
- **Account**: Customer or prospect name
- **Submitted**: Date and time of submission
- **Status**: Current approval status

## Reviewing approval requests
### Opening a request:
1. Click on any row to open the approval drawer
2. Review the full details:
   - **Quote details**: Items, pricing, terms, total amount
   - **Terms details**: Contract language, payment terms, special conditions
   - **Account context**: Customer history, relationship status
   - **Justification**: Notes from the requester explaining the request

### What to check:
- **Pricing accuracy**: Does the total make sense for the items/services?
- **Discount reasonableness**: Is the discount justified by deal size or strategic value?
- **Terms compliance**: Do terms align with company policies?
- **Customer context**: Is this a strategic account? Renewal? New business?
- **Risk factors**: Payment terms, delivery commitments, custom SLAs

## Approving or rejecting
### To approve:
1. Review all details in the drawer
2. Click **Approve** button
3. Optionally add a comment (e.g., "Approved - strategic account")
4. Confirm approval
5. The requester is **automatically notified via email**

### To reject:
1. Review the details and identify issues
2. Click **Reject** button
3. **Add a comment explaining why** (required for rejections)
4. Confirm rejection
5. The requester receives an email with your rejection reason

### Requesting changes:
- If you need more information or changes, **reject with clear instructions**
- The requester can revise and resubmit
- Add comments like: "Please reduce discount to 15% max" or "Need CFO approval for payment terms"

## Email notifications
### For approvers:
- You receive an email when a new approval is assigned to you
- Email includes: Type, amount, account, and a link to the approval queue

### For requesters:
- Automatic notification when your request is approved or rejected
- Rejection emails include the approver's comments
- Approval emails confirm you can proceed with the quote or terms

## Approval workflow
### Standard flow:
1. **Sales rep** creates a quote or terms agreement
2. System checks if approval is required (based on thresholds)
3. **Approval request** is automatically created and assigned to appropriate manager
4. **Manager** receives email notification
5. Manager reviews in **Approval Queue** and approves/rejects
6. **Sales rep** receives decision email
7. If approved, sales rep can send quote to customer

### Escalation:
- Some approvals may require multiple levels (e.g., Manager → Director → VP)
- Check your org's approval matrix for thresholds
- Super-users or admins can view all pending approvals

## Dashboard metrics
### For managers:
- **Pending approvals**: Count of items awaiting your decision
- **Approved this week**: Number of approvals you've processed
- **Average approval time**: How quickly you're processing requests

### For sales reps:
- **Pending approvals**: Your requests awaiting manager sign-off
- **Approval rate**: Percentage of your requests approved on first submission
- **Average approval time**: How long your approvals typically take

## Best practices
- **Review approvals daily** to avoid blocking deals
- **Add meaningful comments** to approvals and rejections for audit trail
- **Ask questions** if anything is unclear before approving
- **Set up notifications** so you don't miss approval requests
- **Delegate approval authority** when you're out of office
- **Track approval times** and streamline for competitive deals
- **Use rejection comments** as coaching moments for your team
- **Approve quickly** for standard deals, review carefully for exceptions`,
    },
    {
        title: 'Using the Acceptance Queue in BOAZ-OS',
        tags: ['acceptance', 'workflow', 'delivery', 'milestones'],
        category: 'Operations & Workflow',
        body: `# Acceptance Queue – Customer Acceptance and Sign-off

## Purpose
The **Acceptance Queue** manages customer acceptance workflows for deliverables, project milestones, and implementation phases. It ensures formal customer sign-off before projects are marked complete and revenue is recognized.

## Opening the app
- Go to **Apps → Acceptance Queue**
- Or navigate from **Projects & Delivery** dashboard

## Core concepts
- **Acceptance item**: A deliverable or milestone requiring customer sign-off
- **Status**: pending, accepted, rejected, on_hold
- **Project**: The parent project or implementation this belongs to
- **Customer contact**: The person authorized to provide acceptance
- **Acceptance criteria**: Requirements that must be met for sign-off

## What requires acceptance?
### Project milestones:
- Phase completions (e.g., Discovery, Design, Build, Testing)
- Go-live approvals
- Training completion sign-offs

### Deliverables:
- Software implementations
- Integrations and data migrations
- Custom development work
- Professional services engagements

### Documentation:
- User guides and training materials
- Technical documentation
- Configuration records

## Creating acceptance requests
### From a project:
1. Go to **Projects & Delivery** and open a project
2. Click **Request acceptance**
3. Fill in details:
   - **Milestone/Deliverable name**
   - **Description** of what was delivered
   - **Acceptance criteria** (what customer should verify)
   - **Customer contact** who will provide sign-off
   - **Target acceptance date**
4. Click **Submit for acceptance**
5. Customer receives email with acceptance request and criteria

### Manual creation:
1. Open **Acceptance Queue**
2. Click **New acceptance request**
3. Select the **Project** and **Account**
4. Fill in deliverable details and criteria
5. Choose **Customer contact**
6. Set **Target date**
7. Click **Create**

## Working with acceptance items
### Viewing the queue:
- **Pending**: Items awaiting customer response
- **Accepted**: Items formally signed off by customer
- **Rejected**: Items not meeting acceptance criteria
- **On hold**: Items paused pending other dependencies

### Queue columns:
- **Project**: Parent project name
- **Deliverable**: What's being accepted
- **Customer**: Account name
- **Contact**: Person providing sign-off
- **Status**: Current acceptance status
- **Target date**: When acceptance is needed
- **Submitted**: When request was created

## Customer acceptance process
### Customer view:
- Customers receive an email with:
  - **Deliverable description**
  - **Acceptance criteria checklist**
  - **Link to acceptance form** (Customer Portal)
- They can review, test, and provide feedback

### Customer actions:
1. **Accept**: Confirms deliverable meets criteria
2. **Reject**: Identifies issues and provides rejection reasons
3. **Request clarification**: Asks questions before deciding

## Managing acceptance internally
### Following up:
- Use **Comments** to log customer conversations
- Update **Status** if customer requests a hold
- Adjust **Target date** if timeline changes
- **Send reminders** to customers approaching target date

### Handling rejections:
1. Review customer's rejection reasons
2. Create **tasks** to address identified issues
3. Update **Status** to "On hold" while issues are resolved
4. Once resolved, **resubmit** for acceptance
5. Customer receives new acceptance request email

### Expediting acceptance:
- For urgent items, call customer in addition to email
- Offer to do a **screenshare walkthrough** of acceptance criteria
- Schedule a **sign-off meeting** for complex deliverables
- Document verbal acceptance and follow up with email confirmation

## Email notifications
### To customers:
- **New acceptance request**: Includes criteria and link to acceptance form
- **Reminder emails**: Sent automatically 3 days before target date
- **Re-submission notices**: When items are resubmitted after fixes

### To internal team:
- **Acceptance received**: When customer accepts
- **Rejection received**: When customer rejects (includes rejection reasons)
- **Target date approaching**: 2 days before target (for unaccepted items)

## Integration with Projects
### Project status:
- Projects show **acceptance status** for each milestone
- Overall project health reflects acceptance progress
- Revenue recognition may be tied to acceptance milestones

### Completion requirements:
- Projects cannot be marked **Completed** until all acceptance items are accepted
- Use **On hold** status if acceptance is blocked by customer issues
- Track acceptance delays in project health scoring

## Reporting and metrics
### For delivery teams:
- **Pending acceptance count**: Items awaiting customer sign-off
- **Average acceptance time**: Days from submission to acceptance
- **First-time acceptance rate**: Percentage accepted without rejection

### For account managers:
- **Overdue acceptances**: Items past target date
- **Acceptance trend**: Week-over-week acceptance velocity
- **Rejection reasons**: Common issues causing rejections

## Best practices
- **Set realistic target dates** with customer input
- **Make acceptance criteria specific and measurable** (not vague)
- **Provide evidence** of completion (screenshots, test results, documentation)
- **Follow up proactively** 2-3 days before target date
- **Document customer feedback** even on accepted items for improvement
- **Address rejections quickly** to keep projects on track
- **Get verbal confirmation** before submitting for formal acceptance
- **Celebrate acceptances** with customers - it's a shared success milestone
- **Track acceptance velocity** per customer to predict future timelines
- **Use acceptance as a health check** - frequent rejections signal deeper issues`,
    },
    {
        title: 'Using the Deal Approval Queue in BOAZ-OS',
        tags: ['deals', 'approvals', 'sales', 'workflow'],
        category: 'Sales & Revenue',
        body: `# Deal Approval Queue – Sales Deal Approvals

## Purpose
The **Deal Approval Queue** provides executive oversight of high-value deals, non-standard pricing, and strategic opportunities. It ensures deals align with company strategy, pricing policies, and revenue goals before sales commits to customers.

## Opening the app
- Go to **CRM Hub → Deals → Approval Queue**
- Or navigate from the **Deals** dashboard

## Core concepts
- **Deal approval**: Executive review required before deal can be finalized
- **Approval triggers**: Deal size, discount depth, payment terms, or strategic importance
- **Approver hierarchy**: Different deal sizes/types route to different executives
- **Status**: pending, approved, rejected, escalated
- **Approval conditions**: Specific requirements that must be met for approval

## What requires approval?
### Deal size thresholds:
- Deals above $X (varies by company and sales role)
- Multi-year contracts over $Y annual value
- Expansion deals above Z% of existing account value

### Pricing and discounts:
- Discounts exceeding standard authority levels
- Non-standard pricing models (usage-based, outcome-based)
- Custom product bundles or packaging

### Terms and conditions:
- Extended payment terms (net 60+)
- Unusual contract lengths (month-to-month or 4+ years)
- Custom SLAs or service commitments
- Contractual commitments requiring product/service changes

### Strategic considerations:
- Lighthouse accounts or reference-able customers
- Competitive displacements
- New market or vertical entries
- Partner or reseller deals

## Submitting deals for approval
### From the Deals app:
1. Open the deal in **CRM → Deals**
2. Ensure all required fields are complete:
   - **Deal amount**
   - **Stage** (typically "Negotiation" or "Proposal")
   - **Close date**
   - **Products/services** included
   - **Discount** (if any)
   - **Payment terms**
3. Click **Submit for approval**
4. Add **justification** explaining:
   - Why this deal is strategic
   - Competitive situation
   - Customer requirements driving terms
   - Revenue opportunity and expansion potential
5. Click **Submit**
6. Approval request is routed to appropriate executive

### What to include in justification:
- **Customer context**: Industry, size, strategic importance
- **Competitive dynamics**: Who else is in the deal? Why might we lose?
- **Discount rationale**: Why is the discount needed? Is it offset by deal size or expansion?
- **Terms justification**: Why non-standard payment/contract terms?
- **Risk factors**: Implementation complexity, customer health, payment risk
- **Upside potential**: Expansion, references, case study, logo value

## Reviewing deal approvals (Executives)
### Your approval queue:
- View all deals requiring your approval
- Sort by **Deal size**, **Submitted date**, or **Close date**
- Filter by **Sales rep**, **Territory**, or **Product line**

### Deal approval drawer:
1. Click any deal to open details
2. Review:
   - **Deal summary**: Amount, products, terms, close date
   - **Account details**: Customer profile, existing revenue, relationship health
   - **Justification**: Sales rep's explanation for approval
   - **Financial analysis**: Margin, discount impact, multi-year value
   - **Risk assessment**: Implementation, payment, customer risk factors
3. Check for:
   - **Policy compliance**: Does it violate pricing or terms policies?
   - **Strategic fit**: Does it align with company priorities?
   - **Win probability**: Is the deal realistic?
   - **Resource requirements**: Can we deliver what's promised?

### Approval actions:
#### Approve:
1. Click **Approve** button
2. Optionally add comments (e.g., "Approved - strategic logo customer")
3. Confirm approval
4. Sales rep receives email and can proceed with deal
5. Deal moves to next stage in pipeline

#### Reject:
1. Click **Reject** button
2. **Add detailed comment** explaining rejection
3. Provide alternative guidance (e.g., "Max 20% discount" or "Net 45 payment terms only")
4. Confirm rejection
5. Sales rep receives email with rejection reasons
6. Deal returns to previous stage

#### Request more information:
1. Click **Request info** button
2. Specify what additional information is needed
3. Sales rep receives email with request
4. Deal stays in "Pending approval" until resubmitted with additional details

#### Escalate:
1. Click **Escalate** button
2. Select executive to escalate to (e.g., CEO for mega-deals)
3. Add escalation notes
4. Higher-level executive receives approval request

## Approval workflow
### Standard flow:
1. Sales rep finalizes deal details in CRM
2. System checks approval requirements based on amount/terms
3. Approval request created and routed to appropriate executive
4. Executive reviews and approves/rejects/escalates
5. Sales rep notified of decision
6. If approved, deal proceeds to contract/close
7. If rejected, sales rep revises and may resubmit

### Multi-level approvals:
- $0-$50K: Sales manager
- $50K-$250K: Director of Sales
- $250K-$1M: VP of Sales
- $1M+: CRO or CEO
- **Discounts >30%**: CFO approval required in addition to sales leadership

## Email notifications
### For sales reps:
- **Submitted confirmation**: Deal received by approver
- **Approved**: Deal approved with any conditions/comments
- **Rejected**: Rejection reasons and guidance for revision
- **Info requested**: What additional information is needed

### For approvers:
- **New approval request**: Deal summary and link to queue
- **Escalated to you**: Another exec escalated a deal for your review
- **Approaching close date**: Reminder if approval pending and close date is soon

## Dashboard metrics
### For sales reps:
- **Pending approvals**: Your deals awaiting executive sign-off
- **Approval cycle time**: Average days from submission to decision
- **Approval rate**: Percentage of deals approved on first submission

### For executives:
- **Pending queue**: Number of deals awaiting your decision
- **Approved this month**: Deal value and count approved
- **Average approval time**: How quickly you're processing approvals
- **Rejection rate**: Percentage of deals you're rejecting

## Integration with revenue forecasting
- **Approved deals** move to higher probability forecast categories
- **Pending deals** remain in "upside" or "pipeline" categories
- **Rejected deals** may stay in pipeline with adjusted probability
- **Revenue Intelligence** shows impact of approval bottlenecks on forecast

## Best practices
### For sales reps:
- **Submit early** - don't wait until the last minute before close date
- **Provide complete justification** - help executives understand the context
- **Be realistic** - don't submit deals you wouldn't approve if you were the exec
- **Learn from rejections** - track why deals are rejected and adjust
- **Communicate with approver** - if deal is time-sensitive, give them a heads-up

### For approvers:
- **Respond within 24 hours** - approvals shouldn't slow down good deals
- **Provide clear feedback** on rejections - help reps understand what's needed
- **Be consistent** - establish clear criteria so reps know what will be approved
- **Delegate authority** for smaller deals to avoid bottlenecks
- **Celebrate wins** - when you approve a great deal, recognize the rep's work
- **Track patterns** - if you're rejecting frequently, policies may need adjustment
- **Use approvals as coaching** - rejection comments should educate, not just block`,
    },
    {
        title: 'Using the Customer Success app in BOAZ-OS',
        tags: ['customer-success', 'retention', 'health', 'renewals'],
        category: 'Customer Success',
        body: `# Customer Success – Proactive Customer Management

## Purpose
The **Customer Success** app helps you monitor customer health, prevent churn, drive adoption, and identify expansion opportunities. It centralizes customer data, health scores, and engagement metrics to enable proactive relationship management.

## Opening the app
- Go to **CRM Hub → Customer Success**
- Or access from the main dashboard

## Core concepts
- **Customer health**: Overall score (green/yellow/red) based on usage, engagement, support, and renewals
- **Health score**: Numeric value (0-100) calculated from multiple factors
- **Churn risk**: Probability that customer will not renew
- **Expansion opportunity**: Potential for upsell or cross-sell
- **Customer lifecycle**: Stage in customer journey (onboarding, adoption, value, renewal, expansion)
- **Health factors**: Individual metrics contributing to overall health

## Understanding customer health
### Health score components:
- **Product usage** (40%): Login frequency, feature adoption, active users
- **Support tickets** (20%): Ticket volume, severity, resolution time
- **Engagement** (20%): Meeting attendance, training completion, survey responses
- **Commercial** (20%): Payment history, contract status, expansion signals

### Health indicators:
- **🟢 Green (80-100)**: Healthy, engaged, expanding
- **🟡 Yellow (50-79)**: At risk, needs attention
- **🔴 Red (0-49)**: High churn risk, urgent intervention needed

### What affects health score:
**Positive factors:**
- Regular product logins
- Increasing user counts
- High feature adoption
- Quick support ticket resolution
- Positive NPS/CSAT scores
- Executive engagement
- On-time payments

**Negative factors:**
- Declining usage
- Unused features/licenses
- Support ticket escalations
- Low survey scores
- Missed meetings
- Late payments
- Executive disengagement

## Working with customer accounts
### Customer list view:
- See all customers with health scores
- Sort by **Health**, **Renewal date**, **ARR**, or **Last activity**
- Filter by **Health status**, **Lifecycle stage**, or **CSM assigned**
- Use **saved views** for segments (e.g., "Renewals this quarter", "At-risk customers")

### Customer detail page:
Click any customer to open their success dashboard:

#### Overview section:
- **Current health score** with trend (improving/declining)
- **Key metrics**: ARR, user count, contract end date
- **CSM assigned**: Your customer success manager
- **Last touchpoint**: Most recent interaction date
- **Next renewal**: Days until contract renewal

#### Usage metrics:
- **Daily/weekly active users**
- **Feature adoption scores** for each product module
- **Login frequency** trends
- **Power users** vs. occasional users

#### Support history:
- **Open tickets**: Count and severity
- **Closed tickets**: Recent resolution trends
- **Average resolution time**
- **Support satisfaction** scores

#### Financial data:
- **Current ARR** (Annual Recurring Revenue)
- **Contract start/end dates**
- **Payment history** and status
- **Expansion revenue** year-over-year

#### Engagement timeline:
- Recent meetings, emails, and calls
- Training sessions attended
- QBR (Quarterly Business Review) dates
- Survey responses and feedback

## Proactive customer management
### Green customers (healthy):
**Goal**: Drive expansion and advocacy
- Schedule **QBR** to explore expansion opportunities
- Request **case studies** or **references**
- Invite to **user group** or **advisory board**
- Identify **champion** for peer referrals

### Yellow customers (at risk):
**Goal**: Restore health and engagement
- Schedule **check-in call** to understand concerns
- Review **feature adoption** and provide training
- Address **support issues** proactively
- Increase **touchpoint frequency**
- Assign **success plan** with specific milestones

### Red customers (high churn risk):
**Goal**: Urgent intervention to prevent churn
- **Executive escalation** - get leadership involved
- **Root cause analysis** - understand what went wrong
- **Recovery plan** with specific actions and timelines
- **Daily check-ins** until health improves
- Consider **discount** or **pilot program** to re-engage
- Document **save efforts** and outcomes

## Renewal management
### Renewal timeline:
- **180 days out**: Begin renewal conversations, assess health
- **120 days out**: Send renewal proposal if health is green/yellow
- **90 days out**: Escalate if red health, involve executives if needed
- **60 days out**: Finalize terms, address objections
- **30 days out**: Execute contract, process payment
- **Renewal date**: Confirm renewal complete, celebrate with customer

### Renewal risk factors:
- **Red health score**: High likelihood of non-renewal
- **Declining usage**: Customer not getting value
- **Executive turnover**: New decision-makers may reevaluate
- **Budget cuts**: Customer may reduce spend
- **Competitive evaluation**: Customer is shopping alternatives

### Saving at-risk renewals:
1. **Acknowledge issues**: Don't ignore problems
2. **Executive engagement**: Get your leadership involved with theirs
3. **Success plan**: Document what will improve in next contract period
4. **Quick wins**: Deliver immediate value to rebuild trust
5. **Discount/incentive**: If needed, offer financial concessions to save the relationship
6. **Escalation path**: Clear plan if issues arise in next period

## Expansion opportunities
### Expansion signals:
- **Increasing usage**: Need for more licenses
- **Feature requests**: Interest in advanced modules
- **New use cases**: Expanding beyond initial deployment
- **Growing team**: Company hiring, expanding operations
- **Executive engagement**: Leadership sees strategic value
- **Positive feedback**: NPS promoters, case study participants

### Expansion plays:
- **Upsell**: Higher tier/edition with more features
- **Cross-sell**: Additional products or modules
- **User expansion**: More licenses/seats
- **Professional services**: Training, customization, integration
- **Multi-year commit**: Discount for longer term

## Customer Success Plans
### Creating a success plan:
1. Open customer in Customer Success app
2. Click **Create Success Plan**
3. Define:
   - **Goals**: What customer wants to achieve
   - **Success criteria**: How you'll measure achievement
   - **Milestones**: Key checkpoints
   - **Timeline**: Target dates
   - **Owner**: Who's responsible (CSM, customer champion)
4. Review plan with customer in kickoff call
5. Track progress in success plan dashboard

### Plan milestones:
- **Onboarding**: User setup, initial training, go-live
- **Adoption**: Feature activation, user engagement targets
- **Value realization**: Customer achieves stated goals
- **Optimization**: Process improvements, advanced features
- **Expansion**: Upsell/cross-sell opportunities identified

## Meetings and QBRs
### Quarterly Business Reviews (QBRs):
**Purpose**: Strategic check-in on value, health, and roadmap

**Agenda template:**
1. **Business review**: Customer's business challenges/goals
2. **Usage review**: Product adoption, user engagement, feature utilization
3. **Value delivered**: ROI achieved, goals met, success metrics
4. **Support review**: Recent issues, resolutions, satisfaction
5. **Roadmap preview**: Upcoming features, what's next
6. **Action items**: Commitments from both sides

**Best practices:**
- Schedule QBRs **quarterly** for all customers
- Include **executive sponsors** from both sides
- Send **pre-read materials** 1 week before
- Document **action items** and follow up
- Share **QBR summary** within 48 hours

## Dashboards and reporting
### CSM dashboard:
- **My book of business**: All assigned customers
- **Health distribution**: Count of green/yellow/red customers
- **Renewals this quarter**: Customers up for renewal
- **At-risk accounts**: Red health customers
- **Expansion pipeline**: Identified upsell/cross-sell opportunities

### Executive dashboard:
- **Overall health**: Portfolio health trends
- **Net retention rate**: Revenue retention after churn and expansion
- **Gross retention rate**: Logo retention (customer count)
- **Churn rate**: Percentage of customers lost
- **Expansion rate**: Percentage of customers expanding

## Best practices
### Proactive engagement:
- **Don't wait for red health** - engage yellow customers early
- **Regular cadence**: Establish predictable touchpoint schedule
- **Executive alignment**: Include executives in strategic accounts
- **Multi-threading**: Build relationships with multiple customer stakeholders

### Data-driven decisions:
- **Track trends**, not just snapshots - is health improving or declining?
- **Leading indicators**: Usage drops often precede support issues and churn
- **Segmentation**: Tailor engagement approach by customer size/segment
- **Benchmarking**: Compare customers to peers in their industry/size

### Customer advocacy:
- **Be their champion** internally - fight for their needs with product/engineering
- **Celebrate wins** - share customer successes internally and externally
- **Close the loop** - tell customers when their feedback drives changes
- **Build community**: Connect customers with each other for peer learning

### Operational excellence:
- **Document everything** - log all customer interactions
- **Handoffs**: Seamless transitions from sales to success to support
- **Escalation paths**: Clear process for urgent issues
- **Continuous improvement**: Learn from churned customers to prevent future churn`,
    },
    {
        title: 'Financial Intelligence: Complete Guide to GAAP-Compliant Accounting in BOAZ-OS',
        tags: ['crm', 'financial', 'accounting', 'gaap', 'journal-entries', 'financial-statements', 'kpi', 'expenses', 'chart-of-accounts'],
        category: 'Financial Management',
        body: `# Financial Intelligence – GAAP-Compliant Accounting & Financial Statements

## Overview
The **Financial Intelligence** module provides a comprehensive, GAAP-compliant double-entry accounting system integrated directly into BOAZ-OS. It automates financial record-keeping from your CRM transactions and delivers real-time financial statements, KPIs, and AI-powered insights.

## Key Features
- **Chart of Accounts (COA)**: Full asset, liability, equity, revenue, and expense account structure
- **Double-Entry Journal Entries**: Immutable audit trail with automatic balancing validation
- **Accounting Periods**: Fiscal year management with period open/close/lock workflow
- **Auto-Posting**: Automatic journal entry creation from invoices, payments, time entries, and renewals
- **Financial Statements**: Trial Balance, Income Statement (P&L), Balance Sheet, and Cash Flow Statement
- **Expense Tracking**: Full accounts payable workflow with approval and payment processing
- **Financial KPIs**: Real-time profitability ratios, liquidity metrics, and efficiency indicators
- **AI Insights**: Automated analysis with trend detection and forecasting

---

## Getting Started

### Step 1: Seed the Chart of Accounts
1. Navigate to **CRM Hub → Financial Intelligence**
2. On the Dashboard, click **"Seed Default Chart of Accounts"**
3. This creates 50+ standard accounts organized by type:
   - **Assets** (1000-1999): Cash, AR, Inventory, Fixed Assets
   - **Liabilities** (2000-2999): AP, Accrued Expenses, Loans
   - **Equity** (3000-3999): Retained Earnings, Owner's Equity
   - **Revenue** (4000-4999): Services Revenue, Product Sales
   - **Expenses** (5000-6999): COGS, Operating Expenses

### Step 2: Generate Accounting Periods
1. Go to the **Periods** tab
2. Click **"+ Generate Fiscal Year"**
3. Select the fiscal year (current year recommended)
4. Click **"Generate"** to create 12 monthly periods
5. All periods start as **Open** status

### Step 3: Auto-Post Existing Transactions
1. Return to the **Dashboard** tab
2. In the **Auto-Post Transactions** panel, click each button:
   - **Post Invoices**: Creates AR/Revenue journal entries
   - **Post Payments**: Creates Cash/AR journal entries
   - **Post Time Entries**: Creates Labor Cost journal entries
   - **Post Renewals**: Creates AR/Deferred Revenue entries
3. Review the **Recent Journal Entries** section to verify postings

---

## Chart of Accounts (COA)

### Account Types
| Type | Normal Balance | Number Range | Description |
|------|---------------|--------------|-------------|
| Asset | Debit | 1000-1999 | Resources owned by the business |
| Liability | Credit | 2000-2999 | Amounts owed to others |
| Equity | Credit | 3000-3999 | Owner's stake in the business |
| Revenue | Credit | 4000-4999 | Income from business operations |
| Expense | Debit | 5000-6999 | Costs of business operations |

### Account Sub-Types
**Assets:**
- Current Asset (Cash, AR, Prepaid)
- Fixed Asset (Equipment, Vehicles)
- Other Asset (Deposits, Intangibles)

**Liabilities:**
- Current Liability (AP, Accrued Expenses)
- Long-term Liability (Loans, Notes Payable)

**Equity:**
- Owner's Equity
- Retained Earnings

**Revenue:**
- Operating Revenue (Services, Products)
- Other Income (Interest, Gains)

**Expenses:**
- COGS (Cost of Goods Sold)
- Operating Expense (Rent, Salaries, Marketing)
- Other Expense (Interest, Depreciation)

### Managing Accounts
**Creating a new account:**
1. Go to **Chart of Accounts** tab
2. Click **"+ New Account"**
3. Enter:
   - **Account Number**: Must be unique (e.g., 1150)
   - **Name**: Descriptive name (e.g., "Petty Cash")
   - **Type**: Asset, Liability, Equity, Revenue, or Expense
   - **Sub-Type**: Category within the type
   - **Description**: Optional details
   - **Tax Code**: Optional tax reporting code
4. Click **"Create Account"**

**Deactivating accounts:**
- Click the **status toggle** on any account row
- Inactive accounts won't appear in selection dropdowns
- Existing entries using the account remain valid

---

## Journal Entries

### Understanding Double-Entry Accounting
Every transaction affects at least two accounts:
- **Debits** increase asset and expense accounts
- **Credits** increase liability, equity, and revenue accounts
- **Total Debits must equal Total Credits** (balanced entry)

### Creating a Manual Journal Entry
1. Go to **Journal Entries** tab
2. Click **"+ New Entry"**
3. Enter:
   - **Date**: Transaction date
   - **Description**: What this entry represents
4. Add journal lines:
   - Select **Account** from dropdown
   - Enter **Debit** or **Credit** amount (not both)
   - Add optional **Line Description**
5. The **Balance Indicator** shows:
   - 🟢 Green "Balanced" = Ready to post
   - 🔴 Red "Unbalanced" = Fix before posting
6. Click **"Post Entry"**

### Common Entry Examples
**Recording a sale (Invoice):**
| Account | Debit | Credit |
|---------|-------|--------|
| 1100 Accounts Receivable | $1,000 | |
| 4000 Services Revenue | | $1,000 |

**Recording a payment received:**
| Account | Debit | Credit |
|---------|-------|--------|
| 1000 Cash | $1,000 | |
| 1100 Accounts Receivable | | $1,000 |

**Recording an expense:**
| Account | Debit | Credit |
|---------|-------|--------|
| 6100 Office Supplies | $200 | |
| 2000 Accounts Payable | | $200 |

### Reversing Entries
If you need to correct a posted entry:
1. Find the entry in the Journal Entries list
2. Click **"Reverse"** in the Actions column
3. A new entry is created with debits and credits swapped
4. Both entries reference each other for audit trail

---

## Accounting Periods

### Period States
| Status | Description | Actions Allowed |
|--------|-------------|-----------------|
| **Open** | Active period | Post entries, create transactions |
| **Closed** | Soft close | View only, can be reopened |
| **Locked** | Hard close | Permanent, cannot be changed |

### Managing Periods
**Closing a period:**
1. Go to **Periods** tab
2. Find the period to close
3. Click **"Close Period"**
4. All entries in this period become read-only
5. Trial Balance should be balanced before closing

**Reopening a period:**
1. Find the closed period
2. Click **"Reopen Period"**
3. Period returns to Open status
4. Only available for Closed (not Locked) periods

### Period Close Checklist
Before closing a period:
- ✅ All transactions entered and posted
- ✅ Trial Balance is balanced (Debits = Credits)
- ✅ Bank reconciliation complete
- ✅ All expenses recorded
- ✅ Revenue properly recognized
- ✅ Management review complete

---

## Financial Statements

### Trial Balance
The Trial Balance shows all account balances at a point in time.

**How to read it:**
- **Debit Column**: Sum of all debit-normal accounts
- **Credit Column**: Sum of all credit-normal accounts
- **Balanced**: Debits = Credits (shown in green)
- **Unbalanced**: Difference shown in red (indicates error)

**Drill-down feature:**
- Click any **account name** to see all journal entries affecting that account
- View transaction history with running balance
- Identify specific entries causing issues

### Income Statement (P&L)
Shows profitability over a period.

**Sections:**
1. **Revenue**: All income from operations
2. **Cost of Goods Sold (COGS)**: Direct costs
3. **Gross Profit**: Revenue - COGS
4. **Operating Expenses**: Indirect costs
5. **Net Income**: Bottom-line profit/loss

**Key metrics:**
- **Gross Margin %**: (Gross Profit / Revenue) × 100
- **Net Margin %**: (Net Income / Revenue) × 100

### Balance Sheet
Shows financial position at a point in time.

**Equation:** Assets = Liabilities + Equity

**Sections:**
1. **Assets**
   - Current Assets (Cash, AR, Inventory)
   - Fixed Assets (Equipment, less Depreciation)
   - Other Assets (Intangibles, Deposits)
2. **Liabilities**
   - Current Liabilities (AP, Accrued)
   - Long-term Liabilities (Loans)
3. **Equity**
   - Owner's Equity
   - Retained Earnings
   - Current Period Net Income

### Cash Flow Statement
Shows cash movements over a period (Indirect Method).

**Sections:**
1. **Operating Activities**
   - Start with Net Income
   - Add back non-cash expenses (Depreciation)
   - Adjust for working capital changes (AR, AP, Inventory)
2. **Investing Activities**
   - Purchase/sale of fixed assets
   - Long-term investments
3. **Financing Activities**
   - Loan proceeds/payments
   - Owner contributions/distributions

**Net Change in Cash** = Operating + Investing + Financing

---

## Expense Management

### Expense Workflow
1. **Draft**: Initial entry, not yet submitted
2. **Pending Approval**: Submitted for review
3. **Approved**: Manager approved, ready to pay
4. **Paid**: Payment processed, JE created
5. **Void**: Canceled (creates reversing entry if paid)

### Creating an Expense
1. Go to **Expenses** tab
2. Click **"+ New Expense"**
3. Enter:
   - **Vendor Name**: Who you're paying
   - **Date**: Expense date
   - **Due Date**: Payment due date
   - **Category**: Type of expense
   - **Payment Method**: Check, CC, ACH, Cash
4. Add expense lines:
   - Select **Expense Account**
   - Enter **Amount**
   - Add optional **Description**
5. Review **Subtotal** and **Total**
6. Click **"Create Expense"**

### Processing Expenses
**Approving:**
- Find pending expense
- Review details and amounts
- Click **"Approve"**

**Marking as Paid:**
- Find approved expense
- Click **"Mark Paid"**
- Journal entry automatically created:
  - DR: Expense Account(s)
  - CR: Cash/Bank Account

**Voiding:**
- Click **"Void"** on any expense
- If already paid, a reversing JE is created
- Expense status becomes "Void"

---

## Financial KPIs & Analytics

### Profitability Metrics
| KPI | Formula | Good Target |
|-----|---------|-------------|
| **Gross Margin** | (Revenue - COGS) / Revenue | > 50% |
| **Operating Margin** | (Gross Profit - OpEx) / Revenue | > 20% |
| **Net Margin** | Net Income / Revenue | > 15% |

### Liquidity Ratios
| KPI | Formula | Good Target |
|-----|---------|-------------|
| **Current Ratio** | Current Assets / Current Liabilities | > 2.0 |
| **Quick Ratio** | (Current Assets - Inventory) / Current Liabilities | > 1.5 |

### Efficiency Metrics
| KPI | Formula | Good Target |
|-----|---------|-------------|
| **DSO** | Accounts Receivable / (Revenue / 365) | < 30 days |
| **Debt-to-Equity** | Total Liabilities / Total Equity | < 1.0 |

### AI Insights
The system automatically generates insights including:
- **Margin Analysis**: Alerts when margins fall below thresholds
- **Liquidity Warnings**: Flags potential cash flow issues
- **Collection Efficiency**: Identifies slow-paying patterns
- **Trend Detection**: Highlights revenue/expense trends
- **Revenue Forecasting**: Predicts future revenue based on historical patterns

---

## Auto-Posting Rules

### Invoice Auto-Posting
When an invoice is created:
| Account | Debit | Credit |
|---------|-------|--------|
| 1100 Accounts Receivable | Invoice Total | |
| 4000 Services Revenue | | Invoice Total |

### Payment Auto-Posting
When a payment is received:
| Account | Debit | Credit |
|---------|-------|--------|
| 1000 Cash/Bank | Payment Amount | |
| 1100 Accounts Receivable | | Payment Amount |

### Time Entry Auto-Posting
When time is logged:
| Account | Debit | Credit |
|---------|-------|--------|
| 5000 Labor - COGS (or 6000 Labor - OpEx) | Hours × Rate | |
| 2300 Accrued Wages | | Hours × Rate |

### Renewal Auto-Posting
When a renewal is created:
| Account | Debit | Credit |
|---------|-------|--------|
| 1100 Accounts Receivable | Renewal Amount | |
| 2400 Deferred Revenue | | Renewal Amount |

---

## Best Practices

### Daily Tasks
- ✅ Review Dashboard KPIs
- ✅ Check for pending expense approvals
- ✅ Verify auto-posted transactions
- ✅ Address any AI insights/warnings

### Weekly Tasks
- ✅ Review Trial Balance for accuracy
- ✅ Process pending expenses
- ✅ Reconcile cash accounts
- ✅ Review aged receivables

### Monthly Tasks
- ✅ Complete all transaction entry
- ✅ Run and review financial statements
- ✅ Analyze KPI trends
- ✅ Close the accounting period

### Year-End Tasks
- ✅ Complete all monthly closes
- ✅ Generate annual financial statements
- ✅ Lock prior year periods
- ✅ Generate new fiscal year periods
- ✅ Review and adjust Chart of Accounts

---

## Troubleshooting

### Trial Balance Not Balanced
1. Check for recent manual entries with errors
2. Use drill-down to find discrepancies
3. Look for entries posted to wrong period
4. Verify all auto-posted transactions completed

### Missing Journal Entries
1. Verify source transaction exists (invoice, payment, etc.)
2. Check if auto-posting has been run
3. Confirm accounting period is Open
4. Review entry filters (may be hidden by status filter)

### Incorrect Account Balances
1. Use drill-down to see all entries
2. Check for reversed or voided entries
3. Verify entries posted to correct accounts
4. Look for duplicate postings

### Period Won't Close
1. Ensure Trial Balance is balanced
2. Check for draft journal entries
3. Verify all pending expenses are processed
4. Review for any locked sub-periods

---

## Glossary

| Term | Definition |
|------|------------|
| **Chart of Accounts** | Master list of all accounts used in the general ledger |
| **Double-Entry** | Accounting method where every transaction affects two or more accounts |
| **Debit** | Left side of an entry; increases assets and expenses |
| **Credit** | Right side of an entry; increases liabilities, equity, and revenue |
| **Journal Entry** | Record of a single transaction with balanced debits and credits |
| **General Ledger** | Collection of all journal entries organized by account |
| **Trial Balance** | List of all account balances to verify debits equal credits |
| **GAAP** | Generally Accepted Accounting Principles |
| **Fiscal Year** | 12-month accounting period (may differ from calendar year) |
| **Period Close** | Process of finalizing an accounting period |
| **Accrual Basis** | Recording revenue when earned and expenses when incurred |
| **Reconciliation** | Process of verifying account balances against external records |
| **Audit Trail** | Chronological record of all transactions and changes |

---

## Related Articles
- Revenue Intelligence: AI-Powered Deal Analytics
- Invoices: Billing and Payment Processing
- Projects & Delivery: Time Tracking and Labor Costs
- Renewals & Subscriptions: Recurring Revenue Management`,
    },
];
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('❌ Database not available. Make sure MONGO_URL is set.');
        process.exit(1);
    }
    console.log('📚 Seeding additional Knowledge Base articles...');
    const collection = db.collection('kb_articles');
    let created = 0;
    let skipped = 0;
    for (const article of ARTICLES) {
        // Check if article already exists by title
        const existing = await collection.findOne({ title: article.title });
        if (existing) {
            console.log(`⏭️  Skipping "${article.title}" (already exists)`);
            skipped++;
            continue;
        }
        const doc = {
            ...article,
            createdAt: new Date(),
            updatedAt: new Date(),
            views: 0,
        };
        await collection.insertOne(doc);
        console.log(`✅ Created "${article.title}"`);
        created++;
    }
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📚 Total: ${ARTICLES.length}`);
    process.exit(0);
}
main().catch((err) => {
    console.error('❌ Error seeding KB articles:', err);
    process.exit(1);
});
