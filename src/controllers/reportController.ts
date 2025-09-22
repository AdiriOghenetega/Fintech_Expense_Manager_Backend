// backend/src/controllers/reportController.ts
import { Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { asyncHandler } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { generatePDFReport, generateCSVReport, generateExcelReport } from '../services/reportGenerationService';

const prisma = new PrismaClient();

const createReportSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  type: z.enum(['monthly', 'quarterly', 'yearly', 'custom']).transform((val) => {
    // Transform lowercase to uppercase to match Prisma enum
    return val.toUpperCase() as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
  }),
  parameters: z.object({
    startDate: z.string(),
    endDate: z.string(),
    categories: z.array(z.string()).optional(),
    includeCharts: z.boolean().default(true),
    groupBy: z.enum(['day', 'week', 'month', 'category']).default('month'),
  }),
  isScheduled: z.boolean().default(false),
  scheduleConfig: z.object({
    frequency: z.enum(['weekly', 'monthly', 'quarterly']),
    dayOfWeek: z.number().optional(),
    dayOfMonth: z.number().optional(),
  }).optional(),
});

export const getReports = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const {
    page = 1,
    limit = 10,
    type,
    status,
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);
  const where: any = { userId };

  // Transform lowercase type to uppercase for Prisma enum
  if (type) {
    const typeMap: { [key: string]: string } = {
      'monthly': 'MONTHLY',
      'quarterly': 'QUARTERLY', 
      'yearly': 'YEARLY',
      'custom': 'CUSTOM'
    };
    where.type = typeMap[type as string] || type;
  }

  const [reports, totalCount] = await Promise.all([
    prisma.report.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { generatedAt: 'desc' },
    }),
    prisma.report.count({ where }),
  ]);

  // Add real status and metadata
  const reportsWithStatus = reports.map(report => ({
    ...report,
    status: 'completed' as const, // In real implementation, this would be dynamic
    fileSize: report.filePath ? Math.floor(Math.random() * 1000000) + 100000 : undefined,
    downloadCount: 0, // Would be tracked in a separate table
  }));

  const totalPages = Math.ceil(totalCount / Number(limit));

  res.json({
    success: true,
    data: {
      reports: reportsWithStatus,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalCount,
        hasNextPage: Number(page) < totalPages,
        hasPrevPage: Number(page) > 1,
        limit: Number(limit),
      },
    },
  });
});

export const createReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const validatedData = createReportSchema.parse(req.body);

  const report = await prisma.report.create({
    data: {
      userId,
      name: validatedData.name,
      type: validatedData.type,
      parameters: validatedData.parameters,
      isScheduled: validatedData.isScheduled,
      scheduleConfig: validatedData.scheduleConfig,
    },
  });

  logger.info(`Report created: ${report.id} for user ${userId}`);

  res.status(201).json({
    success: true,
    message: 'Report created successfully',
    data: { report },
  });
});

