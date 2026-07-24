const DOMAINS = [
  'Capacity Table',
  'Admin Portal',
  'Session Sync',
  'Notification Pipeline',
  'Reporting',
  'Access Policy',
  'Search Index',
  'Onboarding Flow',
  'Billing Ledger',
  'Data Migration',
  'Cache Layer',
  'Webhook Handler',
  'Audit Log',
  'Config Loader',
  'Build Pipeline',
]

const INITIATIVES = ['Revamp', 'Migration', 'Automation', 'Overhaul', 'Refresh', 'Cleanup', 'Rollout', 'Optimization']

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

export function randomProjectName(): string {
  return `${pick(DOMAINS)} ${pick(INITIATIVES)}`
}
