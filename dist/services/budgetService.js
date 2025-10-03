"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
class BudgetService {
    async createBudget(userId, data) {
        const { startDate, endDate } = this.calculatePeriodDates(data.period, data.startDate);
        // Check for existing budget
        const existingBudget = await prisma.budget.findFirst({
            where: {
                userId,
                categoryId: data.categoryId,
                period: data.period,
                startDate,
                isActive: true,
            },
        });
        if (existingBudget) {
            throw new Error('Budget already exists for this category and period');
        }
        const budget = await prisma.budget.create({
            data: {
                userId,
                categoryId: data.categoryId,
                amount: data.amount,
                period: data.period,
                startDate,
                endDate,
                isActive: true,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        icon: true,
                    },
                },
            },
        });
        return await this.calculateBudgetSummary(budget);
    }
    async updateBudget(userId, budgetId, data) {
        const updateData = {};
        if (data.amount !== undefined)
            updateData.amount = data.amount;
        if (data.period !== undefined) {
            updateData.period = data.period;
            const { startDate, endDate } = this.calculatePeriodDates(data.period, data.startDate);
            updateData.startDate = startDate;
            updateData.endDate = endDate;
        }
        const budget = await prisma.budget.update({
            where: {
                id: budgetId,
                userId, // Ensure user can only update their own budgets
            },
            data: updateData,
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        icon: true,
                    },
                },
            },
        });
        return await this.calculateBudgetSummary(budget);
    }
    async deleteBudget(userId, budgetId) {
        await prisma.budget.update({
            where: {
                id: budgetId,
                userId,
            },
            data: {
                isActive: false,
            },
        });
    }
    async getUserBudgets(userId, period) {
        const where = {
            userId,
            isActive: true,
        };
        if (period) {
            where.period = period;
        }
        const budgets = await prisma.budget.findMany({
            where,
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        icon: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        const budgetSummaries = await Promise.all(budgets.map(budget => this.calculateBudgetSummary(budget)));
        return budgetSummaries;
    }
    async getBudgetById(userId, budgetId) {
        const budget = await prisma.budget.findFirst({
            where: {
                id: budgetId,
                userId,
                isActive: true,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        color: true,
                        icon: true,
                    },
                },
            },
        });
        if (!budget)
            return null;
        return await this.calculateBudgetSummary(budget);
    }
    async calculateBudgetSummary(budget) {
        // Get expenses for this budget period
        const expenses = await prisma.expense.findMany({
            where: {
                userId: budget.userId,
                categoryId: budget.categoryId,
                transactionDate: {
                    gte: budget.startDate,
                    lte: budget.endDate,
                },
            },
            select: {
                amount: true,
                transactionDate: true,
            },
        });
        const spent = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        const remaining = Number(budget.amount) - spent;
        const percentage = Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0;
        // Calculate status
        let status;
        if (percentage >= 100)
            status = 'exceeded';
        else if (percentage >= 90)
            status = 'critical';
        else if (percentage >= 75)
            status = 'caution';
        else
            status = 'good';
        // Calculate projections
        const now = new Date();
        const periodStart = budget.startDate;
        const periodEnd = budget.endDate;
        const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.max(0, totalDays - daysElapsed);
        const dailyAverage = daysElapsed > 0 ? spent / daysElapsed : 0;
        const estimatedTotal = dailyAverage * totalDays;
        const onTrack = estimatedTotal <= Number(budget.amount);
        return {
            id: budget.id,
            category: budget.category,
            budgetAmount: Number(budget.amount),
            spent,
            remaining,
            percentage,
            period: budget.period,
            startDate: budget.startDate,
            endDate: budget.endDate,
            status,
            transactions: expenses.length,
            averageTransaction: expenses.length > 0 ? spent / expenses.length : 0,
            projection: {
                estimatedTotal,
                daysRemaining,
                dailyAverage,
                onTrack,
            },
        };
    }
    calculatePeriodDates(period, startDate) {
        const now = startDate || new Date();
        let start;
        let end;
        switch (period) {
            case 'MONTHLY':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                break;
            case 'QUARTERLY':
                const quarter = Math.floor(now.getMonth() / 3);
                start = new Date(now.getFullYear(), quarter * 3, 1);
                end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
                break;
            case 'YEARLY':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31);
                break;
            default:
                throw new Error(`Unsupported budget period: ${period}`);
        }
        return { startDate: start, endDate: end };
    }
    async getBudgetAlerts(userId) {
        const budgets = await this.getUserBudgets(userId);
        const alerts = [];
        for (const budget of budgets) {
            if (budget.percentage >= 100) {
                alerts.push({
                    budgetId: budget.id,
                    categoryName: budget.category.name,
                    type: 'exceeded',
                    message: `Budget exceeded by ₦${(budget.spent - budget.budgetAmount).toFixed(2)}`,
                    severity: 'error',
                });
            }
            else if (budget.percentage >= 90) {
                alerts.push({
                    budgetId: budget.id,
                    categoryName: budget.category.name,
                    type: 'approaching',
                    message: `Approaching budget limit (${budget.percentage.toFixed(1)}% used)`,
                    severity: 'warning',
                });
            }
            else if (!budget.projection.onTrack && budget.projection.daysRemaining > 0) {
                alerts.push({
                    budgetId: budget.id,
                    categoryName: budget.category.name,
                    type: 'projection',
                    message: `Current spending pace will exceed budget by ₦${(budget.projection.estimatedTotal - budget.budgetAmount).toFixed(2)}`,
                    severity: 'warning',
                });
            }
        }
        return alerts;
    }
    async getBudgetStats(userId) {
        const budgets = await this.getUserBudgets(userId);
        return {
            totalBudgets: budgets.length,
            totalBudgetAmount: budgets.reduce((sum, b) => sum + b.budgetAmount, 0),
            totalSpent: budgets.reduce((sum, b) => sum + b.spent, 0),
            onTrackBudgets: budgets.filter(b => b.projection.onTrack).length,
            exceededBudgets: budgets.filter(b => b.status === 'exceeded').length,
        };
    }
}
exports.budgetService = new BudgetService();
//# sourceMappingURL=budgetService.js.map