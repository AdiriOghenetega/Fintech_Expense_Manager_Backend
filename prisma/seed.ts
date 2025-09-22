import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create default categories with proper icons and colors
  const categories = [
    { 
      name: 'Food & Dining', 
      description: 'Restaurants, groceries, and food delivery', 
      color: '#10B981', 
      icon: 'utensils', 
      isDefault: true 
    },
    { 
      name: 'Transportation', 
      description: 'Gas, rideshares, public transport, car maintenance', 
      color: '#3B82F6', 
      icon: 'car', 
      isDefault: true 
    },
    { 
      name: 'Shopping', 
      description: 'Clothing, electronics, retail purchases', 
      color: '#8B5CF6', 
      icon: 'shopping-bag', 
      isDefault: true 
    },
    { 
      name: 'Entertainment', 
      description: 'Movies, games, subscriptions, events', 
      color: '#F59E0B', 
      icon: 'film', 
      isDefault: true 
    },
    { 
      name: 'Bills & Utilities', 
      description: 'Rent, electricity, internet, phone bills', 
      color: '#EF4444', 
      icon: 'receipt', 
      isDefault: true 
    },
    { 
      name: 'Healthcare', 
      description: 'Medical expenses, pharmacy, insurance', 
      color: '#06B6D4', 
      icon: 'heart', 
      isDefault: true 
    },
    { 
      name: 'Travel', 
      description: 'Hotels, flights, vacation expenses', 
      color: '#84CC16', 
      icon: 'plane', 
      isDefault: true 
    },
    { 
      name: 'Education', 
      description: 'Courses, books, tuition, learning materials', 
      color: '#6366F1', 
      icon: 'book', 
      isDefault: true 
    },
    { 
      name: 'Personal Care', 
      description: 'Haircuts, cosmetics, gym membership', 
      color: '#EC4899', 
      icon: 'user', 
      isDefault: true 
    },
    { 
      name: 'Home & Garden', 
      description: 'Furniture, home improvement, gardening', 
      color: '#F97316', 
      icon: 'home', 
      isDefault: true 
    },
    { 
      name: 'Business', 
      description: 'Office supplies, business meals, equipment', 
      color: '#64748B', 
      icon: 'briefcase', 
      isDefault: true 
    },
    { 
      name: 'Other', 
      description: 'Miscellaneous expenses', 
      color: '#6B7280', 
      icon: 'more-horizontal', 
      isDefault: true 
    },
  ];

  console.log('Creating default categories...');
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {
        description: category.description,
        color: category.color,
        icon: category.icon,
      },
      create: category,
    });
  }

  // Create demo user with more realistic data
  const hashedPassword = await bcrypt.hash('demo123456', 12);
  
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@fintech.com' },
    update: {},
    create: {
      email: 'demo@fintech.com',
      passwordHash: hashedPassword,
      firstName: 'Demo',
      lastName: 'User',
      emailVerified: true,
    },
  });

  console.log('Creating AI categorization rules...');
  
  // Create AI categorization rules for better automatic categorization
  const categoryRules = [
    {
      categoryName: 'Food & Dining',
      keywords: ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'food', 'dining', 'meal', 'eat', 'kitchen', 'bistro', 'grill', 'lunch', 'dinner', 'breakfast'],
      patterns: ['mcdonald', 'starbucks', 'subway', 'domino', 'kfc', 'taco bell', 'dunkin', 'chipotle', 'panera']
    },
    {
      categoryName: 'Transportation',
      keywords: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'metro', 'bus', 'train', 'parking', 'toll', 'car wash', 'auto', 'vehicle'],
      patterns: ['shell', 'exxon', 'chevron', 'bp', 'citgo', 'speedway', 'mobil', '76']
    },
    {
      categoryName: 'Shopping',
      keywords: ['store', 'shop', 'retail', 'amazon', 'target', 'walmart', 'costco', 'mall', 'clothing', 'shoes', 'electronics'],
      patterns: ['best buy', 'home depot', 'lowes', 'ikea', 'macys', 'nordstrom', 'kohls']
    },
    {
      categoryName: 'Entertainment',
      keywords: ['movie', 'cinema', 'theater', 'netflix', 'spotify', 'gaming', 'concert', 'show', 'museum', 'entertainment'],
      patterns: ['steam', 'playstation', 'xbox', 'amc', 'regal', 'disney', 'hulu']
    },
    {
      categoryName: 'Bills & Utilities',
      keywords: ['electric', 'water', 'gas', 'internet', 'phone', 'cable', 'rent', 'mortgage', 'insurance', 'utility', 'bill'],
      patterns: ['comcast', 'verizon', 'att', 'sprint', 'tmobile', 'pg&e', 'edison']
    },
    {
      categoryName: 'Healthcare',
      keywords: ['medical', 'doctor', 'hospital', 'pharmacy', 'dentist', 'clinic', 'health', 'medicine', 'prescription'],
      patterns: ['cvs', 'walgreens', 'rite aid', 'kaiser', 'anthem']
    },
  ];

  // Clear existing AI rules to avoid duplicates on re-seeding
  await prisma.aiCategoryRule.deleteMany({});

  for (const rule of categoryRules) {
    const category = await prisma.category.findFirst({
      where: { name: rule.categoryName }
    });

    if (category) {
      await prisma.aiCategoryRule.create({
        data: {
          categoryId: category.id,
          keywords: rule.keywords,
          patterns: rule.patterns,
          confidence: 0.8,
          isActive: true,
        },
      });
    }
  }

  // Create sample expenses for the demo user (last 3 months)
  console.log('Creating sample expenses...');
  
  const foodCategory = await prisma.category.findFirst({ where: { name: 'Food & Dining' } });
  const transportCategory = await prisma.category.findFirst({ where: { name: 'Transportation' } });
  const shoppingCategory = await prisma.category.findFirst({ where: { name: 'Shopping' } });
  const entertainmentCategory = await prisma.category.findFirst({ where: { name: 'Entertainment' } });
  const billsCategory = await prisma.category.findFirst({ where: { name: 'Bills & Utilities' } });

  const sampleExpenses = [
    // Food & Dining
    { amount: 45.67, description: 'Dinner at Italian Bistro', merchant: 'Bella Vista Restaurant', categoryId: foodCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 2 },
    { amount: 12.50, description: 'Coffee and pastry', merchant: 'Starbucks', categoryId: foodCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 5 },
    { amount: 85.43, description: 'Weekly grocery shopping', merchant: 'Whole Foods Market', categoryId: foodCategory?.id, paymentMethod: 'DEBIT_CARD', daysAgo: 7 },
    { amount: 28.90, description: 'Lunch with colleagues', merchant: 'Chipotle Mexican Grill', categoryId: foodCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 10 },
    { amount: 156.78, description: 'Family dinner', merchant: 'The Cheesecake Factory', categoryId: foodCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 15 },
    
    // Transportation
    { amount: 55.20, description: 'Gas fill-up', merchant: 'Shell Gas Station', categoryId: transportCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 3 },
    { amount: 18.75, description: 'Uber ride to airport', merchant: 'Uber', categoryId: transportCategory?.id, paymentMethod: 'DIGITAL_WALLET', daysAgo: 8 },
    { amount: 65.00, description: 'Monthly parking pass', merchant: 'City Parking Authority', categoryId: transportCategory?.id, paymentMethod: 'BANK_TRANSFER', daysAgo: 12 },
    { amount: 42.30, description: 'Gas station', merchant: 'Chevron', categoryId: transportCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 18 },
    
    // Shopping
    { amount: 234.56, description: 'New laptop accessories', merchant: 'Best Buy', categoryId: shoppingCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 6 },
    { amount: 89.99, description: 'Winter jacket', merchant: 'REI Co-op', categoryId: shoppingCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 14 },
    { amount: 125.00, description: 'Home office supplies', merchant: 'Amazon', categoryId: shoppingCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 20 },
    { amount: 67.43, description: 'Household items', merchant: 'Target', categoryId: shoppingCategory?.id, paymentMethod: 'DEBIT_CARD', daysAgo: 25 },
    
    // Entertainment
    { amount: 24.99, description: 'Netflix subscription', merchant: 'Netflix', categoryId: entertainmentCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 1, isRecurring: true },
    { amount: 15.50, description: 'Movie tickets', merchant: 'AMC Theaters', categoryId: entertainmentCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 9 },
    { amount: 59.99, description: 'Concert tickets', merchant: 'Ticketmaster', categoryId: entertainmentCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 16 },
    { amount: 9.99, description: 'Spotify Premium', merchant: 'Spotify', categoryId: entertainmentCategory?.id, paymentMethod: 'CREDIT_CARD', daysAgo: 4, isRecurring: true },
    
    // Bills & Utilities
    { amount: 145.67, description: 'Electricity bill', merchant: 'Pacific Gas & Electric', categoryId: billsCategory?.id, paymentMethod: 'BANK_TRANSFER', daysAgo: 5, isRecurring: true },
    { amount: 89.99, description: 'Internet service', merchant: 'Comcast Xfinity', categoryId: billsCategory?.id, paymentMethod: 'BANK_TRANSFER', daysAgo: 11, isRecurring: true },
    { amount: 1250.00, description: 'Monthly rent', merchant: 'Property Management Co', categoryId: billsCategory?.id, paymentMethod: 'BANK_TRANSFER', daysAgo: 30, isRecurring: true },
    { amount: 67.45, description: 'Phone bill', merchant: 'Verizon Wireless', categoryId: billsCategory?.id, paymentMethod: 'BANK_TRANSFER', daysAgo: 13, isRecurring: true },
  ];

  // Clear existing expenses for demo user to avoid duplicates on re-seeding
  await prisma.expense.deleteMany({
    where: { userId: demoUser.id }
  });

  // Add expenses with realistic dates
  for (const expense of sampleExpenses) {
    const transactionDate = new Date();
    transactionDate.setDate(transactionDate.getDate() - expense.daysAgo);

    await prisma.expense.create({
      data: {
        userId: demoUser.id,
        categoryId: expense.categoryId!,
        amount: expense.amount,
        description: expense.description,
        merchant: expense.merchant,
        paymentMethod: expense.paymentMethod as any,
        transactionDate,
        isRecurring: expense.isRecurring || false,
        tags: [],
        aiConfidence: Math.random() > 0.3 ? 0.85 + Math.random() * 0.14 : null, // Some AI categorized
      },
    });
  }

  // Create sample budgets for demo user
  console.log('Creating sample budgets...');
  
  const currentDate = new Date();
  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const budgets = [
    { categoryId: foodCategory?.id, amount: 500.00, period: 'MONTHLY' },
    { categoryId: transportCategory?.id, amount: 200.00, period: 'MONTHLY' },
    { categoryId: shoppingCategory?.id, amount: 300.00, period: 'MONTHLY' },
    { categoryId: entertainmentCategory?.id, amount: 150.00, period: 'MONTHLY' },
    { categoryId: billsCategory?.id, amount: 1800.00, period: 'MONTHLY' },
  ];

  // Clear existing budgets for demo user to avoid duplicates on re-seeding
  await prisma.budget.deleteMany({
    where: { userId: demoUser.id }
  });

  for (const budget of budgets) {
    if (budget.categoryId) {
      await prisma.budget.create({
        data: {
          userId: demoUser.id,
          categoryId: budget.categoryId,
          amount: budget.amount,
          period: budget.period as any,
          startDate: startOfMonth,
          endDate: endOfMonth,
          isActive: true,
        },
      });
    }
  }

  // Create a sample report
  console.log('Creating sample report...');
  
  // Clear existing reports for demo user to avoid duplicates on re-seeding
  await prisma.report.deleteMany({
    where: { userId: demoUser.id }
  });

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const startOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
  const endOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

  await prisma.report.create({
    data: {
      userId: demoUser.id,
      name: `Monthly Report - ${lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      type: 'MONTHLY',
      parameters: {
        startDate: startOfLastMonth.toISOString(),
        endDate: endOfLastMonth.toISOString(),
        includeCharts: true,
        groupBy: 'category',
      },
      isScheduled: false,
    },
  });

  console.log('Seed completed successfully!');
  console.log('');
  console.log('='.repeat(50));
  console.log('Demo Account Details:');
  console.log('Email: demo@fintech.com');
  console.log('Password: demo123456');
  console.log('='.repeat(50));
  console.log('');
  console.log('Created:');
  console.log(`- ${categories.length} default categories`);
  console.log(`- ${categoryRules.length} AI categorization rules`);
  console.log(`- ${sampleExpenses.length} sample expenses`);
  console.log(`- ${budgets.length} sample budgets`);
  console.log('- 1 sample report');
  console.log('');
  console.log('Your fintech application is ready for production use!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });