import request from 'supertest';
import app from '../../src/app';
import { dynamodbService } from '../../src/services/dynamodbService';
import { kubernetesService } from '../../src/services/kubernetesService';
import { User } from '../../src/types';

// Mock services
jest.mock('../../src/services/dynamodbService');
jest.mock('../../src/services/kubernetesService');
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

// Mock auth middleware
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ code: 'AUTHENTICATION_ERROR' });
    }
    next();
  },
  requireAdmin: (req: any, res: any, next: any) => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ code: 'AUTHORIZATION_ERROR' });
    }
    next();
  },
  requireWorkspaceOwnership: () => (req: any, res: any, next: any) => next(),
  requireGroupMembership: () => (req: any, res: any, next: any) => next(),
}));

describe('Dashboard Routes', () => {
  const testUser: User = {
    id: 'usr_123',
    username: 'testuser',
    email: 'test@example.com',
    groups: ['grp_1'],
    isAdmin: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/dashboard', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/dashboard').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/dashboard/stats', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/dashboard/stats').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/dashboard/activity', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/dashboard/activity').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/dashboard/resources', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/dashboard/resources').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });
});
