"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hybridAiService = void 0;
const openai_1 = __importDefault(require("openai"));
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const mockAiService_1 = require("./mockAiService");
const prisma = new client_1.PrismaClient();
class HybridAIService {
    constructor() {
        this.openai = null;
        this.useRealAI = false;
        this.quotaExhausted = false;
        if (process.env.OPENAI_API_KEY) {
            this.openai = new openai_1.default({
                apiKey: process.env.OPENAI_API_KEY,
            });
            this.useRealAI = process.env.ENABLE_AI_CATEGORIZATION === 'true';
        }
        else {
            logger_1.default.warn('OpenAI API key not provided. Using mock AI service only.');
        }
    }
    async categorizeExpense(data) {
        // If quota is exhausted or AI is disabled, use mock service
        if (this.quotaExhausted || !this.useRealAI || !this.openai) {
            logger_1.default.info('Using mock AI service for categorization');
            const result = await mockAiService_1.mockAiService.categorizeExpense(data);
            result.reasoning = `[DEMO MODE] ${result.reasoning}`;
            return result;
        }
        try {
            // Try real AI first
            const realResult = await this.categorizeWithRealAI(data);
            if (realResult) {
                return realResult;
            }
        }
        catch (error) {
            logger_1.default.error('Real AI categorization failed:', error);
            // Check if it's a quota error
            if (error.message?.includes('insufficient_quota') ||
                error.message?.includes('rate_limit') ||
                error.message?.includes('quota')) {
                this.quotaExhausted = true;
                logger_1.default.warn('OpenAI quota exhausted, switching to mock AI service for future requests');
            }
        }
        // Fallback to mock AI
        logger_1.default.info('Falling back to mock AI service');
        const mockResult = await mockAiService_1.mockAiService.categorizeExpense(data);
        mockResult.reasoning = `[DEMO MODE - Real AI unavailable] ${mockResult.reasoning}`;
        return mockResult;
    }
    async categorizeWithRealAI(data) {
        try {
            const categories = await prisma.category.findMany({
                select: { id: true, name: true, description: true }
            });
            const categoryList = categories.map(c => `${c.name}: ${c.description || ''}`).join('\n');
            const prompt = `
Analyze this expense and categorize it:

Expense Details:
- Description: "${data.description}"
- Merchant: "${data.merchant || 'Unknown'}"
- Amount: $${data.amount}
- Payment Method: ${data.paymentMethod}

Available Categories:
${categoryList}

Instructions:
1. Choose the most appropriate category from the list above
2. Provide a confidence score between 0.0 and 1.0
3. Give a brief reasoning for your choice

Respond with only a JSON object in this format:
{
  "categoryName": "exact category name from list",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}`;
            const modelName = await this.getBestAvailableModel();
            const response = await this.openai.chat.completions.create({
                model: modelName,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 200
            });
            const content = response.choices[0]?.message?.content?.trim();
            if (!content)
                throw new Error('Empty response from OpenAI');
            const aiResponse = JSON.parse(content);
            const category = categories.find(c => c.name === aiResponse.categoryName);
            if (!category) {
                throw new Error(`Category "${aiResponse.categoryName}" not found`);
            }
            logger_1.default.info(`Real AI categorization successful: ${category.name} (${aiResponse.confidence})`);
            return {
                categoryId: category.id,
                confidence: Math.min(Math.max(aiResponse.confidence, 0), 1),
                reasoning: `[REAL AI] ${aiResponse.reasoning || 'AI categorization'}`
            };
        }
        catch (error) {
            logger_1.default.error('Real AI categorization failed:', error);
            throw error;
        }
    }
    async testConnection() {
        if (this.quotaExhausted || !this.useRealAI || !this.openai) {
            return await mockAiService_1.mockAiService.testConnection();
        }
        try {
            const response = await this.openai.chat.completions.create({
                model: await this.getBestAvailableModel(),
                messages: [{ role: 'user', content: 'Test' }],
                max_tokens: 1
            });
            return !!response.choices[0]?.message?.content;
        }
        catch (error) {
            if (error.message?.includes('insufficient_quota') ||
                error.message?.includes('quota')) {
                this.quotaExhausted = true;
            }
            return await mockAiService_1.mockAiService.testConnection();
        }
    }
    async verifyAvailableModels() {
        if (this.quotaExhausted || !this.useRealAI || !this.openai) {
            return await mockAiService_1.mockAiService.verifyAvailableModels();
        }
        try {
            const modelsList = await this.openai.models.list();
            return modelsList.data
                .filter(model => model.id.includes('gpt') ||
                model.id.includes('o1') ||
                model.id.includes('o3') ||
                model.id.includes('o4'))
                .map(model => model.id)
                .sort();
        }
        catch (error) {
            if (error.message?.includes('insufficient_quota')) {
                this.quotaExhausted = true;
            }
            return await mockAiService_1.mockAiService.verifyAvailableModels();
        }
    }
    async getBestAvailableModel() {
        if (this.quotaExhausted || !this.useRealAI || !this.openai) {
            return await mockAiService_1.mockAiService.getBestAvailableModel();
        }
        const preferredModels = [
            'gpt-4.1-mini',
            'gpt-4.1-nano',
            'gpt-4o-mini',
            'gpt-4.1',
            'gpt-4o',
            'gpt-3.5-turbo'
        ];
        try {
            const availableModels = await this.verifyAvailableModels();
            for (const preferred of preferredModels) {
                if (availableModels.includes(preferred)) {
                    return preferred;
                }
            }
            const fallback = availableModels.find(model => model.includes('gpt'));
            if (fallback) {
                return fallback;
            }
        }
        catch (error) {
            logger_1.default.error('Failed to get best model:', error);
        }
        return 'gpt-4.1-mini'; // Default fallback
    }
    async learnFromCorrection(originalCategoryId, correctedCategoryId, expenseData) {
        // Always use mock service for learning (it's free)
        return await mockAiService_1.mockAiService.learnFromCorrection(originalCategoryId, correctedCategoryId, expenseData);
    }
    async getCategorizationStats() {
        return await mockAiService_1.mockAiService.getCategorizationStats();
    }
    // Get service status
    getServiceStatus() {
        return {
            mode: this.quotaExhausted ? 'mock' : (this.useRealAI ? 'hybrid' : 'mock'),
            quotaExhausted: this.quotaExhausted,
            realAIEnabled: this.useRealAI,
        };
    }
}
exports.hybridAiService = new HybridAIService();
//# sourceMappingURL=hybridAiService.js.map