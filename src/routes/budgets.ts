import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetById,
  getBudgetAlerts,
  getBudgetStats,
  getBudgetPerformance,
} from '../controllers/budgetController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const budgetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: 'Too many budget requests' },
});

router.use(authenticateToken);
router.use(budgetLimiter);

router.get('/', getBudgets);
router.post('/', createBudget);
router.get('/alerts', getBudgetAlerts);
router.get('/stats', getBudgetStats);
router.get('/performance', getBudgetPerformance);
router.get('/:id', getBudgetById);
router.put('/:id', updateBudget);
router.delete('/:id', deleteBudget);

export default router;