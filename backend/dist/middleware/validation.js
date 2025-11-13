"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.commonSchemas = void 0;
exports.validate = validate;
exports.validateQuery = validateQuery;
exports.validateParams = validateParams;
const joi_1 = __importDefault(require("joi"));
const errors_1 = require("../utils/errors");
function validate(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            throw new errors_1.ValidationError('Validation failed', { fields: details });
        }
        req.body = value;
        next();
    };
}
function validateQuery(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            throw new errors_1.ValidationError('Query validation failed', { fields: details });
        }
        req.query = value;
        next();
    };
}
function validateParams(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.params, {
            abortEarly: false,
            stripUnknown: true
        });
        if (error) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));
            throw new errors_1.ValidationError('Parameter validation failed', { fields: details });
        }
        req.params = value;
        next();
    };
}
// Common validation schemas
exports.commonSchemas = {
    // ID parameter validation
    id: joi_1.default.object({
        id: joi_1.default.string().required(),
    }),
    userId: joi_1.default.object({
        userId: joi_1.default.string().required(),
    }),
    workspaceId: joi_1.default.object({
        workspaceId: joi_1.default.string().required(),
    }),
    // Pagination
    pagination: joi_1.default.object({
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        offset: joi_1.default.number().integer().min(0).default(0),
        nextToken: joi_1.default.string().optional(),
    }),
    // Group validation
    createGroup: joi_1.default.object({
        name: joi_1.default.string()
            .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
            .min(1)
            .max(63)
            .required()
            .messages({
            'string.pattern.base': 'Name must be a valid Kubernetes name (lowercase alphanumeric with hyphens)',
        }),
        displayName: joi_1.default.string().min(1).max(100).required(),
        description: joi_1.default.string().max(500).allow('').optional(),
        namespace: joi_1.default.string()
            .regex(/^group-[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)
            .required()
            .messages({
            'string.pattern.base': 'Namespace must start with "group-" followed by valid Kubernetes name',
        }),
        resourceQuota: joi_1.default.object({
            cpu: joi_1.default.string().required(),
            memory: joi_1.default.string().required(),
            storage: joi_1.default.string().required(),
            pods: joi_1.default.number().integer().min(1).required(),
        }).optional(),
    }),
    updateGroup: joi_1.default.object({
        displayName: joi_1.default.string().min(1).max(100).optional(),
        description: joi_1.default.string().max(500).optional(),
        resourceQuota: joi_1.default.object({
            cpu: joi_1.default.string().optional(),
            memory: joi_1.default.string().optional(),
            storage: joi_1.default.string().optional(),
            pods: joi_1.default.number().integer().min(1).optional(),
        }).optional(),
    }).min(1),
    groupAndUserId: joi_1.default.object({
        groupId: joi_1.default.string().required(),
        userId: joi_1.default.string().required(),
    }),
    // Workspace validation
    createWorkspace: joi_1.default.object({
        name: joi_1.default.string()
            .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-\ ])*[a-zA-Z0-9]$/)
            .min(1)
            .max(63)
            .required(),
        description: joi_1.default.string().max(500).allow('').optional(),
        groupId: joi_1.default.string().required(),
        image: joi_1.default.string().default('codercom/code-server:latest'),
        resources: joi_1.default.object({
            cpu: joi_1.default.string().required(),
            memory: joi_1.default.string().required(),
            storage: joi_1.default.string().required(),
        }).optional(),
    }),
    updateWorkspace: joi_1.default.object({
        name: joi_1.default.string()
            .regex(/^[a-zA-Z0-9]([a-zA-Z0-9\-\ ])*[a-zA-Z0-9]$/)
            .min(1)
            .max(63)
            .optional(),
        description: joi_1.default.string().max(500).optional(),
        resources: joi_1.default.object({
            cpu: joi_1.default.string().optional(),
            memory: joi_1.default.string().optional(),
            storage: joi_1.default.string().optional(),
        }).optional(),
    }).min(1),
    workspaceAction: joi_1.default.object({
        type: joi_1.default.string().valid('start', 'stop', 'restart').required(),
    }),
    // User validation
    updateUser: joi_1.default.object({
        name: joi_1.default.string().min(1).max(100).optional(),
        isAdmin: joi_1.default.boolean().optional(),
        groups: joi_1.default.array().items(joi_1.default.string()).optional(),
    }).min(1),
    addGroupMember: joi_1.default.object({
        userId: joi_1.default.string().required(),
        role: joi_1.default.string().valid('viewer', 'developer', 'admin').default('developer'),
    }),
    addUserToGroup: joi_1.default.object({
        groupId: joi_1.default.string().required(),
    }),
    // Query filters
    workspaceQuery: joi_1.default.object({
        groupId: joi_1.default.string().optional(),
        status: joi_1.default.string().valid('running', 'stopped', 'starting', 'stopping', 'error', 'pending').optional(),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        offset: joi_1.default.number().integer().min(0).default(0),
    }),
    auditLogQuery: joi_1.default.object({
        startDate: joi_1.default.date().optional(),
        endDate: joi_1.default.date().optional(),
        userId: joi_1.default.string().optional(),
        action: joi_1.default.string().optional(),
        nextToken: joi_1.default.string().optional(),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
    }),
    userQuery: joi_1.default.object({
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        nextToken: joi_1.default.string().optional(),
        search: joi_1.default.string().min(1).max(100).optional(),
    }),
    workspaceLogsQuery: joi_1.default.object({
        lines: joi_1.default.number().integer().min(1).max(1000).default(100),
        since: joi_1.default.string().isoDate().optional(),
    }),
};
