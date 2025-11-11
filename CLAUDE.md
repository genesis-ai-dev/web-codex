# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Codex Web is a multi-tenant Kubernetes-based VSCode platform that enables users to create, manage, and access cloud-based development workspaces. The platform consists of a Node.js/Express backend API and a React/TypeScript frontend.

## Architecture

### Backend Architecture
- **Express API Server** (backend/src/app.ts) - RESTful API with OpenAPI-style endpoints
- **Service Layer Pattern**:
  - `kubernetesService.ts` - Manages Kubernetes resources (namespaces, deployments, pods)
  - `dynamodbService.ts` - Single-table DynamoDB design for all entity types
  - `userService.ts` - User authentication and authorization business logic
- **Middleware Stack**: Authentication (JWT), rate limiting, validation (Joi), error handling
- **Data Model**: Single-table DynamoDB design using PK/SK pattern with GSI for secondary access patterns
  - PK: `USER#{id}`, `GROUP#{id}`, `WORKSPACE#{id}`
  - GSI1 for email lookups: GSI1PK: `EMAIL#{email}`, GSI1SK: `USER#{id}`

### Frontend Architecture
- **React 18** with TypeScript and React Router for navigation
- **Context-based Auth** (contexts/AuthContext.tsx) - Handles OAuth flow and JWT token management
- **Component Library**: Reusable UI components in components/ (Button, Card, Modal, Input, etc.)
- **API Service Layer** (services/api.ts) - Axios-based HTTP client with auth token injection
- **Pages**: Dashboard, Workspaces, Groups, Admin (placeholder)

### Multi-Tenancy Model
- **Groups** represent tenants with isolated Kubernetes namespaces
- Each group has resource quotas (CPU, memory, storage)
- Users belong to groups and can only access workspaces within their groups
- Admins have cross-group visibility and control

### Authentication Flow
1. Frontend redirects to OAuth provider (AWS Cognito or Google)
2. Provider redirects back with authorization code to /auth/callback
3. Backend exchanges code for JWT tokens via /api/auth/callback
4. Frontend stores JWT in localStorage and includes in API requests
5. Backend validates JWT on protected routes via auth middleware (backend/src/middleware/auth.ts)

## Common Commands

### Backend Development

```bash
# Install dependencies
cd backend && npm install

# Start development server (with hot-reload)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Start production server
npm start

# Run tests
npm test                    # Unit tests only (mocks external services)
npm run test:watch          # Watch mode for unit tests
npm run test:integration    # Integration tests (requires DynamoDB Local + Redis)
npm run test:all            # Run both unit and integration tests
npm run test:coverage       # Coverage report for unit tests
npm run test:coverage:all   # Coverage report for all tests

# Linting
npm run lint                # Run ESLint
npm run lint:fix            # Fix auto-fixable issues

# Start local development services (Redis + DynamoDB Local)
docker-compose -f docker-compose.dev.yml up -d

# View logs
docker-compose -f docker-compose.dev.yml logs -f backend
```

### Frontend Development

```bash
# Install dependencies
cd frontend && npm install

# Start development server (runs on port 3000)
npm start

# Build for production
npm run build

# Run tests
npm test
```

### Integration Tests Prerequisites
Integration tests require local services:
- **DynamoDB Local** at http://localhost:8000
- **Redis** at redis://localhost:6379

Start these via Docker Compose:
```bash
cd backend && docker-compose -f docker-compose.dev.yml up -d dynamodb-local redis
```

## Key Implementation Patterns

### Error Handling
- Custom error classes in backend/src/utils/errors.ts: `KubernetesError`, `DatabaseError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`
- Centralized error handler middleware (backend/src/middleware/errorHandler.ts)
- Use `express-async-errors` package - async route handlers automatically catch and pass errors to error handler

### DynamoDB Single-Table Design
All entities stored in one table with pattern:
- Users: `PK=USER#{id}`, `SK=USER#{id}`, `GSI1PK=EMAIL#{email}`, `GSI1SK=USER#{id}`
- Groups: `PK=GROUP#{id}`, `SK=GROUP#{id}`
- Workspaces: `PK=WORKSPACE#{id}`, `SK=WORKSPACE#{id}`
- Audit Logs: `PK=AUDIT#{id}`, `SK=AUDIT#{id}`

### Kubernetes Resource Management
- Namespace per group: `{KUBERNETES_NAMESPACE_PREFIX}-{groupId}`
- Each workspace creates a Deployment with VSCode server pod
- ResourceQuota per namespace enforces group limits
- Service for external access to VSCode instances
- RBAC for namespace-level isolation

