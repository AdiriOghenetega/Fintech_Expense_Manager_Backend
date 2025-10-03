"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = __importDefault(require("../utils/logger"));
class CacheService {
    constructor() {
        this.defaultTTL = 300; // 5 minutes
        this.isConnected = false;
        this.client = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', {
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            maxMemoryPolicy: 'allkeys-lru'
        });
        this.client.on('connect', () => {
            this.isConnected = true;
            logger_1.default.info('Redis connected successfully');
        });
        this.client.on('error', (err) => {
            this.isConnected = false;
            logger_1.default.error('Redis error:', err);
        });
        this.client.on('close', () => {
            this.isConnected = false;
            logger_1.default.warn('Redis connection closed');
        });
    }
    async get(key) {
        if (!this.isConnected)
            return null;
        try {
            const data = await this.client.get(key);
            if (!data)
                return null;
            const parsed = JSON.parse(data);
            logger_1.default.debug(`Cache HIT: ${key}`);
            return parsed;
        }
        catch (error) {
            logger_1.default.error('Cache get error:', error);
            return null;
        }
    }
    async set(key, value, options = {}) {
        if (!this.isConnected)
            return;
        try {
            const ttl = options.ttl || this.defaultTTL;
            const serialized = JSON.stringify(value);
            await this.client.setex(key, ttl, serialized);
            logger_1.default.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
        }
        catch (error) {
            logger_1.default.error('Cache set error:', error);
        }
    }
    async del(pattern) {
        if (!this.isConnected)
            return 0;
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length === 0)
                return 0;
            const deleted = await this.client.del(...keys);
            logger_1.default.debug(`Cache DELETE: ${keys.length} keys matching ${pattern}`);
            return deleted;
        }
        catch (error) {
            logger_1.default.error('Cache delete error:', error);
            return 0;
        }
    }
    async invalidateUser(userId) {
        await Promise.all([
            this.del(`user:${userId}:*`),
            this.del(`overview:${userId}:*`),
            this.del(`analytics:${userId}:*`),
            this.del(`budgets:${userId}:*`),
            this.del(`expenses:${userId}:*`)
        ]);
    }
    generateKey(prefix, ...parts) {
        return `${prefix}:${parts.join(':')}`;
    }
    async mget(keys) {
        if (!this.isConnected || keys.length === 0)
            return [];
        try {
            const values = await this.client.mget(...keys);
            return values.map(value => value ? JSON.parse(value) : null);
        }
        catch (error) {
            logger_1.default.error('Cache mget error:', error);
            return keys.map(() => null);
        }
    }
    async mset(keyValuePairs, ttl = this.defaultTTL) {
        if (!this.isConnected)
            return;
        try {
            const pipeline = this.client.pipeline();
            Object.entries(keyValuePairs).forEach(([key, value]) => {
                pipeline.setex(key, ttl, JSON.stringify(value));
            });
            await pipeline.exec();
            logger_1.default.debug(`Cache MSET: ${Object.keys(keyValuePairs).length} keys`);
        }
        catch (error) {
            logger_1.default.error('Cache mset error:', error);
        }
    }
    isHealthy() {
        return this.isConnected;
    }
    async flushAll() {
        if (process.env.NODE_ENV === 'development') {
            await this.client.flushall();
            logger_1.default.info('Cache flushed (development mode)');
        }
    }
}
exports.cacheService = new CacheService();
//# sourceMappingURL=cacheService.js.map