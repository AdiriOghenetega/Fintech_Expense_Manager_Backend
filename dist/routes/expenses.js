"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const expenseController_1 = require("../controllers/expenseController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests' },
});
const bulkLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 bulk imports per hour
    message: { success: false, message: 'Too many bulk import requests' },
});
// All routes require authentication
router.use(auth_1.authenticateToken);
router.use(generalLimiter);
// Expense CRUD routes
router.get('/', expenseController_1.getExpenses);
router.post('/', expenseController_1.createExpense);
router.get('/stats', expenseController_1.getExpenseStats);
router.get('/recurring', expenseController_1.getRecurringExpenses);
router.get('/tags', expenseController_1.getExpenseTags);
router.get('/:id', expenseController_1.getExpenseById);
router.put('/:id', expenseController_1.updateExpense);
router.delete('/:id', expenseController_1.deleteExpense);
router.post('/:id/categorize', expenseController_1.categorizeExpense);
// Bulk operations
router.post('/bulk/import', bulkLimiter, expenseController_1.bulkImport);
// Category routes
router.get('/categories/list', expenseController_1.getCategories);
exports.default = router;
//# sourceMappingURL=expenses.js.map