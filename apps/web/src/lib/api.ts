export async function getHealth(): Promise<Response> {
  return fetch('/api/health')
}

export async function getMetricsSummary(): Promise<{ data: { appointmentsToday: number; tasksDueToday: number; tasksCompletedToday: number }; error: unknown }> {
  const res = await fetch('/api/metrics/summary')
  return res.json()
}


