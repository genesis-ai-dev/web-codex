import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  KubernetesError,
  DatabaseError,
} from '../../src/utils/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toBeUndefined();
    });

    it('should create an error with custom values', () => {
      const details = { field: 'test' };
      const error = new AppError('Custom error', 400, 'CUSTOM_CODE', details);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.details).toEqual(details);
      expect(error.isOperational).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error');
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct properties', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create validation error with details', () => {
      const details = { fields: ['email', 'password'] };
      const error = new ValidationError('Validation failed', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with default message', () => {
      const error = new AuthenticationError();

      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error with default message', () => {
      const error = new AuthorizationError();

      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create authorization error with custom message', () => {
      const error = new AuthorizationError('Admin access required');

      expect(error.message).toBe('Admin access required');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with default message', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.isOperational).toBe(true);
    });

    it('should create not found error with custom message', () => {
      const error = new NotFoundError('User not found');

      expect(error.message).toBe('User not found');
    });

    it('should create not found error with resource details', () => {
      const error = new NotFoundError('Resource not found', 'User', 'usr_123');

      expect(error.details).toEqual({
        resourceType: 'User',
        resourceId: 'usr_123',
      });
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');

      expect(error.message).toBe('Resource already exists');
      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.isOperational).toBe(true);
    });

    it('should create conflict error with details', () => {
      const details = { field: 'email', value: 'test@example.com' };
      const error = new ConflictError('Email already in use', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with default message', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.isOperational).toBe(true);
    });

    it('should create rate limit error with custom message', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
    });
  });

  describe('KubernetesError', () => {
    it('should create kubernetes error', () => {
      const error = new KubernetesError('Failed to create pod');

      expect(error.message).toBe('Failed to create pod');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('KUBERNETES_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create kubernetes error with details', () => {
      const details = { namespace: 'default', pod: 'test-pod' };
      const error = new KubernetesError('Pod creation failed', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Query failed');

      expect(error.message).toBe('Query failed');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.isOperational).toBe(true);
    });

    it('should create database error with details', () => {
      const details = { table: 'users', operation: 'insert' };
      const error = new DatabaseError('Insert failed', details);

      expect(error.details).toEqual(details);
    });
  });
});
