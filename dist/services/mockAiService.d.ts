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
declare class MockAIService {
    private fallbackRules;
    constructor();
    private initializeFallbackRules;
    private getDefaultColorForCategory;
    private getDefaultIconForCategory;
    categorizeExpense(data: AIAnalysisRequest): Promise<CategorySuggestion>;
    private generateReasoning;
    private getDefaultCategory;
    learnFromCorrection(originalCategoryId: string, correctedCategoryId: string, expenseData: AIAnalysisRequest): Promise<void>;
    getCategorizationStats(): Promise<{
        totalCategorized: number;
        aiCategorized: number;
        ruleBased: number;
        averageConfidence: number;
    }>;
    testConnection(): Promise<boolean>;
    verifyAvailableModels(): Promise<string[]>;
    getBestAvailableModel(): Promise<string>;
    testPatternMatching(searchText: string): Promise<any[]>;
}
export declare const mockAiService: MockAIService;
export {};
//# sourceMappingURL=mockAiService.d.ts.map