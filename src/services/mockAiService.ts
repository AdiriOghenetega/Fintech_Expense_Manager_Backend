import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

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

class MockAIService {
  private fallbackRules: Map<string, { categoryId: string; patterns: RegExp[]; confidence: number }> = new Map();

  constructor() {
    this.initializeFallbackRules();
  }

  private async initializeFallbackRules() {
    try {
      let categories = await prisma.category.findMany();
      
      // Enhanced patterns with confidence levels for mock AI - optimized for fintech/tech companies
      const ruleDefinitions = [
        // Tech & Software-specific categories
        {
          categoryName: 'Software & SaaS',
          confidence: 0.95,
          patterns: [
            /saas|software|subscription|license|api|cloud|hosting|domain|ssl/i,
            /aws|azure|google cloud|digitalocean|heroku|vercel|netlify|cloudflare|mongodb atlas/i,
            /github|gitlab|bitbucket|jira|confluence|slack|discord|teams|zoom|notion/i,
            /figma|adobe|canva|sketch|miro|asana|trello|monday\.com|airtable/i,
            /stripe|paypal|square|plaid|twilio|sendgrid|mailchimp|hubspot|salesforce/i,
            /datadog|newrelic|sentry|splunk|auth0|okta|firebase|supabase/i,
            /openai|anthropic|cohere|huggingface|replicate|pinecone/i
          ]
        },
        {
          categoryName: 'IT Equipment & Hardware',
          confidence: 0.90,
          patterns: [
            /laptop|computer|monitor|keyboard|mouse|webcam|headphones|microphone|router|switch/i,
            /macbook|imac|dell|hp|lenovo|asus|acer|surface|ipad|tablet/i,
            /apple|microsoft|logitech|bose|sony|samsung|lg|nvidia|amd|intel/i,
            /server|rack|storage|ssd|hdd|ram|memory|processor|gpu|cpu/i,
            /cable|adapter|charger|dock|stand|case|bag|electronics/i
          ]
        },
        {
          categoryName: 'Development Tools',
          confidence: 0.93,
          patterns: [
            /ide|editor|database|devtools|framework|library|package|npm|yarn/i,
            /jetbrains|intellij|pycharm|webstorm|phpstorm|rider|vscode|sublime/i,
            /docker|kubernetes|terraform|ansible|jenkins|circleci|travis|gitlab ci/i,
            /postgresql|mysql|mongodb|redis|elasticsearch|snowflake|databricks/i,
            /postman|insomnia|swagger|rapidapi|graphql|rest|api testing/i
          ]
        },
        {
          categoryName: 'Marketing & Analytics',
          confidence: 0.88,
          patterns: [
            /marketing|analytics|seo|sem|social media|advertising|campaign|crm/i,
            /google ads|facebook ads|linkedin ads|twitter ads|tiktok ads|snapchat ads/i,
            /google analytics|mixpanel|amplitude|segment|hotjar|fullstory|intercom/i,
            /mailchimp|sendgrid|constant contact|klaviyo|marketo|pardot/i,
            /buffer|hootsuite|sprout social|later|canva|unbounce|leadpages/i
          ]
        },
        {
          categoryName: 'Security & Compliance',
          confidence: 0.92,
          patterns: [
            /security|cybersecurity|compliance|audit|penetration test|vulnerability|encryption/i,
            /ssl certificate|vpn|firewall|antivirus|malware|endpoint protection/i,
            /1password|lastpass|bitwarden|okta|auth0|duo|yubikey|rsa|crowdstrike/i,
            /soc2|gdpr|hipaa|pci|iso27001|compliance|legal|attorney|law firm/i,
            /insurance|liability|cyber insurance|e&o|professional liability/i
          ]
        },
        {
          categoryName: 'Communication & Productivity',
          confidence: 0.85,
          patterns: [
            /communication|collaboration|productivity|project management|time tracking/i,
            /slack|discord|teams|zoom|meet|webex|gotomeeting|calendly|acuity/i,
            /asana|trello|monday\.com|clickup|basecamp|wrike|smartsheet|airtable/i,
            /notion|obsidian|roam|evernote|onenote|dropbox|box|onedrive|drive/i,
            /toggl|harvest|clockify|rescuetime|timecamp|hubstaff/i
          ]
        },
        {
          categoryName: 'Business Services',
          confidence: 0.87,
          patterns: [
            /accounting|bookkeeping|payroll|hr|recruiting|legal|consulting|advisory/i,
            /quickbooks|xero|freshbooks|wave|gusto|bamboohr|workday|adp/i,
            /lawyer|attorney|accountant|cpa|consultant|advisor|coach|mentor/i,
            /bank|banking|payment processing|merchant services|fintech|financial/i,
            /incorporation|llc|trademark|patent|copyright|intellectual property/i
          ]
        },
        {
          categoryName: 'Events & Conferences',
          confidence: 0.88,
          patterns: [
            /conference|summit|meetup|workshop|training|course|certification|bootcamp/i,
            /techcrunch|sxsw|ces|aws summit|google io|apple wwdc|microsoft build/i,
            /registration|ticket|travel|hotel|flight|accommodation|venue/i,
            /networking|speaking|sponsorship|booth|exhibition|trade show/i,
            /udemy|coursera|pluralsight|skillshare|linkedin learning|masterclass/i
          ]
        },
        {
          categoryName: 'Research & Data',
          confidence: 0.90,
          patterns: [
            /market research|data|analytics|survey|research|intelligence|insights/i,
            /gartner|forrester|idc|nielsen|mckinsey|deloitte|pwc|kpmg|ey/i,
            /survey monkey|typeform|qualtrics|surveyio|google forms/i,
            /data science|machine learning|ai|artificial intelligence|ml|nlp/i,
            /dataset|api|webhook|integration|middleware|etl|pipeline/i
          ]
        },
        
        // Standard categories with tech company context
        {
          categoryName: 'Food & Dining',
          confidence: 0.85,
          patterns: [
            /restaurant|cafe|coffee|pizza|burger|food|dining|meal|eat|kitchen|bistro|grill|lunch|dinner|breakfast/i,
            /mcdonald|starbucks|subway|domino|kfc|taco bell|dunkin|chipotle|panera|olive garden/i,
            /delivery|takeout|uber eats|doordash|grubhub|postmates|seamless|caviar/i,
            /team lunch|catering|office snacks|company dinner|client dinner|business meal/i
          ]
        },
        {
          categoryName: 'Transportation',
          confidence: 0.80,
          patterns: [
            /gas|fuel|uber|lyft|taxi|metro|bus|train|parking|toll|car wash|automotive|vehicle/i,
            /shell|exxon|chevron|bp|citgo|speedway|mobil|texaco/i,
            /airport|flight|airline|rental car|car rental|business travel|mileage/i,
            /commute|rideshare|public transport|parking meter|garage|valet/i
          ]
        },
        {
          categoryName: 'Office Supplies',
          confidence: 0.82,
          patterns: [
            /office supplies|stationery|paper|pen|pencil|notebook|folder|binder/i,
            /staples|office depot|best buy|amazon business|costco business/i,
            /printer|ink|toner|copier|scanner|shredder|laminator/i,
            /desk|chair|furniture|whiteboard|easel|projector|presentation/i,
            /coffee|snacks|water|kitchen supplies|cleaning|janitorial/i
          ]
        },
        {
          categoryName: 'Shopping',
          confidence: 0.75,
          patterns: [
            /store|shop|retail|amazon|target|walmart|costco|mall|clothing|shoes|fashion|electronics/i,
            /best buy|home depot|lowes|ikea|macys|nordstrom|tj maxx|marshalls/i,
            /online|purchase|buy|order|merchandise|supplies|equipment/i
          ]
        },
        {
          categoryName: 'Entertainment',
          confidence: 0.80,
          patterns: [
            /movie|cinema|theater|netflix|spotify|gaming|concert|show|museum|entertainment/i,
            /steam|playstation|xbox|nintendo|cinema|amc|regal|imax/i,
            /ticket|event|festival|amusement|team building|company outing/i
          ]
        },
        {
          categoryName: 'Bills & Utilities',
          confidence: 0.90,
          patterns: [
            /electric|electricity|water|gas|internet|phone|cable|rent|mortgage|insurance|utility|bill/i,
            /comcast|verizon|att|sprint|tmobile|pg&e|con edison|national grid/i,
            /monthly|recurring|subscription|lease|facilities|building|office space/i
          ]
        },
        {
          categoryName: 'Healthcare',
          confidence: 0.85,
          patterns: [
            /medical|doctor|hospital|pharmacy|dentist|clinic|health|prescription|medicine/i,
            /cvs|walgreens|rite aid|kaiser|anthem|blue cross|aetna|cigna/i,
            /dental|vision|checkup|appointment|wellness|therapy|mental health/i
          ]
        },
        {
          categoryName: 'Groceries',
          confidence: 0.80,
          patterns: [
            /grocery|supermarket|safeway|kroger|whole foods|trader joe|aldi|publix/i,
            /market|fresh|organic|produce|dairy|meat|instacart|amazon fresh/i
          ]
        },
        {
          categoryName: 'Personal Care',
          confidence: 0.75,
          patterns: [
            /salon|barbershop|spa|massage|manicure|pedicure|haircut|beauty/i,
            /cosmetics|skincare|makeup|shampoo|soap|personal hygiene/i
          ]
        }
      ];

      // Create missing categories if they don't exist
      for (const rule of ruleDefinitions) {
        let category = categories.find(c => c.name === rule.categoryName);
        
        if (!category) {
          logger.info(`Creating missing category: ${rule.categoryName}`);
          try {
            category = await prisma.category.create({
              data: {
                name: rule.categoryName,
                description: `Auto-created category for ${rule.categoryName}`,
                color: this.getDefaultColorForCategory(rule.categoryName),
                icon: this.getDefaultIconForCategory(rule.categoryName),
                isDefault: false,
              }
            });
            categories.push(category);
            logger.info(`Successfully created category: ${rule.categoryName} with ID: ${category.id}`);
          } catch (error) {
            logger.error(`Failed to create category ${rule.categoryName}:`, error);
            continue;
          }
        }

        // Store the rule
        this.fallbackRules.set(category.id, {
          categoryId: category.id,
          patterns: rule.patterns,
          confidence: rule.confidence
        });
        
        logger.debug(`Initialized rule for category: ${rule.categoryName} (${category.id}) with ${rule.patterns.length} patterns`);
      }

      logger.info(`Initialized ${this.fallbackRules.size} mock AI categorization rules`);
      
      // Log all initialized categories for debugging
      logger.debug('All initialized categories:');
      for (const [categoryId, rule] of this.fallbackRules) {
        const category = categories.find(c => c.id === categoryId);
        logger.debug(`- ${category?.name || 'Unknown'} (${categoryId}): ${rule.patterns.length} patterns`);
      }
      
    } catch (error) {
      logger.error('Failed to initialize mock AI rules:', error);
    }
  }

