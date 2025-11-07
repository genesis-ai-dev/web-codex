"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.AWS_REGION = 'us-west-2';
process.env.DYNAMODB_TABLE_PREFIX = 'vscode-platform-test';
process.env.REDIS_URL = 'redis://localhost:6379';
// Mock AWS SDK
jest.mock('aws-sdk', () => ({
    DynamoDB: {
        DocumentClient: jest.fn(() => ({
            get: jest.fn().mockReturnValue({ promise: jest.fn() }),
            put: jest.fn().mockReturnValue({ promise: jest.fn() }),
            query: jest.fn().mockReturnValue({ promise: jest.fn() }),
            scan: jest.fn().mockReturnValue({ promise: jest.fn() }),
            update: jest.fn().mockReturnValue({ promise: jest.fn() }),
            delete: jest.fn().mockReturnValue({ promise: jest.fn() }),
            describeTable: jest.fn().mockReturnValue({ promise: jest.fn() }),
        }))
    },
    config: {
        update: jest.fn(),
    },
}));
// Mock Kubernetes client
jest.mock('@kubernetes/client-node', () => ({
    KubeConfig: jest.fn(() => ({
        loadFromCluster: jest.fn(),
        loadFromDefault: jest.fn(),
        makeApiClient: jest.fn(),
    })),
    CoreV1Api: jest.fn(),
    AppsV1Api: jest.fn(),
    RbacAuthorizationV1Api: jest.fn(),
    Metrics: jest.fn(),
}));
// Mock Winston logger in test environment
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));
// Increase timeout for integration tests
jest.setTimeout(10000);
// Global test cleanup
afterEach(() => {
    jest.clearAllMocks();
});
