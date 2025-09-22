import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getReports,
  createReport,
  generateReport,
  getReportData,
  deleteReport,
  downloadReport,
  duplicateReport,
} from '../controllers/reportController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

const reportsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many report requests' },
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 downloads per hour
  message: { success: false, message: 'Too many download requests' },
});

router.use(authenticateToken);
router.use(reportsLimiter);

router.get('/', getReports);
router.post('/', createReport);
router.post('/preview', getReportData);
router.post('/:id/generate', generateReport);
router.post('/:id/duplicate', duplicateReport);
router.get('/:id/download', downloadLimiter, downloadReport);
router.delete('/:id', deleteReport);

export default router;