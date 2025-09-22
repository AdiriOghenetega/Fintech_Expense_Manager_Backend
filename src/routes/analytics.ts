import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getOverview,
  getTrends,
  getCategoryAnalysis,
  getBudgetPerformance,
  getSpendingInsights,
} from '../controllers/analyticsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 analytics requests per windowMs
  message: {
    success: false,
    message: 'Too many analytics requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// All routes require authentication
router.use(authenticateToken);
router.use(analyticsLimiter);

// Analytics endpoints
router.get('/overview', getOverview);
router.get('/trends', getTrends);
router.get('/categories', getCategoryAnalysis);
router.get('/budget-performance', getBudgetPerformance);
router.get('/insights', getSpendingInsights);

export default router;