interface ReportData {
    summary: {
        totalExpenses: number;
        transactionCount: number;
        averageTransaction: number;
        dateRange: {
            startDate: string;
            endDate: string;
        };
        periodComparison?: {
            totalChange: number;
            countChange: number;
        };
    };
    categoryBreakdown: Array<{
        categoryName: string;
        total: number;
        count: number;
        percentage: number;
        color: string;
    }>;
    monthlyTrends: Array<{
        period: string;
        total: number;
        count: number;
        average: number;
    }>;
    topMerchants: Array<{
        merchant: string;
        total: number;
        count: number;
    }>;
    paymentMethods: Array<{
        method: string;
        total: number;
        count: number;
        percentage: number;
    }>;
    rawTransactions: Array<{
        id: string;
        date: Date;
        amount: number;
        description: string;
        merchant?: string;
        category: string;
        paymentMethod: string;
    }>;
}
export declare function generatePDFReport(report: any, data: ReportData): Promise<Buffer>;
export declare function generateCSVReport(data: ReportData): Promise<Buffer>;
export declare function generateExcelReport(report: any, data: ReportData): Promise<Buffer>;
export {};
//# sourceMappingURL=reportGenerationService.d.ts.map