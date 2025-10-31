import { getApiUrl } from './http'

export async function getHealth(): Promise<Response> {
  return fetch(getApiUrl('/api/health'))
}

export async function getMetricsSummary(): Promise<{ data: { appointmentsToday: number; tasksDueToday: number; tasksCompletedToday: number }; error: unknown }> {
  const res = await fetch(getApiUrl('/api/metrics/summary'))
  return res.json()
}


