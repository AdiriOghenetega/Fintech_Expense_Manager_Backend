import { Request, Response, NextFunction } from 'express';
declare class PerformanceMonitor {
    private slowThreshold;
    private verySlowThreshold;
    private metrics;
    private maxMetrics;
    middleware(): (req: Request, res: Response, next: NextFunction) => void;
    private addMetric;
    getStats(): {
        totalRequests: number;
        averageResponseTime: number;
        slowRequests: number;
        errorRate: number;
        slowRequestsPercentage?: undefined;
        memoryUsage?: undefined;
    } | {
        totalRequests: number;
        averageResponseTime: number;
        slowRequests: number;
        slowRequestsPercentage: number;
        errorRate: number;
        memoryUsage: NodeJS.MemoryUsage;
    };
    getSlowestEndpoints(limit?: number): {
        endpoint: string;
        duration: number;
        statusCode: number;
    }[];
    reset(): void;
}
export declare const performanceMonitor: PerformanceMonitor;
export declare const healthMiddleware: (req: Request, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=performance.d.ts.map