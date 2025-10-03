"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const logger_1 = __importDefault(require("../utils/logger"));
const errorHandler = (error, req, res, next) => {
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    let errors = [];
    logger_1.default.error('Error occurred:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
    });
    if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        statusCode = 400;
        switch (error.code) {
            case 'P2002':
                message = 'A record with this information already exists';
                break;
            case 'P2025':
                statusCode = 404;
                message = 'Record not found';
                break;
            default:
                message = 'Database operation failed';
        }
    }
    if (error instanceof zod_1.ZodError) {
        statusCode = 400;
        message = 'Validation error';
        errors = error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
        }));
    }
    const response = {
        success: false,
        message,
    };
    if (errors.length > 0) {
        response.errors = errors;
    }
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map