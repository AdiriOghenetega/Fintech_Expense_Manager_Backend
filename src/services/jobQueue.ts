import { PrismaClient } from '@prisma/client';
import { aiService } from './aiService';
import { emailService } from './emailService';
import { cacheService } from './cacheService';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// Mock job queue for development without Redis
export const jobQueue = {
  add: async (jobType: string, data: any, options?: any) => {
    logger.info(`[NO REDIS MODE] Processing ${jobType} synchronously`);
    
    try {
      switch (jobType) {
        case 'categorize-expense':
          return await handleCategorizationSync(data);
        
        case 'learn-from-correction':
          return await handleLearningSync(data);
        
        case 'send-email':
          return await handleEmailSync(data);
        
        case 'bulk-recategorize':
          logger.info(`[NO REDIS MODE] Bulk recategorization skipped - would process ${data.limit || 100} expenses`);
          return { processed: 0, updated: 0, failed: 0, skipped: true };
        
        default:
          logger.warn(`[NO REDIS MODE] Unknown job type ${jobType} - skipped`);
          return null;
      }
    } catch (error) {
      logger.error(`[NO REDIS MODE] Failed to process ${jobType}:`, error);
      return null;
    }
  },
};

// Handle expense categorization synchronously
async function handleCategorizationSync(data: any) {
  const { expenseId, expenseData } = data;
  
  try {
    logger.info(`[NO REDIS MODE] Processing AI categorization for expense ${expenseId}`);
    
    const aiResult = await aiService.categorizeExpense(expenseData);
    
    await prisma.expense.update({
      where: { id: expenseId },
      data: {
        categoryId: aiResult.categoryId,
        aiConfidence: aiResult.confidence,
      },
    });

    // Try to invalidate cache
    try {
      const expense = await prisma.expense.findUnique({
        where: { id: expenseId },
        select: { userId: true }
      });
      if (expense) {
        await cacheService.invalidateUser(expense.userId);
      }
    } catch (cacheError) {
      logger.warn('[NO REDIS MODE] Cache invalidation failed:', cacheError);
    }

    logger.info(`[NO REDIS MODE] AI categorization completed for expense ${expenseId}: ${aiResult.categoryId}`);
    
    return {
      id: `sync-${Date.now()}`,
      expenseId,
      categoryId: aiResult.categoryId,
      confidence: aiResult.confidence,
    };
    
  } catch (error) {
    logger.error(`[NO REDIS MODE] AI categorization failed for expense ${expenseId}:`, error);
    return null;
  }
}

// Handle learning synchronously
async function handleLearningSync(data: any) {
  const { originalCategoryId, correctedCategoryId, expenseData } = data;
  
  try {
    await aiService.learnFromCorrection(originalCategoryId, correctedCategoryId, expenseData);
    logger.info(`[NO REDIS MODE] Learning completed: ${originalCategoryId} -> ${correctedCategoryId}`);
    return { success: true };
  } catch (error) {
    logger.error('[NO REDIS MODE] Learning failed:', error);
    return null;
  }
}

// Handle email synchronously (optional - you might want to skip this)
async function handleEmailSync(data: any) {
  const { type, to, data: emailData } = data;
  
  try {
    let success = false;
    
    switch (type) {
      case 'welcome':
        success = await emailService.sendWelcomeEmail(to, emailData.userName);
        break;
      case 'password-reset':
        success = await emailService.sendPasswordResetEmail(to, emailData.resetToken);
        break;
      default:
        logger.info(`[NO REDIS MODE] Email type ${type} skipped`);
        return { skipped: true };
    }
    
    logger.info(`[NO REDIS MODE] Email ${type} sent to ${to}: ${success}`);
    return { success };
    
  } catch (error) {
    logger.error(`[NO REDIS MODE] Email failed:`, error);
    return null;
  }
}

// Mock functions for compatibility
export const aiQueue = {
  on: (event: string, callback: Function) => {
    logger.debug(`[NO REDIS MODE] Mock aiQueue.on(${event}) registered`);
  },
  process: (jobName: string, concurrency: number, processor: Function) => {
    logger.debug(`[NO REDIS MODE] Mock aiQueue.process(${jobName}) registered`);
  },
  isReady: () => Promise.resolve(false),
  close: () => Promise.resolve(),
};

export const emailQueue = {
  on: (event: string, callback: Function) => {
    logger.debug(`[NO REDIS MODE] Mock emailQueue.on(${event}) registered`);
  },
  process: (jobName: string, concurrency: number, processor: Function) => {
    logger.debug(`[NO REDIS MODE] Mock emailQueue.process(${jobName}) registered`);
  },
  close: () => Promise.resolve(),
};

export const reportQueue = {
  on: (event: string, callback: Function) => {
    logger.debug(`[NO REDIS MODE] Mock reportQueue.on(${event}) registered`);
  },
  process: (jobName: string, concurrency: number, processor: Function) => {
    logger.debug(`[NO REDIS MODE] Mock reportQueue.process(${jobName}) registered`);
  },
  close: () => Promise.resolve(),
};

// Mock queue monitoring
export function getQueueStats() {
  return Promise.resolve({
    ai: { waiting: 0, active: 0, completed: 0, failed: 0 },
    email: { waiting: 0, active: 0, completed: 0, failed: 0 },
    report: { waiting: 0, active: 0, completed: 0, failed: 0 },
    redisConnected: false,
    mode: 'NO_REDIS_SYNC_MODE'
  });
}

// Mock graceful shutdown
export async function closeQueues() {
  logger.info('[NO REDIS MODE] Mock queues closed');
}

logger.warn('='.repeat(60));
logger.warn('RUNNING IN NO-REDIS MODE FOR DEVELOPMENT');
logger.warn('Background jobs will run synchronously');
logger.warn('Install Redis for production use');
logger.warn('='.repeat(60));