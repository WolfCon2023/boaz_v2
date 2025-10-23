export type AppCatalogItem = {
  key: string
  name: string
  description: string
}

export const catalog: AppCatalogItem[] = [
  { key: 'crm', name: 'CRM', description: 'Contacts, deals, pipelines' },
  { key: 'scheduler', name: 'Scheduler', description: 'Calendar and bookings' },
  { key: 'support', name: 'Helpdesk', description: 'Tickets and SLAs' },
  { key: 'billing', name: 'Billing', description: 'Invoices and payments' },
  { key: 'analytics', name: 'Analytics', description: 'Dashboards and reports' },
  { key: 'stratflow', name: 'StratFlow', description: 'Projects and tasks' },
]

const STORAGE_KEY = 'boaz.installedApps'
const ORDER_KEY = 'boaz.workspace.order'

export function getInstalledApps(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function installApp(key: string) {
  const current = new Set(getInstalledApps())
  current.add(key)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]))
}

export function uninstallApp(key: string) {
  const current = new Set(getInstalledApps())
  current.delete(key)
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]))
}

export function getWorkspaceOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function setWorkspaceOrder(order: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order))
}


