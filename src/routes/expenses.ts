import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  categorizeExpense,
  getCategories,
  bulkImport,
  getExpenseById,
  getExpenseStats,
  getRecurringExpenses,
  getExpenseTags,
} from '../controllers/expenseController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests' },
});

const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 bulk imports per hour
  message: { success: false, message: 'Too many bulk import requests' },
});

// All routes require authentication
router.use(authenticateToken);
router.use(generalLimiter);

// Expense CRUD routes
router.get('/', getExpenses);
router.post('/', createExpense);
router.get('/stats', getExpenseStats);
router.get('/recurring', getRecurringExpenses);
router.get('/tags', getExpenseTags);
router.get('/:id', getExpenseById);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);
router.post('/:id/categorize', categorizeExpense);

// Bulk operations
router.post('/bulk/import', bulkLimiter, bulkImport);

// Category routes
router.get('/categories/list', getCategories);

export default router;