  private getDefaultColorForCategory(categoryName: string): string {
    const colorMap: { [key: string]: string } = {
      'Software & SaaS': '#3B82F6',
      'IT Equipment & Hardware': '#6B7280',
      'Development Tools': '#10B981',
      'Marketing & Analytics': '#F59E0B',
      'Security & Compliance': '#EF4444',
      'Communication & Productivity': '#8B5CF6',
      'Business Services': '#06B6D4',
      'Events & Conferences': '#F97316',
      'Research & Data': '#84CC16',
      'Office Supplies': '#64748B',
      'Food & Dining': '#EC4899',
      'Transportation': '#14B8A6',
      'Shopping': '#A855F7',
      'Entertainment': '#F43F5E',
      'Bills & Utilities': '#059669',
      'Healthcare': '#DC2626',
      'Groceries': '#65A30D',
      'Personal Care': '#C2410C'
    };
    return colorMap[categoryName] || '#6B7280';
  }

  private getDefaultIconForCategory(categoryName: string): string {
    const iconMap: { [key: string]: string } = {
      'Software & SaaS': 'cloud',
      'IT Equipment & Hardware': 'laptop',
      'Development Tools': 'code',
      'Marketing & Analytics': 'chart-bar',
      'Security & Compliance': 'shield',
      'Communication & Productivity': 'chat',
      'Business Services': 'briefcase',
      'Events & Conferences': 'calendar',
      'Research & Data': 'database',
      'Office Supplies': 'folder',
      'Food & Dining': 'utensils',
      'Transportation': 'car',
      'Shopping': 'shopping-bag',
      'Entertainment': 'film',
      'Bills & Utilities': 'receipt',
      'Healthcare': 'heart',
      'Groceries': 'shopping-cart',
      'Personal Care': 'user'
    };
    return iconMap[categoryName] || 'folder';
  }

