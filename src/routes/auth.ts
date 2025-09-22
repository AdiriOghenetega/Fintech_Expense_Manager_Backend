import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { 
  register, 
  login, 
  getCurrentUser,
  forgotPassword,
  validateResetToken,
  resetPassword,
  cleanupExpiredTokens
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 password reset requests per hour per IP
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication routes
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', authenticateToken, getCurrentUser);

// Password reset routes
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.get('/validate-reset-token/:token', validateResetToken);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Admin/utility routes (require authentication)
router.post('/cleanup-tokens', authenticateToken, cleanupExpiredTokens);

export default router;