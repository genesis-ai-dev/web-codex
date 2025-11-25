import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationError } from '../utils/errors';

export function validate(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new ValidationError('Validation failed', { fields: details });
    }

    req.body = value;
    next();
  };
}

export function validateQuery(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new ValidationError('Query validation failed', { fields: details });
    }

    req.query = value;
    next();
  };
}

export function validateParams(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      throw new ValidationError('Parameter validation failed', { fields: details });
    }

    req.params = value;
    next();
  };
}

// Common validation schemas
export const commonSchemas = {
  // ID parameter validation
  id: Joi.object({
    id: Joi.string().required(),
  }),

  userId: Joi.object({
    userId: Joi.string().required(),
  }),

  workspaceId: Joi.object({
    workspaceId: Joi.string().required(),
  }),

  // Pagination
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    nextToken: Joi.string().optional(),
  }),

  // Group validation
  createGroup: Joi.object({
    name: Joi.string()
      .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
      .min(1)
      .max(63)
      .required()
      .messages({
        'string.pattern.base': 'Name must be a valid Kubernetes name (lowercase alphanumeric with hyphens)',
      }),
    displayName: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).allow('', null).optional(),
    namespace: Joi.string()
      .regex(/^group-[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
      .required()
      .messages({
        'string.pattern.base': 'Namespace must start with "group-" followed by valid Kubernetes name',
      }),
    resourceQuota: Joi.object({
      cpu: Joi.string().required(),
      memory: Joi.string().required(),
      storage: Joi.string().required(),
      pods: Joi.number().integer().min(1).required(),
    }).optional(),
  }),

  updateGroup: Joi.object({
    displayName: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    resourceQuota: Joi.object({
      cpu: Joi.string().optional(),
      memory: Joi.string().optional(),
      storage: Joi.string().optional(),
      pods: Joi.number().integer().min(1).optional(),
    }).optional(),
  }).min(1),
  groupAndUserId: Joi.object({
    groupId: Joi.string().required(),
    userId: Joi.string().required(),
  }),

  // Workspace validation
  createWorkspace: Joi.object({
    name: Joi.string()
      .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-\ ])*[a-zA-Z0-9]$/)
      .min(1)
      .max(63)
      .required(),
    description: Joi.string().max(500).allow('', null).optional(),
    groupId: Joi.string().required(),
    image: Joi.string()
      .regex(/^[a-z0-9\-\.\/\:]+$/i)
      .min(1)
      .max(255)
      .optional()
      .messages({
        'string.pattern.base': 'Image must be a valid container image reference (e.g., registry.io/org/image:tag)',
      }),
    resources: Joi.object({
      cpu: Joi.string().required(),
      memory: Joi.string().required(),
      storage: Joi.string().required(),
    }).optional(),
  }),

  updateWorkspace: Joi.object({
    name: Joi.string()
      .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-\ ])*[a-zA-Z0-9]$/)
      .min(1)
      .max(63)
      .optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    resources: Joi.object({
      cpu: Joi.string().optional(),
      memory: Joi.string().optional(),
      storage: Joi.string().optional(),
    }).optional(),
  }).min(1),

  workspaceAction: Joi.object({
    type: Joi.string().valid('start', 'stop', 'restart').required(),
  }),

  // User validation
  createUser: Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().min(1).max(100).optional(),
    temporaryPassword: Joi.string().min(8).max(256).required(),
    sendInvite: Joi.boolean().default(true),
    isAdmin: Joi.boolean().default(false),
    groups: Joi.array().items(Joi.string()).default([]),
  }),

  updateUser: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    isAdmin: Joi.boolean().optional(),
    groups: Joi.array().items(Joi.string()).optional(),
  }).min(1),

  resetPassword: Joi.object({
    newPassword: Joi.string().min(8).max(256).required(),
    permanent: Joi.boolean().default(false),
  }),

  addGroupMember: Joi.object({
    userId: Joi.string().required(),
    role: Joi.string().valid('viewer', 'developer', 'admin').default('developer'),
  }),

  addUserToGroup: Joi.object({
    groupId: Joi.string().required(),
  }),

  // Query filters
  workspaceQuery: Joi.object({
    groupId: Joi.string().optional(),
    status: Joi.string().valid('running', 'stopped', 'starting', 'stopping', 'error', 'pending').optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
  }),

  auditLogQuery: Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    userId: Joi.string().optional(),
    action: Joi.string().optional(),
    nextToken: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),

  userQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    nextToken: Joi.string().optional(),
    search: Joi.string().min(1).max(100).optional(),
  }),

  workspaceLogsQuery: Joi.object({
    lines: Joi.number().integer().min(1).max(1000).default(100),
    since: Joi.string().isoDate().optional(),
  }),

  // System settings validation
  updateSystemSettings: Joi.object({
    defaultWorkspaceImage: Joi.string()
      .regex(/^[a-z0-9\-\.\/\:]+$/i)
      .min(1)
      .max(255)
      .optional()
      .messages({
        'string.pattern.base': 'Image must be a valid container image reference (e.g., registry.io/org/image:tag)',
      }),
  }).min(1),
};
