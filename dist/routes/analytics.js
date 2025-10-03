"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const analyticsController_1 = require("../controllers/analyticsController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const analyticsLimiter = (0, express_rate_limit_1.default)({
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
router.use(auth_1.authenticateToken);
router.use(analyticsLimiter);
// Analytics endpoints
router.get('/overview', analyticsController_1.getOverview);
router.get('/trends', analyticsController_1.getTrends);
router.get('/categories', analyticsController_1.getCategoryAnalysis);
router.get('/budget-performance', analyticsController_1.getBudgetPerformance);
router.get('/insights', analyticsController_1.getSpendingInsights);
exports.default = router;
//# sourceMappingURL=analytics.js.map