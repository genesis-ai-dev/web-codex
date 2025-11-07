"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.operationRateLimits = exports.authRateLimit = exports.adminRateLimit = exports.workspaceRateLimit = exports.standardRateLimit = void 0;
exports.createUserRateLimit = createUserRateLimit;
exports.createNamespaceRateLimit = createNamespaceRateLimit;
exports.bypassRateLimit = bypassRateLimit;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("../config");
// Standard rate limit
exports.standardRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimitWindowMs,
    max: config_1.config.rateLimitMaxRequests,
    message: {
        error: 'Too many requests from this IP, please try again later',
        code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use IP address as key for unauthenticated requests
        return req.ip;
    },
});
// Workspace-specific rate limit (more restrictive)
exports.workspaceRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimitWindowMs,
    max: config_1.config.rateLimitWorkspaceMax,
    message: {
        error: 'Too many workspace operations, please try again later',
        code: 'WORKSPACE_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use user ID + namespace for workspace operations
        const userId = req.user?.id || req.ip;
        const namespace = req.params.groupId || req.body.groupId || 'default';
        return `workspace:${userId}:${namespace}`;
    },
    skip: (req) => {
        // Skip rate limiting for admins
        return req.user?.isAdmin || false;
    },
});
// Admin rate limit (moderate restrictions)
exports.adminRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimitWindowMs,
    max: 50, // More permissive for admin operations
    message: {
        error: 'Too many admin operations, please try again later',
        code: 'ADMIN_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return `admin:${req.user?.id || req.ip}`;
    },
});
// Authentication rate limit (stricter to prevent brute force)
exports.authRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Very strict for auth attempts
    message: {
        error: 'Too many authentication attempts, please try again later',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Use IP for auth attempts
        return `auth:${req.ip}`;
    },
});
// Per-user rate limit middleware factory
function createUserRateLimit(max, windowMs) {
    return (0, express_rate_limit_1.default)({
        windowMs: windowMs || config_1.config.rateLimitWindowMs,
        max,
        keyGenerator: (req) => {
            return req.user?.id || req.ip;
        },
        skip: (req) => {
            return req.user?.isAdmin || false;
        },
    });
}
// Per-namespace rate limit middleware factory
function createNamespaceRateLimit(max, windowMs) {
    return (0, express_rate_limit_1.default)({
        windowMs: windowMs || config_1.config.rateLimitWindowMs,
        max,
        keyGenerator: (req) => {
            const namespace = req.params.groupId || req.body.groupId;
            const userId = req.user?.id || req.ip;
            return `namespace:${namespace}:${userId}`;
        },
        skip: (req) => {
            return req.user?.isAdmin || false;
        },
    });
}
// Custom rate limit for specific operations
exports.operationRateLimits = {
    createWorkspace: createNamespaceRateLimit(5, 5 * 60 * 1000), // 5 per 5 minutes per namespace
    deleteWorkspace: createNamespaceRateLimit(10, 10 * 60 * 1000), // 10 per 10 minutes per namespace
    workspaceActions: createUserRateLimit(20), // 20 workspace actions per minute per user
    createGroup: createUserRateLimit(2, 10 * 60 * 1000), // 2 per 10 minutes per user
    bulkOperations: createUserRateLimit(5, 5 * 60 * 1000), // 5 per 5 minutes for bulk ops
};
// Rate limit bypass for system operations
function bypassRateLimit(req, res, next) {
    // Add a flag to bypass rate limiting for system operations
    req.skipRateLimit = true;
    next();
}
