import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import authRoutes from './routes/auth';
import expenseRoutes from './routes/expenses';
import budgetRoutes from './routes/budgets';
import analyticsRoutes from './routes/analytics';
import reportRoutes from './routes/reports';
import uploadRoutes from './routes/upload';
import { errorHandler } from './middleware/errorHandler';
import { performanceMonitor, healthMiddleware } from './middleware/performance';
import { cacheService } from './services/cacheService';
import { getQueueStats, closeQueues } from './services/jobQueue';
import logger from './utils/logger';

dotenv.config();

const app = express();

// Optimized Prisma configuration
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'], // Reduced logging
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // CONNECTION POOLING OPTIMIZATION
  transactionOptions: {
    maxWait: 2000, // 2 seconds
    timeout: 5000,  // 5 seconds
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
app.use(helmet({
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
app.use(cors({
  origin: ['http://localhost:3000','https://ai-powered-fintech-expense-manager.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24 hours preflight cache
}));

// Enhanced compression
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Body parsing with limits
app.use(express.json({ 
  limit: '10mb',
  type: ['application/json', 'text/plain']
}));
app.use(express.urlencoded({ 
  extended: true,
  limit: '10mb',
  parameterLimit: 1000
}));

// Static file serving with caching
const uploadsPath = process.env.UPLOAD_PATH || './uploads';
app.use('/uploads', express.static(path.resolve(uploadsPath), {
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
app.use(performanceMonitor.middleware());
app.use(healthMiddleware);

// Request logging with optimization
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
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
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - startTime;
    
    // Get performance stats
    const performanceStats = (req as any).performanceStats || {};
    
    // Get queue stats
    const queueStats = await getQueueStats();
    
    // Check cache health
    const cacheHealthy = cacheService.isHealthy();
    
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
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Performance stats endpoint
app.get('/stats', (req, res) => {
  const stats = performanceMonitor.getStats();
  const slowestEndpoints = performanceMonitor.getSlowestEndpoints();
  
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
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/upload', uploadRoutes);

// Cache management endpoints (development only)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/cache/flush', async (req, res) => {
    try {
      await cacheService.flushAll();
      res.json({ success: true, message: 'Cache flushed' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Cache flush failed' });
    }
  });

  app.get('/api/cache/stats', async (req, res) => {
    try {
      // This would require implementing cache stats in your Redis service
      res.json({ 
        success: true, 
        data: { 
          healthy: cacheService.isHealthy(),
          // Add more stats as needed
        }
      });
    } catch (error) {
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
app.use(errorHandler);

// Graceful shutdown handlers
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  try {
    // Close database connections
    await prisma.$disconnect();
    logger.info('Database connections closed');

    // Close job queues
    await closeQueues();
    logger.info('Job queues closed');

    // Exit process
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;