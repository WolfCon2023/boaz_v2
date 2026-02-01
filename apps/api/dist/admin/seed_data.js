/**
 * Admin API: Seed Data Endpoints
 *
 * Allows admins to trigger data seeding via API calls
 * Runs on Railway where MongoDB is accessible
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requirePermission } from '../auth/rbac.js';
export const adminSeedDataRouter = Router();
// All routes require admin permission
adminSeedDataRouter.use(requireAuth);
adminSeedDataRouter.use(requirePermission('*'));
// POST /api/admin/seed/it-roles - Add IT and IT Manager roles
adminSeedDataRouter.post('/it-roles', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const IT_ROLE = {
            name: 'it',
            permissions: [
                'support.read', 'support.write', 'kb.read', 'kb.write',
                'assets.read', 'assets.write', 'vendors.read', 'vendors.write',
                'projects.read', 'slas.read', 'contacts.read', 'accounts.read', 'products.read',
            ],
        };
        const IT_MANAGER_ROLE = {
            name: 'it_manager',
            permissions: [
                'support.read', 'support.write', 'kb.read', 'kb.write',
                'assets.read', 'assets.write', 'vendors.read', 'vendors.write',
                'projects.read', 'slas.read', 'slas.write', 'contacts.read',
                'accounts.read', 'products.read', 'users.read', 'roles.read',
                'quotes.read', 'quotes.approve', 'invoices.read', 'deals.read', 'renewals.read',
            ],
        };
        const results = { it: 'skipped', it_manager: 'skipped' };
        // Check if IT role exists
        const itRoleExists = await db.collection('roles').findOne({ name: 'it' });
        if (!itRoleExists) {
            await db.collection('roles').insertOne(IT_ROLE);
            results.it = 'created';
        }
        // Check if IT Manager role exists
        const itManagerRoleExists = await db.collection('roles').findOne({ name: 'it_manager' });
        if (!itManagerRoleExists) {
            await db.collection('roles').insertOne(IT_MANAGER_ROLE);
            results.it_manager = 'created';
        }
        // Get all roles
        const allRoles = await db.collection('roles').find({}).toArray();
        res.json({
            data: {
                message: 'IT roles seeded successfully',
                results,
                totalRoles: allRoles.length,
                roles: allRoles.map((r) => ({ name: r.name, permissions: r.permissions.length })),
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed IT roles error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_roles' });
    }
});
// POST /api/admin/seed/roles-kb - Add Roles & Permissions KB article
adminSeedDataRouter.post('/roles-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ROLES_KB_ARTICLE = {
            title: 'User Roles & Permissions Guide',
            category: 'Administration',
            slug: 'user-roles-permissions',
            tags: ['admin', 'roles', 'permissions', 'security', 'access control'],
            body: `# User Roles & Permissions Guide

This guide explains all user roles in BOAZ-OS and their permissions.

---

## 🛡️ **Role Overview**

BOAZ-OS uses a role-based access control (RBAC) system. Each user can be assigned one or more roles that determine what they can access and do within the system.

---

## 👥 **Internal User Roles**

### **1. Admin** 🔑
**Full System Access**

**Permissions:** All permissions (*)

**What they can do:**
- ✅ Everything - complete system control
- ✅ Manage users and roles
- ✅ Access all applications
- ✅ Approve all requests
- ✅ System configuration
- ✅ View all data across all modules

**Best for:** System administrators, business owners, IT directors

---

### **2. Manager** 👔
**Team & User Management**

**Permissions:**
- users.read
- users.write
- roles.read

**What they can do:**
- ✅ View and manage users
- ✅ Assign roles to team members
- ✅ View role definitions
- ✅ Access granted applications

**What they cannot do:**
- ❌ Create or modify roles
- ❌ Access financial data (unless granted separately)
- ❌ System configuration

**Best for:** Department managers, team leads, HR managers

---

### **3. IT** 🔧
**Technical Support & Asset Management**

**Permissions:**
- support.read, support.write
- kb.read, kb.write
- assets.read, assets.write
- vendors.read, vendors.write
- projects.read
- slas.read
- contacts.read
- accounts.read
- products.read

**What they can do:**
- ✅ Handle support tickets
- ✅ Manage knowledge base
- ✅ Track and manage assets/installed base
- ✅ Manage vendor relationships
- ✅ View projects, contacts, and accounts (read-only)
- ✅ View SLAs and products

**What they cannot do:**
- ❌ Approve quotes or deals
- ❌ Manage users
- ❌ Access financial data
- ❌ Send marketing campaigns

**Best for:** IT support specialists, help desk agents, systems administrators

---

### **4. IT Manager** 💼
**IT Oversight & Technical Approvals**

**Permissions:**
- All IT permissions, PLUS:
- slas.write
- users.read
- roles.read
- quotes.read, quotes.approve
- invoices.read
- deals.read
- renewals.read

**What they can do:**
- ✅ Everything IT can do
- ✅ Manage SLAs
- ✅ View and manage IT team members
- ✅ Approve IT-related quotes (equipment, software, services)
- ✅ View deals, invoices, and renewals for planning
- ✅ Access to broader business context

**What they cannot do:**
- ❌ Modify user permissions
- ❌ Create or edit deals/invoices
- ❌ Access marketing campaigns

**Best for:** IT managers, IT directors, technical leads

---

### **5. Staff** 📋
**Basic User Access**

**Permissions:**
- users.read

**What they can do:**
- ✅ View user directory
- ✅ Access granted applications

**What they cannot do:**
- ❌ Modify any data
- ❌ Access sensitive information

**Best for:** General employees, contractors with limited access

---

## 📊 **Role Comparison Matrix**

| Feature | Admin | Manager | IT | IT Manager | Staff |
|---------|:-----:|:-------:|:--:|:----------:|:-----:|
| **User Management** | ✅ Full | ✅ Full | ❌ | 👁️ Read | 👁️ Read |
| **Support Tickets** | ✅ | ❌ | ✅ Full | ✅ Full | ❌ |
| **Assets & Vendors** | ✅ | ❌ | ✅ Full | ✅ Full | ❌ |
| **Knowledge Base** | ✅ | ❌ | ✅ Full | ✅ Full | ❌ |
| **Approve Quotes** | ✅ All | ❌ | ❌ | ✅ IT Only | ❌ |
| **SLA Management** | ✅ | ❌ | 👁️ Read | ✅ Full | ❌ |
| **View Deals** | ✅ | 👁️ Read* | ❌ | 👁️ Read | ❌ |
| **Projects** | ✅ | 👁️ Read* | 👁️ Read | 👁️ Read | ❌ |
| **System Config** | ✅ | ❌ | ❌ | ❌ | ❌ |

*If application access granted

---

## 🔧 **Managing Roles**

### **Assigning Roles to Users**
1. Go to **Admin Portal**
2. Click **Users** tab
3. Find the user
4. Click **Edit Role**
5. Select appropriate role(s)
6. Save

---

## ❓ **Common Questions**

### **Can a user have multiple roles?**
Yes! Users can be assigned multiple roles. Their permissions are combined (union of all role permissions).

### **What happens if a user has no role?**
They can login but will have no access to any applications or data (except their own profile).

### **What's the difference between IT and IT Manager?**
IT handles day-to-day support and asset management. IT Manager adds oversight, approvals, and team management capabilities.

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        // Check if article already exists
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'user-roles-permissions' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'user-roles-permissions' }, { $set: { ...ROLES_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ROLES_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ROLES_KB_ARTICLE.title,
                slug: ROLES_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${ROLES_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed roles KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/tickets-kb - Add Tickets KB article
adminSeedDataRouter.post('/tickets-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const TICKETS_KB_ARTICLE = {
            title: 'Support Tickets Guide',
            category: 'Help Desk',
            slug: 'support-tickets-guide',
            tags: ['tickets', 'support', 'help desk', 'customer service', 'sla'],
            body: `# Support Tickets Guide

This guide explains how to create, manage, and track support tickets in BOAZ-OS.

---

## 📝 **Overview**

The Support Tickets app allows you to manage customer support requests, track issue resolution, and maintain service level agreements (SLAs).

---

## 🎫 **Ticket Types**

### **Internal Tickets**
Internal tickets are for issues reported by employees or internal users.

### **External Tickets**
External tickets are submitted by customers through the Customer Portal or via email.

---

## 🆕 **Creating a Ticket**

### **From the Help Desk App:**
1. Click **New Ticket** button
2. Fill in the required fields:
   - **Short Description**: Brief summary of the issue
   - **Description**: Detailed explanation
   - **Priority**: Low, Medium, High, Critical
   - **Status**: Open, In Progress, Pending, Resolved, Closed
   - **Account**: Link to customer account (optional)
   - **Contact**: Link to contact person (optional)
   - **Assignee**: Who is responsible for resolving the ticket
   - **Owner**: Who owns the ticket (usually the creator)
   - **Type**: Internal or External
   - **SLA Due At**: When the SLA expires (calculated automatically based on priority)
3. Click **Create Ticket**

### **From the Customer Portal:**
Customers can submit tickets directly:
1. Log in to the Customer Portal
2. Navigate to **Tickets**
3. Click **Create Ticket**
4. Fill in:
   - Subject
   - Description
   - Priority
   - Phone number
5. Submit

---

## 📊 **Ticket Statuses**

| Status | Description |
|--------|-------------|
| **Open** | New ticket, not yet assigned or worked on |
| **In Progress** | Actively being worked on |
| **Pending** | Waiting for customer response or external dependency |
| **Resolved** | Issue is resolved, waiting for customer confirmation |
| **Closed** | Ticket is complete and closed |

---

## 🎯 **Priority Levels**

| Priority | SLA Time | Use For |
|----------|----------|---------|
| **Critical** | 1 hour | System down, major business impact |
| **High** | 4 hours | Significant issue affecting multiple users |
| **Medium** | 1 day | Standard issues |
| **Low** | 3 days | Minor issues, feature requests |

---

## ⏰ **SLA Management**

### **What is an SLA?**
Service Level Agreement defines the expected response time for resolving tickets.

### **SLA Calculation:**
- SLA due time is automatically calculated when a ticket is created
- Based on ticket priority
- Breached SLAs appear in red in the ticket list

### **SLA Views:**
- **Breached SLA**: Shows all tickets with breached SLAs
- **Due next 60m**: Shows tickets due within the next 60 minutes

---

## 💬 **Adding Comments**

1. Open a ticket
2. Scroll to the **Comments** section
3. Enter your comment
4. Click **Add Comment**
5. Comments are timestamped and show who added them

---

## 📧 **Email Notifications**

### **Automatic Notifications:**
- When a ticket is created, the assignee receives an email
- When a ticket is updated, relevant parties are notified
- Customers receive notifications when their tickets are updated

### **Manual Updates to Customers:**
1. Open the ticket
2. Click **Send Update to Customer**
3. Enter the update message
4. Optionally add CC recipients
5. Click **Send**

---

## 🔍 **Searching & Filtering**

### **Search:**
Type in the search box to find tickets by number, description, or requester name.

### **Filters:**
- **Status**: Filter by ticket status (multi-select)
- **Priority**: Filter by priority level
- **Type**: Internal or External
- **Breached SLA Only**: Show only tickets with breached SLAs
- **Due Next 60m**: Show tickets due soon

### **Saved Views:**
- Create custom views with your favorite filters
- Save and quickly switch between views
- Views are saved per user

---

## 📱 **Column Customization**

Click the **Columns** button to show/hide columns:
- Ticket Number
- Short Description
- Status
- Priority
- Assignee
- Account
- Contact
- SLA Due At
- Created At
- Updated At
- Owner
- Type
- Requester Name
- Requester Email
- Requester Phone

---

## 🎨 **Status & Priority Badges**

Tickets display color-coded badges:
- **Status**: Open (blue), In Progress (yellow), Pending (orange), Resolved (green), Closed (gray)
- **Priority**: Critical (red), High (orange), Medium (yellow), Low (gray)

---

## 🛠️ **Best Practices**

1. **Assign tickets promptly** to ensure timely resolution
2. **Update ticket status** as work progresses
3. **Add comments** to document troubleshooting steps
4. **Link to accounts/contacts** for better customer context
5. **Monitor SLA breaches** and prioritize accordingly
6. **Send customer updates** regularly to keep them informed
7. **Close resolved tickets** to keep your queue clean

---

## ❓ **Common Questions**

### **How do I change a ticket's assignee?**
Edit the ticket and update the **Assignee** field.

### **Can customers view ticket history?**
Yes, customers can view all their tickets and comments in the Customer Portal.

### **What happens when an SLA is breached?**
The ticket shows in red, and appears in the "Breached SLA" view. It's still actionable, but indicates the SLA was not met.

### **Can I delete a ticket?**
Yes, admins can delete tickets. Click the **Delete** button when editing a ticket (use with caution).

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'support-tickets-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'support-tickets-guide' }, { $set: { ...TICKETS_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(TICKETS_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: TICKETS_KB_ARTICLE.title,
                slug: TICKETS_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${TICKETS_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed tickets KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/approval-queue-kb - Add Approval Queue KB article
adminSeedDataRouter.post('/approval-queue-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const APPROVAL_QUEUE_KB_ARTICLE = {
            title: 'Approval Queue Guide',
            category: 'Workflows',
            slug: 'approval-queue-guide',
            tags: ['approval', 'queue', 'workflow', 'quotes', 'authorization'],
            body: `# Approval Queue Guide

This guide explains how to use the Approval Queue to review and approve quotes.

---

## 📋 **Overview**

The Approval Queue is where quotes are sent for review and approval before being sent to customers. This ensures proper oversight and authorization for pricing, terms, and commitments.

---

## 🔄 **Approval Workflow**

1. **Quote Created**: A user creates a quote in the CRM
2. **Submit for Approval**: The quote is submitted to the Approval Queue
3. **Review**: Authorized users review the quote details
4. **Decision**: Approve or reject the quote
5. **Notification**: The quote creator is notified of the decision
6. **Next Steps**: 
   - If approved, the quote can be sent to the customer
   - If rejected, the quote is returned for revision

---

## 👥 **Who Can Approve Quotes?**

Users with the following permissions can approve quotes:
- **Admins**: Can approve all quotes
- **Managers**: Can approve quotes up to their authorization limit
- **Sales Managers**: Can approve sales-related quotes
- **IT Managers**: Can approve IT-related quotes (equipment, software, services)

---

## 🆕 **Viewing the Queue**

### **Accessing the Queue:**
1. Navigate to **Apps** > **Approval Queue**
2. View all pending quotes awaiting approval

### **Queue Columns:**
- **Quote Number**: Unique quote identifier
- **Account**: Customer account
- **Total Amount**: Quote total value
- **Created By**: Who created the quote
- **Submitted At**: When it was submitted for approval
- **Status**: Pending, Approved, Rejected

---

## ✅ **Approving a Quote**

1. Click on a quote in the queue to view details
2. Review:
   - Line items and pricing
   - Terms and conditions
   - Customer information
   - Notes and comments
3. Click **Approve**
4. Optionally add approval comments
5. Confirm approval

### **What Happens After Approval:**
- Quote status changes to "Approved"
- Creator receives email notification
- Quote can now be sent to the customer
- Quote is removed from the Approval Queue

---

## ❌ **Rejecting a Quote**

1. Click on a quote in the queue
2. Click **Reject**
3. **Required**: Add rejection reason/comments
4. Confirm rejection

### **What Happens After Rejection:**
- Quote status changes to "Rejected"
- Creator receives email notification with rejection reason
- Quote is removed from the Approval Queue
- Creator can revise and resubmit

---

## 🔍 **Filtering & Sorting**

### **Filters:**
- **Status**: Pending, Approved, Rejected
- **Date Range**: Filter by submission date
- **Amount Range**: Filter by quote value
- **Created By**: Filter by quote creator

### **Sorting:**
- By Amount (ascending/descending)
- By Date (oldest first/newest first)
- By Account name

---

## 📧 **Email Notifications**

### **Approvers Receive:**
- New quote submitted for approval
- Quote details and summary

### **Quote Creators Receive:**
- Quote approved notification
- Quote rejected notification with reason
- Reminder if quote needs revision

---

## 🎯 **Best Practices**

1. **Review Promptly**: Check the queue daily to avoid delays
2. **Provide Clear Feedback**: If rejecting, explain why clearly
3. **Check Details**: Verify pricing, terms, and customer information
4. **Communicate**: If questions arise, contact the quote creator before rejecting
5. **Document**: Use comments to explain approval decisions
6. **Set Limits**: Establish clear authorization limits for different approval levels

---

## 📊 **Approval Metrics**

Track approval performance:
- Average approval time
- Approval rate vs. rejection rate
- Quotes pending over 24 hours
- Approval bottlenecks

---

## 🛠️ **Troubleshooting**

### **I don't see any quotes in my queue**
- Verify you have quote approval permissions
- Check if there are any pending quotes
- Ensure filters are not hiding quotes

### **I approved a quote but it's still showing**
- Refresh the page
- The quote may have been approved by another user simultaneously

### **Can I un-approve a quote?**
No, once approved, a quote cannot be un-approved. Contact an admin if a mistake was made.

---

## ❓ **Common Questions**

### **What's the difference between Approval Queue and Acceptance Queue?**
- **Approval Queue**: Internal authorization before sending to customer
- **Acceptance Queue**: Quotes accepted by customers, ready to convert to orders

### **Can multiple people approve the same quote?**
Yes, but only one approval is needed. The first person to approve/reject processes the quote.

### **How long do quotes stay in the queue?**
Quotes remain until approved or rejected. Set up reminders for quotes pending over 48 hours.

### **Can I see who approved a quote?**
Yes, check the quote history to see who approved it and when.

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'approval-queue-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'approval-queue-guide' }, { $set: { ...APPROVAL_QUEUE_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(APPROVAL_QUEUE_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: APPROVAL_QUEUE_KB_ARTICLE.title,
                slug: APPROVAL_QUEUE_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${APPROVAL_QUEUE_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed approval queue KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/acceptance-queue-kb - Add Acceptance Queue KB article
adminSeedDataRouter.post('/acceptance-queue-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ACCEPTANCE_QUEUE_KB_ARTICLE = {
            title: 'Acceptance Queue Guide',
            category: 'Workflows',
            slug: 'acceptance-queue-guide',
            tags: ['acceptance', 'queue', 'quotes', 'orders', 'conversion'],
            body: `# Acceptance Queue Guide

This guide explains how to use the Acceptance Queue to process customer-accepted quotes.

---

## 📋 **Overview**

The Acceptance Queue displays quotes that have been accepted by customers and are ready to be converted into orders, invoices, or projects.

---

## 🔄 **Acceptance Workflow**

1. **Quote Approved**: Quote passes through Approval Queue
2. **Quote Sent**: Quote is sent to customer
3. **Customer Accepts**: Customer accepts the quote
4. **Appears in Queue**: Quote shows up in Acceptance Queue
5. **Process**: Convert to order, invoice, or project
6. **Fulfillment**: Begin order fulfillment or project delivery

---

## 🆕 **Viewing the Queue**

### **Accessing the Queue:**
1. Navigate to **Apps** > **Acceptance Queue**
2. View all customer-accepted quotes

### **Queue Columns:**
- **Quote Number**: Unique quote identifier
- **Account**: Customer account
- **Contact**: Customer contact who accepted
- **Total Amount**: Quote value
- **Accepted At**: When customer accepted
- **Valid Until**: Quote expiration date
- **Status**: Accepted, Processed, Expired

---

## ✅ **Processing an Accepted Quote**

1. Click on a quote to view full details
2. Verify:
   - Customer acceptance signature/confirmation
   - Line items and pricing
   - Delivery/service dates
   - Payment terms
3. Choose action:
   - **Convert to Invoice**: Create invoice for payment
   - **Convert to Order**: Create sales order
   - **Create Project**: For service-based quotes
   - **Mark as Processed**: Manual processing

### **Convert to Invoice:**
1. Click **Convert to Invoice**
2. Verify invoice details
3. Set due date and payment terms
4. Click **Create Invoice**
5. Invoice is automatically sent to customer

### **Convert to Order:**
1. Click **Convert to Order**
2. Add order details (PO number, ship date, etc.)
3. Click **Create Order**
4. Order is sent to fulfillment

### **Create Project:**
1. Click **Create Project**
2. Add project details:
   - Project name
   - Start date
   - Delivery date
   - Team members
3. Click **Create Project**
4. Project appears in Projects & Delivery app

---

## ⏰ **Quote Expiration**

### **Valid Until Date:**
- Every quote has an expiration date
- Expired quotes cannot be processed
- System alerts when quotes are near expiration

### **Handling Expired Quotes:**
1. Contact customer to reconfirm
2. Create new quote with updated terms
3. Mark old quote as expired

---

## 🔍 **Filtering & Sorting**

### **Filters:**
- **Status**: Accepted, Processed, Expired
- **Date Range**: Filter by acceptance date
- **Amount Range**: Filter by quote value
- **Expiring Soon**: Quotes expiring within 7 days

### **Sorting:**
- By Acceptance Date (oldest first/newest first)
- By Amount (ascending/descending)
- By Expiration Date (soonest first)

---

## 📧 **Email Notifications**

### **Sales Team Receives:**
- New quote accepted by customer
- Quote nearing expiration
- Quote processed confirmation

### **Customer Receives:**
- Quote acceptance confirmation
- Invoice/order confirmation
- Project kickoff details

---

## 📊 **Queue Metrics**

Track acceptance queue performance:
- Average time from acceptance to processing
- Quotes processed vs. expired
- Revenue in queue
- Conversion rate by quote type

---

## 🎯 **Best Practices**

1. **Process Quickly**: Convert accepted quotes within 24 hours
2. **Check Expiration**: Prioritize quotes nearing expiration
3. **Verify Details**: Double-check all information before conversion
4. **Communicate**: Keep customers informed of next steps
5. **Update Status**: Mark quotes as processed to keep queue clean
6. **Track Metrics**: Monitor queue performance and bottlenecks

---

## 🛠️ **Bulk Actions**

Process multiple quotes at once:
1. Select multiple quotes (checkbox)
2. Choose bulk action:
   - **Bulk Convert to Invoices**
   - **Bulk Create Projects**
   - **Bulk Mark as Processed**
3. Confirm action

---

## 🚨 **Common Issues**

### **Quote is in queue but customer didn't accept**
- Verify acceptance signature/confirmation
- Check customer portal logs
- Contact customer to confirm

### **Cannot convert quote**
- Check if quote is expired
- Verify all required fields are filled
- Ensure customer account is active

### **Quote disappeared from queue**
- Check if another user processed it
- Look in "Processed" status filter
- Check if quote expired

---

## ❓ **Common Questions**

### **What's the difference between Approval Queue and Acceptance Queue?**
- **Approval Queue**: Internal authorization before sending to customer
- **Acceptance Queue**: Quotes accepted by customers, ready to process

### **Can I edit a quote after customer acceptance?**
No, accepted quotes are locked. Create a new quote if changes are needed.

### **What happens if I don't process a quote before expiration?**
The quote becomes invalid and must be recreated with new terms.

### **Can customers accept a quote after it expires?**
No, expired quotes cannot be accepted. Extend the validity period or create a new quote.

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'acceptance-queue-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'acceptance-queue-guide' }, { $set: { ...ACCEPTANCE_QUEUE_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ACCEPTANCE_QUEUE_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ACCEPTANCE_QUEUE_KB_ARTICLE.title,
                slug: ACCEPTANCE_QUEUE_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${ACCEPTANCE_QUEUE_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed acceptance queue KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/deal-approval-kb - Add Deal Approval Queue KB article
adminSeedDataRouter.post('/deal-approval-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const DEAL_APPROVAL_KB_ARTICLE = {
            title: 'Deal Approval Queue Guide',
            category: 'Workflows',
            slug: 'deal-approval-queue-guide',
            tags: ['deals', 'approval', 'queue', 'sales', 'authorization'],
            body: `# Deal Approval Queue Guide

This guide explains how to use the Deal Approval Queue to review and approve sales deals.

---

## 📋 **Overview**

The Deal Approval Queue is where sales deals are sent for management review and approval before closing. This ensures proper oversight for large deals, special pricing, or strategic accounts.

---

## 🔄 **Deal Approval Workflow**

1. **Deal Created**: Sales rep creates a deal in the CRM
2. **Submit for Approval**: Deal is submitted to approval queue when it meets certain criteria
3. **Review**: Manager reviews deal details, pricing, and terms
4. **Decision**: Approve or reject the deal
5. **Notification**: Sales rep is notified of the decision
6. **Next Steps**:
   - If approved, sales rep can proceed to close the deal
   - If rejected, deal is returned for revision

---

## 📊 **When Deals Require Approval**

Deals typically require approval when:
- **Deal value exceeds threshold** (e.g., over $50,000)
- **Custom pricing** or discounts beyond standard limits
- **Special terms** or payment arrangements
- **Strategic accounts** or high-value customers
- **Multi-year contracts** or long-term commitments
- **Manually submitted** by sales rep for review

---

## 👥 **Who Can Approve Deals?**

Users with the following permissions can approve deals:
- **Admins**: Can approve all deals
- **Sales Managers**: Can approve sales deals up to their limit
- **Executive Team**: Can approve large strategic deals
- **Finance**: Can approve deals with payment terms

---

## 🆕 **Viewing the Queue**

### **Accessing the Queue:**
1. Navigate to **Apps** > **Deal Approval Queue**
2. View all pending deals awaiting approval

### **Queue Columns:**
- **Deal Name**: Deal title
- **Account**: Customer account
- **Owner**: Sales rep who created the deal
- **Deal Value**: Total deal amount
- **Close Date**: Forecasted close date
- **Stage**: Current deal stage
- **Submitted At**: When submitted for approval
- **Status**: Pending, Approved, Rejected

---

## ✅ **Approving a Deal**

1. Click on a deal in the queue to view details
2. Review:
   - **Deal Summary**: Value, stage, close date
   - **Account Information**: Customer details, history
   - **Products/Services**: Line items and pricing
   - **Terms**: Payment terms, contract length
   - **Discount Analysis**: If discounts were applied
   - **Revenue Forecast**: Impact on pipeline
   - **Deal History**: Previous interactions and notes
3. Click **Approve**
4. Optionally add approval comments
5. Confirm approval

### **What Happens After Approval:**
- Deal status changes to "Approved"
- Sales rep receives email notification
- Deal can proceed to close
- Deal is removed from the approval queue
- Forecast is updated

---

## ❌ **Rejecting a Deal**

1. Click on a deal in the queue
2. Click **Reject**
3. **Required**: Add rejection reason/comments
   - Pricing concerns
   - Terms not acceptable
   - Customer credit issues
   - Strategic reasons
4. Confirm rejection

### **What Happens After Rejection:**
- Deal status changes to "Rejected"
- Sales rep receives email notification with rejection reason
- Deal is removed from the approval queue
- Sales rep can revise and resubmit
- Deal history tracks rejection

---

## 💰 **Discount Analysis**

When reviewing deals with discounts:
- **Standard Margin**: Expected margin
- **Actual Margin**: Margin with applied discount
- **Discount Percentage**: Total discount given
- **Impact on Revenue**: How it affects targets
- **Justification**: Sales rep's reasoning

---

## 🔍 **Filtering & Sorting**

### **Filters:**
- **Status**: Pending, Approved, Rejected
- **Value Range**: Filter by deal size
- **Owner**: Filter by sales rep
- **Account**: Filter by customer
- **Close Date Range**: Filter by forecasted close date
- **Stage**: Filter by deal stage

### **Sorting:**
- By Value (ascending/descending)
- By Close Date (soonest first/furthest)
- By Submission Date (oldest first/newest first)

---

## 📧 **Email Notifications**

### **Approvers Receive:**
- New deal submitted for approval
- Deal details and summary
- Deal nearing close date

### **Sales Reps Receive:**
- Deal approved notification
- Deal rejected notification with reason
- Reminder to resubmit revised deal

---

## 🎯 **Best Practices**

1. **Review Promptly**: Check queue daily, especially for deals nearing close date
2. **Provide Clear Feedback**: If rejecting, explain clearly what needs to change
3. **Validate Pricing**: Ensure pricing aligns with company strategy
4. **Check Account Health**: Review customer payment history
5. **Consider Strategic Value**: Not all deals are about immediate profit
6. **Document Decisions**: Use comments to explain approval reasoning
7. **Escalate When Needed**: Large or complex deals may need executive review

---

## 📊 **Approval Metrics**

Track deal approval performance:
- Average approval time
- Approval rate vs. rejection rate
- Deals pending over 48 hours
- Approval bottlenecks by approver
- Revenue in approval queue
- Impact on forecast

---

## 🚨 **Urgent Approvals**

For time-sensitive deals:
1. Sales rep marks deal as **Urgent**
2. Approvers receive high-priority notification
3. Target: Review within 4 hours
4. Use comments to explain urgency

---

## 🛠️ **Escalation Process**

If deal approval is:
- **Over threshold**: Escalate to executive team
- **Strategic account**: Loop in account management
- **Payment terms issues**: Include finance approval
- **Legal concerns**: Add legal review

---

## ❓ **Common Questions**

### **Can I approve a deal conditionally?**
Yes, use comments to specify conditions. Sales rep must confirm conditions are met.

### **What if customer is ready to close but deal isn't approved?**
Contact the approver directly. Mark the deal as urgent in the queue.

### **Can I see historical approval data?**
Yes, go to Reports > Deal Approvals to see trends and metrics.

### **What's the approval limit for sales managers?**
Check with your admin. Typically $50,000 for managers, unlimited for executives.

### **Can multiple people approve the same deal?**
Yes, some large deals require multiple approvals. The queue shows approval status for each required approver.

---

## 🔄 **Deal Revision Process**

After rejection:
1. Sales rep reviews rejection comments
2. Makes necessary changes to:
   - Pricing/discounts
   - Terms and conditions
   - Close date
   - Deal structure
3. Adds revision notes
4. Resubmits for approval
5. Deal re-enters queue with "Resubmitted" flag

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'deal-approval-queue-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'deal-approval-queue-guide' }, { $set: { ...DEAL_APPROVAL_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(DEAL_APPROVAL_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: DEAL_APPROVAL_KB_ARTICLE.title,
                slug: DEAL_APPROVAL_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${DEAL_APPROVAL_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed deal approval KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/customer-success-kb - Add Customer Success KB article
adminSeedDataRouter.post('/customer-success-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const CUSTOMER_SUCCESS_KB_ARTICLE = {
            title: 'Customer Success Guide',
            category: 'Customer Success',
            slug: 'customer-success-guide',
            tags: ['customer success', 'retention', 'health scores', 'renewals', 'engagement'],
            body: `# Customer Success Guide

This guide explains how to use the Customer Success app to drive customer retention, engagement, and growth.

---

## 📋 **Overview**

The Customer Success app helps you proactively manage customer relationships, track customer health, monitor engagement, and drive renewals and expansion.

---

## 🎯 **Customer Success Goals**

1. **Reduce Churn**: Keep customers engaged and satisfied
2. **Drive Adoption**: Ensure customers use your products/services effectively
3. **Identify Expansion**: Find upsell and cross-sell opportunities
4. **Renewals**: Ensure timely renewal of contracts
5. **Customer Advocacy**: Turn satisfied customers into advocates

---

## 💚 **Customer Health Scores**

### **What is a Health Score?**
A numeric rating (0-100) that indicates overall customer health based on multiple factors.

### **Health Score Factors:**
- **Product Usage**: How frequently they use your product
- **Support Tickets**: Number and severity of issues
- **Payment History**: On-time payments vs. late/missed
- **Engagement**: Email opens, meetings, training attendance
- **Renewal Date**: Time until renewal
- **Sentiment**: Feedback from surveys and interactions

### **Health Score Ranges:**
- **80-100** (Green): Healthy, engaged customer
- **60-79** (Yellow): At-risk, needs attention
- **40-59** (Orange): Declining, intervention required
- **0-39** (Red): Critical, high churn risk

---

## 🆕 **Managing Customers**

### **Customer Success Dashboard:**
1. Navigate to **Apps** > **Customer Success**
2. View all customers with health scores
3. Filter by health status, renewal date, or account manager

### **Customer Profile:**
Click on a customer to view:
- **Health Score Breakdown**: See what's impacting the score
- **Activity Timeline**: Recent interactions and milestones
- **Support History**: Tickets and resolution times
- **Product Usage**: Adoption metrics
- **Renewal Information**: Contract details and renewal date
- **Success Plan**: Goals and action items
- **Notes & Actions**: Document customer interactions

---

## 📈 **Success Plans**

### **Creating a Success Plan:**
1. Open customer profile
2. Click **Create Success Plan**
3. Add:
   - **Goals**: What the customer wants to achieve
   - **Milestones**: Key checkpoints
   - **Action Items**: Tasks to complete
   - **Owner**: Who is responsible
   - **Due Dates**: Timeline for completion
4. Save plan

### **Tracking Progress:**
- Check off completed action items
- Update milestones
- Add notes on customer feedback
- Adjust plan as needed

---

## 🚨 **At-Risk Customer Management**

### **Identifying At-Risk Customers:**
- Health score below 70
- Decreased product usage
- Increased support tickets
- Missed payments
- Renewal date approaching with low engagement
- Negative feedback

### **Intervention Steps:**
1. **Identify Root Cause**: Why is health declining?
2. **Create Action Plan**: Specific steps to address issues
3. **Schedule Check-in**: Meet with customer to discuss
4. **Provide Resources**: Training, documentation, support
5. **Monitor Progress**: Track improvements
6. **Executive Escalation**: For high-value at-risk accounts

---

## 🔄 **Renewal Management**

### **Renewal Dashboard:**
View all upcoming renewals:
- **Next 30 Days**: Urgent renewals
- **Next 90 Days**: Plan renewal conversations
- **Past Due**: Expired contracts needing attention

### **Renewal Process:**
1. **60 Days Out**: Initial renewal conversation
2. **45 Days Out**: Send renewal quote
3. **30 Days Out**: Follow up on quote
4. **15 Days Out**: Escalate if not confirmed
5. **On Renewal Date**: Process renewal or escalate

### **Renewal Strategies:**
- **Upsell**: Add more products/services
- **Cross-sell**: Offer complementary products
- **Expansion**: Increase user count or usage
- **Multi-year**: Lock in longer commitment
- **Loyalty Discount**: Reward long-term customers

---

## 📊 **Engagement Tracking**

### **Engagement Metrics:**
- **Email Opens/Clicks**: Marketing and outreach engagement
- **Login Frequency**: Product usage
- **Feature Adoption**: Which features are being used
- **Training Completion**: Did they complete onboarding?
- **Support Interactions**: How often they contact support
- **Meeting Attendance**: Participation in QBRs and check-ins

### **Improving Engagement:**
- **Onboarding**: Ensure proper product setup
- **Training**: Offer webinars and documentation
- **Check-ins**: Regular touchpoints
- **Product Updates**: Keep them informed of new features
- **Community**: Connect them with other customers

---

## 📞 **Customer Touchpoints**

### **Types of Touchpoints:**
1. **Onboarding Call**: Welcome new customer, set expectations
2. **Kickoff Meeting**: Project or implementation start
3. **Training Session**: Product education
4. **Check-in**: Regular status updates (monthly/quarterly)
5. **QBR (Quarterly Business Review)**: Strategic review
6. **Renewal Discussion**: Contract renewal planning
7. **Executive Briefing**: High-level account review

### **Documenting Touchpoints:**
- Add notes to customer profile
- Log meeting outcomes
- Track action items
- Schedule follow-ups

---

## 🎓 **Customer Onboarding**

### **Onboarding Checklist:**
- ☑️ Welcome email sent
- ☑️ Kickoff meeting scheduled
- ☑️ Account setup completed
- ☑️ Training sessions scheduled
- ☑️ Documentation provided
- ☑️ Initial check-in completed
- ☑️ Success plan created
- ☑️ First milestone achieved

### **Onboarding Timeline:**
- **Week 1**: Setup and configuration
- **Week 2**: Training and education
- **Week 3**: Initial usage and support
- **Month 2**: First check-in and review
- **Month 3**: Success plan review

---

## 📧 **Automated Workflows**

### **Trigger-Based Actions:**
- **Health Score Drops**: Auto-assign to CSM
- **Renewal in 60 Days**: Auto-create renewal task
- **Low Product Usage**: Send engagement email
- **Support Ticket Created**: Notify CSM
- **Payment Failed**: Alert account manager

---

## 🎯 **Best Practices**

1. **Proactive Outreach**: Don't wait for customers to contact you
2. **Regular Check-ins**: Schedule consistent touchpoints
3. **Monitor Health Scores**: Address issues early
4. **Document Everything**: Keep detailed notes
5. **Celebrate Wins**: Acknowledge customer successes
6. **Measure Success**: Track metrics and improve
7. **Cross-Team Collaboration**: Work with sales, support, product
8. **Customer Education**: Provide training and resources

---

## 📊 **Success Metrics**

Track key metrics:
- **Customer Retention Rate**: % of customers retained
- **Net Retention Rate (NRR)**: Revenue retention + expansion
- **Churn Rate**: % of customers lost
- **Average Health Score**: Overall customer health
- **Renewal Rate**: % of renewals closed
- **Upsell/Cross-sell Rate**: Expansion revenue
- **Time to Value**: How quickly customers see ROI
- **NPS (Net Promoter Score)**: Customer satisfaction

---

## 🛠️ **Tools & Integrations**

Connect with:
- **CRM**: Sync account and contact data
- **Support Tickets**: Monitor customer issues
- **Product Analytics**: Track usage and adoption
- **Email**: Send campaigns and track engagement
- **Calendar**: Schedule meetings and reminders
- **Surveys**: Collect customer feedback

---

## ❓ **Common Questions**

### **How often should I contact customers?**
Depends on customer tier:
- **High-value**: Weekly or bi-weekly
- **Mid-tier**: Monthly
- **Low-tier**: Quarterly

### **When should I escalate an at-risk customer?**
When health score drops below 50 or revenue is at significant risk.

### **How do I improve a customer's health score?**
Focus on the specific factors bringing it down: increase engagement, resolve support issues, drive product adoption.

### **What's the difference between Customer Success and Account Management?**
- **Customer Success**: Proactive, focused on product adoption and health
- **Account Management**: Focused on relationship and growth opportunities

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'customer-success-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'customer-success-guide' }, { $set: { ...CUSTOMER_SUCCESS_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(CUSTOMER_SUCCESS_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: CUSTOMER_SUCCESS_KB_ARTICLE.title,
                slug: CUSTOMER_SUCCESS_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${CUSTOMER_SUCCESS_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed customer success KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/outreach-sequences-kb - Add Outreach Sequences KB article
adminSeedDataRouter.post('/outreach-sequences-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const OUTREACH_SEQUENCES_KB_ARTICLE = {
            title: 'Outreach Sequences Guide',
            category: 'CRM',
            slug: 'outreach-sequences-guide',
            tags: ['outreach', 'sequences', 'automation', 'email', 'crm'],
            body: `# Outreach Sequences Guide

Complete guide to creating and managing automated outreach sequences in BOAZ-OS.

---

## 📋 **Overview**

Outreach Sequences allow you to automate multi-step email campaigns to contacts, ensuring consistent follow-up and engagement without manual effort.

---

## 🎯 **What is an Outreach Sequence?**

An outreach sequence is a series of automated emails sent to contacts over time. Each sequence consists of multiple steps, with each step sending a template at a specific time delay.

**Example Sequence:**
1. Day 1: Introduction email
2. Day 3: Follow-up with value proposition
3. Day 7: Case study or social proof
4. Day 14: Final call to action

---

## 🆕 **Creating a Sequence**

### **Step 1: Navigate to Sequences**
- Go to **CRM** > **Outreach** > **Sequences**
- Click **Create Sequence**

### **Step 2: Basic Information**
- **Name**: Give your sequence a descriptive name (e.g., "New Lead Nurture")
- **Description**: Optional details about the sequence purpose
- **Status**: Active (sends emails) or Inactive (paused)

### **Step 3: Add Sequence Steps**
Each step represents an email in the sequence:

1. **Step Number**: Order of the email (1, 2, 3, etc.)
2. **Template**: Select an existing email template
3. **Delay**: How long to wait after the previous step (in days)
   - Step 1 always starts immediately (0 days)
   - Step 2 might be +3 days after Step 1
   - Step 3 might be +4 days after Step 2 (7 days total)

4. Click **Add Step** to create additional emails

### **Step 4: Save Sequence**
- Click **Create Sequence**
- Your sequence is now ready to enroll contacts

---

## 👥 **Enrolling Contacts**

### **Manual Enrollment:**
1. Go to **Contacts** app
2. Select a contact
3. Click **Enroll in Sequence**
4. Choose the sequence
5. Confirm enrollment

### **Bulk Enrollment:**
1. Go to **Outreach** > **Enrollments**
2. Click **Bulk Enroll**
3. Select contacts (by segment, tag, or manual selection)
4. Choose sequence
5. Confirm bulk enrollment

### **Automatic Enrollment:**
- Contacts can be auto-enrolled based on triggers:
  - New lead created
  - Deal stage changed
  - Contact tagged
  - Form submitted

---

## 📊 **Sequence Steps**

Each step in a sequence has:

**Step Number**: Order in the sequence  
**Template**: Which email template to send  
**Delay Days**: Days to wait before sending  
**Status**: Active or Inactive

**Example Sequence Steps:**

| Step | Template | Delay | Description |
|------|----------|-------|-------------|
| 1 | "Introduction" | 0 days | Sent immediately |
| 2 | "Follow-Up" | 3 days | Sent 3 days after step 1 |
| 3 | "Case Study" | 4 days | Sent 7 days after enrollment (3+4) |
| 4 | "Final CTA" | 7 days | Sent 14 days after enrollment (3+4+7) |

---

## 🔄 **Managing Enrollments**

### **View Enrollments:**
- Go to **Outreach** > **Enrollments**
- See all contacts enrolled in sequences
- Filter by sequence, status, or contact

### **Enrollment Status:**
- **Active**: Currently receiving emails
- **Paused**: Temporarily stopped
- **Completed**: Finished all steps
- **Unsubscribed**: Contact opted out
- **Bounced**: Email delivery failed

### **Pause/Resume Enrollment:**
- Click on an enrollment
- Click **Pause** to stop emails temporarily
- Click **Resume** to continue

### **Unenroll Contact:**
- Click **Unenroll** to remove contact from sequence
- All future emails will be cancelled
- Past emails already sent remain in history

---

## 📧 **Email Sending**

### **When Emails Send:**
- Emails are queued based on step delays
- Sent during business hours (9 AM - 5 PM local time)
- Respects contact timezone if available
- Skips weekends and holidays (optional)

### **Send Limits:**
- Maximum emails per day per user
- Respects email provider limits
- Prevents spam complaints

### **Email Tracking:**
- Opens tracked automatically
- Clicks tracked automatically
- Replies detected and stop sequence
- Bounces logged and enrollment paused

---

## 🛑 **Stopping Sequences**

### **Automatic Stops:**
Sequences automatically stop when:
- Contact replies to any email
- Contact unsubscribes
- Email bounces (hard bounce)
- Contact is marked "Do Not Contact"
- All steps completed

### **Manual Stops:**
- Unenroll individual contacts
- Pause entire sequence (affects all enrollments)
- Deactivate sequence (stops new enrollments)

---

## 📊 **Sequence Analytics**

### **Performance Metrics:**
- **Enrollment Count**: Total contacts in sequence
- **Open Rate**: % of emails opened
- **Click Rate**: % of links clicked
- **Reply Rate**: % who replied
- **Conversion Rate**: % who took desired action
- **Unsubscribe Rate**: % who opted out

### **Step-by-Step Analysis:**
- See performance for each step
- Identify which emails perform best
- Optimize underperforming steps

---

## ✅ **Best Practices**

1. **Start Simple**: Begin with 3-4 steps, add more as needed
2. **Test Templates**: Ensure templates are personalized and relevant
3. **Space Out Steps**: Don't overwhelm contacts with daily emails
4. **Monitor Replies**: Respond quickly to engagement
5. **A/B Test**: Try different templates and timing
6. **Respect Unsubscribes**: Always include unsubscribe links
7. **Update Regularly**: Refresh content to keep it relevant
8. **Segment Contacts**: Different sequences for different audiences
9. **Track Performance**: Review analytics monthly
10. **Clean Your List**: Remove bounced/unsubscribed contacts

---

## 🎨 **Sequence Templates**

### **Lead Nurture Sequence:**
- Step 1: Welcome email
- Step 2: Educational content
- Step 3: Case study
- Step 4: Demo offer
- Step 5: Final follow-up

### **Re-engagement Sequence:**
- Step 1: "We miss you" email
- Step 2: Feature updates
- Step 3: Special offer
- Step 4: Feedback request

### **Onboarding Sequence:**
- Step 1: Welcome and next steps
- Step 2: Getting started guide
- Step 3: Tips and tricks
- Step 4: Check-in and support offer

---

## ❓ **Common Questions**

### **Can I edit a sequence after enrolling contacts?**
Yes, but changes only affect new enrollments. Existing enrollments continue with the original steps.

### **What happens if I delete a template used in a sequence?**
The sequence step will fail. Always update the sequence to use a different template before deleting.

### **Can contacts be in multiple sequences?**
Yes, but be careful not to overwhelm them. Monitor total email volume per contact.

### **How do I know if someone replied?**
Check the **Enrollments** page. Replied enrollments are automatically marked and stopped.

### **Can I schedule sequences to start at a specific time?**
Not currently. Sequences start immediately upon enrollment, then follow the delay schedule.

---

## 🛠️ **Troubleshooting**

### **Emails not sending**
- Check sequence status (must be Active)
- Verify contact has valid email
- Check enrollment status (must be Active)
- Review email sending limits

### **Low open rates**
- Test different subject lines
- Send at different times
- Verify email deliverability
- Check spam score of templates

### **High unsubscribe rate**
- Review email frequency (too many emails?)
- Ensure content is relevant
- Improve targeting and segmentation
- Make unsubscribe process clear

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'outreach-sequences-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'outreach-sequences-guide' }, { $set: { ...OUTREACH_SEQUENCES_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(OUTREACH_SEQUENCES_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: OUTREACH_SEQUENCES_KB_ARTICLE.title,
                slug: OUTREACH_SEQUENCES_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${OUTREACH_SEQUENCES_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed outreach sequences KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/outreach-templates-kb - Add Outreach Templates KB article
adminSeedDataRouter.post('/outreach-templates-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const OUTREACH_TEMPLATES_KB_ARTICLE = {
            title: 'Outreach Templates Guide',
            category: 'CRM',
            slug: 'outreach-templates-guide',
            tags: ['outreach', 'templates', 'email', 'crm', 'personalization'],
            body: `# Outreach Templates Guide

Complete guide to creating, managing, and using email templates for outreach campaigns.

---

## 📋 **Overview**

Outreach Templates are reusable email templates that can be used in sequences, one-off emails, and marketing campaigns. They support personalization, HTML formatting, and dynamic content.

---

## 🎯 **What is an Outreach Template?**

An email template is a pre-written email with:
- Subject line
- Email body (text and/or HTML)
- Personalization variables
- Reusable content

Templates save time and ensure consistent messaging across your outreach efforts.

---

## 🆕 **Creating a Template**

### **Step 1: Navigate to Templates**
- Go to **CRM** > **Outreach** > **Templates**
- Click **Create Template**

### **Step 2: Template Details**
- **Name**: Internal name for the template (e.g., "Lead Introduction")
- **Subject**: Email subject line
  - Can include personalization: \`Hello {{firstName}}!\`
- **Category**: Optional grouping (Prospecting, Follow-up, Re-engagement, etc.)

### **Step 3: Email Body**
Write your email content:
- Plain text or HTML
- Use personalization variables
- Keep it concise and actionable
- Include clear call-to-action

### **Step 4: Save Template**
- Click **Save**
- Template is now available for use

---

## 🎨 **Personalization Variables**

Make emails feel personal by using variables that auto-fill with contact data:

### **Available Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| \`{{firstName}}\` | Contact's first name | John |
| \`{{lastName}}\` | Contact's last name | Smith |
| \`{{fullName}}\` | Full name | John Smith |
| \`{{email}}\` | Email address | john@example.com |
| \`{{company}}\` | Company name | Acme Corp |
| \`{{title}}\` | Job title | Marketing Director |
| \`{{phone}}\` | Phone number | (555) 123-4567 |

### **Usage Example:**

**Template:**
\`\`\`
Subject: Quick question for {{company}}

Hi {{firstName}},

I noticed {{company}} is growing quickly in the {{industry}} space. 
I'd love to chat about how we can help with {{challenge}}.

Are you available for a quick 15-minute call this week?

Best,
[Your Name]
\`\`\`

**Rendered:**
\`\`\`
Subject: Quick question for Acme Corp

Hi John,

I noticed Acme Corp is growing quickly in the SaaS space.
I'd love to chat about how we can help with customer retention.

Are you available for a quick 15-minute call this week?

Best,
[Your Name]
\`\`\`

---

## 📝 **Template Types**

### **1. Introduction Templates**
First contact with a prospect
- Keep it short (under 100 words)
- Personalize with their company/role
- Clear value proposition
- Easy call-to-action

### **2. Follow-Up Templates**
After initial contact
- Reference previous email/conversation
- Add new information or value
- Different angle or benefit
- Gentle reminder

### **3. Re-Engagement Templates**
Reconnect with cold leads
- Acknowledge the gap
- Share something new
- Ask if still interested
- Easy out (permission-based)

### **4. Meeting Request Templates**
Schedule calls or demos
- Specific time options
- Clear agenda
- Short and direct
- Calendar link

### **5. Thank You Templates**
After meetings or interactions
- Express gratitude
- Summarize next steps
- Share resources
- Keep momentum

---

## ✏️ **Editing Templates**

### **Update Existing Template:**
1. Go to **Templates** page
2. Click on template to edit
3. Make changes to subject, body, or category
4. Click **Save**

### **Important Notes:**
- Changes affect future uses only
- Emails already sent are not changed
- Sequences using template will use updated version

---

## 📋 **Using Templates**

### **In Sequences:**
1. Create or edit a sequence
2. Select template for each step
3. Template is sent automatically per schedule

### **One-Off Emails:**
1. Go to **Contacts**
2. Select a contact
3. Click **Send Email**
4. Choose **Load from Template**
5. Select template
6. Customize if needed
7. Send

### **In Marketing Campaigns:**
1. Create marketing campaign
2. Click **Load from Template**
3. Select outreach template
4. Adapt for campaign audience
5. Send or schedule

---

## 🎯 **Best Practices**

### **Subject Lines:**
1. **Keep it short** (under 50 characters)
2. **Personalize** when possible
3. **Avoid spam words** (Free, Guaranteed, Act Now)
4. **Create curiosity** without being clickbait
5. **Test variations** to see what works

**Good Subject Lines:**
- "Quick question about {{company}}"
- "{{firstName}}, thoughts on [topic]?"
- "Ideas for improving [specific metric]"
- "Following up from [event]"

**Bad Subject Lines:**
- "FREE OFFER - ACT NOW!!!"
- "You won't believe this"
- "RE: RE: Important"
- Generic subjects with no personalization

### **Email Body:**
1. **Start with why** - Why are you reaching out?
2. **Make it about them** - Not about your product
3. **One clear CTA** - Don't confuse with multiple asks
4. **Keep it short** - Respect their time
5. **Professional tone** - Match their communication style
6. **Proofread** - Typos hurt credibility

### **Call-to-Action:**
- Be specific: "Are you free for a 15-min call on Tuesday?"
- Not vague: "Let me know if you're interested"
- Make it easy: Include calendar link or specific times
- Low commitment: Start with small ask

---

## 📊 **Template Performance**

### **Track Metrics:**
- **Usage Count**: How often template is used
- **Open Rate**: % of emails opened
- **Click Rate**: % of links clicked
- **Reply Rate**: % who responded
- **Bounce Rate**: % of failed deliveries

### **Optimize Templates:**
1. **A/B Test**: Try different versions
2. **Analyze Data**: Which templates perform best?
3. **Iterate**: Update based on results
4. **Retire**: Delete templates that don't work

---

## 🗂️ **Organizing Templates**

### **Categories:**
Group templates by purpose:
- **Prospecting**: Initial outreach
- **Follow-Up**: Second and third touches
- **Re-Engagement**: Win back cold leads
- **Meeting**: Schedule calls
- **Post-Meeting**: Follow-up after calls
- **Thank You**: Appreciation emails
- **Referral**: Ask for introductions

### **Naming Conventions:**
Use clear, descriptive names:
- Good: "Intro - SaaS Decision Maker"
- Good: "Follow-Up 1 - No Response"
- Bad: "Template 1"
- Bad: "New email"

---

## 🔍 **Testing Templates**

### **Before Using:**
1. **Send test email** to yourself
2. **Check all variables** render correctly
3. **Test on mobile** - 50%+ open on mobile
4. **Check spam score** using online tools
5. **Verify links** all work

### **Spam Checklist:**
- Avoid ALL CAPS
- Don't use excessive exclamation points!!!
- No misleading subject lines
- Include company address
- Have clear unsubscribe link
- Balance text and images
- Use proper HTML formatting

---

## 💡 **Template Examples**

### **Cold Outreach:**
\`\`\`
Subject: Quick question for {{company}}

Hi {{firstName}},

I noticed {{company}} recently [specific observation].
Congrats on the growth!

We help companies like yours [specific benefit].
Would you be open to a quick 10-minute call to explore if
we could help {{company}} achieve [specific goal]?

Best,
[Your Name]
\`\`\`

### **Follow-Up (No Response):**
\`\`\`
Subject: Re: Quick question for {{company}}

Hi {{firstName}},

I know you're busy, so I'll keep this brief.

I'd love to share how [specific benefit] could help {{company}}.
Are you the right person to discuss this, or should I connect
with someone else on your team?

Thanks,
[Your Name]
\`\`\`

### **Meeting Request:**
\`\`\`
Subject: 15 minutes to discuss [specific topic]?

Hi {{firstName}},

Based on our conversation, I think a quick call would be valuable.

I can share [specific outcome] and answer any questions about
[specific topic].

Are you available any of these times?
- Tuesday 2 PM
- Wednesday 10 AM
- Thursday 3 PM

Or pick a time that works for you: [calendar link]

Looking forward to it!
[Your Name]
\`\`\`

---

## ❓ **Common Questions**

### **Can I use HTML in templates?**
Yes! You can use basic HTML formatting for bold, links, lists, etc.

### **What if contact doesn't have a value for a variable?**
The variable will be blank. Always include fallback text or check data quality.

### **Can I share templates with my team?**
Yes, all templates are shared across the organization. Use clear naming so others can find them.

### **How do I delete a template?**
Click the template, then click **Delete**. Warning: If used in active sequences, update those sequences first.

---

## 🛠️ **Troubleshooting**

### **Variables not rendering**
- Check spelling: \`{{firstName}}\` not \`{{firstname}}\`
- Ensure contact has data for that field
- Test with a contact that has complete data

### **Emails going to spam**
- Improve subject line (avoid spam words)
- Include unsubscribe link
- Verify sender authentication (SPF, DKIM)
- Don't use URL shorteners
- Balance text and images

### **Low response rates**
- Personalize more (research recipient)
- Shorten email (under 150 words)
- Clearer call-to-action
- Better timing (Tuesday-Thursday, 10 AM - 2 PM)
- Improve targeting (right audience?)

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'outreach-templates-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'outreach-templates-guide' }, { $set: { ...OUTREACH_TEMPLATES_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(OUTREACH_TEMPLATES_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: OUTREACH_TEMPLATES_KB_ARTICLE.title,
                slug: OUTREACH_TEMPLATES_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${OUTREACH_TEMPLATES_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed outreach templates KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/payment-portal-kb - Add Payment Portal KB article
adminSeedDataRouter.post('/payment-portal-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const PAYMENT_PORTAL_KB_ARTICLE = {
            title: 'Payment Portal: Secure Payment Processing & PCI Compliance',
            category: 'Finance',
            slug: 'payment-portal-guide',
            tags: ['payments', 'invoices', 'billing', 'portal', 'online payments', 'reconciliation', 'pci-compliance', 'security', 'credit-card', 'paypal', 'ach', 'wire-transfer'],
            body: `# Payment Portal: Secure Payment Processing & PCI Compliance

Complete guide to using the Payment Portal for secure payment processing, PCI DSS compliance, and payment reconciliation.

---

## 📋 **Overview**

The Payment Portal is a comprehensive payment management system that allows you to:
- **Accept online payments** from customers via credit card or PayPal
- **Record manual payments** received by phone, mail, or in person
- **View payment history** with filtering and search
- **Automatic reconciliation** via webhooks from payment providers

---

## 🎯 **Who Uses the Payment Portal?**

### **Customers**
- Pay invoices online with credit card or PayPal
- View payment instructions for offline methods (ACH, wire, check)
- Receive instant payment confirmations

### **Internal Staff**
- Record phone payments from customers
- Enter mailed-in check/cash payments
- View complete payment history
- Track reconciliation status

---

## 🔒 **Security & PCI DSS Compliance**

### **What is PCI DSS?**

The Payment Card Industry Data Security Standard (PCI DSS) is a set of security standards designed to ensure that all companies that accept, process, store, or transmit credit card information maintain a secure environment.

### **Our PCI Compliance Level**

We maintain **PCI DSS SAQ A** compliance by using hosted payment solutions:

1. **Tokenization**
   - Credit card data never touches our servers
   - Stripe securely tokenizes all card information
   - We only store non-sensitive payment tokens

2. **Secure Payment Forms**
   - Credit card forms are hosted and secured by Stripe (PCI Level 1)
   - All payment data transmitted via TLS 1.2+ encryption
   - Forms are served from PCI-compliant domains

3. **No Sensitive Data Storage**
   - We NEVER store complete credit card numbers
   - We NEVER store CVV/CVC security codes
   - We NEVER store unencrypted cardholder data

### **Security Measures**

**Encryption:**
- All data transmitted using TLS 1.2 or higher
- HTTPS enforced for all payment pages
- End-to-end encryption for payment data
- Database encryption for all stored data (AES-256)

**Access Controls:**
- Role-based access control (RBAC)
- Multi-factor authentication (MFA) for admin access
- Audit logs for all payment activities
- Regular security audits and penetration testing

**Third-Party Security:**
- **Stripe:** PCI DSS Level 1 Service Provider, SOC 1 and SOC 2 Type II certified
- **PayPal:** PCI DSS Level 1 compliant, Advanced fraud protection
- **ACH/Wire:** NACHA guidelines and banking security standards

### **Payment Method Security Levels**

| Method | Processing Time | Security Standard | Fees |
|--------|----------------|-------------------|------|
| **Credit Card** | Instant | PCI DSS Level 1 (Stripe) | 2.9% + $0.30 |
| **PayPal** | Instant | PCI DSS Level 1 (PayPal) | 3.49% + $0.49 |
| **ACH Transfer** | 2-3 days | NACHA Guidelines | No fee |
| **Wire Transfer** | 1-5 days | SWIFT/Bank Secure | Bank fees |
| **Check** | 7-10 days | Physical Mail | No fee |

---

## 💳 **Tab 1: Make Payment (Customer-Facing)**

### **How Customers Pay Invoices:**

1. **Select an Invoice**
   - View all outstanding invoices with balances
   - See due dates (overdue invoices highlighted in red)
   - Click an invoice to select it

2. **Enter Payment Amount**
   - Default amount is the full balance
   - Can pay partial amounts if needed
   - Maximum is the invoice balance

3. **Choose Payment Method**
   - **Credit/Debit Card** - Instant processing via Stripe
   - **PayPal** - Instant processing via PayPal
   - **ACH Transfer** - 2-3 days, bank transfer instructions provided
   - **Wire Transfer** - 1-5 days, international/domestic instructions
   - **Check** - 7-10 days, mailing instructions provided

4. **Complete Payment**
   - For online methods (card/PayPal): Click to be redirected to secure payment page
   - For offline methods: Follow the displayed instructions

### **Payment Confirmation:**
- Customers receive immediate email confirmation for online payments
- Email includes transaction ID, payment details, and new balance
- For offline payments, confirmation sent when payment is recorded by staff

---

## 📞 **Tab 2: Record Payment (Internal Staff)**

For payments received by phone, mail, or in person, staff must manually record them in the system.

### **Step-by-Step Process:**

1. **Search for Invoice**
   - Type invoice number, customer name, or account name
   - Select the correct invoice from search results

2. **Enter Payment Details**
   - **Payment Amount** (required): Enter the amount received
   - **Payment Method** (required): Select how payment was received:
     - Check
     - Cash
     - Credit Card (Phone)
     - ACH Transfer
     - Wire Transfer
     - PayPal
   - **Reference Number** (required): Check number, transaction ID, or confirmation code
   - **Payment Date** (required): Date payment was received (defaults to today)
   - **Notes** (optional): Any additional information about the payment

3. **Record Payment**
   - Click "Record Payment" button
   - System automatically:
     - Updates invoice balance
     - Marks invoice as paid if balance reaches $0
     - Creates payment history entry
     - Sends confirmation email to customer
     - Flags payment as needing reconciliation

### **Required Information:**

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| **Invoice** | ✅ Yes | Invoice being paid | Invoice #1234 |
| **Amount** | ✅ Yes | Payment amount | $500.00 |
| **Method** | ✅ Yes | How paid | Check |
| **Reference** | ✅ Yes | Check #, Transaction ID | Check #5678 |
| **Date** | ✅ Yes | Payment received date | 12/10/2024 |
| **Notes** | ❌ No | Additional details | Received via FedEx |

### **Best Practices:**

1. ✅ **Record payments immediately** upon receipt
2. ✅ **Include detailed reference numbers** for tracking
3. ✅ **Verify invoice number** before recording
4. ✅ **Double-check amount** matches payment received
5. ✅ **Use correct payment date** (when received, not when recorded)
6. ✅ **Add notes** for unusual circumstances

---

## 📊 **Tab 3: Payment History**

View all recorded payments with powerful filtering and search capabilities.

### **Filter Options:**

- **Search**: Find by invoice number or reference number
- **Status**:
  - All Payments
  - Reconciled (verified and confirmed)
  - Pending Reconciliation (awaiting verification)
- **Date Range**: Filter by payment date

### **Payment Information Displayed:**

- **Date**: When payment was received
- **Invoice**: Invoice number paid
- **Method**: How payment was made (with icon)
- **Reference**: Transaction ID or check number
- **Amount**: Payment amount
- **Status**: Reconciled or Pending badge

### **Reconciliation Status:**

**✅ Reconciled (Green)**
- Payment verified and confirmed
- Bank/payment processor records match
- No action needed

**⚠️ Pending (Yellow)**
- Manual payment awaiting bank verification
- Review bank statement to confirm
- Mark as reconciled once verified

### **Export to CSV:**
Click "Export to CSV" to download payment history for accounting/reporting.

---

## 🔄 **Automatic Reconciliation**

The Payment Portal uses webhooks to automatically reconcile online payments from Stripe and PayPal.

### **How It Works:**

1. **Customer Pays Online**
   - Customer submits payment via Stripe or PayPal
   - Payment processor charges card/account

2. **Webhook Notification**
   - Stripe/PayPal sends webhook to BOAZ-OS
   - System verifies webhook signature (security)

3. **Automatic Recording**
   - Payment automatically recorded in system
   - Invoice balance updated immediately
   - Payment marked as "Reconciled"
   - Customer receives confirmation email

4. **No Manual Entry Needed**
   - Zero data entry for staff
   - Instant reconciliation
   - Reduced errors

### **Manual vs. Automatic:**

| Aspect | Manual Recording | Automatic (Webhook) |
|--------|-----------------|---------------------|
| **Entry Time** | ~2-3 minutes | Instant |
| **Reconciliation** | Requires bank verification | Automatic |
| **Error Risk** | Human error possible | Near zero |
| **Staff Time** | Required | None |
| **Confirmation** | After recording | Instant |

---

## 🛠️ **Setting Up Payment Methods**

### **For Admins: Configuring Payment Options**

See the **Payment Setup Guide** in the API documentation at:
\`apps/api/docs/PAYMENT_SETUP.md\`

### **Stripe Setup (Credit Cards):**

1. **Create Stripe Account**
   - Sign up at https://stripe.com
   - Complete business verification
   - Get API keys from Dashboard

2. **Add to Environment Variables**
   \`\`\`
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   \`\`\`

3. **Configure Webhook**
   - URL: \`https://your-domain.com/api/webhooks/stripe\`
   - Events:
     - \`checkout.session.completed\`
     - \`payment_intent.succeeded\`
     - \`payment_intent.payment_failed\`
     - \`charge.refunded\`

4. **Test Mode**
   - Use test keys for development
   - Test card: \`4242 4242 4242 4242\`
   - Switch to live keys when ready

### **PayPal Setup:**

1. **Create PayPal Business Account**
   - Sign up at https://www.paypal.com/business
   - Complete verification

2. **Quick Setup (PayPal.me)**
   - Create PayPal.me link at https://www.paypal.me
   - Update in payment providers config

3. **Advanced Setup (Full Integration)**
   - Get Client ID and Secret from PayPal Developer
   - Add to environment variables:
   \`\`\`
   PAYPAL_CLIENT_ID=your_client_id
   PAYPAL_CLIENT_SECRET=your_client_secret
   PAYPAL_WEBHOOK_ID=your_webhook_id
   \`\`\`

4. **Configure Webhook**
   - URL: \`https://your-domain.com/api/webhooks/paypal\`
   - Events:
     - \`PAYMENT.CAPTURE.COMPLETED\`
     - \`PAYMENT.CAPTURE.DENIED\`
     - \`PAYMENT.CAPTURE.REFUNDED\`

### **Bank Account Details (ACH/Wire):**

Update in \`apps/api/src/lib/payment-providers.ts\`:

\`\`\`typescript
bankAccountDetails: {
  bankName: 'Your Bank Name',
  routingNumber: 'YOUR_ROUTING',
  accountNumber: '****LAST4', // Masked!
  accountName: 'Your Company Name',
  swiftCode: 'YOUR_SWIFT',
}
\`\`\`

---

## 🔒 **Additional Security Features**

### **Payment Data Protection:**
- ✅ PCI DSS SAQ A compliant payment processing
- ✅ Zero sensitive card data stored in BOAZ-OS
- ✅ All payment pages use HTTPS/TLS 1.2+
- ✅ Webhook signature verification (prevents fraud)
- ✅ Account numbers masked (show last 4 digits only)
- ✅ 256-bit AES encryption at rest
- ✅ Tokenization for all card transactions

### **Access Control & Audit:**
- ✅ Authentication required for all payment operations
- ✅ Role-based permissions (RBAC)
- ✅ Complete audit trail in payment history
- ✅ "Processed By" tracked for manual payments
- ✅ Webhook request logging and verification
- ✅ Failed payment attempt logging

### **Compliance Certifications:**
- ✅ PCI DSS SAQ A (Payment Card Industry)
- ✅ NACHA Compliance (ACH transactions)
- ✅ GDPR Compliance (EU customer data)
- ✅ CCPA Compliance (California privacy)

---

## 📧 **Email Notifications**

### **Customers Receive:**
- ✅ Payment confirmation email
- ✅ Transaction ID and reference
- ✅ Updated invoice balance
- ✅ Receipt for records

### **Staff Notifications:**
- ⚠️ Payment failures (admin alert)
- ⚠️ Disputed payments
- ⚠️ Refunds processed

---

## ❓ **Common Questions**

### **Why is a payment showing "Pending Reconciliation"?**
Manual payments (phone, mail, cash) require bank verification. Once you confirm the payment cleared your bank, you can mark it as reconciled.

### **Can customers pay partial amounts?**
Yes! Customers can enter any amount up to the invoice balance. The remaining balance will still show as due.

### **What if a payment fails?**
Failed payments are logged in the system. Staff receives a notification. Customer can try again or use a different payment method.

### **How long do online payments take?**
Credit card and PayPal payments process instantly. The customer receives immediate confirmation and the invoice is updated in real-time.

### **Can I export payment history for accounting?**
Yes! Click "Export to CSV" in the Payment History tab to download all payment data for your accounting software.

### **What if someone pays the wrong invoice?**
Contact an admin to process a refund and re-apply the payment to the correct invoice. All refunds are tracked in the system.

### **Do webhooks work in development?**
Use tools like ngrok to expose your local server, or test webhooks in Stripe/PayPal test mode.

### **Is my credit card information safe?**
Yes. Your credit card information is processed through Stripe, a PCI DSS Level 1 certified payment processor. Your card details never touch our servers and are secured with bank-level encryption.

### **What is PCI DSS and why does it matter?**
PCI DSS (Payment Card Industry Data Security Standard) is a set of security standards that protect cardholder data. We are PCI DSS SAQ A compliant, which means we use hosted payment solutions so sensitive card data never enters our systems, greatly reducing security risks.

### **Do you store my credit card number?**
No. We never store complete credit card numbers, CVV codes, or any sensitive authentication data. We only store secure tokens provided by Stripe that allow us to process future payments if authorized, but these tokens cannot be used to retrieve your card details.

### **How do you protect against fraud?**
We use multiple layers of fraud protection: Stripe's advanced fraud detection algorithms, webhook signature verification, secure tokenization, HTTPS/TLS encryption, and audit logging of all payment activities.

### **What happens if there's a data breach?**
Because we don't store sensitive payment data (PCI DSS SAQ A compliance), a breach of our systems would not expose credit card numbers, CVV codes, or other sensitive payment information. Payment data is securely stored only with Stripe and PayPal.

---

## 🔧 **Troubleshooting**

### **Payment not showing in history**
- Check filters (may be filtered out)
- Verify payment was recorded (check invoice)
- Refresh the page

### **Can't find invoice to record payment**
- Check spelling of invoice number
- Try searching by account name
- Verify invoice exists in Invoices app

### **Reconciliation not automatic**
- Verify webhook is configured correctly
- Check webhook secret matches environment variable
- Review webhook logs in Stripe/PayPal dashboard
- Ensure webhook URL is publicly accessible

### **Customer didn't receive confirmation email**
- Check spam/junk folder
- Verify email address in account record
- Check system email logs

---

## 📞 **Support**

For technical issues with the Payment Portal:
- **Email**: support@wolfconsultingnc.com
- **Phone**: (704) 555-1234

For payment processing issues:
- **Stripe**: https://support.stripe.com
- **PayPal**: https://www.paypal.com/support

---

**Last Updated:** December 2024  
**Version:** 2.0
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'payment-portal-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'payment-portal-guide' }, { $set: { ...PAYMENT_PORTAL_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(PAYMENT_PORTAL_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: PAYMENT_PORTAL_KB_ARTICLE.title,
                slug: PAYMENT_PORTAL_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${PAYMENT_PORTAL_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed payment portal KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/reporting-kb - Add Reporting KB article
adminSeedDataRouter.post('/reporting-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const REPORTING_KB_ARTICLE = {
            title: 'Using the Reporting app in BOAZ‑OS CRM',
            category: 'Sales & Analytics',
            slug: 'crm-reporting-guide',
            tags: ['crm', 'crm:reporting', 'analytics', 'reporting', 'finance', 'executive-report'],
            body: `# CRM Reporting (Executive Dashboard) Guide

The **Reporting** app is a cross‑module executive dashboard that ties together **pipeline, support, marketing, renewals, and financial performance** into one view.

---

## ✅ How to open Reporting

- **CRM Hub → Reporting**
- Or **CRM Navigation → Reporting**

---

## 📊 What you can do in Reporting

### **1) Review KPIs**
Reporting surfaces key performance indicators across CRM modules (pipeline, quotes, invoices/AR, renewals, and support).

### **2) Use Date Range filters**
Choose a date range to control what’s included in the report and exports.

### **3) Use Snapshots (history/trends)**
- **Manual snapshots**: click **Save snapshot**
- **Scheduled daily snapshots**: auto-captured daily
- **Run daily snapshot now**: triggers today’s scheduled snapshot immediately

### **4) Export data**
- **Export CSV**: exports the currently visible KPIs
- **Export Pack (JSON/CSV)**: downloads a single “executive pack” (KPIs + key lists + snapshot deltas)
- **Export PDF**: generates a BOAZ‑branded executive report for printing / Save as PDF

---

## 💰 Financial definitions (quick reference)

- **AR (Accounts Receivable)**: Money customers owe you on unpaid invoices.
- **Overdue AR**: The total unpaid invoice balance **past its due date**.
- **Receivables Aging**: AR grouped by lateness (Current, 1–30, 31–60, 61–90, 90+).
- **DSO (Days Sales Outstanding)**: Best‑effort estimate of average collection time.
- **Cash collected**: Payments recorded on invoices during the selected range.
- **Refunds**: Refunds recorded on invoices during the selected range.
- **Net cash**: Cash collected minus refunds.

---

## 🧰 Troubleshooting

### “Basic report (API not updated yet)”
This indicates your Web app is newer than the API. **Redeploy the API** and try again.
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'crm-reporting-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'crm-reporting-guide' }, { $set: { ...REPORTING_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(REPORTING_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: REPORTING_KB_ARTICLE.title,
                slug: REPORTING_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${REPORTING_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed reporting KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/integrations-kb - Add Integrations KB article
adminSeedDataRouter.post('/integrations-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const INTEGRATIONS_KB_ARTICLE = {
            title: 'CRM Integrations (Webhooks + API Keys + Inbound) — Step‑by‑Step Guide',
            category: 'Administration',
            slug: 'crm-integrations-guide',
            tags: ['crm', 'crm:integrations', 'integrations', 'webhooks', 'api-keys', 'inbound', 'zapier', 'make'],
            body: `# CRM Integrations (Webhooks + API Keys + Inbound) — Step‑by‑Step Guide

BOAZ Integrations lets you connect BOAZ to other tools (Slack, Zapier, Make, custom apps) so things can happen automatically.

This guide is written for **regular business users** — you do **not** need to be a developer.

---

## 1) What is a webhook? (plain English)

A **webhook** is a “notification link”.

- BOAZ watches for an event (example: **a ticket is created**).
- When it happens, BOAZ sends a message to a URL you provide (your webhook URL).
- That other tool receives it and can run an automation (example: **post to Slack**, **create a task**, **add a row to a spreadsheet**, **create a contact**, etc.).

Think of it like: **“When X happens in BOAZ → tell Y immediately.”**

---

## 2) Quick Start (recommended)

### Step A — Get a test webhook URL
Pick one:
- **Webhook.site** (fastest): create a temporary URL that shows you what BOAZ sends.
- **Zapier**: create a “Catch Hook” trigger.
- **Make**: create a “Custom Webhook” trigger.

You will end up with a URL that looks like \`https://...\`.

### Step B — Create the webhook in BOAZ
1. Go to **CRM → Integrations**
2. In **Webhooks**, enter:
   - **Name**: e.g. “Zapier”
   - **Destination URL**: paste your webhook URL
   - **Signing secret (optional)**: leave blank for now (you can enable later)
   - **Events**: keep the default or use \`*\` to receive everything
3. Click **Create Webhook**

### Step C — Send a test event
1. Find your webhook in “Configured webhooks”
2. Click **Send test**
3. In your receiving tool, confirm you received an event named **\`test.ping\`**

If you see the test event, your webhook is working.

---

## 3) Common BOAZ events you can automate

BOAZ will send events like:
- **\`support.ticket.created\`**: a new support ticket was created
- **\`crm.invoice.paid\`**: an invoice was paid in full
- **\`test.ping\`**: sent only when you click “Send test”

The Integrations page shows the full list of supported events.

---

## 4) Turning webhook events into automations (Zapier example)

Example: “When a BOAZ ticket is created → create a Slack message”
1. In Zapier, create a new Zap
2. Trigger: **Webhooks by Zapier → Catch Hook**
3. Paste the hook URL into BOAZ and click **Send test**
4. Action: Slack → “Send Channel Message”
5. Map fields from the incoming BOAZ payload (like ticket number and subject)
6. Turn on the Zap

---

## 5) Security (recommended for production)

### Use a Signing Secret (protects against fake events)
If you set a **Signing secret**, BOAZ will add two headers:
- \`x-boaz-timestamp\`
- \`x-boaz-signature\`

Your receiving system can verify the signature to ensure the request genuinely came from BOAZ.

If you’re using Zapier/Make and cannot verify signatures easily, you can still use a secret by:
- Using a private/unguessable webhook URL
- Restricting by IP/allowlist if your platform supports it

### Do NOT paste secrets into tickets or public docs
Treat webhook URLs and signing secrets like passwords.

---

## 6) API Keys (what they are for)

An **API key** is used when an external system needs to **call BOAZ** (instead of BOAZ calling it).

Examples:
- Sync contacts from another tool into BOAZ
- Pull invoice status into a data warehouse
- Build a custom integration service

**Important:** API keys are shown **once** at creation. Copy and store them securely.

---

## 7) Inbound (Push data into BOAZ)

BOAZ supports an **Inbound API** so external systems can create/update (upsert) data inside BOAZ.

### What “upsert” means
If the record already exists, BOAZ updates it. If it does not exist, BOAZ creates it.

### Idempotency (prevents duplicates)
Inbound uses two fields to uniquely identify records:
- \`externalSource\` (example: \`hubspot\`, \`quickbooks\`, \`make\`)
- \`externalId\` (the record ID in that external system)

Send the same \`externalSource + externalId\` again and BOAZ will update the same record.

### Authentication (required)
Send your API key in a header:
- \`x-boaz-api-key: boaz_sk_...\`

Required scope:
- \`integrations:write\`

### Endpoints
- **Accounts**: \`POST /api/integrations/inbound/accounts\`
- **Contacts**: \`POST /api/integrations/inbound/contacts\`
- **Deals**: \`POST /api/integrations/inbound/deals\`
- **Tickets**: \`POST /api/integrations/inbound/tickets\`

### Example: create/update an Account (copy/paste)
\`\`\`
curl -X POST "https://<your-api-host>/api/integrations/inbound/accounts" \\
  -H "Content-Type: application/json" \\
  -H "x-boaz-api-key: boaz_sk_********" \\
  -d '{
    "externalSource": "hubspot",
    "externalId": "company_123",
    "name": "Acme Corp",
    "domain": "acme.com",
    "phone": "+1 555-123-4567"
  }'
\`\`\`

### Example: create/update a Ticket
\`\`\`
curl -X POST "https://<your-api-host>/api/integrations/inbound/tickets" \\
  -H "Content-Type: application/json" \\
  -H "x-boaz-api-key: boaz_sk_********" \\
  -d '{
    "externalSource": "make",
    "externalId": "run_987",
    "shortDescription": "Customer reported login issue",
    "description": "Created automatically from external form submission",
    "requesterEmail": "user@acme.com",
    "priority": "normal",
    "status": "open"
  }'
\`\`\`

---

## 8) Troubleshooting

### “Send test” worked, but real events don’t arrive
- Confirm the webhook is **Active**
- Confirm your webhook’s **Events** include the event type you want (or use \`*\`)
- Create the action again (create a new ticket / fully pay an invoice)

### The receiving tool says “timeout”
- Your endpoint may be slow or blocked
- Try a simpler receiver (Webhook.site) to isolate the issue

### I’m not sure what fields are included
- Use **Webhook.site** and click the received request — you’ll see the exact JSON payload BOAZ sends.
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existingArticle = await db.collection('kb_articles').findOne({ slug: 'crm-integrations-guide' });
        const result = existingArticle ? 'updated' : 'created';
        if (existingArticle) {
            await db.collection('kb_articles').updateOne({ slug: 'crm-integrations-guide' }, { $set: { ...INTEGRATIONS_KB_ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(INTEGRATIONS_KB_ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: INTEGRATIONS_KB_ARTICLE.title,
                slug: INTEGRATIONS_KB_ARTICLE.slug,
                url: `/apps/crm/support/kb/${INTEGRATIONS_KB_ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed integrations KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/marketing-segments-kb - Add Marketing Segments / Engagement KB article
adminSeedDataRouter.post('/marketing-segments-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Marketing Segments & Engagement (Opens/Clicks) — BOAZ‑OS Guide',
            category: 'Marketing',
            slug: 'marketing-segments-engagement-guide',
            tags: ['crm', 'crm:marketing', 'crm:marketing-segments', 'marketing', 'segments', 'engagement', 'opens', 'clicks', 'unsubscribe'],
            body: `# Marketing Segments & Engagement (Opens/Clicks) — BOAZ‑OS Guide

This guide explains how to build and use **Marketing Segments** in BOAZ‑OS, including how BOAZ automatically creates **Engaged** segments based on email opens and clicks.

---

## 1) What is a Segment?

A **segment** is a saved audience list. You use segments to decide **who receives a campaign**.

BOAZ supports:
- **Rule-based segments** (filters that match contacts)
- **Direct email segments** (a list of emails you paste in)

---

## 2) Step-by-step: Create a segment

1. Go to **CRM → Marketing → Segments**
2. Click **Add segment**
3. Open the segment and define:
   - **Rules** (example: email contains “@company.com”) and/or
   - **Direct emails** (paste a list, one per line)
4. Click **Preview** to see how many contacts/emails match

---

## 3) Engagement tracking (opens & clicks)

When you send a campaign, BOAZ tracks:
- **Opens**: a tiny tracking pixel embedded in the email (counts when the email is opened)
- **Clicks**: tracked links (BOAZ wraps links so it can record clicks)

This gives you real engagement signals.

---

## 4) Automatic “Engaged” segments (what most users want)

BOAZ can automatically build an audience segment based on **recipient engagement**:

- When a recipient **opens** or **clicks** a campaign email (and does **not** unsubscribe),
  BOAZ adds their email address to an auto-generated segment named:
  - **Engaged: &lt;Campaign Name&gt;**

### How to use the Engaged segment
1. Send Campaign A
2. Wait for opens/clicks
3. Create Campaign B
4. In Campaign B, choose the segment **Engaged: &lt;Campaign A&gt;**
5. Send to follow up with people who showed interest

---

## 5) Do Not Contact / Unsubscribe behavior

If someone unsubscribes, they are placed on the **Do Not Contact** list and BOAZ will:
- Stop sending them marketing emails
- Stop adding them to Engaged segments

---

## 6) Troubleshooting

### I don’t see an Engaged segment
- Make sure the campaign was sent successfully
- Opens/clicks only appear after recipients interact with the email
- If nobody opened/clicked yet, the segment may not exist yet

### Clicks aren’t tracking
- Use the built-in link tracking (BOAZ-wrapped links)
- Some email clients or security tools can strip tracking parameters

---

Need help? Open **CRM → Marketing** and click the **?** icon.
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed marketing segments KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/scheduler-kb - Add Scheduler KB article
adminSeedDataRouter.post('/scheduler-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Scheduler — Booking Links, Availability, and Appointments',
            category: 'Scheduling',
            slug: 'scheduler-guide',
            tags: ['scheduler', 'appointments', 'booking link', 'availability', 'calendar', 'crm', 'tasks', 'meetings'],
            body: `# Scheduler — Booking Links, Availability, and Appointments

The **Scheduler** app is used to:
- Create **Appointment Types** (what can be booked)
- Configure **Availability** (when you can be booked)
- Share **public booking links** (\`/schedule/<slug>\`)
- Manage **Appointments** (booked/cancelled)
- View appointments in **Calendar** views (Month / Week / Day)

When an appointment is booked, BOAZ also creates a **CRM Task (type: meeting)** so it appears in your CRM workflow.

---

## ✅ Where to find it

- Internal Scheduler app: **Apps → Scheduler** (\`/apps/scheduler\`)
- Public booking page: \`/schedule/<appointment-type-slug>\`

---

## 📚 Sub-guides (by tab)

- Appointment Types: \`/apps/crm/support/kb/scheduler-appointment-types\`
- Availability: \`/apps/crm/support/kb/scheduler-availability\`
- Appointments: \`/apps/crm/support/kb/scheduler-appointments\`
- Calendar: \`/apps/crm/support/kb/scheduler-calendar\`

---

## Core concepts

- **Appointment Type**: A template (name, slug, duration, location, buffers, active)
- **Availability**: Weekly schedule + time zone used to generate slots
- **Appointment**: A booking record (attendee, start/end, status, source)
- **Source**: \`public\` (booked by attendee) or \`internal\` (booked by staff)
- **CRM meeting task**: A CRM task created from an appointment (visible at \`/apps/crm/tasks\`)

---

## Booking flow overview

### Public booking (clients)
1. Share \`/schedule/<slug>\`
2. Attendee selects an available slot and enters details
3. BOAZ validates:
   - within availability hours
   - within booking window
   - no conflicts with existing appointments (including buffers)
   - optional external-calendar “busy” conflicts (if connected)
4. BOAZ creates:
   - Appointment record
   - CRM Contact link/creation (best-effort)
   - CRM meeting task

### Internal booking (staff)
1. Scheduler → Appointments → “Create appointment (internal)”
2. Optionally link to a CRM Contact (recommended)
3. Choose type, date/time, attendee details
4. BOAZ runs the same conflict checks and creates the same downstream records

---

## Troubleshooting (common)

### “Booking page not found”
- The booking URL slug may be wrong
- The appointment type may be inactive or deleted

### “No available times”
- Availability day may be disabled
- Start/end window may be too small for the appointment duration
- Existing appointments and/or buffers may block all slots

### “Slot taken”
Someone booked it first or another appointment overlaps the buffered window.

---

**Last Updated:** January 2026
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed scheduler KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/scheduler-appointment-types-kb - Add Scheduler Appointment Types KB article
adminSeedDataRouter.post('/scheduler-appointment-types-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Scheduler — Appointment Types',
            category: 'Scheduling',
            slug: 'scheduler-appointment-types',
            tags: ['scheduler', 'appointment types', 'booking link', 'slug', 'duration', 'location', 'buffers'],
            body: `# Scheduler — Appointment Types

Appointment Types define **what** someone can book and generate the **public booking link** for that type.

---

## Where to find it

- Scheduler app: **Appointment types** tab (\`/apps/scheduler\`)

---

## Fields (and what they do)

### Name (required)
- Display name shown internally and on the public booking page.

### Slug (required)
- Used in the public booking URL: \`/schedule/<slug>\`
- Keep slugs short and stable (changing the slug changes the public link).

### Duration (minutes)
- Determines the appointment end time.

### Location
- Location type: Video / Phone / In person / Custom
- Location details (optional): meeting link, address, dial-in instructions, etc.

### Buffers (optional, recommended)
- Buffer before (minutes)
- Buffer after (minutes)

Buffers are included in conflict checks to prevent back-to-back bookings.

### Active
- If inactive, the public booking page is effectively disabled for new bookings.

---

## Booking link actions

In the appointment type list you can:
- **Open booking page** (opens \`/schedule/<slug>\`)
- **Copy link** (copies the full booking URL)

---

## Best practices

- Use \`15\` or \`30\` minute durations for most intro calls.
- Use buffers for travel/setup (example: 10 before / 10 after).
- Put the actual Zoom/Teams link in “Location details” so clients have it at booking time.

---

## Troubleshooting

### Booking page “not found”
- Ensure the appointment type is **Active**
- Ensure you’re using the correct URL: \`/schedule/<slug>\`

### People can’t see any times
- Availability may not be enabled for that day
- Existing appointments (or buffers) may be blocking all slots

---

Related:
- Overview: \`/apps/crm/support/kb/scheduler-guide\`
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed scheduler appointment types KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/scheduler-availability-kb - Add Scheduler Availability KB article
adminSeedDataRouter.post('/scheduler-availability-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Scheduler — Availability',
            category: 'Scheduling',
            slug: 'scheduler-availability',
            tags: ['scheduler', 'availability', 'timezone', 'weekly schedule', 'time slots'],
            body: `# Scheduler — Availability

Availability controls **when** your public booking pages show available times.

---

## Where to find it

- Scheduler app: **Availability** tab (\`/apps/scheduler\`)

---

## Time zone

Availability uses an **IANA** time zone (example: \`America/New_York\`).

Notes:
- The public booking page displays slots in this time zone.
- If you change the time zone, the weekly hours are interpreted in the new zone.

---

## Weekly schedule

For each day of week you can set:
- **Enabled**: Whether bookings can occur on that day
- **Start** and **End** times

The public booking page generates slots in **15-minute increments**, then filters out:
- Past times
- Times outside the booking window
- Conflicts with existing appointments (including buffers)

---

## Troubleshooting

### “No available times”
- Ensure the weekday is enabled
- Ensure start/end allow enough room for the appointment duration
- Check whether buffers are blocking adjacent slots

---

Related:
- Overview: \`/apps/crm/support/kb/scheduler-guide\`
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed scheduler availability KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/scheduler-appointments-kb - Add Scheduler Appointments KB article
adminSeedDataRouter.post('/scheduler-appointments-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Scheduler — Appointments',
            category: 'Scheduling',
            slug: 'scheduler-appointments',
            tags: ['scheduler', 'appointments', 'internal booking', 'public booking', 'cancel', 'crm', 'tasks'],
            body: `# Scheduler — Appointments

The Appointments tab is where you manage bookings and (internally) schedule on behalf of clients.

---

## Where to find it

- Scheduler app: **Appointments** tab (\`/apps/scheduler\`)
- Public booking: \`/schedule/<slug>\`

---

## Appointment status & source

- **Status**: booked / cancelled
- **Source**: public / internal

---

## Search

Search supports:
- attendee name
- attendee email
- attendee phone
- appointment type name

---

## Internal scheduling (“book on behalf of”)

You can create an appointment manually:
1. Select an **appointment type**
2. Choose a **date/time**
3. (Optional) select a **CRM contact**
4. Enter attendee info + optional notes
5. Click **Book & send invite**

The server enforces:
- Availability window checks
- Conflict checks (including buffers)
- Optional external calendar busy checks (if connected)

---

## Cancelling

Booked appointments can be cancelled from:
- The appointment row actions
- The appointment details modal

When cancelled, BOAZ will best-effort cancel the matching CRM meeting task(s).

---

## CRM Task integration

When an appointment is booked, BOAZ creates a **CRM Task** of type **meeting** (visible in \`/apps/crm/tasks\`).

---

Related:
- Overview: \`/apps/crm/support/kb/scheduler-guide\`
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed scheduler appointments KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/scheduler-calendar-kb - Add Scheduler Calendar KB article
adminSeedDataRouter.post('/scheduler-calendar-kb', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Scheduler — Calendar',
            category: 'Scheduling',
            slug: 'scheduler-calendar',
            tags: ['scheduler', 'calendar', 'month view', 'week view', 'day view'],
            body: `# Scheduler — Calendar

The Calendar tab provides a visual view of scheduled appointments.

---

## Where to find it

- Scheduler app: **Calendar** tab (\`/apps/scheduler\`)

---

## Views

- **Month**: quick overview; shows up to a few appointments per day and a “+X more” indicator.
- **Week**: appointments grouped by weekday.
- **Day**: list of all appointments for the selected day.

Clicking an appointment opens its details.

---

## Tips

- Cancelled appointments do not appear.
- If you don’t see an appointment, confirm it falls within the displayed date range.

---

## Quick create workflow (Month view)

In Month view, clicking a day can jump you into internal booking and pre-fill the date for faster scheduling.

---

Related:
- Overview: \`/apps/crm/support/kb/scheduler-guide\`
`,
            status: 'published',
            createdAt: new Date(),
            updatedAt: new Date(),
            author: 'System',
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed scheduler calendar KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/stratflow-kb - Add StratFlow KB articles (all modules)
adminSeedDataRouter.post('/stratflow-kb', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLES = [
            {
                title: 'StratFlow — Getting Started (Projects, Flow Hub, and Navigation)',
                category: 'StratFlow',
                slug: 'stratflow-guide',
                tags: ['stratflow', 'projects', 'flow hub', 'board', 'list', 'sprint', 'timeline', 'reports', 'activity', 'notifications', 'mentions', 'watching'],
                body: `# StratFlow — Getting Started (Projects, Flow Hub, and Navigation)

StratFlow is BOAZ’s strategic delivery workspace. It combines **project planning**, **agile execution**, and **portfolio visibility** into one Flow Hub.

---

## ✅ What you can do in StratFlow

- Create projects with a ready-to-use workflow (Scrum / Kanban / Traditional / Hybrid)
- Track work as **Epics, Stories, Tasks, Defects** (and optional **Spikes**)
- Plan issues into sprints and manage sprint capacity
- Visualize delivery through Board, List, Sprint, Timeline, Reports, and Activity views
- Track dependencies (Blocked / Blocks) and log time (billable vs non-billable)
- Stay informed with **in‑app notifications** (watch project/issue + @mentions)

---

## ✅ Where to find it

- Projects home: \`/apps/stratflow\`
- A project’s Flow Hub: \`/apps/stratflow/<projectId>\`

---

## The Flow Hub (views)

### Board
Use the Board for day-to-day execution and WIP visibility.
- Drag-and-drop issues across columns
- Filter each column by issue type
- See a **Blocked** badge when an issue is blocked by another issue

### List
Use List view for power filtering and bulk operations.
- Saved filters (presets + custom)
- Bulk edit (assignee, sprint, labels, components)
- Export issues to CSV

### Sprint
Use Sprint view to plan and run delivery.
- Maintain backlog vs active sprint
- Track sprint progress (planned vs done points)
- Edit sprint name, goal, dates, and capacity points
- Close sprint (governance checks apply)

### Timeline
Use Timeline for roadmap visibility.
- Epic roadmap by phase and target dates
- Sprint timeline bars (when start/end dates exist)
- Drill into blocked items from an Epic card

### Reports
Use Reports to measure throughput, cycle time (approx), WIP health, and time logged.
- WIP by column
- WIP limits (per column)
- Blocked metrics
- Time rollups and time CSV export

### Activity
Use Activity to see changes as a feed.
- Issue updates/moves/comments/links
- Sprint lifecycle events
- Bulk updates and time events

---

## Notifications, watching, and @mentions (stay in the loop)

StratFlow includes an in‑app notification system so teams don’t miss important changes.

### Where notifications appear

- In a project’s Flow Hub, use the **Notifications (bell)** button at the top.
- Unread notifications show an **unread badge count**.

### How to watch

- **Watch project**: In the Flow Hub header, click **Watch project**. You’ll receive notifications for key updates in that project.
- **Watch issue**: In Issue Focus, click **Watch**. You’ll receive notifications for updates to that issue.

### How @mentions work

In Issue Focus → Comments, you can mention teammates using:
- \`@name\` (or part of a name)
- \`@email\` (or email local-part)

When you mention someone, they receive a **“You were mentioned”** notification.

### Marking notifications read

- Clicking a notification marks it as **read**
- Use **Mark all read** to clear everything at once

---

## Recommended learning path (self-service)

1. Projects + templates: \`/apps/crm/support/kb/stratflow-projects\`
2. Issues (Epics/Stories/Tasks/Defects): \`/apps/crm/support/kb/stratflow-issues\`
3. Sprint planning: \`/apps/crm/support/kb/stratflow-sprints\`
4. Dependencies (Blocked/Blocks): \`/apps/crm/support/kb/stratflow-dependencies\`
5. Time tracking: \`/apps/crm/support/kb/stratflow-time-tracking\`
6. Reports: \`/apps/crm/support/kb/stratflow-reports\`

---

Need help? In StratFlow, click the **?** help icon for the page you’re on.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
            {
                title: 'StratFlow — Projects & Templates (Scrum, Kanban, Traditional, Hybrid)',
                category: 'StratFlow',
                slug: 'stratflow-projects',
                tags: ['stratflow', 'projects', 'templates', 'scrum', 'kanban', 'traditional', 'hybrid'],
                body: `# StratFlow — Projects & Templates (Scrum, Kanban, Traditional, Hybrid)

Projects are the top-level container in StratFlow. When you create a project, StratFlow generates a starter workflow (boards + columns) based on the template you choose.

---

## Create a project

1. Go to \`/apps/stratflow\`
2. Click **New project**
3. Choose a template
4. Enter name + key
5. Create

---

## Templates (what they create)

### Scrum
Best for sprint-based delivery.
- **Backlog** board (Backlog column)
- **Sprint Board** (To Do / In Progress / In Review / Done)

### Kanban
Best for continuous flow work.
- **Board** (To Do / In Progress / In Review / Done)

### Traditional
Best for milestone-based delivery.
- **Milestones** board (Not Started / In Progress / Blocked / Complete)

### Hybrid
Best when you need both backlog and flow.
- **Board** (To Do / In Progress / In Review / Done)
- **Backlog**

---

## Project key (important)

The project key is used for quick identification (similar to Jira project keys).
- Keep it short and stable (2–12 characters)

---

Need help? Click the **?** icon in StratFlow projects.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
            {
                title: 'StratFlow — Issues (Epics, Stories, Tasks, Defects, Spikes)',
                category: 'StratFlow',
                slug: 'stratflow-issues',
                tags: ['stratflow', 'issues', 'epic', 'story', 'task', 'defect', 'spike', 'priority', 'labels', 'components', 'notifications', 'mentions', 'watching'],
                body: `# StratFlow — Issues (Epics, Stories, Tasks, Defects, Spikes)

Issues are the units of work in StratFlow.

---

## Issue types (when to use each)

- **Epic**: a large initiative spanning many issues
- **Story**: a user-facing increment of value (often sprint-planned)
- **Task**: a unit of work (implementation / ops / internal)
- **Defect**: a bug or production issue
- **Spike**: research/investigation (optional)

---

## Creating issues

### Fast-create (Board)
1. In a column, type a title in “Add an issue…”
2. Press Enter (or click +)
3. The issue is created in that column and inherits that column’s status

### Full edit (Issue Focus)
Click an issue card to open **Issue Focus** and edit fields:
- Summary, description, acceptance criteria
- Priority
- Sprint
- Epic link (disabled for Epics)
- Story points
- Assignee (project members only)
- Labels and Components

---

## Watching and notifications (Issue Focus)

Issue Focus includes a **Watch** button in the header.

- If you click **Watch**, StratFlow will notify you when important updates happen on that issue (comments, moves, etc.).
- If you click **Watching**, you’ll stop watching that issue.

Tip: Use **Watch issue** for work you depend on or anything you’re actively collaborating on.

---

## @mentions in comments

In the Comments section of Issue Focus, you can mention a teammate:

- \`@name\` (or part of a name)
- \`@email\` (or email local-part)

Mentions create a dedicated **“You were mentioned”** notification for the person you tagged.

---

## Governance rules (quality gates)

To move issues to **Done**, the API enforces:
- **Story** must have Acceptance Criteria
- **Defect** must have a Description

If a rule blocks the move, you’ll see an error and the move is prevented.

---

## Keyboard shortcuts (Issue Focus)

- **Esc**: close Issue Focus
- **F**: toggle full window
- **Ctrl/Cmd + Enter**: save

---

Need help? Click the **?** icon in Issue Focus or the Flow Hub.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
            {
                title: 'StratFlow — Sprint Planning (Backlog, Active Sprint, Capacity, Close Sprint)',
                category: 'StratFlow',
                slug: 'stratflow-sprints',
                tags: ['stratflow', 'sprint', 'planning', 'capacity', 'story points', 'close sprint'],
                body: `# StratFlow — Sprint Planning (Backlog, Active Sprint, Capacity, Close Sprint)

Sprint view helps you plan and execute sprint-based delivery.

---

## Key ideas

- **Backlog**: unplanned work (no sprint)
- **Planned sprint**: issues assigned to a sprint
- **Active sprint**: the sprint currently being executed (one per project)
- **Capacity points**: optional, used for utilization reporting

---

## Plan a sprint

1. Open a project → **Sprint** tab
2. Create a sprint (name, optional goal)
3. Set sprint active (if needed)
4. Assign issues into the sprint
5. (Optional) set sprint start/end dates + capacity points

---

## Sprint details

In Sprint view you can edit:
- Name and goal
- Start and end dates
- Capacity points

You also get a progress summary:
- Planned vs Done points
- Capacity utilization

---

## Close sprint (governance)

Only the **project owner** can close a sprint.

When closing:
- If there is open work, the system blocks close unless you use **Force close**
- Closing is logged in Activity

---

Need help? Click the **?** icon on Sprint view.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
            {
                title: 'StratFlow — Dependencies (Blocked / Blocks / Relates to)',
                category: 'StratFlow',
                slug: 'stratflow-dependencies',
                tags: ['stratflow', 'dependencies', 'blocked', 'blocks', 'relates_to'],
                body: `# StratFlow — Dependencies (Blocked / Blocks / Relates to)

Dependencies explain why work can’t proceed and make project risk visible.

---

## Link types

- **Blocked by**: this issue cannot move forward until another issue is done
- **Blocks**: this issue is preventing another issue from moving forward
- **Relates to**: informational relationship

---

## How “Blocked” works in StratFlow

An issue is considered **Blocked** if it has at least one **Blocked by** link.

Blocked issues:
- show a **Blocked** badge on cards
- can be filtered in Board/List/Sprint views
- are highlighted in Reports and epic rollups

---

## Add a dependency

1. Open an issue → Issue Focus
2. In **Dependencies**, choose link type (Blocked by / Blocks / Relates to)
3. Select the other issue
4. Click **Add**

---

## Unblock

If an issue is blocked, Issue Focus shows a **Blocked** banner and an **Unblock** action that removes all “Blocked by” links (use when the dependency is resolved).

---

Need help? Click the **?** icon on the Board or in Issue Focus.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
            {
                title: 'StratFlow — Time Tracking (Billable vs Non‑billable) + Rollups',
                category: 'StratFlow',
                slug: 'stratflow-time-tracking',
                tags: ['stratflow', 'time tracking', 'billable', 'reports'],
                body: `# StratFlow — Time Tracking (Billable vs Non‑billable) + Rollups

Time entries help teams understand effort and (optionally) track billable delivery.

---

## Log time

1. Open an issue → Issue Focus
2. In **Time**, set:
   - Work date
   - Hours
   - Billable toggle
   - Optional note
3. Click **Log time**

Notes:
- Time is stored as **minutes**.
- Only the entry author (or project owner) can edit/delete a time entry.

---

## Reports rollups

In **Reports**, StratFlow shows:
- Total time logged
- Billable vs non-billable totals
- Time by person
- Top issues by time
- Export time entries to CSV

---

## Best practices

- Use billable only when your organization has a clear billing policy.
- Write notes that explain *what changed* (useful in audits).
- Review the “Top issues (time)” list weekly to spot risk or scope creep.

---

Need help? Click the **?** icon in Reports.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
            {
                title: 'StratFlow — Reports (WIP, Throughput, Cycle Time, Work Health)',
                category: 'StratFlow',
                slug: 'stratflow-reports',
                tags: ['stratflow', 'reports', 'wip', 'throughput', 'cycle time', 'health', 'csv'],
                body: `# StratFlow — Reports (WIP, Throughput, Cycle Time, Work Health)

Reports provide a high-level view of delivery health and flow.

---

## Metrics included

- **Total / Done / WIP / Backlog**
- **Throughput** (7d / 14d / 30d)
- **Cycle time (approx)**: createdAt → updatedAt when status is Done
- **Blocked** count + oldest blocked age
- **WIP by column**
- **WIP limits** table
- **Time rollups** (total + billable)

---

## WIP limits (governance)

You can set WIP limits per column. When the limit is reached:
- Creating or moving issues into that column is prevented by the API

---

## Export

Reports view supports:
- Export of headline metrics CSV
- Export of time entries CSV
- Export of list issues CSV (from List view)

---

Need help? Click the **?** icon on Reports.
`,
                status: 'published',
                createdAt: new Date(),
                updatedAt: new Date(),
                author: 'System',
                views: 0,
            },
        ];
        const results = [];
        for (const ARTICLE of ARTICLES) {
            const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
            const result = existing ? 'updated' : 'created';
            if (existing)
                await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
            else
                await db.collection('kb_articles').insertOne(ARTICLE);
            results.push({ title: ARTICLE.title, slug: ARTICLE.slug, result, url: `/apps/crm/support/kb/${ARTICLE.slug}` });
        }
        res.json({
            data: {
                message: `StratFlow KB seeded successfully (${results.length} articles)`,
                results,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed stratflow KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// POST /api/admin/seed/financial-intelligence-kb - Add Financial Intelligence KB article
adminSeedDataRouter.post('/financial-intelligence-kb', async (_req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const ARTICLE = {
            title: 'Financial Intelligence: Complete Guide to GAAP-Compliant Accounting',
            category: 'Financial Management',
            slug: 'financial-intelligence-guide',
            tags: ['crm', 'crm:financial', 'financial', 'accounting', 'gaap', 'journal-entries', 'financial-statements', 'kpi', 'expenses', 'chart-of-accounts'],
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
            createdAt: new Date(),
            updatedAt: new Date(),
            views: 0,
        };
        const existing = await db.collection('kb_articles').findOne({ slug: ARTICLE.slug });
        const result = existing ? 'updated' : 'created';
        if (existing) {
            await db.collection('kb_articles').updateOne({ slug: ARTICLE.slug }, { $set: { ...ARTICLE, updatedAt: new Date() } });
        }
        else {
            await db.collection('kb_articles').insertOne(ARTICLE);
        }
        res.json({
            data: {
                message: `KB article ${result} successfully`,
                result,
                title: ARTICLE.title,
                slug: ARTICLE.slug,
                url: `/apps/crm/support/kb/${ARTICLE.slug}`,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Seed financial intelligence KB error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_seed_kb' });
    }
});
// DELETE /api/admin/customer-portal-users/:email - Remove customer by email
adminSeedDataRouter.delete('/customer-portal-user/:email', async (req, res) => {
    const db = await getDb();
    if (!db)
        return res.status(500).json({ data: null, error: 'db_unavailable' });
    try {
        const email = req.params.email.toLowerCase();
        const user = await db.collection('customer_portal_users').findOne({ email });
        if (!user) {
            return res.status(404).json({ data: null, error: 'user_not_found' });
        }
        const userInfo = {
            id: user._id.toHexString(),
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified || false,
            createdAt: user.createdAt,
        };
        await db.collection('customer_portal_users').deleteOne({ _id: user._id });
        res.json({
            data: {
                message: 'User deleted successfully',
                deletedUser: userInfo,
            },
            error: null,
        });
    }
    catch (err) {
        console.error('Delete customer portal user error:', err);
        res.status(500).json({ data: null, error: err.message || 'failed_to_delete_user' });
    }
});
