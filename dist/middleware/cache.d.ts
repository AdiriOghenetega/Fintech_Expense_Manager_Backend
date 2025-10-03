import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth';
interface CacheMiddlewareOptions {
    ttl?: number;
    keyGenerator?: (req: AuthRequest) => string;
    skipCache?: (req: AuthRequest) => boolean;
    varyBy?: string[];
}
export declare function cacheMiddleware(prefix: string, options?: CacheMiddlewareOptions): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const overviewCache: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const analyticsCache: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const expensesCache: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const budgetsCache: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare function invalidateUserCache(userId: string, patterns?: string[]): Promise<void>;
export {};
//# sourceMappingURL=cache.d.ts.map