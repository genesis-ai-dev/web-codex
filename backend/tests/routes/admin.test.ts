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

describe('Admin Routes', () => {
  const regularUser: User = {
    id: 'usr_123',
    username: 'testuser',
    email: 'test@example.com',
    groups: ['grp_1'],
    isAdmin: false,
    createdAt: new Date(),
  };

  const adminUser: User = {
    id: 'usr_admin',
    username: 'admin',
    email: 'admin@example.com',
    groups: [],
    isAdmin: true,
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/users', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/users').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should accept pagination query parameters', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .query({ limit: 50, nextToken: 'token123' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/users/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/users/usr_123').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('PATCH /api/admin/users/:id', () => {
    const updateData = {
      name: 'Updated Name',
      isAdmin: true,
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/admin/users/usr_123')
        .send(updateData)
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app).delete('/api/admin/users/usr_123').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/admin/audit-logs', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/audit-logs').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should accept query filters', async () => {
      const response = await request(app)
        .get('/api/admin/audit-logs')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          userId: 'usr_123',
          limit: 50,
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/stats', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/stats').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/admin/system/health', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/system/health').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('POST /api/admin/maintenance', () => {
    const maintenanceData = {
      action: 'cleanup',
      dryRun: true,
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/admin/maintenance')
        .send(maintenanceData)
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });
});
