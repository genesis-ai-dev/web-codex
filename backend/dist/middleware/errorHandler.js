"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.asyncHandler = asyncHandler;
const errors_1 = require("../utils/errors");
const logger_1 = require("../config/logger");
const config_1 = require("../config");
function errorHandler(err, req, res, next) {
    // Log error
    logger_1.logger.error('Request error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
    });
    // Handle operational errors
    if (err instanceof errors_1.AppError) {
        res.status(err.statusCode).json({
            message: err.message,
            code: err.code,
            ...(err.details && { details: err.details }),
        });
        return;
    }
    // Handle Kubernetes client errors
    if (err.name === 'HttpError' && 'statusCode' in err) {
        const k8sError = err;
        res.status(500).json({
            message: 'Kubernetes operation failed',
            code: 'KUBERNETES_ERROR',
            details: config_1.config.isDevelopment ? k8sError.body : undefined,
        });
        return;
    }
    // Handle AWS SDK errors
    if (err.name === 'ResourceNotFound' || err.name === 'ValidationException') {
        res.status(400).json({
            message: err.message,
            code: 'AWS_ERROR',
        });
        return;
    }
    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        res.status(401).json({
            message: 'Invalid or expired token',
            code: 'INVALID_TOKEN',
        });
        return;
    }
    // Handle validation errors from Joi or other validators
    if (err.name === 'ValidationError' && 'details' in err) {
        res.status(400).json({
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: err.details,
        });
        return;
    }
    // Handle MongoDB/Database errors
    if (err.name === 'MongoError' || err.name === 'CastError') {
        res.status(500).json({
            message: 'Database operation failed',
            code: 'DATABASE_ERROR',
        });
        return;
    }
    // Handle rate limiting errors
    if (err.message && err.message.includes('Too many requests')) {
        res.status(429).json({
            message: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
    }
    // Handle syntax errors (malformed JSON, etc.)
    if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({
            message: 'Invalid request format',
            code: 'SYNTAX_ERROR',
        });
        return;
    }
    // Handle unknown errors
    logger_1.logger.error('Unknown error:', err);
    res.status(500).json({
        message: config_1.config.isDevelopment ? err.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
        ...(config_1.config.isDevelopment && { stack: err.stack }),
    });
}
// Async error wrapper
function asyncHandler(fn) {
    return (...args) => {
        const result = fn(...args);
        if (result && typeof result.catch === 'function') {
            return result.catch(args[2]); // args[2] should be next function
        }
        return result;
    };
}