  async categorizeExpense(data: AIAnalysisRequest): Promise<CategorySuggestion> {
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 200));

    const searchText = `${data.description} ${data.merchant || ''}`.toLowerCase();
    
    logger.info(`Categorizing expense with search text: "${searchText}"`);
    
    // Try to match patterns with different confidence levels
    for (const [categoryId, rule] of this.fallbackRules) {
      for (let i = 0; i < rule.patterns.length; i++) {
        const pattern = rule.patterns[i];
        const match = pattern.test(searchText);
        
        logger.debug(`Testing pattern ${i + 1} for category ${categoryId}: ${pattern.source} -> ${match ? 'MATCH' : 'NO MATCH'}`);
        
        if (match) {
          // Add some randomness to make it feel more realistic
          const baseConfidence = rule.confidence;
          const randomFactor = 0.9 + (Math.random() * 0.1); // 0.9 to 1.0
          const finalConfidence = Math.min(baseConfidence * randomFactor, 0.95);

          // Get category name for logging
          const category = await prisma.category.findUnique({ where: { id: categoryId } });
          const categoryName = category?.name || 'Unknown';

          logger.info(`Mock AI categorization successful: ${categoryName} (${categoryId}) with confidence ${finalConfidence.toFixed(2)}`);
          logger.info(`Matched pattern: ${pattern.source}`);
          
          return {
            categoryId,
            confidence: Number(finalConfidence.toFixed(2)),
            reasoning: this.generateReasoning(data, pattern, categoryName)
          };
        }
      }
    }

    logger.warn(`No patterns matched for search text: "${searchText}"`);
    logger.info('Available categories and their first patterns:');
    for (const [categoryId, rule] of this.fallbackRules) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      logger.info(`- ${category?.name || 'Unknown'}: ${rule.patterns[0]?.source || 'No patterns'}`);
    }

    // Fallback to default category
    return await this.getDefaultCategory();
  }

  private generateReasoning(data: AIAnalysisRequest, matchedPattern: RegExp, categoryName: string): string {
    const description = data.description;
    const merchant = data.merchant || 'unknown merchant';
    const amount = data.amount;

    // Extract what actually matched from the pattern
    const searchText = `${description} ${merchant}`.toLowerCase();
    const matches = searchText.match(matchedPattern);
    const matchedTerm = matches ? matches[0] : 'keyword';

    const reasons = [
      `Identified "${matchedTerm}" in the description "${description}", which indicates this is a ${categoryName} expense.`,
      `The transaction with ${merchant} for $${amount} matches ${categoryName} patterns based on "${matchedTerm}".`,
      `Based on the description "${description}" and merchant "${merchant}", this appears to be a ${categoryName} expense.`,
      `The keyword "${matchedTerm}" in "${description}" strongly suggests this belongs in ${categoryName}.`,
      `Transaction pattern analysis shows "${matchedTerm}" typically indicates ${categoryName} expenses.`
    ];

    return reasons[Math.floor(Math.random() * reasons.length)];
  }

  private async getDefaultCategory(): Promise<CategorySuggestion> {
    const defaultCategory = await prisma.category.findFirst({
      where: { name: 'Other' }
    });

    if (!defaultCategory) {
      throw new Error('Default "Other" category not found in database');
    }

    return {
      categoryId: defaultCategory.id,
      confidence: 0.15,
      reasoning: 'No specific patterns matched, categorized as Other with low confidence'
    };
  }

  async learnFromCorrection(
    originalCategoryId: string,
    correctedCategoryId: string,
    expenseData: AIAnalysisRequest
  ): Promise<void> {
    // Mock learning - in real implementation, this would update ML models
    logger.info(`Mock AI learned from correction: ${originalCategoryId} -> ${correctedCategoryId}`);
    
    // Could store this data for future pattern improvements
    try {
      await prisma.aiCategoryRule.create({
        data: {
          keywords: [expenseData.description, expenseData.merchant || ''].filter(Boolean),
          patterns: [],
          categoryId: correctedCategoryId,
          confidence: 0.8,
          isActive: true,
        }
      });
    } catch (error) {
      logger.error('Failed to store mock learning data:', error);
    }
  }

  async getCategorizationStats(): Promise<{
    totalCategorized: number;
    aiCategorized: number;
    ruleBased: number;
    averageConfidence: number;
  }> {
    const stats = await prisma.expense.aggregate({
      where: {
        aiConfidence: { not: null }
      },
      _count: true,
      _avg: {
        aiConfidence: true
      }
    });

    return {
      totalCategorized: stats._count || 0,
      aiCategorized: stats._count || 0, // All are "AI" in mock
      ruleBased: 0,
      averageConfidence: Number(stats._avg.aiConfidence) || 0
    };
  }

  async testConnection(): Promise<boolean> {
    // Mock always returns true
    logger.info('Mock AI service connection test: successful');
    return true;
  }

  async verifyAvailableModels(): Promise<string[]> {
    // Return mock model list
    return ['mock-gpt-4.1-mini', 'mock-categorization-engine'];
  }

  async getBestAvailableModel(): Promise<string> {
    return 'mock-gpt-4.1-mini';
  }

  // Debug method to test pattern matching
  async testPatternMatching(searchText: string): Promise<any[]> {
    const results = [];
    const normalizedText = searchText.toLowerCase();
    
    console.log(`\n🔍 Testing pattern matching for: "${normalizedText}"\n`);
    
    for (const [categoryId, rule] of this.fallbackRules) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      const categoryName = category?.name || 'Unknown';
      
      console.log(`📂 Testing category: ${categoryName}`);
      
      for (let i = 0; i < rule.patterns.length; i++) {
        const pattern = rule.patterns[i];
        const match = pattern.test(normalizedText);
        
        console.log(`  Pattern ${i + 1}: ${pattern.source}`);
        console.log(`  Result: ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
        
        if (match) {
          const matches = normalizedText.match(pattern);
          console.log(`  Matched terms: ${matches ? matches.join(', ') : 'none'}`);
          
          results.push({
            categoryId,
            categoryName,
            pattern: pattern.source,
            confidence: rule.confidence,
            matchedTerms: matches
          });
        }
        console.log('');
      }
    }
    
    if (results.length === 0) {
      console.log('❌ No patterns matched!');
      console.log('\n📋 Available categories:');
      for (const [categoryId, rule] of this.fallbackRules) {
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        console.log(`- ${category?.name || 'Unknown'}`);
      }
    } else {
      console.log(`✅ Found ${results.length} matching pattern(s)`);
    }
    
    return results;
  }
}

export const mockAiService = new MockAIService();