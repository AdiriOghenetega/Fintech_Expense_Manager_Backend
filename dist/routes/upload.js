"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const uploadController_1 = require("../controllers/uploadController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Rate limiting for uploads
const uploadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 uploads per hour per user (increased for Cloudinary)
    message: {
        success: false,
        message: 'Too many upload requests, please try again later',
    },
});
// Rate limiting for bulk operations
const bulkLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 bulk operations per hour
    message: {
        success: false,
        message: 'Too many bulk requests, please try again later',
    },
});
// All routes require authentication
router.use(auth_1.authenticateToken);
// Receipt upload route with rate limiting
router.post('/receipt', uploadLimiter, uploadController_1.upload.single('receipt'), uploadController_1.uploadReceipt);
// Receipt management routes
router.get('/receipt/:publicId(*)', uploadController_1.getReceiptInfo); // (*) allows slashes in publicId
router.delete('/receipt/:publicId(*)', uploadController_1.deleteReceipt);
// Bulk operations
router.delete('/receipts/bulk', bulkLimiter, uploadController_1.bulkDeleteReceipts);
// User statistics
router.get('/receipts/stats', uploadController_1.getReceiptStats);
exports.default = router;
//# sourceMappingURL=upload.js.map