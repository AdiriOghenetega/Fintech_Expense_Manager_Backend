import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../types/auth';
import { emailService } from '../services/emailService';
import logger from '../utils/logger';

const prisma = new PrismaClient();

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format').max(255, 'Email too long'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required').max(255, 'Invalid token'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

const validateTokenSchema = z.object({
  token: z.string().min(1, 'Token is required').max(255, 'Invalid token'),
});

const generateJWT = (userId: string): string => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

export const register = async (req: Request, res: Response) => {
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

    const passwordHash = await bcrypt.hash(password, 12);

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

    logger.info(`User registered: ${user.email}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user, token },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
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

export const login = async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    const user = await prisma.user.findUnique({
      where: { 
        email: email.toLowerCase(),
        isActive: true,
      },
    });

    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
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

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: userResponse, token },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
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

export const getCurrentUser = async (req: AuthRequest, res: Response) => {
  res.json({
    success: true,
    data: { user: req.user },
  });
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    
    logger.info(`Password reset requested for email: ${email}`);
    
    // Find user (but don't reveal if they exist)
    const user = await prisma.user.findUnique({
      where: { 
        email: email.toLowerCase(),
        isActive: true 
      }
    });

    // Always return success for security
    if (!user) {
      logger.info(`Password reset requested for non-existent email: ${email}`);
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
      logger.warn(`Rate limit exceeded for password reset: ${email}`);
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
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
    const emailSent = await emailService.sendPasswordResetEmail(user.email, token);

    if (emailSent) {
      logger.info(`Password reset email sent to: ${email}`);
    } else {
      logger.error(`Failed to send password reset email to: ${email}`);
    }

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    
    logger.error('Password reset request failed:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request. Please try again.',
    });
  }
};

export const validateResetToken = async (req: Request, res: Response) => {
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

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token format',
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    
    logger.error('Token validation failed:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while validating the token',
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    
    logger.info(`Password reset confirmation attempted for token: ${token.substring(0, 8)}...`);
    
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
    const passwordHash = await bcrypt.hash(newPassword, 12);

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

    logger.info(`Password successfully reset for user: ${resetRecord.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now sign in with your new password.',
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    
    logger.error('Password reset failed:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while resetting your password. Please try again.',
    });
  }
};

// Utility function for cleanup (can be called by cron job)
export const cleanupExpiredTokens = async (req: Request, res: Response) => {
  try {
    const result = await prisma.passwordReset.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true }
        ]
      }
    });

    logger.info(`Cleaned up ${result.count} expired/used password reset tokens`);

    res.status(200).json({
      success: true,
      message: `Cleaned up ${result.count} expired tokens`,
      data: { deletedCount: result.count }
    });
  } catch (error) {
    logger.error('Token cleanup failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup expired tokens',
    });
  }
};