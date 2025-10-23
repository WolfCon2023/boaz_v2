export type HealthResponse = {
    ok: boolean;
    service: string;
    timestamp: number;
};
export declare function createHealthResponse(service?: string): HealthResponse;
export * from './auth';
