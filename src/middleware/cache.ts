import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/auth';
import { cacheService } from '../services/cacheService';
import crypto from 'crypto';

interface CacheMiddlewareOptions {
  ttl?: number;
  keyGenerator?: (req: AuthRequest) => string;
  skipCache?: (req: AuthRequest) => boolean;
  varyBy?: string[]; // Request properties to include in cache key
}

export function cacheMiddleware(prefix: string, options: CacheMiddlewareOptions = {}) {
  const {
    ttl = 300,
    keyGenerator,
    skipCache,
    varyBy = ['query']
  } = options;

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) return next();

    // Check if we should skip cache
    if (skipCache && skipCache(req)) {
      return next();
    }

    // Generate cache key
    let cacheKey: string;
    if (keyGenerator) {
      cacheKey = keyGenerator(req);
    } else {
      const keyParts = [prefix, userId];
      
      // Add varying parameters
      varyBy.forEach(prop => {
        if (prop === 'query') {
          const queryString = JSON.stringify(req.query);
          const queryHash = crypto.createHash('md5').update(queryString).digest('hex');
          keyParts.push(queryHash);
        } else if (prop === 'params') {
          keyParts.push(JSON.stringify(req.params));
        } else if (prop === 'body') {
          const bodyHash = crypto.createHash('md5').update(JSON.stringify(req.body)).digest('hex');
          keyParts.push(bodyHash);
        }
      });
      
      cacheKey = keyParts.join(':');
    }

    // Try to get from cache
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Cache miss - set up response interception
    res.setHeader('X-Cache', 'MISS');
    
    const originalJson = res.json;
    res.json = function(data: any) {
      // Only cache successful responses
      if (data.success !== false && res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.set(cacheKey, data, { ttl });
      }
      return originalJson.call(this, data);
    };

    next();
  };
}

// Specialized cache middleware for different endpoints
export const overviewCache = cacheMiddleware('overview', { 
  ttl: 300, // 5 minutes
  varyBy: ['query']
});

export const analyticsCache = cacheMiddleware('analytics', { 
  ttl: 600, // 10 minutes
  varyBy: ['query']
});

export const expensesCache = cacheMiddleware('expenses', { 
  ttl: 180, // 3 minutes
  varyBy: ['query'],
  skipCache: (req) => {
    // Skip cache for real-time operations
    return req.method !== 'GET' || req.query.realtime === 'true';
  }
});

export const budgetsCache = cacheMiddleware('budgets', { 
  ttl: 300,
  varyBy: ['query']
});

// Cache invalidation helper
export async function invalidateUserCache(userId: string, patterns: string[] = []) {
  await cacheService.invalidateUser(userId);
  
  // Invalidate specific patterns if provided
  for (const pattern of patterns) {
    await cacheService.del(pattern);
  }
}