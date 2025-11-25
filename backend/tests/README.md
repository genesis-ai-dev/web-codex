# Test Suite Documentation

## Overview

This project contains both unit tests and integration tests for the backend API. The test suite has been significantly improved to increase code coverage and confidence in the codebase.

## Test Organization

```
tests/
├── setup/
│   └── integration.ts          # Integration test environment setup
├── integration/                # Integration tests with real services
│   ├── dynamodbService.integration.test.ts
│   ├── groups.integration.test.ts
│   └── workspaces.integration.test.ts
├── routes/                     # Route/endpoint tests
│   ├── admin.test.ts
│   ├── auth.test.ts
│   ├── dashboard.test.ts
│   ├── groups.test.ts
│   ├── health.test.ts
│   └── workspaces.test.ts
├── middleware/                 # Middleware tests
│   ├── auth.test.ts
│   ├── errorHandler.test.ts
│   ├── rateLimiting.test.ts
│   └── validation.test.ts
├── services/                   # Service layer tests
│   └── userService.test.ts
├── utils/                      # Utility tests
│   └── errors.test.ts
└── helpers/                    # Test helpers
    └── mocks.ts
```

## Test Types

### Unit Tests
Unit tests mock external dependencies and focus on testing individual components in isolation.

- **Run unit tests only:**
  ```bash
  npm test
  ```

- **Run with coverage:**
  ```bash
  npm run test:coverage
  ```

- **Watch mode:**
  ```bash
  npm run test:watch
  ```

**Current Unit Test Coverage:** 30.25% statements

**Coverage by Component:**
- Utils: 100%
- Middleware: 84.9%
- Config: 80.95%
- Services (mocked): 20.29%
- Routes (mocked): 18.33%

### Integration Tests
Integration tests use real DynamoDB and Redis instances to test actual behavior.

**Prerequisites:**
1. DynamoDB Local running at `http://localhost:8000`
2. Redis server running at `redis://localhost:6379`

**Setup DynamoDB Local:**
```bash
# Using Docker
docker run -p 8000:8000 amazon/dynamodb-local

# Or using AWS CLI tools
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
```

**Setup Redis:**
```bash
# Using Docker
docker run -p 6379:6379 redis:latest

# Or using Homebrew (macOS)
brew install redis
brew services start redis

# Or using apt (Linux)
sudo apt-get install redis-server
sudo systemctl start redis
```

**Run integration tests:**
```bash
npm run test:integration
```

**Run all tests (unit + integration):**
```bash
npm run test:all
```

**Run all tests with coverage:**
```bash
npm run test:coverage:all
```

## Integration Test Features

### DynamoDB Service Integration Tests
Tests all CRUD operations against real DynamoDB:
- User operations (create, get, update, delete, list)
- Group operations (create, get, update, delete)
- Workspace operations (create, get, update, delete, user/group queries)
- Audit log operations (create, get)
- Health checks

### Route Integration Tests

#### Groups Routes
- Group creation with resource quotas
- Authorization (admin-only operations)
- Member management (add/remove users)
- Group listing and retrieval
- Validation of input data

#### Workspaces Routes
- Workspace creation linked to groups
- Ownership verification
- Workspace lifecycle (start/stop)
- Logs retrieval
- Authorization (owner/admin access)

## Test Isolation

Integration tests use unique IDs for each test run to prevent interference:
```typescript
const generateTestId = (prefix: string) => `${prefix}_test_${uuidv4().substring(0, 8)}`;
```

All test data is automatically cleaned up in `afterEach` or `afterAll` hooks.

## Environment Variables

Integration tests use these environment variables:
- `NODE_ENV=test`
- `REDIS_URL` - defaults to `redis://localhost:6379`
- `DYNAMODB_ENDPOINT` - defaults to `http://localhost:8000`
- `DYNAMODB_TABLE_PREFIX=test-codex-platform`
- `JWT_SECRET` - test JWT secret for token generation
- `SKIP_K8S_INIT=true` - disables Kubernetes client initialization

## Mocking Strategy

### Unit Tests
- Mock all external services (DynamoDB, Kubernetes, Redis)
- Mock authentication middleware
- Mock rate limiting
- Focus on business logic

### Integration Tests
- Use real DynamoDB and Redis
- Mock only Kubernetes service (infrastructure dependency)
- Generate real JWT tokens for authentication
- Test actual data persistence and retrieval

## Writing New Tests

### Unit Test Example
```typescript
import { myFunction } from '../../src/services/myService';
import { dependency } from '../../src/services/dependency';

jest.mock('../../src/services/dependency');

describe('myFunction', () => {
  it('should do something', () => {
    (dependency.method as jest.Mock).mockResolvedValue('mocked value');

    const result = myFunction();

    expect(result).toBe('expected');
  });
});
```

### Integration Test Example
```typescript
import '../setup/integration';
import request from 'supertest';
import app from '../../src/app';
import { dynamodbService } from '../../src/services/dynamodbService';

describe('My Integration Test', () => {
  let testData: any;

  beforeEach(async () => {
    testData = await dynamodbService.create({ ... });
  });

  afterEach(async () => {
    await dynamodbService.delete(testData.id);
  });

  it('should test real behavior', async () => {
    const response = await request(app)
      .get(`/api/resource/${testData.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });
});
```

## CI/CD Considerations

For CI/CD pipelines:
1. Start DynamoDB Local as a service
2. Start Redis as a service
3. Run `npm run test:all` to execute both unit and integration tests
4. Generate coverage reports

Example GitHub Actions:
```yaml
services:
  dynamodb:
    image: amazon/dynamodb-local
    ports:
      - 8000:8000
  redis:
    image: redis:latest
    ports:
      - 6379:6379

steps:
  - name: Run tests
    run: npm run test:all
    env:
      DYNAMODB_ENDPOINT: http://localhost:8000
      REDIS_URL: redis://localhost:6379
```

## Coverage Goals

- **Current Overall Coverage:** 30.25%
- **Target:** 70%

To reach the target, focus on:
1. Integration tests for route handlers (currently 18.33%)
2. Integration tests for service layers (currently 20.29%)
3. Additional unit tests for rate limiting (currently 51.85%)

## Troubleshooting

### Integration Tests Failing
1. Check if DynamoDB Local is running: `curl http://localhost:8000`
2. Check if Redis is running: `redis-cli ping`
3. Verify table prefix in environment: `DYNAMODB_TABLE_PREFIX=test-codex-platform`

### Connection Errors
- Ensure services are accessible on specified ports
- Check firewall settings
- Verify Docker containers are running (if using Docker)

### Timeout Errors
- Integration tests have 30s timeout (configured in `setup/integration.ts`)
- If tests timeout, check service health and network latency

## Best Practices

1. **Test Isolation:** Always clean up test data
2. **Unique IDs:** Use `generateTestId()` for all test entities
3. **Mocking:** Mock only what you need, prefer integration tests for accuracy
4. **Coverage:** Aim for meaningful coverage, not just numbers
5. **Fast Feedback:** Run unit tests during development, integration tests before commits
6. **CI/CD:** Run both test suites in pipeline

## Future Improvements

- [ ] Add integration tests for admin routes
- [ ] Add integration tests for dashboard routes
- [ ] Improve Kubernetes service test coverage
- [ ] Add performance/load tests
- [ ] Add end-to-end tests with real Kubernetes cluster
- [ ] Implement test data factories for easier setup
- [ ] Add visual regression tests for any UI components
