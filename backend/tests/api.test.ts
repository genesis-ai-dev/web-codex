import request from 'supertest';
import app from '../src/app';

describe('Health Check Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return 200 and health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('GET /api/health/live', () => {
    it('should return alive status', async () => {
      const response = await request(app)
        .get('/api/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});

describe('Authentication Endpoints', () => {
  describe('GET /api/auth/me', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should handle login request', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should handle logout request', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});

describe('Error Handling', () => {
  describe('Non-existent endpoints', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
