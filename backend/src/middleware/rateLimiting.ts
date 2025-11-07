import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { AuthenticatedRequest } from '../types';

// Standard rate limit
export const standardRateLimit = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP address as key for unauthenticated requests
    return req.ip;
  },
});

// Workspace-specific rate limit (more restrictive)
export const workspaceRateLimit = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitWorkspaceMax,
  message: {
    error: 'Too many workspace operations, please try again later',
    code: 'WORKSPACE_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthenticatedRequest) => {
    // Use user ID + namespace for workspace operations
    const userId = req.user?.id || req.ip;
    const namespace = req.params.groupId || req.body.groupId || 'default';
    return `workspace:${userId}:${namespace}`;
  },
  skip: (req: AuthenticatedRequest) => {
    // Skip rate limiting for admins
    return req.user?.isAdmin || false;
  },
});

// Admin rate limit (moderate restrictions)
export const adminRateLimit = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: 50, // More permissive for admin operations
  message: {
    error: 'Too many admin operations, please try again later',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthenticatedRequest) => {
    return `admin:${req.user?.id || req.ip}`;
  },
});

// Authentication rate limit (stricter to prevent brute force)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Very strict for auth attempts
  message: {
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Use IP for auth attempts
    return `auth:${req.ip}`;
  },
});

// Per-user rate limit middleware factory
export function createUserRateLimit(max: number, windowMs?: number) {
  return rateLimit({
    windowMs: windowMs || config.rateLimitWindowMs,
    max,
    keyGenerator: (req: AuthenticatedRequest) => {
      return req.user?.id || req.ip;
    },
    skip: (req: AuthenticatedRequest) => {
      return req.user?.isAdmin || false;
    },
  });
}

// Per-namespace rate limit middleware factory
export function createNamespaceRateLimit(max: number, windowMs?: number) {
  return rateLimit({
    windowMs: windowMs || config.rateLimitWindowMs,
    max,
    keyGenerator: (req: AuthenticatedRequest) => {
      const namespace = req.params.groupId || req.body.groupId;
      const userId = req.user?.id || req.ip;
      return `namespace:${namespace}:${userId}`;
    },
    skip: (req: AuthenticatedRequest) => {
      return req.user?.isAdmin || false;
    },
  });
}

// Custom rate limit for specific operations
export const operationRateLimits = {
  createWorkspace: createNamespaceRateLimit(5, 5 * 60 * 1000), // 5 per 5 minutes per namespace
  deleteWorkspace: createNamespaceRateLimit(10, 10 * 60 * 1000), // 10 per 10 minutes per namespace
  workspaceActions: createUserRateLimit(20), // 20 workspace actions per minute per user
  createGroup: createUserRateLimit(2, 10 * 60 * 1000), // 2 per 10 minutes per user
  bulkOperations: createUserRateLimit(5, 5 * 60 * 1000), // 5 per 5 minutes for bulk ops
};

// Rate limit bypass for system operations
export function bypassRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Add a flag to bypass rate limiting for system operations
  (req as any).skipRateLimit = true;
  next();
}
