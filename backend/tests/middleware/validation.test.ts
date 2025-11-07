import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { validate, validateQuery, validateParams, commonSchemas } from '../../src/middleware/validation';
import { ValidationError } from '../../src/utils/errors';

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
    };
    mockResponse = {};
    nextFunction = jest.fn();
  });

  describe('validate', () => {
    const testSchema = Joi.object({
      name: Joi.string().required(),
      age: Joi.number().min(0),
    });

    it('should pass validation with valid data', () => {
      mockRequest.body = { name: 'John', age: 30 };

      const middleware = validate(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
    });

    it('should throw ValidationError with invalid data', () => {
      mockRequest.body = { age: 'invalid' };

      const middleware = validate(testSchema);

      expect(() => {
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(ValidationError);

      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should strip unknown fields', () => {
      mockRequest.body = { name: 'John', age: 30, unknown: 'field' };

      const middleware = validate(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.body).toEqual({ name: 'John', age: 30 });
      expect(mockRequest.body).not.toHaveProperty('unknown');
    });

    it('should provide detailed error messages', () => {
      mockRequest.body = { age: -5 };

      const middleware = validate(testSchema);

      try {
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).details).toHaveProperty('fields');
        expect((error as ValidationError).details.fields).toBeInstanceOf(Array);
      }
    });
  });

  describe('validateQuery', () => {
    const testSchema = Joi.object({
      limit: Joi.number().min(1).max(100),
      offset: Joi.number().min(0),
    });

    it('should pass validation with valid query params', () => {
      mockRequest.query = { limit: '20', offset: '0' };

      const middleware = validateQuery(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
    });

    it('should throw ValidationError with invalid query params', () => {
      mockRequest.query = { limit: '200' };

      const middleware = validateQuery(testSchema);

      expect(() => {
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(ValidationError);
    });

    it('should strip unknown query parameters', () => {
      mockRequest.query = { limit: '20', unknown: 'param' };

      const middleware = validateQuery(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.query).not.toHaveProperty('unknown');
    });
  });

  describe('validateParams', () => {
    const testSchema = Joi.object({
      id: Joi.string().required(),
    });

    it('should pass validation with valid params', () => {
      mockRequest.params = { id: 'usr_123' };

      const middleware = validateParams(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.params).toEqual({ id: 'usr_123' });
    });

    it('should throw ValidationError with missing params', () => {
      mockRequest.params = {};

      const middleware = validateParams(testSchema);

      expect(() => {
        middleware(mockRequest as Request, mockResponse as Response, nextFunction);
      }).toThrow(ValidationError);
    });
  });

  describe('commonSchemas', () => {
    describe('id', () => {
      it('should validate id parameter', () => {
        const { error } = commonSchemas.id.validate({ id: 'usr_123' });
        expect(error).toBeUndefined();
      });

      it('should fail without id', () => {
        const { error } = commonSchemas.id.validate({});
        expect(error).toBeDefined();
      });
    });

    describe('pagination', () => {
      it('should validate pagination with defaults', () => {
        const { value } = commonSchemas.pagination.validate({});
        expect(value.limit).toBe(20);
        expect(value.offset).toBe(0);
      });

      it('should validate custom pagination values', () => {
        const { error, value } = commonSchemas.pagination.validate({ limit: 50, offset: 10 });
        expect(error).toBeUndefined();
        expect(value.limit).toBe(50);
        expect(value.offset).toBe(10);
      });

      it('should fail with invalid limit', () => {
        const { error } = commonSchemas.pagination.validate({ limit: 200 });
        expect(error).toBeDefined();
      });
    });

    describe('createGroup', () => {
      it('should validate valid group creation data', () => {
        const data = {
          name: 'test-group',
          displayName: 'Test Group',
          namespace: 'group-test-group',
        };
        const { error } = commonSchemas.createGroup.validate(data);
        expect(error).toBeUndefined();
      });

      it('should fail with invalid name format', () => {
        const data = {
          name: 'Test Group!',
          displayName: 'Test Group',
          namespace: 'group-test',
        };
        const { error } = commonSchemas.createGroup.validate(data);
        expect(error).toBeDefined();
      });

      it('should fail with invalid namespace format', () => {
        const data = {
          name: 'test-group',
          displayName: 'Test Group',
          namespace: 'invalid-namespace',
        };
        const { error } = commonSchemas.createGroup.validate(data);
        expect(error).toBeDefined();
      });

      it('should validate with resource quota', () => {
        const data = {
          name: 'test-group',
          displayName: 'Test Group',
          namespace: 'group-test-group',
          resourceQuota: {
            cpu: '2',
            memory: '4Gi',
            storage: '10Gi',
            pods: 10,
          },
        };
        const { error } = commonSchemas.createGroup.validate(data);
        expect(error).toBeUndefined();
      });
    });

    describe('createWorkspace', () => {
      it('should validate valid workspace creation data', () => {
        const data = {
          name: 'My Workspace',
          groupId: 'grp_123',
        };
        const { error, value } = commonSchemas.createWorkspace.validate(data);
        expect(error).toBeUndefined();
        expect(value.image).toBe('codercom/code-server:latest');
      });

      it('should fail with invalid name format', () => {
        const data = {
          name: '-invalid',
          groupId: 'grp_123',
        };
        const { error } = commonSchemas.createWorkspace.validate(data);
        expect(error).toBeDefined();
      });

      it('should validate with custom resources', () => {
        const data = {
          name: 'My Workspace',
          groupId: 'grp_123',
          resources: {
            cpu: '2',
            memory: '4Gi',
            storage: '10Gi',
          },
        };
        const { error } = commonSchemas.createWorkspace.validate(data);
        expect(error).toBeUndefined();
      });
    });

    describe('workspaceAction', () => {
      it('should validate start action', () => {
        const { error } = commonSchemas.workspaceAction.validate({ type: 'start' });
        expect(error).toBeUndefined();
      });

      it('should validate stop action', () => {
        const { error } = commonSchemas.workspaceAction.validate({ type: 'stop' });
        expect(error).toBeUndefined();
      });

      it('should validate restart action', () => {
        const { error } = commonSchemas.workspaceAction.validate({ type: 'restart' });
        expect(error).toBeUndefined();
      });

      it('should fail with invalid action', () => {
        const { error } = commonSchemas.workspaceAction.validate({ type: 'delete' });
        expect(error).toBeDefined();
      });
    });

    describe('updateUser', () => {
      it('should validate user updates', () => {
        const data = { name: 'John Doe', isAdmin: true };
        const { error } = commonSchemas.updateUser.validate(data);
        expect(error).toBeUndefined();
      });

      it('should fail with empty update', () => {
        const { error } = commonSchemas.updateUser.validate({});
        expect(error).toBeDefined();
      });
    });

    describe('workspaceQuery', () => {
      it('should validate workspace query with defaults', () => {
        const { value } = commonSchemas.workspaceQuery.validate({});
        expect(value.limit).toBe(20);
        expect(value.offset).toBe(0);
      });

      it('should validate with filters', () => {
        const data = {
          groupId: 'grp_123',
          status: 'running',
          limit: 50,
        };
        const { error } = commonSchemas.workspaceQuery.validate(data);
        expect(error).toBeUndefined();
      });

      it('should fail with invalid status', () => {
        const { error } = commonSchemas.workspaceQuery.validate({ status: 'invalid' });
        expect(error).toBeDefined();
      });
    });

    describe('auditLogQuery', () => {
      it('should validate audit log query', () => {
        const data = {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
          userId: 'usr_123',
        };
        const { error } = commonSchemas.auditLogQuery.validate(data);
        expect(error).toBeUndefined();
      });
    });

    describe('workspaceLogsQuery', () => {
      it('should validate with defaults', () => {
        const { value } = commonSchemas.workspaceLogsQuery.validate({});
        expect(value.lines).toBe(100);
      });

      it('should validate with custom lines', () => {
        const { error, value } = commonSchemas.workspaceLogsQuery.validate({ lines: 500 });
        expect(error).toBeUndefined();
        expect(value.lines).toBe(500);
      });

      it('should fail with too many lines', () => {
        const { error } = commonSchemas.workspaceLogsQuery.validate({ lines: 2000 });
        expect(error).toBeDefined();
      });
    });
  });
});
