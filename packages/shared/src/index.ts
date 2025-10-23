export type HealthResponse = {
  ok: boolean
  service: string
  timestamp: number
}

export function createHealthResponse(service: string = 'api'): HealthResponse {
  return { ok: true, service, timestamp: Date.now() }
}

export * from './auth'


