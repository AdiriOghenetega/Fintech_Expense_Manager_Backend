interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}
interface BudgetAlert {
    categoryName: string;
    budgetAmount: number;
    spent: number;
    percentage: number;
}
declare class EmailService {
    private transporter;
    constructor();
    private initializeTransporter;
    sendEmail(options: EmailOptions): Promise<boolean>;
    sendWelcomeEmail(userEmail: string, userName: string): Promise<boolean>;
    sendBudgetAlert(userEmail: string, userName: string, alert: BudgetAlert): Promise<boolean>;
    sendMonthlyReport(userEmail: string, userName: string, reportData: {
        totalSpent: number;
        transactionCount: number;
        topCategory: string;
        reportUrl?: string;
    }): Promise<boolean>;
    sendPasswordResetEmail(userEmail: string, resetToken: string): Promise<boolean>;
    private generateWelcomeEmailHTML;
    private generateBudgetAlertHTML;
    private generateMonthlyReportHTML;
    private generatePasswordResetHTML;
    private htmlToText;
}
export declare const emailService: EmailService;
export {};
//# sourceMappingURL=emailService.d.ts.map