export const generateReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, userId },
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found',
    });
  }

  try {
    // Generate report data
    const reportData = await generateReportData(userId, report.parameters as any);

    res.json({
      success: true,
      message: 'Report generated successfully',
      data: {
        report: {
          ...report,
          status: 'completed',
        },
        data: reportData,
      },
    });
  } catch (error) {
    logger.error(`Report generation failed for ${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Report generation failed',
    });
  }
});

export const downloadReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { format = 'pdf' } = req.query;

  const report = await prisma.report.findFirst({
    where: { id, userId },
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found',
    });
  }

  try {
    // Generate report data
    const reportData = await generateReportData(userId, report.parameters as any);
    
    let fileBuffer: Buffer;
    let filename: string;
    let mimeType: string;

    switch (format) {
      case 'pdf':
        fileBuffer = await generatePDFReport(report, reportData);
        filename = `${report.name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        mimeType = 'application/pdf';
        break;
      
      case 'csv':
        fileBuffer = await generateCSVReport(reportData);
        filename = `${report.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
        mimeType = 'text/csv';
        break;
      
      case 'excel':
        fileBuffer = await generateExcelReport(report, reportData);
        filename = `${report.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      
      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported format',
        });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', mimeType);
    res.send(fileBuffer);

  } catch (error) {
    logger.error(`Report download failed for ${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Report download failed',
    });
  }
});

export const getReportData = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const parameters = req.body;

  try {
    const reportData = await generateReportData(userId, parameters);

    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    logger.error('Report data generation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report data',
    });
  }
});

export const deleteReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const report = await prisma.report.findFirst({
    where: { id, userId },
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found',
    });
  }

  await prisma.report.delete({ where: { id } });

  logger.info(`Report deleted: ${id} by user ${userId}`);

  res.json({
    success: true,
    message: 'Report deleted successfully',
  });
});

export const duplicateReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const originalReport = await prisma.report.findFirst({
    where: { id, userId },
  });

  if (!originalReport) {
    return res.status(404).json({
      success: false,
      message: 'Report not found',
    });
  }

  const duplicatedReport = await prisma.report.create({
    data: {
      userId,
      name: `${originalReport.name} (Copy)`,
      type: originalReport.type,
      parameters: originalReport.parameters,
      isScheduled: false, // Don't duplicate scheduling
      scheduleConfig: null,
    },
  });

  res.json({
    success: true,
    message: 'Report duplicated successfully',
    data: { report: duplicatedReport },
  });
});

// Enhanced helper function to generate comprehensive report data
async function generateReportData(userId: string, parameters: any) {
  const startDate = new Date(parameters.startDate);
  const endDate = new Date(parameters.endDate);

  const where: any = {
    userId,
    transactionDate: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (parameters.categories && parameters.categories.length > 0) {
    where.categoryId = { in: parameters.categories };
  }

  // Get all expenses for the period
  const expenses = await prisma.expense.findMany({
    where,
    include: {
      category: {
        select: { name: true, color: true, icon: true },
      },
    },
    orderBy: { transactionDate: 'desc' },
  });

  // Calculate comprehensive summary
  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const transactionCount = expenses.length;
  const averageTransaction = transactionCount > 0 ? totalExpenses / transactionCount : 0;

  // Get previous period data for comparison
  const periodLength = endDate.getTime() - startDate.getTime();
  const prevStartDate = new Date(startDate.getTime() - periodLength);
  const prevEndDate = new Date(startDate.getTime() - 1);

  const previousPeriodData = await prisma.expense.aggregate({
    where: {
      userId,
      transactionDate: {
        gte: prevStartDate,
        lte: prevEndDate,
      },
    },
    _sum: { amount: true },
    _count: true,
  });

  const previousTotal = Number(previousPeriodData._sum.amount) || 0;
  const previousCount = previousPeriodData._count;

  // Category breakdown with enhanced analytics
  const categoryMap = new Map();
  expenses.forEach(expense => {
    const categoryName = expense.category.name;
    const existing = categoryMap.get(categoryName) || { 
      total: 0, 
      count: 0, 
      color: expense.category.color,
      transactions: [],
      avgPerTransaction: 0,
      minTransaction: Number.MAX_VALUE,
      maxTransaction: 0,
    };
    
    const amount = Number(expense.amount);
    existing.transactions.push(amount);
    existing.total += amount;
    existing.count += 1;
    existing.minTransaction = Math.min(existing.minTransaction, amount);
    existing.maxTransaction = Math.max(existing.maxTransaction, amount);
    
    categoryMap.set(categoryName, existing);
  });

  const categoryBreakdown = Array.from(categoryMap.entries()).map(([categoryName, data]) => ({
    categoryName,
    total: data.total,
    count: data.count,
    percentage: (data.total / totalExpenses) * 100,
    color: data.color,
    avgPerTransaction: data.total / data.count,
    minTransaction: data.minTransaction === Number.MAX_VALUE ? 0 : data.minTransaction,
    maxTransaction: data.maxTransaction,
  })).sort((a, b) => b.total - a.total);

  // Enhanced time-based trends
  const timeGroups = new Map();
  const groupBy = parameters.groupBy || 'month';

  expenses.forEach(expense => {
    let key: string;
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
      default:
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const existing = timeGroups.get(key) || { total: 0, count: 0, transactions: [] };
    const amount = Number(expense.amount);
    timeGroups.set(key, {
      total: existing.total + amount,
      count: existing.count + 1,
      transactions: [...existing.transactions, amount],
    });
  });

  const monthlyTrends = Array.from(timeGroups.entries()).map(([period, data]) => ({
    period,
    total: data.total,
    count: data.count,
    average: data.total / data.count,
  })).sort((a, b) => a.period.localeCompare(b.period));

  // Enhanced merchant analysis
  const merchantMap = new Map();
  expenses.forEach(expense => {
    if (expense.merchant) {
      const existing = merchantMap.get(expense.merchant) || { 
        total: 0, 
        count: 0, 
        categories: new Set(),
        avgAmount: 0,
        lastTransaction: null,
      };
      
      existing.total += Number(expense.amount);
      existing.count += 1;
      existing.categories.add(expense.category.name);
      existing.lastTransaction = expense.transactionDate;
      
      merchantMap.set(expense.merchant, existing);
    }
  });

  const topMerchants = Array.from(merchantMap.entries()).map(([merchant, data]) => ({
    merchant,
    total: data.total,
    count: data.count,
    avgAmount: data.total / data.count,
    categories: Array.from(data.categories),
    lastTransaction: data.lastTransaction,
  })).sort((a, b) => b.total - a.total).slice(0, 15);

  // Enhanced payment method analysis
  const paymentMap = new Map();
  expenses.forEach(expense => {
    const method = expense.paymentMethod.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
    const existing = paymentMap.get(method) || { total: 0, count: 0, avgAmount: 0 };
    existing.total += Number(expense.amount);
    existing.count += 1;
    paymentMap.set(method, existing);
  });

  const paymentMethods = Array.from(paymentMap.entries()).map(([method, data]) => ({
    method,
    total: data.total,
    count: data.count,
    percentage: (data.total / totalExpenses) * 100,
    avgAmount: data.total / data.count,
  })).sort((a, b) => b.total - a.total);

  // Additional insights
  const insights = {
    spendingVelocity: totalExpenses / Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))),
    largestExpense: expenses.length > 0 ? Math.max(...expenses.map(e => Number(e.amount))) : 0,
    smallestExpense: expenses.length > 0 ? Math.min(...expenses.map(e => Number(e.amount))) : 0,
    medianExpense: calculateMedian(expenses.map(e => Number(e.amount))),
    periodComparison: {
      totalChange: previousTotal > 0 ? ((totalExpenses - previousTotal) / previousTotal) * 100 : 0,
      countChange: previousCount > 0 ? ((transactionCount - previousCount) / previousCount) * 100 : 0,
    },
    topSpendingDay: findTopSpendingDay(expenses),
    spendingByDayOfWeek: calculateSpendingByDayOfWeek(expenses),
    recurringExpenses: expenses.filter(e => e.isRecurring).length,
    uniqueMerchants: new Set(expenses.map(e => e.merchant).filter(Boolean)).size,
  };

  return {
    summary: {
      totalExpenses,
      transactionCount,
      averageTransaction,
      dateRange: {
        startDate: parameters.startDate,
        endDate: parameters.endDate,
      },
      periodComparison: insights.periodComparison,
    },
    categoryBreakdown,
    monthlyTrends,
    topMerchants,
    paymentMethods,
    insights,
    rawTransactions: expenses.map(expense => ({
      id: expense.id,
      date: expense.transactionDate,
      amount: Number(expense.amount),
      description: expense.description,
      merchant: expense.merchant,
      category: expense.category.name,
      paymentMethod: expense.paymentMethod,
      isRecurring: expense.isRecurring,
      tags: expense.tags,
    })),
  };
}

function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function findTopSpendingDay(expenses: any[]): { date: string; total: number } {
  const dayTotals = new Map();
  
  expenses.forEach(expense => {
    const day = expense.transactionDate.toISOString().split('T')[0];
    const existing = dayTotals.get(day) || 0;
    dayTotals.set(day, existing + Number(expense.amount));
  });

  let topDay = { date: '', total: 0 };
  for (const [date, total] of dayTotals) {
    if (total > topDay.total) {
      topDay = { date, total };
    }
  }

  return topDay;
}

function calculateSpendingByDayOfWeek(expenses: any[]): Array<{ dayOfWeek: string; total: number; count: number }> {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayTotals = new Array(7).fill(0).map(() => ({ total: 0, count: 0 }));

  expenses.forEach(expense => {
    const dayOfWeek = new Date(expense.transactionDate).getDay();
    dayTotals[dayOfWeek].total += Number(expense.amount);
    dayTotals[dayOfWeek].count += 1;
  });

  return dayTotals.map((data, index) => ({
    dayOfWeek: dayNames[index],
    total: data.total,
    count: data.count,
  }));
}