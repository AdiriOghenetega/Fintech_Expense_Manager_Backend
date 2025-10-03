"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpendingInsights = exports.getBudgetPerformance = exports.getCategoryAnalysis = exports.getTrends = exports.getOverview = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../middleware/errorHandler");
const budgetService_1 = require("../services/budgetService");
const cacheService_1 = require("../services/cacheService");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma = new client_1.PrismaClient();
const analyticsQuerySchema = zod_1.z.object({
    period: zod_1.z.enum(['week', 'month', 'quarter', 'year']).default('month'),
    startDate: zod_1.z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid start date').optional(),
    endDate: zod_1.z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid end date').optional(),
    categories: zod_1.z.string().transform(str => str.split(',')).optional(),
    groupBy: zod_1.z.enum(['day', 'week', 'month', 'category', 'paymentMethod']).default('month'),
});
exports.getOverview = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = cacheService_1.cacheService.generateKey('overview', userId, 'v5');
    // Check cache first - increased cache time
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const recent7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    try {
        // OPTIMIZATION 1: Execute only essential queries in parallel
        const [currentMonthExpenses, lastMonthExpenses, topCategories, recentVelocity, previousVelocity, recentTransactions] = await Promise.all([
            // Current month expenses
            prisma.expense.aggregate({
                where: {
                    userId,
                    transactionDate: { gte: startOfMonth, lte: now },
                },
                _sum: { amount: true },
                _count: true,
                _avg: { amount: true },
            }),
            // Last month expenses
            prisma.expense.aggregate({
                where: {
                    userId,
                    transactionDate: { gte: startOfLastMonth, lte: endOfLastMonth },
                },
                _sum: { amount: true },
                _count: true,
                _avg: { amount: true },
            }),
            // OPTIMIZATION 2: Simplified category breakdown - just top 3
            prisma.expense.groupBy({
                by: ['categoryId'],
                where: {
                    userId,
                    transactionDate: { gte: startOfMonth, lte: now },
                },
                _sum: { amount: true },
                _count: true,
                orderBy: { _sum: { amount: 'desc' } },
                take: 3, // Reduced from 5 to 3
            }),
            // Recent velocity
            prisma.expense.aggregate({
                where: {
                    userId,
                    transactionDate: { gte: recent7Days, lte: now },
                },
                _sum: { amount: true },
            }),
            // Previous velocity  
            prisma.expense.aggregate({
                where: {
                    userId,
                    transactionDate: { gte: previous7Days, lt: recent7Days },
                },
                _sum: { amount: true },
            }),
            // OPTIMIZATION 3: Minimal recent transactions
            prisma.expense.findMany({
                where: {
                    userId,
                    transactionDate: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days only
                },
                select: {
                    id: true,
                    amount: true,
                    description: true,
                    transactionDate: true,
                    merchant: true,
                    category: { select: { name: true, color: true } } // Removed icon for speed
                },
                orderBy: { transactionDate: 'desc' },
                take: 3, // Reduced from 5 to 3
            }),
        ]);
        // OPTIMIZATION 4: Batch category lookup for top categories only
        const categoryIds = topCategories.map(c => c.categoryId);
        const categories = categoryIds.length > 0 ? await prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true, name: true, color: true, icon: true },
        }) : [];
        // OPTIMIZATION 5: Simplified budget processing - load separately and cache
        let budgetStatusProcessed = [];
        // Get budgets with minimal data
        const budgets = await prisma.budget.findMany({
            where: {
                userId,
                isActive: true,
                startDate: { lte: now },
                endDate: { gte: now },
            },
            select: {
                id: true,
                amount: true,
                categoryId: true,
                period: true,
                startDate: true,
                category: { select: { name: true, color: true } }
            },
            take: 3, // Reduced from 5 to 3
        });
        if (budgets.length > 0) {
            // OPTIMIZATION 6: Single query for all budget expenses
            const budgetCategoryIds = budgets.map(b => b.categoryId);
            const budgetExpenses = await prisma.expense.groupBy({
                by: ['categoryId'],
                where: {
                    userId,
                    categoryId: { in: budgetCategoryIds },
                    transactionDate: { gte: startOfMonth, lte: now }, // Use current month for all for simplicity
                },
                _sum: { amount: true },
                _count: true,
            });
            budgetStatusProcessed = budgets.map(budget => {
                const expenseData = budgetExpenses.find(e => e.categoryId === budget.categoryId);
                const spent = Number(expenseData?._sum.amount) || 0;
                const budgetAmount = Number(budget.amount);
                const percentage = budgetAmount > 0 ? (spent / budgetAmount) * 100 : 0;
                let status;
                if (percentage >= 100)
                    status = 'exceeded';
                else if (percentage >= 90)
                    status = 'critical';
                else if (percentage >= 75)
                    status = 'caution';
                else
                    status = 'good';
                return {
                    id: budget.id,
                    amount: budgetAmount,
                    spent,
                    remaining: budgetAmount - spent,
                    percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
                    period: budget.period,
                    category: { name: budget.category.name, color: budget.category.color },
                    status,
                };
            });
        }
        // OPTIMIZATION 7: Streamlined data processing
        const currentMonth = {
            total: Number(currentMonthExpenses._sum.amount) || 0,
            count: currentMonthExpenses._count || 0,
            average: Number(currentMonthExpenses._avg.amount) || 0,
        };
        const lastMonth = {
            total: Number(lastMonthExpenses._sum.amount) || 0,
            count: lastMonthExpenses._count || 0,
            average: Number(lastMonthExpenses._avg.amount) || 0,
        };
        // Simplified trend calculations
        const trends = {
            totalChange: lastMonth.total > 0 ? Math.round(((currentMonth.total - lastMonth.total) / lastMonth.total) * 1000) / 10 : 0,
            countChange: lastMonth.count > 0 ? Math.round(((currentMonth.count - lastMonth.count) / lastMonth.count) * 1000) / 10 : 0,
            velocityChange: calculateVelocityChange([
                { period: 'recent', total: Number(recentVelocity._sum.amount) || 0 },
                { period: 'previous', total: Number(previousVelocity._sum.amount) || 0 }
            ]),
        };
        // Simplified category breakdown
        const categoriesWithTotals = topCategories.map(cb => {
            const category = categories.find(c => c.id === cb.categoryId);
            return {
                categoryId: cb.categoryId,
                categoryName: category?.name || 'Unknown',
                categoryColor: category?.color || '#6B7280',
                categoryIcon: category?.icon || 'folder',
                total: Number(cb._sum.amount) || 0,
                count: cb._count || 0,
            };
        });
        const response = {
            success: true,
            data: {
                overview: {
                    currentMonth,
                    lastMonth,
                    trends,
                    velocity: {
                        recent7Days: Number(recentVelocity._sum.amount) || 0,
                        previous7Days: Number(previousVelocity._sum.amount) || 0,
                    },
                },
                categoryBreakdown: categoriesWithTotals,
                recentTransactions: recentTransactions.map(tx => ({
                    id: tx.id,
                    amount: Number(tx.amount),
                    description: tx.description,
                    transactionDate: tx.transactionDate,
                    merchant: tx.merchant,
                    category: tx.category,
                })),
                budgetStatus: budgetStatusProcessed,
            },
        };
        // OPTIMIZATION 8: Longer cache time for dashboard data
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 600 }); // 10 minutes instead of 5
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Overview query failed:', error);
        throw error;
    }
});
exports.getTrends = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const validatedQuery = analyticsQuerySchema.parse(req.query);
    const { period, startDate, endDate, categories, groupBy } = validatedQuery;
    const cacheKey = cacheService_1.cacheService.generateKey('trends', userId, period, groupBy, JSON.stringify(categories));
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    // Calculate date range
    let dateRange;
    const now = new Date();
    if (startDate && endDate) {
        dateRange = {
            gte: new Date(startDate),
            lte: new Date(endDate),
        };
    }
    else {
        switch (period) {
            case 'week':
                dateRange = {
                    gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                    lte: now,
                };
                break;
            case 'quarter':
                const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                dateRange = {
                    gte: quarterStart,
                    lte: now,
                };
                break;
            case 'year':
                dateRange = {
                    gte: new Date(now.getFullYear(), 0, 1),
                    lte: now,
                };
                break;
            default: // month
                dateRange = {
                    gte: new Date(now.getFullYear(), now.getMonth() - 5, 1), // Last 6 months
                    lte: now,
                };
        }
    }
    let result;
    try {
        if (groupBy === 'category') {
            // Category grouping using Prisma
            const categoryData = await prisma.expense.groupBy({
                by: ['categoryId'],
                where: {
                    userId,
                    transactionDate: dateRange,
                    ...(categories && categories.length > 0 ? { categoryId: { in: categories } } : {}),
                },
                _sum: { amount: true },
                _count: true,
                _avg: { amount: true },
                orderBy: {
                    _sum: {
                        amount: 'desc',
                    },
                },
            });
            // Get category details
            const categoryIds = categoryData.map(cd => cd.categoryId);
            const categoryDetails = await prisma.category.findMany({
                where: { id: { in: categoryIds } },
                select: { id: true, name: true, color: true, icon: true },
            });
            result = categoryData.map(item => {
                const category = categoryDetails.find(c => c.id === item.categoryId);
                return {
                    key: category?.name || 'Unknown',
                    value: Number(item._sum.amount) || 0,
                    count: item._count,
                    average: Number(item._avg.amount) || 0,
                    color: category?.color || '#6B7280',
                    icon: category?.icon || 'folder',
                };
            });
        }
        else if (groupBy === 'paymentMethod') {
            // Payment method grouping
            const paymentData = await prisma.expense.groupBy({
                by: ['paymentMethod'],
                where: {
                    userId,
                    transactionDate: dateRange,
                    ...(categories && categories.length > 0 ? { categoryId: { in: categories } } : {}),
                },
                _sum: { amount: true },
                _count: true,
                _avg: { amount: true },
                orderBy: {
                    _sum: {
                        amount: 'desc',
                    },
                },
            });
            result = paymentData.map(item => ({
                key: item.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
                value: Number(item._sum.amount) || 0,
                count: item._count,
                average: Number(item._avg.amount) || 0,
            }));
        }
        else {
            // For time-based grouping, we'll use a simpler approach
            // Get all expenses in the date range first
            const expenses = await prisma.expense.findMany({
                where: {
                    userId,
                    transactionDate: dateRange,
                    ...(categories && categories.length > 0 ? { categoryId: { in: categories } } : {}),
                },
                select: {
                    amount: true,
                    transactionDate: true,
                },
                orderBy: {
                    transactionDate: 'asc',
                },
            });
            // Group by time period in memory
            const timeGroups = new Map();
            expenses.forEach(expense => {
                let key;
                const date = new Date(expense.transactionDate);
                switch (groupBy) {
                    case 'day':
                        key = date.toISOString().split('T')[0];
                        break;
                    case 'week':
                        const weekStart = new Date(date);
                        weekStart.setDate(date.getDate() - date.getDay());
                        key = weekStart.toISOString().split('T')[0];
                        break;
                    default: // month
                        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
                }
                const existing = timeGroups.get(key) || { total: 0, count: 0, amounts: [] };
                const amount = Number(expense.amount);
                timeGroups.set(key, {
                    total: existing.total + amount,
                    count: existing.count + 1,
                    amounts: [...existing.amounts, amount],
                });
            });
            result = Array.from(timeGroups.entries()).map(([period, data]) => ({
                key: period,
                value: data.total,
                count: data.count,
                average: data.total / data.count,
                median: calculateMedian(data.amounts),
            })).sort((a, b) => a.key.localeCompare(b.key));
        }
        const response = {
            success: true,
            data: { trends: result, groupBy, period, dateRange },
        };
        // Cache for 10 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 600 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Trends query failed:', error);
        throw error;
    }
});
exports.getCategoryAnalysis = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = cacheService_1.cacheService.generateKey('category-analysis', userId);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last6Months = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    try {
        // Get current month data by category
        const currentMonthData = await prisma.expense.groupBy({
            by: ['categoryId'],
            where: {
                userId,
                transactionDate: {
                    gte: startOfMonth,
                    lte: now,
                },
            },
            _sum: { amount: true },
            _count: true,
            _avg: { amount: true },
            _min: { amount: true },
            _max: { amount: true },
        });
        // Get historical data by category
        const historicalData = await prisma.expense.groupBy({
            by: ['categoryId'],
            where: {
                userId,
                transactionDate: {
                    gte: last6Months,
                    lte: now,
                },
            },
            _sum: { amount: true },
            _count: true,
            _avg: { amount: true },
        });
        // Get category details
        const allCategoryIds = [...new Set([
                ...currentMonthData.map(d => d.categoryId),
                ...historicalData.map(d => d.categoryId),
            ])];
        const categories = await prisma.category.findMany({
            where: { id: { in: allCategoryIds } },
            select: { id: true, name: true, color: true, icon: true },
        });
        // Process analysis data
        const analysis = categories.map(category => {
            const currentData = currentMonthData.find(d => d.categoryId === category.id);
            const histData = historicalData.find(d => d.categoryId === category.id);
            const currentTotal = Number(currentData?._sum.amount) || 0;
            const historicalTotal = Number(histData?._sum.amount) || 0;
            const historicalAvg = historicalTotal / 6; // 6 months average
            const totalChange = historicalAvg > 0 ? ((currentTotal - historicalAvg) / historicalAvg) * 100 : 0;
            return {
                category: {
                    id: category.id,
                    name: category.name,
                    color: category.color,
                    icon: category.icon,
                },
                currentMonth: {
                    total: currentTotal,
                    count: currentData?._count || 0,
                    average: Number(currentData?._avg.amount) || 0,
                    min: Number(currentData?._min.amount) || 0,
                    max: Number(currentData?._max.amount) || 0,
                },
                historical: {
                    total: historicalTotal,
                    count: histData?._count || 0,
                    average: Number(histData?._avg.amount) || 0,
                    monthlyAverage: historicalAvg,
                },
                trends: {
                    totalChange,
                    isIncreasing: totalChange > 5,
                    monthlyData: [], // Could be enhanced with monthly breakdown
                },
                insights: generateCategoryInsights(currentTotal, historicalAvg, currentData?._count || 0, histData?._count || 0),
            };
        }).filter(a => a.currentMonth.total > 0 || a.historical.total > 0);
        const response = {
            success: true,
            data: { analysis },
        };
        // Cache for 10 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 600 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Category analysis query failed:', error);
        throw error;
    }
});
exports.getBudgetPerformance = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { period = 'MONTHLY' } = req.query;
    const cacheKey = cacheService_1.cacheService.generateKey('budget-performance', userId, period);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        // Use the budget service to get real budget performance
        const budgets = await budgetService_1.budgetService.getUserBudgets(userId, period);
        const budgetPerformance = budgets.map(budget => ({
            budget: {
                id: budget.id,
                amount: budget.budgetAmount,
                period: budget.period,
                startDate: budget.startDate,
                endDate: budget.endDate,
            },
            category: {
                name: budget.category.name,
                color: budget.category.color,
            },
            performance: {
                spent: budget.spent,
                remaining: budget.remaining,
                percentage: budget.percentage,
                transactionCount: budget.transactions,
                averageTransaction: budget.averageTransaction,
            },
            timeline: {
                daysPassed: Math.ceil((new Date().getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)),
                daysRemaining: budget.projection.daysRemaining,
                totalDays: Math.ceil((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)),
                progressPercentage: (Math.ceil((new Date().getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24)) /
                    Math.ceil((budget.endDate.getTime() - budget.startDate.getTime()) / (1000 * 60 * 60 * 24))) * 100,
            },
            projection: {
                avgDailySpending: budget.projection.dailyAverage,
                projectedTotal: budget.projection.estimatedTotal,
                projectedOverage: Math.max(0, budget.projection.estimatedTotal - budget.budgetAmount),
                onTrack: budget.projection.onTrack,
            },
            status: budget.status,
        }));
        const response = {
            success: true,
            data: { budgetPerformance },
        };
        // Cache for 5 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 300 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Budget performance query failed:', error);
        throw error;
    }
});
exports.getSpendingInsights = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = cacheService_1.cacheService.generateKey('spending-insights', userId);
    const cached = await cacheService_1.cacheService.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const previous30Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    try {
        // Get current and previous period data using Prisma
        const [currentPeriodData, previousPeriodData, topMerchants] = await Promise.all([
            prisma.expense.aggregate({
                where: {
                    userId,
                    transactionDate: {
                        gte: last30Days,
                        lte: now,
                    },
                },
                _sum: { amount: true },
                _count: true,
                _avg: { amount: true },
            }),
            prisma.expense.aggregate({
                where: {
                    userId,
                    transactionDate: {
                        gte: previous30Days,
                        lt: last30Days,
                    },
                },
                _sum: { amount: true },
                _count: true,
                _avg: { amount: true },
            }),
            prisma.expense.groupBy({
                by: ['merchant'],
                where: {
                    userId,
                    transactionDate: {
                        gte: last30Days,
                        lte: now,
                    },
                    merchant: { not: null },
                },
                _sum: { amount: true },
                _count: true,
                orderBy: {
                    _sum: {
                        amount: 'desc',
                    },
                },
                take: 10,
            }),
        ]);
        // Get weekday vs weekend spending
        const expenses = await prisma.expense.findMany({
            where: {
                userId,
                transactionDate: {
                    gte: last30Days,
                    lte: now,
                },
            },
            select: {
                amount: true,
                transactionDate: true,
            },
        });
        let weekdayTotal = 0;
        let weekendTotal = 0;
        expenses.forEach(expense => {
            const dayOfWeek = new Date(expense.transactionDate).getDay();
            const amount = Number(expense.amount);
            if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
                weekendTotal += amount;
            }
            else {
                weekdayTotal += amount;
            }
        });
        // Find unusual spending patterns
        const unusualSpending = await findUnusualSpending(userId, last30Days, now);
        const currentPeriod = {
            total: Number(currentPeriodData._sum.amount) || 0,
            count: currentPeriodData._count || 0,
            average: Number(currentPeriodData._avg.amount) || 0,
        };
        const previousPeriod = {
            total: Number(previousPeriodData._sum.amount) || 0,
            count: previousPeriodData._count || 0,
            average: Number(previousPeriodData._avg.amount) || 0,
        };
        const insights = {
            period: {
                current: currentPeriod,
                previous: previousPeriod,
                change: {
                    total: calculatePercentageChange(previousPeriod.total, currentPeriod.total),
                    count: calculatePercentageChange(previousPeriod.count, currentPeriod.count),
                    average: calculatePercentageChange(previousPeriod.average, currentPeriod.average),
                },
            },
            weekdayVsWeekend: {
                weekday: weekdayTotal,
                weekend: weekendTotal,
                ratio: weekdayTotal > 0 ? weekendTotal / weekdayTotal : 0,
            },
            topMerchants: topMerchants.map(m => ({
                merchant: m.merchant || 'Unknown',
                total: Number(m._sum.amount) || 0,
                count: m._count,
            })),
            unusual: unusualSpending,
        };
        const response = {
            success: true,
            data: { insights },
        };
        // Cache for 15 minutes
        await cacheService_1.cacheService.set(cacheKey, response, { ttl: 900 });
        res.json(response);
    }
    catch (error) {
        logger_1.default.error('Spending insights query failed:', error);
        throw error;
    }
});
// Helper functions
function calculateVelocityChange(velocityData) {
    const recent = velocityData.find(v => v.period === 'recent')?.total || 0;
    const previous = velocityData.find(v => v.period === 'previous')?.total || 0;
    return previous > 0 ? ((recent - previous) / previous) * 100 : 0;
}
function calculateMedian(numbers) {
    if (numbers.length === 0)
        return 0;
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function generateCategoryInsights(currentTotal, historicalAvg, currentCount, historicalCount) {
    const insights = [];
    const totalChange = historicalAvg > 0 ? ((currentTotal - historicalAvg) / historicalAvg) * 100 : 0;
    const countChange = historicalCount > 0 ? ((currentCount - (historicalCount / 6)) / (historicalCount / 6)) * 100 : 0;
    if (Math.abs(totalChange) > 50) {
        insights.push(totalChange > 0 ? 'Significant increase in spending' : 'Significant decrease in spending');
    }
    if (Math.abs(countChange) > 30) {
        insights.push(countChange > 0 ? 'More frequent transactions' : 'Fewer transactions than usual');
    }
    if (currentTotal === 0 && historicalAvg > 0) {
        insights.push('No spending this month in this category');
    }
    return insights;
}
function calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0)
        return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
}
async function findUnusualSpending(userId, startDate, endDate) {
    const unusual = [];
    try {
        // Find unusually large transactions (> 3x average)
        const avgExpense = await prisma.expense.aggregate({
            where: {
                userId,
                transactionDate: { gte: new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000), lt: startDate },
            },
            _avg: { amount: true },
        });
        const avgAmount = Number(avgExpense._avg.amount) || 0;
        const threshold = avgAmount * 3;
        if (threshold > 0) {
            const largeExpenses = await prisma.expense.findMany({
                where: {
                    userId,
                    transactionDate: { gte: startDate, lte: endDate },
                    amount: { gte: threshold },
                },
                include: {
                    category: { select: { name: true } },
                },
                take: 5,
            });
            largeExpenses.forEach(expense => {
                unusual.push({
                    type: 'large_transaction',
                    description: `Unusually large expense: ${expense.description}`,
                    amount: Number(expense.amount),
                    category: expense.category.name,
                });
            });
        }
        // Find new merchants (not seen in previous 90 days)
        const newMerchants = await prisma.expense.groupBy({
            by: ['merchant'],
            where: {
                userId,
                transactionDate: { gte: startDate, lte: endDate },
                merchant: { not: null },
                AND: {
                    NOT: {
                        merchant: {
                            in: await prisma.expense.findMany({
                                where: {
                                    userId,
                                    transactionDate: {
                                        gte: new Date(startDate.getTime() - 90 * 24 * 60 * 60 * 1000),
                                        lt: startDate
                                    },
                                    merchant: { not: null },
                                },
                                select: { merchant: true },
                            }).then(expenses => expenses.map(e => e.merchant).filter(Boolean)),
                        },
                    },
                },
            },
            _sum: { amount: true },
            orderBy: {
                _sum: { amount: 'desc' },
            },
            take: 3,
        });
        newMerchants.forEach(merchant => {
            unusual.push({
                type: 'new_merchant',
                description: `New merchant: ${merchant.merchant}`,
                amount: Number(merchant._sum.amount) || 0,
            });
        });
        // Find spending spikes (days with unusually high spending)
        const expenses = await prisma.expense.findMany({
            where: {
                userId,
                transactionDate: { gte: startDate, lte: endDate },
            },
            select: {
                amount: true,
                transactionDate: true,
            },
        });
        // Group by day and find spikes
        const dailyTotals = new Map();
        expenses.forEach(expense => {
            const day = expense.transactionDate.toISOString().split('T')[0];
            const current = dailyTotals.get(day) || 0;
            dailyTotals.set(day, current + Number(expense.amount));
        });
        const dailyAmounts = Array.from(dailyTotals.values());
        const avgDailySpending = dailyAmounts.reduce((sum, amount) => sum + amount, 0) / Math.max(dailyAmounts.length, 1);
        // Find days with spending > 2x average
        Array.from(dailyTotals.entries())
            .filter(([_, amount]) => amount > avgDailySpending * 2)
            .slice(0, 3)
            .forEach(([day, amount]) => {
            unusual.push({
                type: 'spending_spike',
                description: `High spending day: ${day}`,
                amount,
            });
        });
    }
    catch (error) {
        logger_1.default.error('Error finding unusual spending patterns:', error);
    }
    return unusual.slice(0, 5); // Limit to top 5 unusual patterns
}
//# sourceMappingURL=analyticsController.js.map