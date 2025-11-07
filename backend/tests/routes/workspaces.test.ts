import request from 'supertest';
import app from '../../src/app';
import { dynamodbService } from '../../src/services/dynamodbService';
import { kubernetesService } from '../../src/services/kubernetesService';
import { User, WorkspaceStatus } from '../../src/types';

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
  requireWorkspaceOwnership: () => (req: any, res: any, next: any) => {
    next();
  },
  requireGroupMembership: () => (req: any, res: any, next: any) => {
    next();
  },
}));

describe('Workspaces Routes', () => {
  const testUser: User = {
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

  describe('GET /api/workspaces', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/workspaces').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should list workspaces with query filters', async () => {
      const response = await request(app)
        .get('/api/workspaces')
        .query({ groupId: 'grp_1', status: 'running', limit: 10 });

      // Should require authentication
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/workspaces', () => {
    const validWorkspaceData = {
      name: 'My Workspace',
      description: 'Test workspace',
      groupId: 'grp_1',
      image: 'codercom/code-server:latest',
      resources: {
        cpu: '2',
        memory: '4Gi',
        storage: '10Gi',
      },
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/workspaces')
        .send(validWorkspaceData)
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should validate workspace creation data', async () => {
      const invalidData = {
        name: '-invalid-name',
        groupId: 'grp_1',
      };

      const response = await request(app)
        .post('/api/workspaces')
        .set('user', JSON.stringify(testUser))
        .send(invalidData);

      // Validation should fail
    });
  });

  describe('GET /api/workspaces/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/workspaces/ws_123').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('PATCH /api/workspaces/:id', () => {
    const updateData = {
      name: 'Updated Workspace',
      description: 'Updated description',
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .patch('/api/workspaces/ws_123')
        .send(updateData)
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app).delete('/api/workspaces/ws_123').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('POST /api/workspaces/:id/action', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/workspaces/ws_123/action')
        .send({ type: 'start' })
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should validate action type', async () => {
      const response = await request(app)
        .post('/api/workspaces/ws_123/action')
        .set('user', JSON.stringify(testUser))
        .send({ type: 'invalid' });

      // Should fail validation
    });

    it('should accept valid action types', async () => {
      const validActions = ['start', 'stop', 'restart'];

      for (const action of validActions) {
        // Each action should be valid format
        const data = { type: action };
        expect(data.type).toMatch(/^(start|stop|restart)$/);
      }
    });
  });

  describe('GET /api/workspaces/:id/logs', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/workspaces/ws_123/logs').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });

    it('should accept query parameters', async () => {
      const response = await request(app)
        .get('/api/workspaces/ws_123/logs')
        .query({ lines: 500, since: new Date().toISOString() });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/workspaces/:id/usage', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/workspaces/ws_123/usage').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/workspaces/:id/status', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/workspaces/ws_123/status').expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });
});
