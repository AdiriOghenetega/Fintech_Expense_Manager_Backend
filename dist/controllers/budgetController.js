"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBudgetPerformance = exports.getBudgetStats = exports.getBudgetAlerts = exports.getBudgetById = exports.deleteBudget = exports.updateBudget = exports.createBudget = exports.getBudgets = void 0;
const zod_1 = require("zod");
const errorHandler_1 = require("../middleware/errorHandler");
const budgetService_1 = require("../services/budgetService");
const createBudgetSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid('Invalid category ID'),
    amount: zod_1.z.number().positive('Budget amount must be positive'),
    period: zod_1.z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
    startDate: zod_1.z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid start date').optional(),
});
const updateBudgetSchema = createBudgetSchema.partial();
exports.getBudgets = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { period } = req.query;
    const budgets = await budgetService_1.budgetService.getUserBudgets(userId, period);
    res.json({
        success: true,
        data: { budgets },
    });
});
exports.createBudget = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const validatedData = createBudgetSchema.parse(req.body);
    try {
        const budget = await budgetService_1.budgetService.createBudget(userId, {
            categoryId: validatedData.categoryId,
            amount: validatedData.amount,
            period: validatedData.period,
            startDate: validatedData.startDate ? new Date(validatedData.startDate) : undefined,
        });
        res.status(201).json({
            success: true,
            message: 'Budget created successfully',
            data: { budget },
        });
    }
    catch (error) {
        if (error.message.includes('already exists')) {
            return res.status(409).json({
                success: false,
                message: error.message,
            });
        }
        throw error;
    }
});
exports.updateBudget = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const validatedData = updateBudgetSchema.parse(req.body);
    const budget = await budgetService_1.budgetService.updateBudget(userId, id, {
        categoryId: validatedData.categoryId,
        amount: validatedData.amount,
        period: validatedData.period,
        startDate: validatedData.startDate ? new Date(validatedData.startDate) : undefined,
    });
    res.json({
        success: true,
        message: 'Budget updated successfully',
        data: { budget },
    });
});
exports.deleteBudget = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    await budgetService_1.budgetService.deleteBudget(userId, id);
    res.json({
        success: true,
        message: 'Budget deleted successfully',
    });
});
exports.getBudgetById = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const budget = await budgetService_1.budgetService.getBudgetById(userId, id);
    if (!budget) {
        return res.status(404).json({
            success: false,
            message: 'Budget not found',
        });
    }
    res.json({
        success: true,
        data: { budget },
    });
});
exports.getBudgetAlerts = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const alerts = await budgetService_1.budgetService.getBudgetAlerts(userId);
    res.json({
        success: true,
        data: { alerts },
    });
});
exports.getBudgetStats = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const stats = await budgetService_1.budgetService.getBudgetStats(userId);
    res.json({
        success: true,
        data: { stats },
    });
});
exports.getBudgetPerformance = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user.id;
    const { period = 'MONTHLY' } = req.query;
    const budgets = await budgetService_1.budgetService.getUserBudgets(userId, period);
    // Transform to the expected format for the analytics controller
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
            progressPercentage: budget.percentage,
        },
        projection: {
            avgDailySpending: budget.projection.dailyAverage,
            projectedTotal: budget.projection.estimatedTotal,
            projectedOverage: Math.max(0, budget.projection.estimatedTotal - budget.budgetAmount),
            onTrack: budget.projection.onTrack,
        },
        status: budget.status,
    }));
    res.json({
        success: true,
        data: { budgetPerformance },
    });
});
//# sourceMappingURL=budgetController.js.map