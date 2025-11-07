import { Request, Response, NextFunction } from 'express';
import {
  authenticate,
  requireAdmin,
  requireGroupMembership,
  requireGroupRole,
  optionalAuth,
} from '../../src/middleware/auth';
import { AuthenticationError, AuthorizationError } from '../../src/utils/errors';
import { userService } from '../../src/services/userService';
import { AuthenticatedRequest, User } from '../../src/types';

// Mock dependencies
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({
      verify: jest.fn(),
    })),
  },
}));

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('../../src/services/userService');
jest.mock('../../src/config/logger');

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      params: {},
      body: {},
    };
    mockResponse = {};
    nextFunction = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should throw AuthenticationError if no authorization header', async () => {
      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication token required',
        })
      );
    });

    it('should throw AuthenticationError if authorization header does not start with Bearer', async () => {
      mockRequest.headers = { authorization: 'Basic token123' };

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication token required',
        })
      );
    });

    it('should call next with error if token verification fails', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid_token' };

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should authenticate user with valid token', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

      mockRequest.headers = { authorization: 'Bearer valid_token' };
      (userService.getOrCreateUser as jest.Mock).mockResolvedValue(user);

      // Mock jose verification to return a valid payload
      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'google_123',
          email: 'test@example.com',
          iat: Date.now(),
          exp: Date.now() + 3600000,
        },
      });

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual(user);
      expect(nextFunction).toHaveBeenCalledWith();
    });
  });

  describe('requireAdmin', () => {
    it('should throw AuthorizationError if user is not admin', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

      expect(() => {
        requireAdmin(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);
      }).toThrow(AuthorizationError);

      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should call next if user is admin', () => {
      mockRequest.user = {
        id: 'usr_admin',
        username: 'admin',
        email: 'admin@example.com',
        groups: [],
        isAdmin: true,
        createdAt: new Date(),
      };

      requireAdmin(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should throw AuthorizationError if user is not set', () => {
      expect(() => {
        requireAdmin(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);
      }).toThrow(AuthorizationError);
    });
  });

  describe('requireGroupMembership', () => {
    it('should throw AuthorizationError if user is not in group', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };
      mockRequest.params = { groupId: 'grp_2' };

      const middleware = requireGroupMembership();

      expect(() => {
        middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);
      }).toThrow(AuthorizationError);
    });

    it('should call next if user is in group', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };
      mockRequest.params = { groupId: 'grp_1' };

      const middleware = requireGroupMembership();
      middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should call next if user is admin', () => {
      mockRequest.user = {
        id: 'usr_admin',
        username: 'admin',
        email: 'admin@example.com',
        groups: [],
        isAdmin: true,
        createdAt: new Date(),
      };
      mockRequest.params = { groupId: 'grp_1' };

      const middleware = requireGroupMembership();
      middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should throw AuthorizationError if groupId is not provided', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };

      const middleware = requireGroupMembership();

      expect(() => {
        middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);
      }).toThrow(AuthorizationError);
    });

    it('should use groupId parameter if provided', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };

      const middleware = requireGroupMembership('grp_1');
      middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should check body.groupId if params.groupId not present', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };
      mockRequest.body = { groupId: 'grp_1' };

      const middleware = requireGroupMembership();
      middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('requireGroupRole', () => {
    it('should throw AuthorizationError if user is not in group', () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };
      mockRequest.params = { groupId: 'grp_2' };

      const middleware = requireGroupRole('developer');

      expect(async () => {
        await middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);
      }).rejects.toThrow(AuthorizationError);
    });

    it('should call next if user is in group', async () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };
      mockRequest.params = { groupId: 'grp_1' };

      const middleware = requireGroupRole('developer');
      await middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should call next if user is admin', async () => {
      mockRequest.user = {
        id: 'usr_admin',
        username: 'admin',
        email: 'admin@example.com',
        groups: [],
        isAdmin: true,
        createdAt: new Date(),
      };
      mockRequest.params = { groupId: 'grp_1' };

      const middleware = requireGroupRole('admin');
      await middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should throw AuthorizationError if groupId is not provided', async () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };

      const middleware = requireGroupRole('developer');

      await expect(
        middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction)
      ).rejects.toThrow(AuthorizationError);
    });

    it('should check body.groupId if params.groupId not present', async () => {
      mockRequest.user = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['grp_1'],
        isAdmin: false,
        createdAt: new Date(),
      };
      mockRequest.body = { groupId: 'grp_1' };

      const middleware = requireGroupRole('viewer');
      await middleware(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should call next without user if no authorization header', async () => {
      await optionalAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should call next without user if authorization header does not start with Bearer', async () => {
      mockRequest.headers = { authorization: 'Basic token123' };

      await optionalAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should call next without error even if token is invalid', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid_token' };

      await optionalAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it('should authenticate user with valid token', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

      mockRequest.headers = { authorization: 'Bearer valid_token' };
      (userService.getOrCreateUser as jest.Mock).mockResolvedValue(user);

      const jose = require('jose');
      jose.jwtVerify.mockResolvedValue({
        payload: {
          sub: 'google_123',
          email: 'test@example.com',
          iat: Date.now(),
          exp: Date.now() + 3600000,
        },
      });

      await optionalAuth(mockRequest as AuthenticatedRequest, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual(user);
      expect(nextFunction).toHaveBeenCalledWith();
    });
  });
});
