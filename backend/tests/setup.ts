// Jest setup file for global test configuration

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.JWT_SECRET = 'test-secret-key';
process.env.COGNITO_REGION = 'us-east-1';
process.env.COGNITO_USER_POOL_ID = 'test-pool-id';
process.env.COGNITO_CLIENT_ID = 'test-client-id';
process.env.DYNAMODB_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_PREFIX = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Mock external modules that require actual connections
jest.mock('@kubernetes/client-node');

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    on: jest.fn(),
  })),
}));

const mockDynamoDBClient = {
  describeTable: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({
      Table: { TableStatus: 'ACTIVE' },
    }),
  }),
};

const mockDocumentClient = {
  get: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({ Item: {} }),
  }),
  put: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  }),
  update: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  }),
  delete: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({}),
  }),
  query: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({ Items: [] }),
  }),
  scan: jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({ Items: [] }),
  }),
};

jest.mock('aws-sdk', () => {
  const DynamoDBConstructor = jest.fn(() => mockDynamoDBClient);
  (DynamoDBConstructor as any).DocumentClient = jest.fn(() => mockDocumentClient);

  return {
    DynamoDB: DynamoDBConstructor,
    config: {
      update: jest.fn(),
    },
  };
});
