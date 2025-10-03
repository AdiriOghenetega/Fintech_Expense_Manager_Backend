"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetsCache = exports.expensesCache = exports.analyticsCache = exports.overviewCache = void 0;
exports.cacheMiddleware = cacheMiddleware;
exports.invalidateUserCache = invalidateUserCache;
const cacheService_1 = require("../services/cacheService");
const crypto_1 = __importDefault(require("crypto"));
function cacheMiddleware(prefix, options = {}) {
    const { ttl = 300, keyGenerator, skipCache, varyBy = ['query'] } = options;
    return async (req, res, next) => {
        const userId = req.user?.id;
        if (!userId)
            return next();
        // Check if we should skip cache
        if (skipCache && skipCache(req)) {
            return next();
        }
        // Generate cache key
        let cacheKey;
        if (keyGenerator) {
            cacheKey = keyGenerator(req);
        }
        else {
            const keyParts = [prefix, userId];
            // Add varying parameters
            varyBy.forEach(prop => {
                if (prop === 'query') {
                    const queryString = JSON.stringify(req.query);
                    const queryHash = crypto_1.default.createHash('md5').update(queryString).digest('hex');
                    keyParts.push(queryHash);
                }
                else if (prop === 'params') {
                    keyParts.push(JSON.stringify(req.params));
                }
                else if (prop === 'body') {
                    const bodyHash = crypto_1.default.createHash('md5').update(JSON.stringify(req.body)).digest('hex');
                    keyParts.push(bodyHash);
                }
            });
            cacheKey = keyParts.join(':');
        }
        // Try to get from cache
        const cached = await cacheService_1.cacheService.get(cacheKey);
        if (cached) {
            res.setHeader('X-Cache', 'HIT');
            return res.json(cached);
        }
        // Cache miss - set up response interception
        res.setHeader('X-Cache', 'MISS');
        const originalJson = res.json;
        res.json = function (data) {
            // Only cache successful responses
            if (data.success !== false && res.statusCode >= 200 && res.statusCode < 300) {
                cacheService_1.cacheService.set(cacheKey, data, { ttl });
            }
            return originalJson.call(this, data);
        };
        next();
    };
}
// Specialized cache middleware for different endpoints
exports.overviewCache = cacheMiddleware('overview', {
    ttl: 300, // 5 minutes
    varyBy: ['query']
});
exports.analyticsCache = cacheMiddleware('analytics', {
    ttl: 600, // 10 minutes
    varyBy: ['query']
});
exports.expensesCache = cacheMiddleware('expenses', {
    ttl: 180, // 3 minutes
    varyBy: ['query'],
    skipCache: (req) => {
        // Skip cache for real-time operations
        return req.method !== 'GET' || req.query.realtime === 'true';
    }
});
exports.budgetsCache = cacheMiddleware('budgets', {
    ttl: 300,
    varyBy: ['query']
});
// Cache invalidation helper
async function invalidateUserCache(userId, patterns = []) {
    await cacheService_1.cacheService.invalidateUser(userId);
    // Invalidate specific patterns if provided
    for (const pattern of patterns) {
        await cacheService_1.cacheService.del(pattern);
    }
}
//# sourceMappingURL=cache.js.map