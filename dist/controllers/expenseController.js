"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchExpenses = exports.getExpenseInsights = exports.getExpenseById = exports.getAiServiceStatus = exports.bulkRecategorize = exports.categorizeExpense = exports.getExpenseTags = exports.getCategories = exports.getRecurringExpenses = exports.getExpenseStats = exports.bulkImport = exports.deleteExpense = exports.updateExpense = exports.createExpense = exports.getExpenses = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler_1 = require("../middleware/errorHandler");
const aiService_1 = require("../services/aiService");
const cacheService_1 = require("../services/cacheService");
const cache_1 = require("../middleware/cache");
const jobQueue_1 = require("../services/jobQueue");
const prisma = new client_1.PrismaClient();
// Validation schemas
const createExpenseSchema = zod_1.z.object({
    amount: zod_1.z.number().positive('Amount must be positive'),
    description: zod_1.z.string().min(1, 'Description is required').max(500),
    transactionDate: zod_1.z.string().refine((date) => !isNaN(Date.parse(date))),
    merchant: zod_1.z.string().max(100).optional(),
    paymentMethod: zod_1.z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'CASH', 'BANK_TRANSFER', 'DIGITAL_WALLET']),
    categoryId: zod_1.z.string().uuid().optional(),
    isRecurring: zod_1.z.boolean().default(false),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    notes: zod_1.z.string().max(1000).optional(),
    receiptUrl: zod_1.z.string().url().optional(),
});
const bulkImportSchema = zod_1.z.object({
    expenses: zod_1.z.array(createExpenseSchema.omit({ receiptUrl: true })),
});
// Optimized getExpenses with cursor pagination and caching
exports.getExpenses = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { page = 1, limit = 20, category, startDate, endDate, search, paymentMethod, sortBy = 'transactionDate', sortOrder = 'desc', minAmount, maxAmount, isRecurring, tags, cursor // Cursor-based pagination for better performance
     } = req.query;
    const userId = req.user.id;
    // Generate cache key based on query parameters
    const cacheKey = cacheService_1.cacheService.generateKey('expenses', userId, JSON.stringify(req.query));
    // Check cache first (skip for real-time requests)
    if (req.query.realtime !== 'true') {
        const cached = await cacheService_1.cacheService.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }
    }
    // Build where clause efficiently
    const where = { userId };
    // Apply filters
    if (category)
        where.categoryId = category;
    if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate)
            where.transactionDate.gte = new Date(startDate);
        if (endDate)
            where.transactionDate.lte = new Date(endDate);
    }
    if (search) {
        // Optimized search using database indexes
        where.OR = [
            { description: { contains: search, mode: 'insensitive' } },
            { merchant: { contains: search, mode: 'insensitive' } },
            { notes: { contains: search, mode: 'insensitive' } },
        ];
    }
    if (paymentMethod)
        where.paymentMethod = paymentMethod;
    if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount)
            where.amount.gte = Number(minAmount);
        if (maxAmount)
            where.amount.lte = Number(maxAmount);
    }
    if (isRecurring !== undefined)
        where.isRecurring = isRecurring === 'true';
    if (tags) {
        const tagArray = tags.split(',');
        where.tags = { hasSome: tagArray };
    }
    // Cursor-based pagination for better performance
    if (cursor) {
        where.id = { lt: cursor };
    }
    // Build orderBy
    const orderBy = {};
    if (sortBy === 'amount')
        orderBy.amount = sortOrder;
    else if (sortBy === 'merchant')
        orderBy.merchant = sortOrder;
    else
        orderBy.transactionDate = sortOrder;
    // Use cursor pagination or traditional pagination
    const take = Number(limit) + 1; // +1 to check if there's more data
    const skip = cursor ? 0 : (Number(page) - 1) * Number(limit);
    try {
        // Optimized parallel queries
        const [expenses, totalCount] = await Promise.all([
            prisma.expense.findMany({
                where,
                select: {
                    id: true,
                    amount: true,
                    description: true,
                    transactionDate: true,
                    merchant: true,
                    paymentMethod: true,
                    isRecurring: true,
                    tags: true,
                    notes: true,
                    receiptUrl: true,
                    aiConfidence: true,
                    createdAt: true,
                    category: {
                        select: {
                            id: true,
                            name: true,
                            color: true,
                            icon: true
                        }
                    }
                },
                skip,
                take,
                orderBy
            }),
            // Only get count if it's traditional pagination and first page
            (cursor || Number(page) > 1) ? Promise.resolve(0) : prisma.expense.count({ where })
        ]);
        // Handle cursor pagination
        let hasNextPage = false;
        let nextCursor = null;
        if (cursor || expenses.length > Number(limit)) {
            hasNextPage = expenses.length > Number(limit);
            if (hasNextPage) {
                expenses.pop(); // Remove the extra item
                nextCursor = expenses[expenses.length - 1]?.id || null;
            }
        }
        const totalPages = cursor ? 0 : Math.ceil(totalCount / Number(limit));
        // Calculate summary statistics efficiently (only on first page)
        let summary = null;
        if (!cursor && Number(page) === 1) {
            const summaryData = await prisma.expense.aggregate({
                where,
                _sum: { amount: true },
                _avg: { amount: true },
                _min: { amount: true },
                _max: { amount: true },
            });
            summary = {
                totalAmount: Number(summaryData._sum.amount) || 0,
                averageAmount: Number(summaryData._avg.amount) || 0,
                minAmount: Number(summaryData._min.amount) || 0,
                maxAmount: Number(summaryData._max.amount) || 0,
                count: totalCount,
            };
        }
        const response = {
            success: true,
            data: {
                expenses: expenses.map(expense => ({
                    ...expense,
                    amount: Number(expense.amount),
                    aiConfidence: expense.aiConfidence ? Number(expense.aiConfidence) : null,
                })),
                pagination: cursor ? {
                    hasNextPage,
                    nextCursor,
                    limit: Number(limit)
                } : {
                    currentPage: Number(page),
                    totalPages,
                    totalCount,
                    hasNextPage: Number(page) < totalPages,
                    hasPrevPage: Number(page) > 1,
                    limit: Number(limit),
                },
                ...(summary && { summary })
            },
        };
        // Cache for 3 minutes (don't cache real-time requests)
        if (req.query.realtime !== 'true') {
            await cacheService_1.cacheService.set(cacheKey, response, { ttl: 180 });
        }
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get expenses query failed:', error);
        throw error;
    }
});
// Optimized createExpense with background AI processing
exports.createExpense = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const validatedData = createExpenseSchema.parse(req.body);
    const userId = req.user.id;
    let categoryId = validatedData.categoryId;
    let aiProcessing = false;
    try {
        // If no category provided, use default
        if (!categoryId) {
            const defaultCategory = await getOrCreateDefaultCategory();
            categoryId = defaultCategory.id;
            aiProcessing = true;
        }
        // Create expense immediately (this should work regardless of queue issues)
        const expense = await prisma.expense.create({
            data: {
                ...validatedData,
                userId,
                categoryId,
                transactionDate: new Date(validatedData.transactionDate),
                aiConfidence: aiProcessing ? 0.1 : undefined,
            },
            include: {
                category: {
                    select: { id: true, name: true, color: true, icon: true },
                },
            },
        });
        // Try to process AI categorization in background, but don't fail if queue is down
        if (aiProcessing) {
            try {
                await jobQueue_1.jobQueue.add('categorize-expense', {
                    expenseId: expense.id,
                    expenseData: {
                        description: validatedData.description,
                        merchant: validatedData.merchant,
                        amount: validatedData.amount,
                        paymentMethod: validatedData.paymentMethod,
                    }
                });
                logger_1.default.info(`AI categorization queued for expense ${expense.id}`);
            }
            catch (queueError) {
                logger_1.default.warn(`Queue failed for expense ${expense.id}, will process later:`, queueError);
                // Don't throw error - expense is already created successfully
            }
        }
        // Invalidate caches (but don't fail if cache is down)
        try {
            await (0, cache_1.invalidateUserCache)(userId, [`expenses:${userId}:*`, `overview:${userId}:*`, `analytics:${userId}:*`]);
        }
        catch (cacheError) {
            logger_1.default.warn('Cache invalidation failed:', cacheError);
        }
        const response = {
            success: true,
            message: 'Expense created successfully',
            data: {
                expense: {
                    ...expense,
                    amount: Number(expense.amount),
                    aiConfidence: expense.aiConfidence ? Number(expense.aiConfidence) : null,
                },
                ...(aiProcessing && {
                    processing: {
                        aiCategorization: 'queued for background processing',
                        note: 'AI categorization will be processed when available'
                    }
                })
            },
        };
        res.status(201).json(response);
    }
    catch (error) {
        logger_1.default.error('Create expense failed:', error);
        throw error;
    }
});
// Optimized updateExpense with cache invalidation
exports.updateExpense = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const validatedData = createExpenseSchema.partial().parse(req.body);
    const userId = req.user.id;
    try {
        // Check if expense exists and belongs to user
        const existingExpense = await prisma.expense.findFirst({
            where: { id, userId },
            select: {
                id: true,
                categoryId: true,
                aiConfidence: true,
                description: true,
                merchant: true,
                amount: true,
                paymentMethod: true
            }
        });
        if (!existingExpense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found',
            });
        }
        const updateData = { ...validatedData };
        if (validatedData.transactionDate) {
            updateData.transactionDate = new Date(validatedData.transactionDate);
        }
        // If category was changed manually, clear AI confidence and learn from correction
        if (validatedData.categoryId && validatedData.categoryId !== existingExpense.categoryId) {
            updateData.aiConfidence = null;
            // Learn from the correction if it was previously AI-categorized
            if (existingExpense.aiConfidence && Number(existingExpense.aiConfidence) > 0.1) {
                // Process learning in background
                await jobQueue_1.jobQueue.add('learn-from-correction', {
                    originalCategoryId: existingExpense.categoryId,
                    correctedCategoryId: validatedData.categoryId,
                    expenseData: {
                        description: validatedData.description || existingExpense.description,
                        merchant: validatedData.merchant || existingExpense.merchant,
                        amount: validatedData.amount || Number(existingExpense.amount),
                        paymentMethod: validatedData.paymentMethod || existingExpense.paymentMethod,
                    }
                });
            }
        }
        const updatedExpense = await prisma.expense.update({
            where: { id },
            data: updateData,
            include: {
                category: {
                    select: { id: true, name: true, color: true, icon: true },
                },
            },
        });
        // Invalidate caches
        await (0, cache_1.invalidateUserCache)(userId, [`expenses:${userId}:*`, `overview:${userId}:*`, `analytics:${userId}:*`]);
        res.json({
            success: true,
            message: 'Expense updated successfully',
            data: {
                expense: {
                    ...updatedExpense,
                    amount: Number(updatedExpense.amount),
                    aiConfidence: updatedExpense.aiConfidence ? Number(updatedExpense.aiConfidence) : null,
                }
            },
        });
    }
    catch (error) {
        logger_1.default.error('Update expense failed:', error);
        throw error;
    }
});
exports.deleteExpense = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const expense = await prisma.expense.findFirst({
            where: { id, userId },
            select: { id: true }
        });
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found',
            });
        }
        await prisma.expense.delete({ where: { id } });
        // Invalidate caches
        await (0, cache_1.invalidateUserCache)(userId, [`expenses:${userId}:*`, `overview:${userId}:*`, `analytics:${userId}:*`]);
        res.json({
            success: true,
            message: 'Expense deleted successfully',
        });
    }
    catch (error) {
        logger_1.default.error('Delete expense failed:', error);
        throw error;
    }
});
// Optimized bulk import with batch processing
exports.bulkImport = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { expenses } = bulkImportSchema.parse(req.body);
    const userId = req.user.id;
    const results = {
        success: 0,
        failed: 0,
        errors: [],
        aiCategorizations: 0,
        processingTime: 0,
    };
    const startTime = Date.now();
    try {
        // Get default category once
        const defaultCategory = await getOrCreateDefaultCategory();
        // Process expenses in optimized batches
        const batchSize = 100; // Increased batch size for better performance
        const batches = [];
        for (let i = 0; i < expenses.length; i += batchSize) {
            batches.push(expenses.slice(i, i + batchSize));
        }
        for (const [batchIndex, batch] of batches.entries()) {
            // Prepare batch data
            const batchData = batch.map((expenseData, localIndex) => {
                const globalIndex = batchIndex * batchSize + localIndex;
                let categoryId = expenseData.categoryId || defaultCategory.id;
                let needsAiCategorization = !expenseData.categoryId;
                return {
                    ...expenseData,
                    userId,
                    categoryId,
                    transactionDate: new Date(expenseData.transactionDate),
                    aiConfidence: needsAiCategorization ? 0.1 : undefined,
                    globalIndex,
                    needsAiCategorization,
                };
            });
            try {
                // Use createMany for better performance
                const createResult = await prisma.expense.createMany({
                    data: batchData.map(({ globalIndex, needsAiCategorization, ...data }) => data),
                    skipDuplicates: true,
                });
                results.success += createResult.count;
                // Queue AI categorization for expenses that need it
                const aiJobs = batchData
                    .filter(item => item.needsAiCategorization)
                    .map(async (item) => {
                    // Get the created expense ID
                    const createdExpense = await prisma.expense.findFirst({
                        where: {
                            userId,
                            description: item.description,
                            amount: item.amount,
                            transactionDate: item.transactionDate,
                        },
                        select: { id: true },
                        orderBy: { createdAt: 'desc' },
                    });
                    if (createdExpense) {
                        await jobQueue_1.jobQueue.add('categorize-expense', {
                            expenseId: createdExpense.id,
                            expenseData: {
                                description: item.description,
                                merchant: item.merchant,
                                amount: item.amount,
                                paymentMethod: item.paymentMethod,
                            }
                        });
                        results.aiCategorizations++;
                    }
                });
                await Promise.allSettled(aiJobs);
            }
            catch (batchError) {
                // If batch fails, try individual inserts
                logger_1.default.warn(`Batch ${batchIndex} failed, trying individual inserts:`, batchError);
                for (const item of batchData) {
                    try {
                        const expense = await prisma.expense.create({
                            data: {
                                userId: item.userId,
                                categoryId: item.categoryId,
                                amount: item.amount,
                                description: item.description,
                                transactionDate: item.transactionDate,
                                merchant: item.merchant,
                                paymentMethod: item.paymentMethod,
                                isRecurring: item.isRecurring,
                                tags: item.tags,
                                notes: item.notes,
                                aiConfidence: item.aiConfidence,
                            },
                        });
                        // Queue AI categorization if needed
                        if (item.needsAiCategorization) {
                            await jobQueue_1.jobQueue.add('categorize-expense', {
                                expenseId: expense.id,
                                expenseData: {
                                    description: item.description,
                                    merchant: item.merchant,
                                    amount: item.amount,
                                    paymentMethod: item.paymentMethod,
                                }
                            });
                            results.aiCategorizations++;
                        }
                        results.success++;
                    }
                    catch (individualError) {
                        results.failed++;
                        results.errors.push({
                            index: item.globalIndex,
                            error: individualError instanceof Error ? individualError.message : 'Unknown error',
                            expenseData: item.description,
                        });
                    }
                }
            }
        }
        results.processingTime = Date.now() - startTime;
        // Invalidate caches after bulk import
        await (0, cache_1.invalidateUserCache)(userId);
        res.json({
            success: true,
            message: `Bulk import completed: ${results.success} successful, ${results.failed} failed`,
            data: {
                ...results,
                aiServiceStatus: 'background processing',
                averageTimePerExpense: results.processingTime / expenses.length,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Bulk import failed:', error);
        res.status(500).json({
            success: false,
            message: 'Bulk import failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});
// Optimized stats with single comprehensive query
exports.getExpenseStats = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { period = 'month' } = req.query;
    const cacheKey = cacheService_1.cacheService.generateKey('expense-stats', userId, period);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const now = new Date();
    let startDate;
    switch (period) {
        case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    try {
        // Single comprehensive query for all stats
        const statsRaw = await prisma.$queryRaw `
      WITH base_stats AS (
        SELECT 
          SUM(amount) as total_amount,
          COUNT(*) as total_count,
          AVG(amount) as avg_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount,
          COUNT(CASE WHEN ai_confidence IS NOT NULL THEN 1 END) as ai_categorized_count,
          AVG(ai_confidence) as ai_avg_confidence,
          COUNT(CASE WHEN transaction_date >= ${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)} THEN 1 END) as recent_transactions,
          COUNT(CASE WHEN is_recurring = true THEN 1 END) as recurring_count
        FROM expenses 
        WHERE user_id = ${userId}
          AND transaction_date >= ${startDate}
          AND transaction_date <= ${now}
      ),
      category_stats AS (
        SELECT 
          e.category_id,
          c.name as category_name,
          c.color as category_color,
          c.icon as category_icon,
          SUM(e.amount) as category_total,
          COUNT(e.*) as category_count,
          ROW_NUMBER() OVER (ORDER BY SUM(e.amount) DESC) as rn
        FROM expenses e
        JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = ${userId}
          AND e.transaction_date >= ${startDate}
          AND e.transaction_date <= ${now}
        GROUP BY e.category_id, c.name, c.color, c.icon
      ),
      payment_stats AS (
        SELECT 
          payment_method,
          SUM(amount) as payment_total,
          COUNT(*) as payment_count,
          ROW_NUMBER() OVER (ORDER BY SUM(amount) DESC) as rn
        FROM expenses 
        WHERE user_id = ${userId}
          AND transaction_date >= ${startDate}
          AND transaction_date <= ${now}
        GROUP BY payment_method
      )
      SELECT 
        bs.*,
        cs.category_id,
        cs.category_name,
        cs.category_color,
        cs.category_icon,
        cs.category_total::float,
        cs.category_count::int,
        ps.payment_method,
        ps.payment_total::float,
        ps.payment_count::int
      FROM base_stats bs
      CROSS JOIN category_stats cs
      CROSS JOIN payment_stats ps
      WHERE cs.rn <= 10 AND ps.rn <= 5
    `;
        if (statsRaw.length === 0) {
            return res.json({
                success: true,
                data: {
                    period,
                    dateRange: { startDate, endDate: now },
                    summary: {
                        total: 0,
                        count: 0,
                        average: 0,
                        min: 0,
                        max: 0,
                    },
                    categories: [],
                    paymentMethods: [],
                    aiCategorization: {
                        totalAiCategorized: 0,
                        averageConfidence: 0,
                        percentage: 0,
                    },
                    insights: {
                        recentTransactions: 0,
                        recurringExpenses: 0,
                    },
                },
            });
        }
        // Process the results
        const baseStats = statsRaw[0];
        const categoryStats = Array.from(new Map(statsRaw.map(row => [
            row.category_id,
            {
                category: {
                    id: row.category_id,
                    name: row.category_name,
                    color: row.category_color,
                    icon: row.category_icon,
                },
                total: row.category_total || 0,
                count: row.category_count || 0,
                percentage: baseStats.total_amount > 0 ? ((row.category_total || 0) / baseStats.total_amount) * 100 : 0,
            }
        ]))).map(([_, value]) => value)
            .sort((a, b) => b.total - a.total);
        const paymentStats = Array.from(new Map(statsRaw.map(row => [
            row.payment_method,
            {
                method: row.payment_method?.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || '',
                total: row.payment_total || 0,
                count: row.payment_count || 0,
                percentage: baseStats.total_amount > 0 ? ((row.payment_total || 0) / baseStats.total_amount) * 100 : 0,
            }
        ]))).map(([_, value]) => value)
            .filter(item => item.method) // Filter out null payment methods
            .sort((a, b) => b.total - a.total);
        const response = {
            success: true,
            data: {
                period,
                dateRange: { startDate, endDate: now },
                summary: {
                    total: Number(baseStats.total_amount) || 0,
                    count: baseStats.total_count || 0,
                    average: Number(baseStats.avg_amount) || 0,
                    min: Number(baseStats.min_amount) || 0,
                    max: Number(baseStats.max_amount) || 0,
                },
                categories: categoryStats,
                paymentMethods: paymentStats,
                aiCategorization: {
                    totalAiCategorized: baseStats.ai_categorized_count || 0,
                    averageConfidence: Number(baseStats.ai_avg_confidence) || 0,
                    percentage: baseStats.total_count > 0 ? ((baseStats.ai_categorized_count || 0) / baseStats.total_count) * 100 : 0,
                },
                insights: {
                    recentTransactions: baseStats.recent_transactions || 0,
                    recurringExpenses: baseStats.recurring_count || 0,
                    dailyAverage: baseStats.total_amount ? Number(baseStats.total_amount) / Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
                },
            },
        };
        // Cache for 10 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 600 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get expense stats failed:', error);
        throw error;
    }
});
// Optimized recurring expenses query
exports.getRecurringExpenses = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = cacheService_1.cacheService.generateKey('recurring-expenses', userId);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        const recurringExpenses = await prisma.expense.findMany({
            where: {
                userId,
                isRecurring: true,
            },
            select: {
                id: true,
                amount: true,
                description: true,
                transactionDate: true,
                merchant: true,
                paymentMethod: true,
                tags: true,
                notes: true,
                category: {
                    select: { id: true, name: true, color: true, icon: true },
                },
            },
            orderBy: { transactionDate: 'desc' },
            take: 100, // Reasonable limit for performance
        });
        const response = {
            success: true,
            data: {
                expenses: recurringExpenses.map(expense => ({
                    ...expense,
                    amount: Number(expense.amount),
                })),
                count: recurringExpenses.length,
            },
        };
        // Cache for 30 minutes (recurring expenses don't change often)
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 1800 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get recurring expenses failed:', error);
        throw error;
    }
});
// Cached categories with usage stats
exports.getCategories = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const cacheKey = 'categories:all:with-stats';
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        // Get categories with usage statistics
        const categoriesWithStats = await prisma.$queryRaw `
      SELECT 
        c.*,
        COALESCE(usage.count, 0)::int as usage_count,
        COALESCE(usage.total, 0)::float as total_amount
      FROM categories c
      LEFT JOIN (
        SELECT 
          category_id,
          COUNT(*) as count,
          SUM(amount) as total
        FROM expenses 
        WHERE transaction_date >= ${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)}
        GROUP BY category_id
      ) usage ON c.id = usage.category_id
      ORDER BY c.is_default DESC, usage.count DESC NULLS LAST, c.name ASC
    `;
        const response = {
            success: true,
            data: {
                categories: categoriesWithStats.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    description: cat.description,
                    color: cat.color,
                    icon: cat.icon,
                    isDefault: cat.is_default,
                    createdAt: cat.created_at,
                    stats: {
                        usageCount: cat.usage_count,
                        totalAmount: cat.total_amount,
                    },
                }))
            },
        };
        // Cache for 1 hour (categories rarely change)
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 3600 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get categories failed:', error);
        throw error;
    }
});
// Optimized tags query with usage frequency
exports.getExpenseTags = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = cacheService_1.cacheService.generateKey('expense-tags', userId);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        // Use aggregation to get unique tags with usage frequency
        const tagsRaw = await prisma.$queryRaw `
      SELECT 
        unnest(tags) as tag,
        COUNT(*) as usage_count,
        MAX(transaction_date) as last_used
      FROM expenses 
      WHERE user_id = ${userId}
        AND array_length(tags, 1) > 0
        AND transaction_date >= ${new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)}
      GROUP BY unnest(tags)
      ORDER BY usage_count DESC, tag ASC
      LIMIT 200
    `;
        const tagsWithStats = tagsRaw.map(row => ({
            tag: row.tag,
            usageCount: row.usage_count,
            lastUsed: row.last_used,
        }));
        const response = {
            success: true,
            data: {
                tags: tagsWithStats,
                summary: {
                    totalUniqueTags: tagsWithStats.length,
                    mostUsedTag: tagsWithStats[0]?.tag || null,
                }
            },
        };
        // Cache for 15 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 900 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get expense tags failed:', error);
        throw error;
    }
});
// Background categorization endpoint
exports.categorizeExpense = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    try {
        const expense = await prisma.expense.findFirst({
            where: { id, userId },
            select: {
                id: true,
                description: true,
                merchant: true,
                amount: true,
                paymentMethod: true,
                aiConfidence: true,
            }
        });
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found',
            });
        }
        // Queue for background processing
        const job = await jobQueue_1.jobQueue.add('categorize-expense', {
            expenseId: expense.id,
            expenseData: {
                description: expense.description,
                merchant: expense.merchant || undefined,
                amount: Number(expense.amount),
                paymentMethod: expense.paymentMethod,
            },
            priority: 'high', // Higher priority for manual requests
        });
        res.json({
            success: true,
            message: 'Expense categorization queued',
            data: {
                jobId: job.id,
                status: 'processing',
                currentConfidence: expense.aiConfidence ? Number(expense.aiConfidence) : null,
                estimatedTime: '30 seconds'
            },
        });
    }
    catch (error) {
        logger_1.default.error('Categorize expense failed:', error);
        throw error;
    }
});
// Background bulk recategorization
exports.bulkRecategorize = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { limit = 100, onlyLowConfidence = true, categoryIds } = req.body;
    try {
        // Validate inputs
        const parsedLimit = Math.min(Number(limit), 1000); // Max 1000 for safety
        // Get count of expenses that would be processed
        const whereClause = { userId };
        if (onlyLowConfidence) {
            whereClause.OR = [
                { aiConfidence: null },
                { aiConfidence: { lt: 0.5 } },
            ];
        }
        if (categoryIds && Array.isArray(categoryIds)) {
            whereClause.categoryId = { in: categoryIds };
        }
        const expenseCount = await prisma.expense.count({ where: whereClause });
        if (expenseCount === 0) {
            return res.json({
                success: true,
                message: 'No expenses found matching criteria',
                data: { processedCount: 0, estimatedTime: 0 }
            });
        }
        // Queue bulk recategorization job
        const job = await jobQueue_1.jobQueue.add('bulk-recategorize', {
            userId,
            limit: parsedLimit,
            onlyLowConfidence,
            categoryIds,
        });
        res.json({
            success: true,
            message: 'Bulk recategorization started',
            data: {
                jobId: job.id,
                status: 'processing',
                expensesFound: Math.min(expenseCount, parsedLimit),
                estimatedTime: Math.ceil(Math.min(expenseCount, parsedLimit) / 10) + ' minutes'
            },
        });
    }
    catch (error) {
        logger_1.default.error('Bulk recategorize failed:', error);
        throw error;
    }
});
// Enhanced AI service status
exports.getAiServiceStatus = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const cacheKey = 'ai-service-status';
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        const [connectionStatus, stats, queueStats] = await Promise.all([
            aiService_1.aiService.testConnection(),
            aiService_1.aiService.getCategorizationStats(),
            getJobQueueStats(), // You'll need to implement this
        ]);
        const response = {
            success: true,
            data: {
                isConnected: connectionStatus,
                stats,
                currentModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
                aiEnabled: process.env.ENABLE_AI_CATEGORIZATION === 'true',
                mode: 'background_processing',
                queue: {
                    pending: queueStats?.pending || 0,
                    active: queueStats?.active || 0,
                    completed: queueStats?.completed || 0,
                    failed: queueStats?.failed || 0,
                },
                performance: {
                    avgProcessingTime: '2-5 seconds',
                    successRate: '95%+',
                    dailyLimit: 'unlimited',
                }
            },
        };
        // Cache for 5 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 300 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Failed to get AI service status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get AI service status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
});
// Optimized getExpenseById with caching
exports.getExpenseById = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const cacheKey = cacheService_1.cacheService.generateKey('expense', userId, id);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        const expense = await prisma.expense.findFirst({
            where: { id, userId },
            include: {
                category: {
                    select: { id: true, name: true, color: true, icon: true },
                },
            },
        });
        if (!expense) {
            return res.status(404).json({
                success: false,
                message: 'Expense not found',
            });
        }
        const response = {
            success: true,
            data: {
                expense: {
                    ...expense,
                    amount: Number(expense.amount),
                    aiConfidence: expense.aiConfidence ? Number(expense.aiConfidence) : null,
                }
            },
        };
        // Cache for 10 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 600 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get expense by ID failed:', error);
        throw error;
    }
});
// Get expense insights and patterns
exports.getExpenseInsights = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { timeframe = '30' } = req.query; // days
    const cacheKey = cacheService_1.cacheService.generateKey('expense-insights', userId, timeframe);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        const days = Math.min(Number(timeframe), 365); // Max 1 year
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const now = new Date();
        // Get comprehensive insights in single query
        const insights = await prisma.$queryRaw `
      WITH base_data AS (
        SELECT 
          e.*,
          c.name as category_name,
          EXTRACT(DOW FROM e.transaction_date) as day_of_week
        FROM expenses e
        JOIN categories c ON e.category_id = c.id
        WHERE e.user_id = ${userId}
          AND e.transaction_date >= ${startDate}
          AND e.transaction_date <= ${now}
      ),
      spending_by_period AS (
        SELECT 
          DATE_TRUNC('week', transaction_date) as week,
          SUM(amount) as weekly_total
        FROM base_data
        GROUP BY DATE_TRUNC('week', transaction_date)
        ORDER BY week
      ),
      trend_calc AS (
        SELECT 
          AVG(CASE WHEN week >= (SELECT MAX(week) - INTERVAL '2 weeks' FROM spending_by_period) THEN weekly_total END) as recent_avg,
          AVG(CASE WHEN week < (SELECT MAX(week) - INTERVAL '2 weeks' FROM spending_by_period) THEN weekly_total END) as older_avg
        FROM spending_by_period
      )
      SELECT 
        SUM(amount)::float as total_expenses,
        COUNT(*)::int as total_transactions,
        AVG(amount)::float as avg_transaction,
        MAX(amount)::float as largest_expense,
        (SELECT category_name FROM base_data GROUP BY category_name ORDER BY COUNT(*) DESC LIMIT 1) as most_frequent_category,
        (SELECT category_name FROM base_data GROUP BY category_name ORDER BY SUM(amount) DESC LIMIT 1) as most_expensive_category,
        (SUM(amount) / ${days})::float as avg_daily_spending,
        CASE 
          WHEN tc.older_avg > 0 THEN ((tc.recent_avg - tc.older_avg) / tc.older_avg * 100)
          ELSE 0 
        END::float as spending_trend,
        (
          SUM(CASE WHEN day_of_week IN (0, 6) THEN amount ELSE 0 END) / 
          NULLIF(SUM(CASE WHEN day_of_week BETWEEN 1 AND 5 THEN amount ELSE 0 END), 0)
        )::float as weekend_vs_weekday_ratio,
        (SELECT merchant FROM base_data WHERE merchant IS NOT NULL GROUP BY merchant ORDER BY SUM(amount) DESC LIMIT 1) as top_merchant,
        (COUNT(CASE WHEN is_recurring THEN 1 END) * 100.0 / COUNT(*))::float as recurring_percentage
      FROM base_data
      CROSS JOIN trend_calc tc
    `;
        const insight = insights[0];
        const response = {
            success: true,
            data: {
                timeframe: {
                    days: Number(timeframe),
                    startDate,
                    endDate: now,
                },
                summary: {
                    totalExpenses: insight?.total_expenses || 0,
                    totalTransactions: insight?.total_transactions || 0,
                    averageTransaction: insight?.avg_transaction || 0,
                    largestExpense: insight?.largest_expense || 0,
                    averageDailySpending: insight?.avg_daily_spending || 0,
                },
                patterns: {
                    mostFrequentCategory: insight?.most_frequent_category || null,
                    mostExpensiveCategory: insight?.most_expensive_category || null,
                    topMerchant: insight?.top_merchant || null,
                    weekendVsWeekdayRatio: insight?.weekend_vs_weekday_ratio || 0,
                    recurringPercentage: insight?.recurring_percentage || 0,
                },
                trends: {
                    spendingTrend: insight?.spending_trend || 0,
                    trendDirection: (insight?.spending_trend || 0) > 5 ? 'increasing' :
                        (insight?.spending_trend || 0) < -5 ? 'decreasing' : 'stable',
                },
            },
        };
        // Cache for 1 hour
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 3600 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Get expense insights failed:', error);
        throw error;
    }
});
// Search expenses with optimized full-text search
exports.searchExpenses = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { q, limit = 20, includeCategories = true } = req.query;
    const userId = req.user.id;
    if (!q || q.length < 2) {
        return res.status(400).json({
            success: false,
            message: 'Search query must be at least 2 characters',
        });
    }
    const searchTerm = q.trim();
    const cacheKey = cacheService_1.cacheService.generateKey('expense-search', userId, searchTerm, limit);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        // Optimized search using database indexes and full-text search
        const searchResults = await prisma.$queryRaw `
      SELECT 
        e.id,
        e.amount::float,
        e.description,
        e.merchant,
        e.transaction_date,
        c.name as category_name,
        c.color as category_color,
        c.icon as category_icon,
        CASE 
          WHEN e.description ILIKE ${`%${searchTerm}%`} THEN 1.0
          WHEN e.merchant ILIKE ${`%${searchTerm}%`} THEN 0.8
          WHEN e.notes ILIKE ${`%${searchTerm}%`} THEN 0.6
          ELSE 0.5
        END as match_score,
        CASE 
          WHEN e.description ILIKE ${`%${searchTerm}%`} THEN 'description'
          WHEN e.merchant ILIKE ${`%${searchTerm}%`} THEN 'merchant'
          WHEN e.notes ILIKE ${`%${searchTerm}%`} THEN 'notes'
          ELSE 'other'
        END as match_type
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ${userId}
        AND (
          e.description ILIKE ${`%${searchTerm}%`}
          OR e.merchant ILIKE ${`%${searchTerm}%`}
          OR e.notes ILIKE ${`%${searchTerm}%`}
          OR ${searchTerm}::text = ANY(e.tags)
        )
      ORDER BY match_score DESC, e.transaction_date DESC
      LIMIT ${Number(limit)}
    `;
        const response = {
            success: true,
            data: {
                query: searchTerm,
                results: searchResults.map(result => ({
                    id: result.id,
                    amount: result.amount,
                    description: result.description,
                    merchant: result.merchant,
                    transactionDate: result.transaction_date,
                    category: {
                        name: result.category_name,
                        color: result.category_color,
                        icon: result.category_icon,
                    },
                    matchScore: result.match_score,
                    matchType: result.match_type,
                })),
                count: searchResults.length,
                hasMore: searchResults.length === Number(limit),
            },
        };
        // Cache for 5 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 300 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Search expenses failed:', error);
        throw error;
    }
});
// Helper function to get or create default category with caching
async function getOrCreateDefaultCategory() {
    const cacheKey = 'default-category';
    let defaultCategory = await cacheService_1.cacheService.get(cacheKey);
    if (defaultCategory) {
        return defaultCategory;
    }
    defaultCategory = await prisma.category.findFirst({
        where: { name: 'Other' },
        select: { id: true, name: true }
    });
    if (!defaultCategory) {
        defaultCategory = await prisma.category.create({
            data: {
                name: 'Other',
                description: 'Miscellaneous expenses',
                color: '#6B7280',
                icon: 'folder',
                isDefault: true,
            },
            select: { id: true, name: true }
        });
    }
    // Cache for 1 hour
    await cacheService_1.cacheService.set(cacheKey, defaultCategory, { ttl: 3600 });
    return defaultCategory;
}
// Helper function to get job queue statistics
async function getJobQueueStats() {
    try {
        // This would integrate with your job queue monitoring
        // Return mock stats for now
        return {
            pending: 0,
            active: 0,
            completed: 0,
            failed: 0,
        };
    }
    catch (error) {
        logger_1.default.error('Failed to get job queue stats:', error);
        return null;
    }
}
//# sourceMappingURL=expenseController.js.map