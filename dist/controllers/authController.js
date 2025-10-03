"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredTokens = exports.resetPassword = exports.validateResetToken = exports.forgotPassword = exports.getCurrentUser = exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
const emailService_1 = require("../services/emailService");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma = new client_1.PrismaClient();
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    firstName: zod_1.z.string().min(1, 'First name is required'),
    lastName: zod_1.z.string().min(1, 'Last name is required'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format').max(255, 'Email too long'),
});
const resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, 'Token is required').max(255, 'Invalid token'),
    newPassword: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(/[A-Za-z]/, 'Password must contain at least one letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});
const validateTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, 'Token is required').max(255, 'Invalid token'),
});
const generateJWT = (userId) => {
    return jsonwebtoken_1.default.sign({ userId }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: process.env.JWT_EXPIRY || '7d' });
};
const register = async (req, res) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        const { email, password, firstName, lastName } = validatedData;
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists',
            });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                firstName,
                lastName,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                createdAt: true,
                emailVerified: true,
            },
        });
        const token = generateJWT(user.id);
        logger_1.default.info(`User registered: ${user.email}`);
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: { user, token },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        throw error;
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const { email, password } = validatedData;
        const user = await prisma.user.findUnique({
            where: {
                email: email.toLowerCase(),
                isActive: true,
            },
        });
        if (!user || !await bcryptjs_1.default.compare(password, user.passwordHash)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
            });
        }
        const token = generateJWT(user.id);
        const userResponse = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt,
            emailVerified: user.emailVerified,
        };
        logger_1.default.info(`User logged in: ${user.email}`);
        res.json({
            success: true,
            message: 'Login successful',
            data: { user: userResponse, token },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        throw error;
    }
};
exports.login = login;
const getCurrentUser = async (req, res) => {
    res.json({
        success: true,
        data: { user: req.user },
    });
};
exports.getCurrentUser = getCurrentUser;
const forgotPassword = async (req, res) => {
    try {
        const { email } = forgotPasswordSchema.parse(req.body);
        logger_1.default.info(`Password reset requested for email: ${email}`);
        // Find user (but don't reveal if they exist)
        const user = await prisma.user.findUnique({
            where: {
                email: email.toLowerCase(),
                isActive: true
            }
        });
        // Always return success for security
        if (!user) {
            logger_1.default.info(`Password reset requested for non-existent email: ${email}`);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.',
            });
        }
        // Rate limiting check
        const recentRequests = await prisma.passwordReset.count({
            where: {
                userId: user.id,
                createdAt: {
                    gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
                }
            }
        });
        if (recentRequests >= 3) {
            logger_1.default.warn(`Rate limit exceeded for password reset: ${email}`);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.',
            });
        }
        // Generate secure token
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        // Invalidate existing tokens and create new one
        await prisma.$transaction([
            prisma.passwordReset.updateMany({
                where: {
                    userId: user.id,
                    used: false
                },
                data: { used: true }
            }),
            prisma.passwordReset.create({
                data: {
                    userId: user.id,
                    token,
                    expiresAt,
                    used: false
                }
            })
        ]);
        // Send email
        const emailSent = await emailService_1.emailService.sendPasswordResetEmail(user.email, token);
        if (emailSent) {
            logger_1.default.info(`Password reset email sent to: ${email}`);
        }
        else {
            logger_1.default.error(`Failed to send password reset email to: ${email}`);
        }
        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.',
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format',
                errors: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        logger_1.default.error('Password reset request failed:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while processing your request. Please try again.',
        });
    }
};
exports.forgotPassword = forgotPassword;
const validateResetToken = async (req, res) => {
    try {
        const { token } = validateTokenSchema.parse(req.params);
        const resetRecord = await prisma.passwordReset.findUnique({
            where: { token },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isActive: true
                    }
                }
            }
        });
        if (!resetRecord || !resetRecord.user.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset token',
                data: { valid: false },
            });
        }
        if (resetRecord.used) {
            return res.status(400).json({
                success: false,
                message: 'Reset token has already been used',
                data: { valid: false, used: true },
            });
        }
        if (resetRecord.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Reset token has expired',
                data: { valid: false, expired: true },
            });
        }
        res.status(200).json({
            success: true,
            message: 'Token is valid',
            data: { valid: true },
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid token format',
                errors: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        logger_1.default.error('Token validation failed:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while validating the token',
        });
    }
};
exports.validateResetToken = validateResetToken;
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = resetPasswordSchema.parse(req.body);
        logger_1.default.info(`Password reset confirmation attempted for token: ${token.substring(0, 8)}...`);
        // Validate token
        const resetRecord = await prisma.passwordReset.findUnique({
            where: { token },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        isActive: true
                    }
                }
            }
        });
        if (!resetRecord || !resetRecord.user.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reset token',
            });
        }
        if (resetRecord.used) {
            return res.status(400).json({
                success: false,
                message: 'Reset token has already been used. Please request a new one.',
            });
        }
        if (resetRecord.expiresAt < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'Reset token has expired. Please request a new one.',
            });
        }
        // Hash new password and update user
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 12);
        await prisma.$transaction([
            prisma.user.update({
                where: { id: resetRecord.userId },
                data: { passwordHash }
            }),
            prisma.passwordReset.update({
                where: { token },
                data: { used: true }
            })
        ]);
        logger_1.default.info(`Password successfully reset for user: ${resetRecord.user.email}`);
        res.status(200).json({
            success: true,
            message: 'Password has been reset successfully. You can now sign in with your new password.',
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input',
                errors: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }
        logger_1.default.error('Password reset failed:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while resetting your password. Please try again.',
        });
    }
};
exports.resetPassword = resetPassword;
// Utility function for cleanup (can be called by cron job)
const cleanupExpiredTokens = async (req, res) => {
    try {
        const result = await prisma.passwordReset.deleteMany({
            where: {
                OR: [
                    { expiresAt: { lt: new Date() } },
                    { used: true }
                ]
            }
        });
        logger_1.default.info(`Cleaned up ${result.count} expired/used password reset tokens`);
        res.status(200).json({
            success: true,
            message: `Cleaned up ${result.count} expired tokens`,
            data: { deletedCount: result.count }
        });
    }
    catch (error) {
        logger_1.default.error('Token cleanup failed:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cleanup expired tokens',
        });
    }
};
exports.cleanupExpiredTokens = cleanupExpiredTokens;
//# sourceMappingURL=authController.js.map