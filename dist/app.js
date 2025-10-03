"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const expenses_1 = __importDefault(require("./routes/expenses"));
const budgets_1 = __importDefault(require("./routes/budgets"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const reports_1 = __importDefault(require("./routes/reports"));
const upload_1 = __importDefault(require("./routes/upload"));
const errorHandler_1 = require("./middleware/errorHandler");
const performance_1 = require("./middleware/performance");
const cacheService_1 = require("./services/cacheService");
const jobQueue_1 = require("./services/jobQueue");
const logger_1 = __importDefault(require("./utils/logger"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// Optimized Prisma configuration
const prisma = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'], // Reduced logging
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    },
    // CONNECTION POOLING OPTIMIZATION
    transactionOptions: {
        maxWait: 2000, // 2 seconds
        timeout: 5000, // 5 seconds
    },
});
// Enable connection pooling
prisma.$connect();
// Add query optimization middleware
prisma.$use(async (params, next) => {
    const before = Date.now();
    const result = await next(params);
    const after = Date.now();
    // Log slow queries in development
    if (process.env.NODE_ENV === 'development' && (after - before) > 1000) {
        console.log(`Slow Query: ${params.model}.${params.action} took ${after - before}ms`);
    }
    return result;
});
// Enhanced security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
// CORS configuration with optimization
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000', 'https://ai-powered-fintech-expense-manager.vercel.app'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // 24 hours preflight cache
}));
// Enhanced compression
app.use((0, compression_1.default)({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression'])
            return false;
        return compression_1.default.filter(req, res);
    }
}));
// Body parsing with limits
app.use(express_1.default.json({
    limit: '10mb',
    type: ['application/json', 'text/plain']
}));
app.use(express_1.default.urlencoded({
    extended: true,
    limit: '10mb',
    parameterLimit: 1000
}));
// Static file serving with caching
const uploadsPath = process.env.UPLOAD_PATH || './uploads';
app.use('/uploads', express_1.default.static(path_1.default.resolve(uploadsPath), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.pdf') || path.endsWith('.jpg') || path.endsWith('.png')) {
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
        }
    }
}));
// Performance monitoring
app.use(performance_1.performanceMonitor.middleware());
app.use(performance_1.healthMiddleware);
// Request logging with optimization
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('combined', {
        stream: { write: (message) => logger_1.default.info(message.trim()) },
        skip: (req) => {
            // Skip logging for health checks and static assets
            return req.path === '/health' || req.path.startsWith('/uploads/');
        }
    }));
}
// Add request ID for tracing
app.use((req, res, next) => {
    req.id = Math.random().toString(36).substring(2, 15);
    res.setHeader('X-Request-ID', req.id);
    next();
});
// Enhanced health check endpoint
app.get('/health', async (req, res) => {
    try {
        const startTime = Date.now();
        // Test database connection
        await prisma.$queryRaw `SELECT 1`;
        const dbResponseTime = Date.now() - startTime;
        // Get performance stats
        const performanceStats = req.performanceStats || {};
        // Get queue stats
        const queueStats = await (0, jobQueue_1.getQueueStats)();
        // Check cache health
        const cacheHealthy = cacheService_1.cacheService.isHealthy();
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: {
                status: 'connected',
                responseTime: `${dbResponseTime}ms`
            },
            cache: {
                status: cacheHealthy ? 'connected' : 'disconnected',
                healthy: cacheHealthy
            },
            queues: queueStats,
            performance: performanceStats,
            features: {
                fileUploads: process.env.ENABLE_FILE_UPLOADS === 'true',
                aiCategorization: process.env.ENABLE_AI_CATEGORIZATION === 'true',
                emailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
                backgroundJobs: true,
                caching: cacheHealthy,
            },
        };
        res.json(healthData);
    }
    catch (error) {
        logger_1.default.error('Health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: 'Database connection failed',
            timestamp: new Date().toISOString(),
        });
    }
});
// Performance stats endpoint
app.get('/stats', (req, res) => {
    const stats = performance_1.performanceMonitor.getStats();
    const slowestEndpoints = performance_1.performanceMonitor.getSlowestEndpoints();
    res.json({
        success: true,
        data: {
            performance: stats,
            slowestEndpoints,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
        }
    });
});
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/expenses', expenses_1.default);
app.use('/api/budgets', budgets_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/upload', upload_1.default);
// Cache management endpoints (development only)
if (process.env.NODE_ENV === 'development') {
    app.post('/api/cache/flush', async (req, res) => {
        try {
            await cacheService_1.cacheService.flushAll();
            res.json({ success: true, message: 'Cache flushed' });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Cache flush failed' });
        }
    });
    app.get('/api/cache/stats', async (req, res) => {
        try {
            // This would require implementing cache stats in your Redis service
            res.json({
                success: true,
                data: {
                    healthy: cacheService_1.cacheService.isHealthy(),
                    // Add more stats as needed
                }
            });
        }
        catch (error) {
            res.status(500).json({ success: false, message: 'Cache stats failed' });
        }
    });
}
// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.path,
        method: req.method,
        requestId: req.id,
    });
});
// Global error handler
app.use(errorHandler_1.errorHandler);
// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
    logger_1.default.info(`${signal} received, starting graceful shutdown`);
    try {
        // Close database connections
        await prisma.$disconnect();
        logger_1.default.info('Database connections closed');
        // Close job queues
        await (0, jobQueue_1.closeQueues)();
        logger_1.default.info('Job queues closed');
        // Exit process
        process.exit(0);
    }
    catch (error) {
        logger_1.default.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=app.js.map