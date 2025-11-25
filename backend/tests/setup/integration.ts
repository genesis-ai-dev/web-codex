/**
 * Integration test setup
 * Configures environment to use real DynamoDB for testing
 */

// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-west-2';
process.env.DYNAMODB_TABLE_PREFIX = 'test-vscode-platform';

// Disable Kubernetes for tests (use mocks)
process.env.SKIP_K8S_INIT = 'true';

// Set test JWT secrets
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.COGNITO_USER_POOL_ID = '';
process.env.COGNITO_CLIENT_ID = '';

// Mock JWT verification for integration tests
// This allows us to test with real tokens but bypass external OAuth providers
jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn((token: string) => {
    // Simple JWT decode for testing (not cryptographically verified)
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return Promise.reject(new Error('Invalid token format'));
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return Promise.resolve({ payload });
    } catch (error) {
      return Promise.reject(new Error('Invalid token'));
    }
  }),
}));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({
      verify: jest.fn(() => Promise.reject(new Error('Cognito not configured for tests'))),
    })),
  },
}));

// Increase test timeout for integration tests
jest.setTimeout(30000);

console.log('Integration test setup:');
console.log('- DynamoDB Endpoint:', process.env.DYNAMODB_ENDPOINT);
console.log('- Table Prefix:', process.env.DYNAMODB_TABLE_PREFIX);
