"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthMiddleware = exports.performanceMonitor = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class PerformanceMonitor {
    constructor() {
        this.slowThreshold = 1000; // 1 second
        this.verySlowThreshold = 3000; // 3 seconds
        this.metrics = [];
        this.maxMetrics = 1000;
    }
    middleware() {
        return (req, res, next) => {
            const start = process.hrtime.bigint();
            const startMemory = process.memoryUsage();
            // Store original methods
            const originalSend = res.send.bind(res);
            const originalJson = res.json.bind(res);
            let headerSet = false;
            const setPerformanceHeader = () => {
                if (!headerSet && !res.headersSent) {
                    try {
                        const end = process.hrtime.bigint();
                        const duration = Number(end - start) / 1000000; // Convert to milliseconds
                        res.setHeader('X-Response-Time', `${Math.round(duration * 100) / 100}ms`);
                        headerSet = true;
                    }
                    catch (error) {
                        logger_1.default.warn('Failed to set performance header:', error);
                    }
                }
            };
            // Override res.send
            res.send = function (body) {
                setPerformanceHeader();
                return originalSend(body);
            };
            // Override res.json
            res.json = function (body) {
                setPerformanceHeader();
                return originalJson(body);
            };
            // Listen for response finish
            res.on('finish', () => {
                try {
                    const end = process.hrtime.bigint();
                    const duration = Number(end - start) / 1000000; // Convert to milliseconds
                    const endMemory = process.memoryUsage();
                    const metric = {
                        method: req.method,
                        url: req.url,
                        duration: Math.round(duration * 100) / 100,
                        statusCode: res.statusCode,
                        userAgent: req.get('User-Agent'),
                        userId: req.user?.id,
                        memory: {
                            rss: endMemory.rss - startMemory.rss,
                            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
                            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
                            external: endMemory.external - startMemory.external,
                            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
                        }
                    };
                    // Store metric
                    this.addMetric(metric);
                    // Log slow requests
                    if (duration > this.verySlowThreshold) {
                        logger_1.default.error('Very slow request detected', {
                            ...metric,
                            severity: 'critical'
                        });
                    }
                    else if (duration > this.slowThreshold) {
                        logger_1.default.warn('Slow request detected', {
                            ...metric,
                            severity: 'warning'
                        });
                    }
                    // Log memory spikes
                    if (metric.memory.heapUsed > 50 * 1024 * 1024) { // 50MB
                        logger_1.default.warn('High memory usage detected', {
                            method: req.method,
                            url: req.url,
                            memoryIncrease: `${Math.round(metric.memory.heapUsed / 1024 / 1024)}MB`
                        });
                    }
                }
                catch (error) {
                    logger_1.default.error('Error in performance monitoring:', error);
                }
            });
            next();
        };
    }
    addMetric(metric) {
        this.metrics.push(metric);
        if (this.metrics.length > this.maxMetrics) {
            this.metrics.shift();
        }
    }
    getStats() {
        if (this.metrics.length === 0) {
            return {
                totalRequests: 0,
                averageResponseTime: 0,
                slowRequests: 0,
                errorRate: 0
            };
        }
        const slowRequests = this.metrics.filter(m => m.duration > this.slowThreshold).length;
        const errorRequests = this.metrics.filter(m => m.statusCode >= 400).length;
        const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
        return {
            totalRequests: this.metrics.length,
            averageResponseTime: Math.round((totalDuration / this.metrics.length) * 100) / 100,
            slowRequests,
            slowRequestsPercentage: Math.round((slowRequests / this.metrics.length) * 100),
            errorRate: Math.round((errorRequests / this.metrics.length) * 100),
            memoryUsage: process.memoryUsage()
        };
    }
    getSlowestEndpoints(limit = 10) {
        return this.metrics
            .sort((a, b) => b.duration - a.duration)
            .slice(0, limit)
            .map(m => ({
            endpoint: `${m.method} ${m.url}`,
            duration: m.duration,
            statusCode: m.statusCode
        }));
    }
    reset() {
        this.metrics = [];
    }
}
exports.performanceMonitor = new PerformanceMonitor();
// Health check endpoint data
const healthMiddleware = (req, res, next) => {
    if (req.path === '/health') {
        const stats = exports.performanceMonitor.getStats();
        req.performanceStats = stats;
    }
    next();
};
exports.healthMiddleware = healthMiddleware;
//# sourceMappingURL=performance.js.map