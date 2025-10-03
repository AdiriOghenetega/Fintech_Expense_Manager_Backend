"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Rate limiters
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
const passwordResetLimiter = (0, express_rate_limit_1.default)({
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
router.post('/register', authLimiter, authController_1.register);
router.post('/login', authLimiter, authController_1.login);
router.get('/me', auth_1.authenticateToken, authController_1.getCurrentUser);
// Password reset routes
router.post('/forgot-password', passwordResetLimiter, authController_1.forgotPassword);
router.get('/validate-reset-token/:token', authController_1.validateResetToken);
router.post('/reset-password', passwordResetLimiter, authController_1.resetPassword);
// Admin/utility routes (require authentication)
router.post('/cleanup-tokens', auth_1.authenticateToken, authController_1.cleanupExpiredTokens);
exports.default = router;
//# sourceMappingURL=auth.js.map