export function createHealthResponse(service = 'api') {
    return { ok: true, service, timestamp: Date.now() };
}
export * from './auth';
