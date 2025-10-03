import { BudgetPeriod } from '@prisma/client';
interface BudgetSummary {
    id: string;
    category: {
        id: string;
        name: string;
        color: string;
        icon: string;
    };
    budgetAmount: number;
    spent: number;
    remaining: number;
    percentage: number;
    period: BudgetPeriod;
    startDate: Date;
    endDate: Date;
    status: 'good' | 'caution' | 'critical' | 'exceeded';
    transactions: number;
    averageTransaction: number;
    projection: {
        estimatedTotal: number;
        daysRemaining: number;
        dailyAverage: number;
        onTrack: boolean;
    };
}
interface CreateBudgetData {
    categoryId: string;
    amount: number;
    period: BudgetPeriod;
    startDate?: Date;
}
declare class BudgetService {
    createBudget(userId: string, data: CreateBudgetData): Promise<BudgetSummary>;
    updateBudget(userId: string, budgetId: string, data: Partial<CreateBudgetData>): Promise<BudgetSummary>;
    deleteBudget(userId: string, budgetId: string): Promise<void>;
    getUserBudgets(userId: string, period?: BudgetPeriod): Promise<BudgetSummary[]>;
    getBudgetById(userId: string, budgetId: string): Promise<BudgetSummary | null>;
    private calculateBudgetSummary;
    private calculatePeriodDates;
    getBudgetAlerts(userId: string): Promise<Array<{
        budgetId: string;
        categoryName: string;
        type: 'approaching' | 'exceeded' | 'projection';
        message: string;
        severity: 'info' | 'warning' | 'error';
    }>>;
    getBudgetStats(userId: string): Promise<{
        totalBudgets: number;
        totalBudgetAmount: number;
        totalSpent: number;
        onTrackBudgets: number;
        exceededBudgets: number;
    }>;
}
export declare const budgetService: BudgetService;
export {};
//# sourceMappingURL=budgetService.d.ts.map