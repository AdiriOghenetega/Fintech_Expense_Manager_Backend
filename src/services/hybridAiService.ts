import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { mockAiService } from './mockAiService';

const prisma = new PrismaClient();

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

class HybridAIService {
  private openai: OpenAI | null = null;
  private useRealAI: boolean = false;
  private quotaExhausted: boolean = false;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.useRealAI = process.env.ENABLE_AI_CATEGORIZATION === 'true';
    } else {
      logger.warn('OpenAI API key not provided. Using mock AI service only.');
    }
  }

  async categorizeExpense(data: AIAnalysisRequest): Promise<CategorySuggestion> {
    // If quota is exhausted or AI is disabled, use mock service
    if (this.quotaExhausted || !this.useRealAI || !this.openai) {
      logger.info('Using mock AI service for categorization');
      const result = await mockAiService.categorizeExpense(data);
      result.reasoning = `[DEMO MODE] ${result.reasoning}`;
      return result;
    }

    try {
      // Try real AI first
      const realResult = await this.categorizeWithRealAI(data);
      if (realResult) {
        return realResult;
      }
    } catch (error) {
      logger.error('Real AI categorization failed:', error);
      
      // Check if it's a quota error
      if (error.message?.includes('insufficient_quota') || 
          error.message?.includes('rate_limit') ||
          error.message?.includes('quota')) {
        this.quotaExhausted = true;
        logger.warn('OpenAI quota exhausted, switching to mock AI service for future requests');
      }
    }

    // Fallback to mock AI
    logger.info('Falling back to mock AI service');
    const mockResult = await mockAiService.categorizeExpense(data);
    mockResult.reasoning = `[DEMO MODE - Real AI unavailable] ${mockResult.reasoning}`;
    return mockResult;
  }

  private async categorizeWithRealAI(data: AIAnalysisRequest): Promise<CategorySuggestion | null> {
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
      
      const response = await this.openai!.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('Empty response from OpenAI');

      const aiResponse = JSON.parse(content);
      
      const category = categories.find(c => c.name === aiResponse.categoryName);
      if (!category) {
        throw new Error(`Category "${aiResponse.categoryName}" not found`);
      }

      logger.info(`Real AI categorization successful: ${category.name} (${aiResponse.confidence})`);

      return {
        categoryId: category.id,
        confidence: Math.min(Math.max(aiResponse.confidence, 0), 1),
        reasoning: `[REAL AI] ${aiResponse.reasoning || 'AI categorization'}`
      };

    } catch (error) {
      logger.error('Real AI categorization failed:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    if (this.quotaExhausted || !this.useRealAI || !this.openai) {
      return await mockAiService.testConnection();
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: await this.getBestAvailableModel(),
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1
      });

      return !!response.choices[0]?.message?.content;
    } catch (error) {
      if (error.message?.includes('insufficient_quota') || 
          error.message?.includes('quota')) {
        this.quotaExhausted = true;
      }
      return await mockAiService.testConnection();
    }
  }

  async verifyAvailableModels(): Promise<string[]> {
    if (this.quotaExhausted || !this.useRealAI || !this.openai) {
      return await mockAiService.verifyAvailableModels();
    }

    try {
      const modelsList = await this.openai.models.list();
      return modelsList.data
        .filter(model => 
          model.id.includes('gpt') || 
          model.id.includes('o1') || 
          model.id.includes('o3') ||
          model.id.includes('o4')
        )
        .map(model => model.id)
        .sort();
    } catch (error) {
      if (error.message?.includes('insufficient_quota')) {
        this.quotaExhausted = true;
      }
      return await mockAiService.verifyAvailableModels();
    }
  }

  async getBestAvailableModel(): Promise<string> {
    if (this.quotaExhausted || !this.useRealAI || !this.openai) {
      return await mockAiService.getBestAvailableModel();
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
    } catch (error) {
      logger.error('Failed to get best model:', error);
    }

    return 'gpt-4.1-mini'; // Default fallback
  }

  async learnFromCorrection(
    originalCategoryId: string,
    correctedCategoryId: string,
    expenseData: AIAnalysisRequest
  ): Promise<void> {
    // Always use mock service for learning (it's free)
    return await mockAiService.learnFromCorrection(originalCategoryId, correctedCategoryId, expenseData);
  }

  async getCategorizationStats(): Promise<{
    totalCategorized: number;
    aiCategorized: number;
    ruleBased: number;
    averageConfidence: number;
  }> {
    return await mockAiService.getCategorizationStats();
  }

  // Get service status
  getServiceStatus(): {
    mode: 'real' | 'mock' | 'hybrid';
    quotaExhausted: boolean;
    realAIEnabled: boolean;
  } {
    return {
      mode: this.quotaExhausted ? 'mock' : (this.useRealAI ? 'hybrid' : 'mock'),
      quotaExhausted: this.quotaExhausted,
      realAIEnabled: this.useRealAI,
    };
  }
}

export const hybridAiService = new HybridAIService();