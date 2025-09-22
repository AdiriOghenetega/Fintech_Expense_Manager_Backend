import Redis from 'ioredis';
import logger from '../utils/logger';

interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

class CacheService {
  private client: Redis;
  private defaultTTL = 300; // 5 minutes
  private isConnected = false;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      maxMemoryPolicy: 'allkeys-lru'
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Redis connected successfully');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      logger.error('Redis error:', err);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('Redis connection closed');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      
      const parsed = JSON.parse(data);
      logger.debug(`Cache HIT: ${key}`);
      return parsed;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const ttl = options.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
      logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      logger.error('Cache set error:', error);
    }
  }

  async del(pattern: string): Promise<number> {
    if (!this.isConnected) return 0;
    
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      
      const deleted = await this.client.del(...keys);
      logger.debug(`Cache DELETE: ${keys.length} keys matching ${pattern}`);
      return deleted;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return 0;
    }
  }

  async invalidateUser(userId: string): Promise<void> {
    await Promise.all([
      this.del(`user:${userId}:*`),
      this.del(`overview:${userId}:*`),
      this.del(`analytics:${userId}:*`),
      this.del(`budgets:${userId}:*`),
      this.del(`expenses:${userId}:*`)
    ]);
  }

  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (!this.isConnected || keys.length === 0) return [];
    
    try {
      const values = await this.client.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Record<string, any>, ttl = this.defaultTTL): Promise<void> {
    if (!this.isConnected) return;
    
    try {
      const pipeline = this.client.pipeline();
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        pipeline.setex(key, ttl, JSON.stringify(value));
      });
      
      await pipeline.exec();
      logger.debug(`Cache MSET: ${Object.keys(keyValuePairs).length} keys`);
    } catch (error) {
      logger.error('Cache mset error:', error);
    }
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async flushAll(): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      await this.client.flushall();
      logger.info('Cache flushed (development mode)');
    }
  }
}

export const cacheService = new CacheService();