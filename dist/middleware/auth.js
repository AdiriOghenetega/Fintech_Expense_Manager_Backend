"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma = new client_1.PrismaClient();
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required',
            });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const user = await prisma.user.findUnique({
            where: {
                id: decoded.userId,
                isActive: true,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                emailVerified: true,
                createdAt: true,
            },
        });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token - user not found',
            });
        }
        req.user = user;
        next();
    }
    catch (error) {
        logger_1.default.error('Authentication error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid token',
        });
    }
};
exports.authenticateToken = authenticateToken;
//# sourceMappingURL=auth.js.map