"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReceiptStats = exports.bulkDeleteReceipts = exports.getReceiptInfo = exports.deleteReceipt = exports.uploadReceipt = exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const cloudinary_1 = require("cloudinary");
const stream_1 = require("stream");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../utils/logger"));
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Configure multer for memory storage (since we're uploading to Cloudinary)
const storage = multer_1.default.memoryStorage();
const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and PDF files are allowed.'));
    }
};
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
});
const generateReceiptPublicId = (userId, filename) => {
    const sanitizedName = filename
        .replace(/\.[^/.]+$/, '') // Remove extension
        .replace(/\s+/g, '-') // Spaces to hyphens
        .replace(/[^a-zA-Z0-9\-_]/g, '') // Keep only safe chars
        .replace(/[-_]{2,}/g, '-') // Single separators
        .replace(/^[-_]+|[-_]+$/g, '') // Clean edges
        .slice(0, 30) || 'receipt'; // Limit + fallback
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${userId}/receipts/${timestamp}-${sanitizedName}-${random}`;
};
// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, filename, mimetype, userId) => {
    return new Promise((resolve, reject) => {
        const folder = 'fintech-receipts'; // Cloudinary folder
        const publicId = generateReceiptPublicId(userId, filename);
        // Determine resource type based on file type
        const resourceType = mimetype === 'application/pdf' ? 'raw' : 'image';
        const uploadOptions = {
            folder,
            public_id: publicId,
            resource_type: resourceType,
            // For images, enable automatic optimization
            ...(resourceType === 'image' && {
                quality: 'auto:good',
                fetch_format: 'auto',
                flags: 'progressive',
            }),
            // Add tags for better organization
            tags: ['receipt', 'expense', userId],
        };
        const uploadStream = cloudinary_1.v2.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) {
                logger_1.default.error('Cloudinary upload error:', error);
                reject(error);
            }
            else {
                resolve(result);
            }
        });
        // Convert buffer to stream and pipe to Cloudinary
        const bufferStream = new stream_1.Readable();
        bufferStream.push(buffer);
        bufferStream.push(null);
        bufferStream.pipe(uploadStream);
    });
};
exports.uploadReceipt = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded',
            });
        }
        const userId = req.user.id;
        const file = req.file;
        // Validate Cloudinary configuration
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            throw new Error('Cloudinary configuration missing');
        }
        // Upload to Cloudinary
        const result = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype, userId);
        // Log the upload
        logger_1.default.info(`Receipt uploaded to Cloudinary by user ${userId}: ${result.public_id}`);
        res.json({
            success: true,
            message: 'Receipt uploaded successfully',
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                originalName: file.originalname,
                size: file.size,
                mimetype: file.mimetype,
                format: result.format,
                width: result.width,
                height: result.height,
                // Provide different sized versions for images
                ...(result.resource_type === 'image' && {
                    thumbnailUrl: cloudinary_1.v2.url(result.public_id, {
                        width: 200,
                        height: 200,
                        crop: 'fill',
                        quality: 'auto:good',
                        fetch_format: 'auto',
                    }),
                    previewUrl: cloudinary_1.v2.url(result.public_id, {
                        width: 800,
                        height: 600,
                        crop: 'limit',
                        quality: 'auto:good',
                        fetch_format: 'auto',
                    }),
                }),
            },
        });
    }
    catch (error) {
        logger_1.default.error('Receipt upload error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload receipt',
        });
    }
});
exports.deleteReceipt = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    try {
        const { publicId } = req.params;
        const userId = req.user.id;
        // Security check: ensure public_id belongs to current user
        if (!publicId.includes(`${userId}/`)) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to delete this file',
            });
        }
        // Delete from Cloudinary
        const result = await cloudinary_1.v2.uploader.destroy(publicId);
        if (result.result === 'ok') {
            logger_1.default.info(`Receipt deleted from Cloudinary by user ${userId}: ${publicId}`);
            res.json({
                success: true,
                message: 'Receipt deleted successfully',
            });
        }
        else {
            res.status(404).json({
                success: false,
                message: 'File not found or already deleted',
            });
        }
    }
    catch (error) {
        logger_1.default.error('Receipt deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete receipt',
        });
    }
});
exports.getReceiptInfo = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    try {
        const { publicId } = req.params;
        const userId = req.user.id;
        // Security check: ensure public_id belongs to current user
        if (!publicId.includes(`${userId}/`)) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to access this file',
            });
        }
        // Get resource details from Cloudinary
        const result = await cloudinary_1.v2.api.resource(publicId);
        res.json({
            success: true,
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                format: result.format,
                size: result.bytes,
                width: result.width,
                height: result.height,
                createdAt: result.created_at,
                // Generate different sized versions for images
                ...(result.resource_type === 'image' && {
                    thumbnailUrl: cloudinary_1.v2.url(result.public_id, {
                        width: 200,
                        height: 200,
                        crop: 'fill',
                        quality: 'auto:good',
                        fetch_format: 'auto',
                    }),
                    previewUrl: cloudinary_1.v2.url(result.public_id, {
                        width: 800,
                        height: 600,
                        crop: 'limit',
                        quality: 'auto:good',
                        fetch_format: 'auto',
                    }),
                }),
            },
        });
    }
    catch (error) {
        logger_1.default.error('Receipt info retrieval error:', error);
        if (error.http_code === 404) {
            res.status(404).json({
                success: false,
                message: 'File not found',
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve receipt information',
            });
        }
    }
});
// Bulk delete receipts (useful for cleanup)
exports.bulkDeleteReceipts = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    try {
        const { publicIds } = req.body;
        const userId = req.user.id;
        if (!Array.isArray(publicIds) || publicIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No public IDs provided',
            });
        }
        // Security check: ensure all public_ids belong to current user
        const invalidIds = publicIds.filter(id => !id.includes(`${userId}/`));
        if (invalidIds.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to delete some files',
                invalidIds,
            });
        }
        // Delete multiple files from Cloudinary
        const result = await cloudinary_1.v2.api.delete_resources(publicIds);
        logger_1.default.info(`Bulk receipt deletion by user ${userId}: ${publicIds.length} files`);
        res.json({
            success: true,
            message: `${Object.keys(result.deleted).length} receipts deleted successfully`,
            data: {
                deleted: result.deleted,
                notFound: result.not_found,
            },
        });
    }
    catch (error) {
        logger_1.default.error('Bulk receipt deletion error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete receipts',
        });
    }
});
// Get user's receipt statistics
exports.getReceiptStats = (0, errorHandler_1.asyncHandler)(async (req, res) => {
    try {
        const userId = req.user.id;
        // Get user's receipts from Cloudinary
        const result = await cloudinary_1.v2.search
            .expression(`folder:fintech-receipts AND tags:${userId}`)
            .sort_by([['created_at', 'desc']])
            .max_results(500) // Adjust as needed
            .execute();
        const totalSize = result.resources.reduce((sum, resource) => sum + resource.bytes, 0);
        const imageCount = result.resources.filter((r) => r.resource_type === 'image').length;
        const pdfCount = result.resources.filter((r) => r.resource_type === 'raw').length;
        res.json({
            success: true,
            data: {
                totalFiles: result.total_count,
                totalSize,
                imageCount,
                pdfCount,
                recentUploads: result.resources.slice(0, 10).map((resource) => ({
                    publicId: resource.public_id,
                    url: resource.secure_url,
                    format: resource.format,
                    size: resource.bytes,
                    createdAt: resource.created_at,
                })),
            },
        });
    }
    catch (error) {
        logger_1.default.error('Receipt stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve receipt statistics',
        });
    }
});
//# sourceMappingURL=uploadController.js.map