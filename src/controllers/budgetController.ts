import { Response } from 'express';
import { z } from 'zod';
import { BudgetPeriod } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { budgetService } from '../services/budgetService';

const createBudgetSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  amount: z.number().positive('Budget amount must be positive'),
  period: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  startDate: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid start date').optional(),
});

const updateBudgetSchema = createBudgetSchema.partial();

export const getBudgets = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { period } = req.query;

  const budgets = await budgetService.getUserBudgets(
    userId,
    period as BudgetPeriod | undefined
  );

  res.json({
    success: true,
    data: { budgets },
  });
});

export const createBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const validatedData = createBudgetSchema.parse(req.body);

  try {
    const budget = await budgetService.createBudget(userId, {
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
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    throw error;
  }
});

export const updateBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const validatedData = updateBudgetSchema.parse(req.body);

  const budget = await budgetService.updateBudget(userId, id, {
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

export const deleteBudget = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  await budgetService.deleteBudget(userId, id);

  res.json({
    success: true,
    message: 'Budget deleted successfully',
  });
});

export const getBudgetById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const budget = await budgetService.getBudgetById(userId, id);

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

export const getBudgetAlerts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const alerts = await budgetService.getBudgetAlerts(userId);

  res.json({
    success: true,
    data: { alerts },
  });
});

export const getBudgetStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const stats = await budgetService.getBudgetStats(userId);

  res.json({
    success: true,
    data: { stats },
  });
});

export const getBudgetPerformance = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { period = 'MONTHLY' } = req.query;

  const budgets = await budgetService.getUserBudgets(userId, period as BudgetPeriod);

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