### Authentication Middleware
Protected routes use `authenticate` middleware (backend/src/middleware/auth.ts):
- Extracts JWT from Authorization header
- Verifies token signature and expiration
- Attaches `req.user` with user data
- Checks admin status from Cognito group membership

### Rate Limiting
- Global rate limit: 100 requests/minute per IP
- Applied to all /api/* routes except /api/health
- Implemented with express-rate-limit package
- Admin users can be exempted (check middleware/rateLimiting.ts)

## Important Environment Variables

### Backend (.env in backend/)
```bash
# Required
NODE_ENV=development|production
PORT=3001
JWT_SECRET=your-secret-key
AWS_REGION=us-west-2
DYNAMODB_REGION=us-west-2
DYNAMODB_TABLE_PREFIX=vscode-platform
REDIS_URL=redis://localhost:6379

# Optional (for local development)
DYNAMODB_ENDPOINT=http://localhost:8000  # Use DynamoDB Local
SKIP_K8S_INIT=true                        # Skip Kubernetes client init in tests

# OAuth providers (at least one required)
AWS_COGNITO_USER_POOL_ID=us-east-1_xxxxx
AWS_COGNITO_CLIENT_ID=xxxxx
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Kubernetes (production)
KUBERNETES_NAMESPACE_PREFIX=vscode-platform
```

### Frontend (.env.local in frontend/)
```bash
REACT_APP_AUTH_PROVIDER=cognito|google
REACT_APP_AUTH_CLIENT_ID=your-client-id
REACT_APP_AUTH_REGION=us-east-1
REACT_APP_USER_POOL_ID=us-east-1_xxxxx
REACT_APP_API_BASE_URL=http://localhost:3001/api
```

## Project-Specific Patterns

### Adding New API Endpoints
1. Define route handler in backend/src/routes/{resource}.ts
2. Add Joi validation schema if accepting request body (see validation/ directory pattern)
3. Implement business logic in appropriate service (services/)
4. Apply authentication middleware for protected routes: `router.get('/path', authenticate, handler)`
5. Mount route in backend/src/app.ts
6. Add corresponding API call in frontend/src/services/api.ts

### Kubernetes Service Namespace Handling
When creating/deleting groups:
1. Call `kubernetesService.createNamespace()` - includes retry logic for ResourceQuota creation
2. Use `waitForNamespace()` to ensure namespace is fully ready before proceeding
3. Always check `namespaceExists()` before operations - returns false for 404, throws for other errors
4. Group deletion cascades to namespace deletion (handles dependent resources)

### DynamoDB Access Patterns
- Get by ID: Direct get using PK/SK
- Get by email: Query GSI1 with GSI1PK=`EMAIL#{email}`
- List users: Scan with filter (not optimal - consider pagination for production)
- Workspace by group: Query pattern (see dynamodbService for implementation)

### Frontend Protected Routes
Wrap route components with `<ProtectedRoute>` in App.tsx:
- Checks `isAuthenticated` from AuthContext
- Shows loading spinner while checking auth state
- Redirects to /login if not authenticated

## Troubleshooting

### Backend won't start
- Verify all required environment variables are set (check backend/src/index.ts startup logs)
- Ensure Redis is running: `redis-cli ping` should return PONG
- Check Kubernetes config is accessible: `kubectl cluster-info`
- For DynamoDB access issues, verify AWS credentials or DynamoDB Local is running

### Integration tests failing
- Start required services: `cd backend && docker-compose -f docker-compose.dev.yml up -d`
- Verify DynamoDB Local: `curl http://localhost:8000`
- Verify Redis: `redis-cli ping`
- Check test environment variables in backend/tests/setup/integration.ts

### Namespace creation errors
- Check service account permissions (see backend/README.md Kubernetes Permissions section)
- ResourceQuota creation has retry logic - check logs for retry attempts
- Namespace deletion may take time - wait for finalizers to complete

### Authentication not working
- Verify OAuth provider configuration matches between frontend and backend
- Check JWT_SECRET is set and consistent
- Validate token expiration hasn't occurred
- For Cognito: ensure user pool and client ID are correct
- Check browser console and network tab for OAuth redirect issues

## Code Quality Notes
- All TypeScript code must have proper types (no `any` unless absolutely necessary)
- Backend services should throw custom error types from utils/errors.ts
- Frontend components should handle loading and error states
- Write integration tests for new service methods that touch external systems
- Use structured logging with Winston logger - include context objects, not just strings
