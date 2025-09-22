import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { 
  upload, 
  uploadReceipt, 
  deleteReceipt, 
  getReceiptInfo,
  bulkDeleteReceipts,
  getReceiptStats
} from '../controllers/uploadController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Rate limiting for uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 uploads per hour per user (increased for Cloudinary)
  message: {
    success: false,
    message: 'Too many upload requests, please try again later',
  },
});

// Rate limiting for bulk operations
const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 bulk operations per hour
  message: {
    success: false,
    message: 'Too many bulk requests, please try again later',
  },
});

// All routes require authentication
router.use(authenticateToken);

// Receipt upload route with rate limiting
router.post('/receipt', uploadLimiter, upload.single('receipt'), uploadReceipt);

// Receipt management routes
router.get('/receipt/:publicId(*)', getReceiptInfo); // (*) allows slashes in publicId
router.delete('/receipt/:publicId(*)', deleteReceipt);

// Bulk operations
router.delete('/receipts/bulk', bulkLimiter, bulkDeleteReceipts);

// User statistics
router.get('/receipts/stats', getReceiptStats);

export default router;