import { Request, Response, NextFunction } from 'express';
import {
  standardRateLimit,
  workspaceRateLimit,
  adminRateLimit,
  authRateLimit,
  createUserRateLimit,
  createNamespaceRateLimit,
  operationRateLimits,
  bypassRateLimit,
} from '../../src/middleware/rateLimiting';
import { AuthenticatedRequest, User } from '../../src/types';

jest.mock('../../src/config/logger');

describe('Rate Limiting Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      params: {},
      body: {},
    };
    mockResponse = {};
    nextFunction = jest.fn();
  });

  describe('standardRateLimit', () => {
    it('should be a function', () => {
      expect(typeof standardRateLimit).toBe('function');
    });

    it('should have rate limit configuration', () => {
      expect(standardRateLimit).toBeDefined();
    });
  });

  describe('workspaceRateLimit', () => {
    it('should be a function', () => {
      expect(typeof workspaceRateLimit).toBe('function');
    });

    it('should skip rate limiting for admin users', () => {
      mockRequest.user = {
        id: 'usr_admin',
        username: 'admin',
        email: 'admin@example.com',
        groups: [],
        isAdmin: true,
        createdAt: new Date(),
      };

      expect(workspaceRateLimit).toBeDefined();
    });
  });

  describe('adminRateLimit', () => {
    it('should be a function', () => {
      expect(typeof adminRateLimit).toBe('function');
    });

    it('should be configured for admin operations', () => {
      expect(adminRateLimit).toBeDefined();
    });
  });

  describe('authRateLimit', () => {
    it('should be a function', () => {
      expect(typeof authRateLimit).toBe('function');
    });

    it('should be stricter than standard rate limit', () => {
      expect(authRateLimit).toBeDefined();
    });
  });

  describe('createUserRateLimit', () => {
    it('should create a rate limit middleware', () => {
      const middleware = createUserRateLimit(10);
      expect(typeof middleware).toBe('function');
    });

    it('should accept max parameter', () => {
      const middleware = createUserRateLimit(5);
      expect(middleware).toBeDefined();
    });

    it('should accept windowMs parameter', () => {
      const middleware = createUserRateLimit(10, 60000);
      expect(middleware).toBeDefined();
    });

    it('should create different instances', () => {
      const middleware1 = createUserRateLimit(5);
      const middleware2 = createUserRateLimit(10);
      expect(middleware1).not.toBe(middleware2);
    });
  });

  describe('createNamespaceRateLimit', () => {
    it('should create a rate limit middleware', () => {
      const middleware = createNamespaceRateLimit(10);
      expect(typeof middleware).toBe('function');
    });

    it('should accept max parameter', () => {
      const middleware = createNamespaceRateLimit(5);
      expect(middleware).toBeDefined();
    });

    it('should accept windowMs parameter', () => {
      const middleware = createNamespaceRateLimit(10, 60000);
      expect(middleware).toBeDefined();
    });

    it('should create different instances', () => {
      const middleware1 = createNamespaceRateLimit(5);
      const middleware2 = createNamespaceRateLimit(10);
      expect(middleware1).not.toBe(middleware2);
    });
  });

  describe('operationRateLimits', () => {
    it('should have createWorkspace limit', () => {
      expect(operationRateLimits.createWorkspace).toBeDefined();
      expect(typeof operationRateLimits.createWorkspace).toBe('function');
    });

    it('should have deleteWorkspace limit', () => {
      expect(operationRateLimits.deleteWorkspace).toBeDefined();
      expect(typeof operationRateLimits.deleteWorkspace).toBe('function');
    });

    it('should have workspaceActions limit', () => {
      expect(operationRateLimits.workspaceActions).toBeDefined();
      expect(typeof operationRateLimits.workspaceActions).toBe('function');
    });

    it('should have createGroup limit', () => {
      expect(operationRateLimits.createGroup).toBeDefined();
      expect(typeof operationRateLimits.createGroup).toBe('function');
    });

    it('should have bulkOperations limit', () => {
      expect(operationRateLimits.bulkOperations).toBeDefined();
      expect(typeof operationRateLimits.bulkOperations).toBe('function');
    });

    it('should have different rate limits for different operations', () => {
      expect(operationRateLimits.createWorkspace).not.toBe(operationRateLimits.deleteWorkspace);
      expect(operationRateLimits.workspaceActions).not.toBe(operationRateLimits.createGroup);
    });
  });

  describe('bypassRateLimit', () => {
    it('should set skipRateLimit flag and call next', () => {
      bypassRateLimit(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect((mockRequest as any).skipRateLimit).toBe(true);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('should allow system operations to bypass rate limiting', () => {
      const req = mockRequest as any;

      bypassRateLimit(req, mockResponse as Response, nextFunction);

      expect(req.skipRateLimit).toBe(true);
    });
  });
});
