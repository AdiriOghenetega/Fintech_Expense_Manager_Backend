interface CacheOptions {
    ttl?: number;
    prefix?: string;
}
declare class CacheService {
    private client;
    private defaultTTL;
    private isConnected;
    constructor();
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, options?: CacheOptions): Promise<void>;
    del(pattern: string): Promise<number>;
    invalidateUser(userId: string): Promise<void>;
    generateKey(prefix: string, ...parts: (string | number)[]): string;
    mget<T>(keys: string[]): Promise<(T | null)[]>;
    mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void>;
    isHealthy(): boolean;
    flushAll(): Promise<void>;
}
export declare const cacheService: CacheService;
export {};
//# sourceMappingURL=cacheService.d.ts.map