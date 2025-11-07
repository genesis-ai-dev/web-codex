import request from 'supertest';
import app from '../../src/app';
import { userService } from '../../src/services/userService';
import { User } from '../../src/types';

// Mock services
jest.mock('../../src/services/dynamodbService');
jest.mock('../../src/services/kubernetesService');
jest.mock('../../src/services/userService');
jest.mock('../../src/config/logger');

// Mock rate limiting
jest.mock('../../src/middleware/rateLimiting', () => ({
  standardRateLimit: (req: any, res: any, next: any) => next(),
  workspaceRateLimit: (req: any, res: any, next: any) => next(),
  adminRateLimit: (req: any, res: any, next: any) => next(),
  authRateLimit: (req: any, res: any, next: any) => next(),
  operationRateLimits: {
    createWorkspace: (req: any, res: any, next: any) => next(),
    deleteWorkspace: (req: any, res: any, next: any) => next(),
    workspaceActions: (req: any, res: any, next: any) => next(),
    createGroup: (req: any, res: any, next: any) => next(),
    bulkOperations: (req: any, res: any, next: any) => next(),
  },
}));

// Mock JWT verification
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({
      verify: jest.fn(),
    })),
  },
}));

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should handle login request', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should return success response', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.body.success).toBe(true);
    });

    it('should handle login with credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'user@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should handle logout request', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should return success message', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.body.message).toMatch(/logged out/i);
    });

    it('should handle logout without authentication', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/auth/me').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should return user info with valid token', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

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

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('user');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });

    it('should reject missing bearer prefix', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'token');

      expect(response.status).toBe(401);
    });

    it('should handle malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
    });
  });

  describe('Authentication Flow', () => {
    it('should handle complete login flow', async () => {
      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(loginResponse.body.success).toBe(true);
    });

    it('should handle logout after login', async () => {
      // Login first
      await request(app).post('/api/auth/login').send({});

      // Then logout
      const logoutResponse = await request(app).post('/api/auth/logout');

      expect(logoutResponse.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully on login', async () => {
      const response = await request(app).post('/api/auth/login').send({});

      // Should not crash
      expect([200, 401, 500]).toContain(response.status);
    });

    it('should return JSON error responses', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('code');
    });
  });

  describe('Security', () => {
    it('should not expose sensitive information in errors', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should validate authorization header format', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'malformed');

      expect(response.status).toBe(401);
    });

    it('should reject empty authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', '');

      expect(response.status).toBe(401);
    });
  });
});
