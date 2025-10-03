"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const reportController_1 = require("../controllers/reportController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const reportsLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { success: false, message: 'Too many report requests' },
});
const downloadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 downloads per hour
    message: { success: false, message: 'Too many download requests' },
});
router.use(auth_1.authenticateToken);
router.use(reportsLimiter);
router.get('/', reportController_1.getReports);
router.post('/', reportController_1.createReport);
router.post('/preview', reportController_1.getReportData);
router.post('/:id/generate', reportController_1.generateReport);
router.post('/:id/duplicate', reportController_1.duplicateReport);
router.get('/:id/download', downloadLimiter, reportController_1.downloadReport);
router.delete('/:id', reportController_1.deleteReport);
exports.default = router;
//# sourceMappingURL=reports.js.map