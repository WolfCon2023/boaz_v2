import { getApiUrl, http } from './http'

export async function getHealth(): Promise<Response> {
  return fetch(getApiUrl('/api/health'))
}

export async function getMetricsSummary(): Promise<{ data: { appointmentsToday: number; tasksDueToday: number; tasksCompletedToday: number }; error: unknown }> {
  // Use axios client so auth token is attached (endpoint requires auth).
  const res = await http.get('/api/metrics/summary')
  return res.data
}


