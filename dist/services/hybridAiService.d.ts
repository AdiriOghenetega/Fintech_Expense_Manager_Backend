interface CategorySuggestion {
    categoryId: string;
    confidence: number;
    reasoning: string;
}
interface AIAnalysisRequest {
    description: string;
    merchant?: string;
    amount: number;
    paymentMethod: string;
}
declare class HybridAIService {
    private openai;
    private useRealAI;
    private quotaExhausted;
    constructor();
    categorizeExpense(data: AIAnalysisRequest): Promise<CategorySuggestion>;
    private categorizeWithRealAI;
    testConnection(): Promise<boolean>;
    verifyAvailableModels(): Promise<string[]>;
    getBestAvailableModel(): Promise<string>;
    learnFromCorrection(originalCategoryId: string, correctedCategoryId: string, expenseData: AIAnalysisRequest): Promise<void>;
    getCategorizationStats(): Promise<{
        totalCategorized: number;
        aiCategorized: number;
        ruleBased: number;
        averageConfidence: number;
    }>;
    getServiceStatus(): {
        mode: 'real' | 'mock' | 'hybrid';
        quotaExhausted: boolean;
        realAIEnabled: boolean;
    };
}
export declare const hybridAiService: HybridAIService;
export {};
//# sourceMappingURL=hybridAiService.d.ts.map