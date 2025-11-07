import { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../src/middleware/errorHandler';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
} from '../../src/utils/errors';

// Mock logger to silence console output during tests
jest.mock('../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
    };
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockResponse = {
      status: statusMock,
      headersSent: false,
    };
    nextFunction = jest.fn();
  });

  it('should handle AppError', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'TEST_ERROR',
        message: 'Test error',
      })
    );
  });

  it('should handle ValidationError', () => {
    const details = { fields: ['email'] };
    const error = new ValidationError('Validation failed', details);

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      })
    );
  });

  it('should handle AuthenticationError', () => {
    const error = new AuthenticationError('Invalid token');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTHENTICATION_ERROR',
        message: 'Invalid token',
      })
    );
  });

  it('should handle NotFoundError', () => {
    const error = new NotFoundError('Resource not found', 'User', 'usr_123');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(404);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: 'Resource not found',
      })
    );
  });

  it('should handle generic Error', () => {
    const error = new Error('Unexpected error');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      })
    );
  });

  it('should handle errors even if headers are sent', () => {
    // The current implementation doesn't check headersSent before responding
    // This test verifies the error is still handled
    mockResponse.headersSent = true;
    const error = new AppError('Test error');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    // Error is still handled
    expect(statusMock).toHaveBeenCalled();
  });

  it('should include error message and code in response', () => {
    const error = new AppError('Test error', 500, 'TEST_CODE');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Test error',
        code: 'TEST_CODE',
      })
    );
  });

  it('should handle generic errors in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new Error('Generic error');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    const responseBody = jsonMock.mock.calls[0][0];
    // In development mode, it may include more details
    expect(responseBody).toHaveProperty('code', 'INTERNAL_ERROR');

    process.env.NODE_ENV = originalEnv;
  });

  it('should handle generic errors in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Generic error');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    const responseBody = jsonMock.mock.calls[0][0];
    expect(responseBody).toHaveProperty('code', 'INTERNAL_ERROR');
    expect(responseBody).not.toHaveProperty('stack');

    process.env.NODE_ENV = originalEnv;
  });

  it('should handle Kubernetes errors', () => {
    const error: any = new Error('K8s error');
    error.name = 'HttpError';
    error.statusCode = 500;
    error.body = { message: 'Pod not found' };

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'KUBERNETES_ERROR',
        message: 'Kubernetes operation failed',
      })
    );
  });

  it('should handle AWS SDK errors - ResourceNotFound', () => {
    const error: any = new Error('Resource not found');
    error.name = 'ResourceNotFound';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AWS_ERROR',
      })
    );
  });

  it('should handle AWS SDK errors - ValidationException', () => {
    const error: any = new Error('Validation failed');
    error.name = 'ValidationException';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AWS_ERROR',
      })
    );
  });

  it('should handle JWT errors - JsonWebTokenError', () => {
    const error: any = new Error('Invalid token');
    error.name = 'JsonWebTokenError';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
      })
    );
  });

  it('should handle JWT errors - TokenExpiredError', () => {
    const error: any = new Error('Token expired');
    error.name = 'TokenExpiredError';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INVALID_TOKEN',
      })
    );
  });

  it('should handle Joi ValidationError', () => {
    const error: any = new Error('Validation error');
    error.name = 'ValidationError';
    error.details = [{ message: 'Field is required', path: ['field'] }];

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
      })
    );
  });

  it('should handle MongoDB errors - MongoError', () => {
    const error: any = new Error('Mongo error');
    error.name = 'MongoError';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
      })
    );
  });

  it('should handle MongoDB errors - CastError', () => {
    const error: any = new Error('Cast error');
    error.name = 'CastError';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DATABASE_ERROR',
      })
    );
  });

  it('should handle rate limit errors', () => {
    const error = new Error('Too many requests from this IP');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
      })
    );
  });

  it('should handle syntax errors', () => {
    const error: any = new SyntaxError('Unexpected token');
    (error as any).body = 'invalid json';

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SYNTAX_ERROR',
        message: 'Invalid request format',
      })
    );
  });

  it('should include details in AppError response', () => {
    const details = { userId: 'usr_123', action: 'delete' };
    const error = new AppError('Operation failed', 400, 'OPERATION_ERROR', details);

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        details,
      })
    );
  });

  it('should not include details if not present in AppError', () => {
    const error = new AppError('Simple error', 400, 'SIMPLE_ERROR');

    errorHandler(error, mockRequest as Request, mockResponse as Response, nextFunction);

    const responseBody = jsonMock.mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('details');
  });
});
