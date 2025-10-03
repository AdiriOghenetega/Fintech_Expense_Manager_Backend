"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportQueue = exports.emailQueue = exports.aiQueue = exports.jobQueue = void 0;
exports.getQueueStats = getQueueStats;
exports.closeQueues = closeQueues;
const client_1 = require("@prisma/client");
const aiService_1 = require("./aiService");
const emailService_1 = require("./emailService");
const cacheService_1 = require("./cacheService");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma = new client_1.PrismaClient();
// Mock job queue for development without Redis
exports.jobQueue = {
    add: async (jobType, data, options) => {
        logger_1.default.info(`[NO REDIS MODE] Processing ${jobType} synchronously`);
        try {
            switch (jobType) {
                case 'categorize-expense':
                    return await handleCategorizationSync(data);
                case 'learn-from-correction':
                    return await handleLearningSync(data);
                case 'send-email':
                    return await handleEmailSync(data);
                case 'bulk-recategorize':
                    logger_1.default.info(`[NO REDIS MODE] Bulk recategorization skipped - would process ${data.limit || 100} expenses`);
                    return { processed: 0, updated: 0, failed: 0, skipped: true };
                default:
                    logger_1.default.warn(`[NO REDIS MODE] Unknown job type ${jobType} - skipped`);
                    return null;
            }
        }
        catch (error) {
            logger_1.default.error(`[NO REDIS MODE] Failed to process ${jobType}:`, error);
            return null;
        }
    },
};
// Handle expense categorization synchronously
async function handleCategorizationSync(data) {
    const { expenseId, expenseData } = data;
    try {
        logger_1.default.info(`[NO REDIS MODE] Processing AI categorization for expense ${expenseId}`);
        const aiResult = await aiService_1.aiService.categorizeExpense(expenseData);
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
                await cacheService_1.cacheService.invalidateUser(expense.userId);
            }
        }
        catch (cacheError) {
            logger_1.default.warn('[NO REDIS MODE] Cache invalidation failed:', cacheError);
        }
        logger_1.default.info(`[NO REDIS MODE] AI categorization completed for expense ${expenseId}: ${aiResult.categoryId}`);
        return {
            id: `sync-${Date.now()}`,
            expenseId,
            categoryId: aiResult.categoryId,
            confidence: aiResult.confidence,
        };
    }
    catch (error) {
        logger_1.default.error(`[NO REDIS MODE] AI categorization failed for expense ${expenseId}:`, error);
        return null;
    }
}
// Handle learning synchronously
async function handleLearningSync(data) {
    const { originalCategoryId, correctedCategoryId, expenseData } = data;
    try {
        await aiService_1.aiService.learnFromCorrection(originalCategoryId, correctedCategoryId, expenseData);
        logger_1.default.info(`[NO REDIS MODE] Learning completed: ${originalCategoryId} -> ${correctedCategoryId}`);
        return { success: true };
    }
    catch (error) {
        logger_1.default.error('[NO REDIS MODE] Learning failed:', error);
        return null;
    }
}
// Handle email synchronously (optional - you might want to skip this)
async function handleEmailSync(data) {
    const { type, to, data: emailData } = data;
    try {
        let success = false;
        switch (type) {
            case 'welcome':
                success = await emailService_1.emailService.sendWelcomeEmail(to, emailData.userName);
                break;
            case 'password-reset':
                success = await emailService_1.emailService.sendPasswordResetEmail(to, emailData.resetToken);
                break;
            default:
                logger_1.default.info(`[NO REDIS MODE] Email type ${type} skipped`);
                return { skipped: true };
        }
        logger_1.default.info(`[NO REDIS MODE] Email ${type} sent to ${to}: ${success}`);
        return { success };
    }
    catch (error) {
        logger_1.default.error(`[NO REDIS MODE] Email failed:`, error);
        return null;
    }
}
// Mock functions for compatibility
exports.aiQueue = {
    on: (event, callback) => {
        logger_1.default.debug(`[NO REDIS MODE] Mock aiQueue.on(${event}) registered`);
    },
    process: (jobName, concurrency, processor) => {
        logger_1.default.debug(`[NO REDIS MODE] Mock aiQueue.process(${jobName}) registered`);
    },
    isReady: () => Promise.resolve(false),
    close: () => Promise.resolve(),
};
exports.emailQueue = {
    on: (event, callback) => {
        logger_1.default.debug(`[NO REDIS MODE] Mock emailQueue.on(${event}) registered`);
    },
    process: (jobName, concurrency, processor) => {
        logger_1.default.debug(`[NO REDIS MODE] Mock emailQueue.process(${jobName}) registered`);
    },
    close: () => Promise.resolve(),
};
exports.reportQueue = {
    on: (event, callback) => {
        logger_1.default.debug(`[NO REDIS MODE] Mock reportQueue.on(${event}) registered`);
    },
    process: (jobName, concurrency, processor) => {
        logger_1.default.debug(`[NO REDIS MODE] Mock reportQueue.process(${jobName}) registered`);
    },
    close: () => Promise.resolve(),
};
// Mock queue monitoring
function getQueueStats() {
    return Promise.resolve({
        ai: { waiting: 0, active: 0, completed: 0, failed: 0 },
        email: { waiting: 0, active: 0, completed: 0, failed: 0 },
        report: { waiting: 0, active: 0, completed: 0, failed: 0 },
        redisConnected: false,
        mode: 'NO_REDIS_SYNC_MODE'
    });
}
// Mock graceful shutdown
async function closeQueues() {
    logger_1.default.info('[NO REDIS MODE] Mock queues closed');
}
logger_1.default.warn('='.repeat(60));
logger_1.default.warn('RUNNING IN NO-REDIS MODE FOR DEVELOPMENT');
logger_1.default.warn('Background jobs will run synchronously');
logger_1.default.warn('Install Redis for production use');
logger_1.default.warn('='.repeat(60));
//# sourceMappingURL=jobQueue.js.map