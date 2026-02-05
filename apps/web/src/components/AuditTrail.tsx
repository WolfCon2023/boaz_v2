/**
 * Shared Audit Trail component for displaying history/audit logs
 * across all BOAZ modules with a consistent table design.
 */

export type AuditEntry = {
  timestamp: string
  action: string
  eventType?: string // Alternative field name used by some modules
  userId?: string
  userName?: string
  userEmail?: string
  notes?: string
  description?: string // Alternative field name used by some modules
  changedFields?: string[]
  oldValue?: any
  newValue?: any
  previousStatus?: string
  roleName?: string
  metadata?: Record<string, any>
}

export type ActionLabelConfig = {
  label: string
  color: string
}

export type AuditTrailProps = {
  entries: AuditEntry[]
  title?: string
  actionLabels?: Record<string, ActionLabelConfig>
  maxHeight?: string
  emptyMessage?: string
}

// Default action labels that cover common actions across all modules
const DEFAULT_ACTION_LABELS: Record<string, ActionLabelConfig> = {
  // General CRUD
  created: { label: 'Created', color: 'text-blue-400' },
  updated: { label: 'Updated', color: 'text-amber-400' },
  edited: { label: 'Edited', color: 'text-amber-400' },
  deleted: { label: 'Deleted', color: 'text-red-400' },
  
  // Status changes
  status_changed: { label: 'Status Changed', color: 'text-purple-400' },
  stage_changed: { label: 'Stage Changed', color: 'text-purple-400' },
  
  // Approval workflow
  submitted: { label: 'Submitted', color: 'text-purple-400' },
  resubmitted: { label: 'Resubmitted', color: 'text-purple-400' },
  approval_requested: { label: 'Approval Requested', color: 'text-purple-400' },
  level_approved: { label: 'Approved', color: 'text-emerald-400' },
  approved: { label: 'Approved', color: 'text-emerald-400' },
  rejected: { label: 'Rejected', color: 'text-red-400' },
  withdrawn: { label: 'Withdrawn', color: 'text-gray-400' },
  
  // Financial
  paid: { label: 'Paid', color: 'text-green-400' },
  voided: { label: 'Voided', color: 'text-gray-400' },
  payment_received: { label: 'Payment Received', color: 'text-green-400' },
  refund_issued: { label: 'Refund Issued', color: 'text-orange-400' },
  total_changed: { label: 'Total Changed', color: 'text-amber-400' },
  amount_changed: { label: 'Amount Changed', color: 'text-amber-400' },
  
  // Documents/Attachments
  attachment_added: { label: 'Attachment Added', color: 'text-cyan-400' },
  attachment_removed: { label: 'Attachment Removed', color: 'text-orange-400' },
  version_uploaded: { label: 'Version Uploaded', color: 'text-cyan-400' },
  version_downloaded: { label: 'Version Downloaded', color: 'text-blue-400' },
  checked_out: { label: 'Checked Out', color: 'text-amber-400' },
  checked_in: { label: 'Checked In', color: 'text-green-400' },
  
  // Assignment
  assigned: { label: 'Assigned', color: 'text-blue-400' },
  reassigned: { label: 'Reassigned', color: 'text-amber-400' },
  unassigned: { label: 'Unassigned', color: 'text-gray-400' },
  owner_changed: { label: 'Owner Changed', color: 'text-amber-400' },
  
  // Quotes/Contracts
  sent: { label: 'Sent', color: 'text-blue-400' },
  sent_to_signer: { label: 'Sent to Signer', color: 'text-blue-400' },
  signed: { label: 'Signed', color: 'text-green-400' },
  accepted: { label: 'Accepted', color: 'text-green-400' },
  declined: { label: 'Declined', color: 'text-red-400' },
  expired: { label: 'Expired', color: 'text-gray-400' },
  version_changed: { label: 'Version Changed', color: 'text-amber-400' },
  
  // Projects/Tasks
  completed: { label: 'Completed', color: 'text-green-400' },
  reopened: { label: 'Reopened', color: 'text-amber-400' },
  started: { label: 'Started', color: 'text-blue-400' },
  paused: { label: 'Paused', color: 'text-amber-400' },
  resumed: { label: 'Resumed', color: 'text-blue-400' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400' },
  health_changed: { label: 'Health Changed', color: 'text-amber-400' },
  progress_updated: { label: 'Progress Updated', color: 'text-blue-400' },
  priority_changed: { label: 'Priority Changed', color: 'text-amber-400' },
  due_date_changed: { label: 'Due Date Changed', color: 'text-amber-400' },
  
  // Support Tickets
  escalated: { label: 'Escalated', color: 'text-red-400' },
  resolved: { label: 'Resolved', color: 'text-green-400' },
  closed: { label: 'Closed', color: 'text-gray-400' },
  sla_updated: { label: 'SLA Updated', color: 'text-amber-400' },
  comment_added: { label: 'Comment Added', color: 'text-blue-400' },
  
  // Renewals
  churn_risk_changed: { label: 'Churn Risk Changed', color: 'text-amber-400' },
  health_score_changed: { label: 'Health Score Changed', color: 'text-amber-400' },
  renewal_date_changed: { label: 'Renewal Date Changed', color: 'text-amber-400' },
  churned: { label: 'Churned', color: 'text-red-400' },
  renewed: { label: 'Renewed', color: 'text-green-400' },
  
  // Assets
  location_changed: { label: 'Location Changed', color: 'text-amber-400' },
  warranty_updated: { label: 'Warranty Updated', color: 'text-amber-400' },
  retired: { label: 'Retired', color: 'text-gray-400' },
  
  // Vendors
  activated: { label: 'Activated', color: 'text-green-400' },
  deactivated: { label: 'Deactivated', color: 'text-gray-400' },
  contact_updated: { label: 'Contact Updated', color: 'text-amber-400' },
  
  // Generic field change
  field_changed: { label: 'Field Changed', color: 'text-amber-400' },
  
  // Permissions
  permission_granted: { label: 'Permission Granted', color: 'text-green-400' },
  permission_revoked: { label: 'Permission Revoked', color: 'text-red-400' },
}

export function AuditTrail({
  entries,
  title = 'Audit History',
  actionLabels = {},
  maxHeight = '300px',
  emptyMessage = 'No history available',
}: AuditTrailProps) {
  // Merge custom action labels with defaults
  const mergedLabels = { ...DEFAULT_ACTION_LABELS, ...actionLabels }

  const getActionDisplay = (entry: AuditEntry): ActionLabelConfig => {
    // Try action first, then eventType
    const actionKey = entry.action || entry.eventType || ''
    
    if (mergedLabels[actionKey]) {
      return mergedLabels[actionKey]
    }
    
    // Capitalize the action as fallback
    const label = actionKey
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    
    return { label: label || 'Unknown', color: 'text-[color:var(--color-text)]' }
  }

  const getDetails = (entry: AuditEntry): string => {
    // Priority: notes > description > changedFields > oldValue/newValue diff
    if (entry.notes) return entry.notes
    if (entry.description) return entry.description
    if (entry.changedFields && entry.changedFields.length > 0) {
      return `Changed: ${entry.changedFields.join(', ')}`
    }
    if (entry.oldValue !== undefined && entry.newValue !== undefined) {
      const oldStr = typeof entry.oldValue === 'object' 
        ? JSON.stringify(entry.oldValue) 
        : String(entry.oldValue)
      const newStr = typeof entry.newValue === 'object' 
        ? JSON.stringify(entry.newValue) 
        : String(entry.newValue)
      return `${oldStr} → ${newStr}`
    }
    return '—'
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium">{title}</h3>
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
          <p className="text-sm text-[color:var(--color-text-muted)]">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] overflow-hidden">
        <div className="overflow-y-auto" style={{ maxHeight }}>
          <table className="min-w-full text-xs">
            <thead className="bg-[color:var(--color-muted)] sticky top-0">
              <tr className="text-[10px] uppercase text-[color:var(--color-text-muted)]">
                <th className="px-3 py-2 text-left">Date/Time</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">By</th>
                <th className="px-3 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {[...entries].reverse().map((entry, idx) => {
                const actionInfo = getActionDisplay(entry)
                const timestamp = entry.timestamp || (entry as any).createdAt || ''
                const details = getDetails(entry)
                
                return (
                  <tr key={idx} className="border-t border-[color:var(--color-border)]">
                    <td className="px-3 py-2 text-[color:var(--color-text-muted)] whitespace-nowrap">
                      {timestamp ? new Date(timestamp).toLocaleString() : '—'}
                    </td>
                    <td className={`px-3 py-2 font-medium ${actionInfo.color}`}>
                      {actionInfo.label}
                      {entry.roleName && (
                        <span className="ml-1 text-[color:var(--color-text-muted)]">
                          ({entry.roleName})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {entry.userName || entry.userEmail || 'System'}
                    </td>
                    <td 
                      className="px-3 py-2 text-[color:var(--color-text-muted)] max-w-[200px] truncate" 
                      title={details}
                    >
                      {details}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AuditTrail
