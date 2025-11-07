import request from 'supertest';
import app from '../../src/app';

// Mock services and logger
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

describe('Health Routes', () => {
  describe('GET /api/health', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });

    it('should include service information', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toHaveProperty('services');
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app).get('/api/health/live').expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return quickly for liveness probe', async () => {
      const start = Date.now();
      await request(app).get('/api/health/live');
      const duration = Date.now() - start;

      // Liveness probe should be very fast (under 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('GET /api/health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app).get('/api/health/ready');

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should check service dependencies', async () => {
      const response = await request(app).get('/api/health/ready');

      // May return 200 or 503 depending on service health
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('GET /api/health/metrics', () => {
    it('should return metrics', async () => {
      const response = await request(app).get('/api/health/metrics');

      // May require authentication or return metrics
      expect([200, 401]).toContain(response.status);
    });
  });
});
