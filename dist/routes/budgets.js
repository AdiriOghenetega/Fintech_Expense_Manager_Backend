"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const budgetController_1 = require("../controllers/budgetController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const budgetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { success: false, message: 'Too many budget requests' },
});
router.use(auth_1.authenticateToken);
router.use(budgetLimiter);
router.get('/', budgetController_1.getBudgets);
router.post('/', budgetController_1.createBudget);
router.get('/alerts', budgetController_1.getBudgetAlerts);
router.get('/stats', budgetController_1.getBudgetStats);
router.get('/performance', budgetController_1.getBudgetPerformance);
router.get('/:id', budgetController_1.getBudgetById);
router.put('/:id', budgetController_1.updateBudget);
router.delete('/:id', budgetController_1.deleteBudget);
exports.default = router;
//# sourceMappingURL=budgets.js.map