# Backend Project Structure

This document describes the organization of the Codex Platform Backend API.

## Directory Structure

```
backend/
├── src/                        # Source code
│   ├── index.ts               # Application entry point
│   ├── app.ts                 # Express app configuration
│   ├── config/                # Configuration files
│   │   ├── index.ts          # Application configuration
│   │   └── logger.ts         # Winston logger configuration
│   ├── middleware/            # Express middleware
│   │   ├── auth.ts           # Authentication & authorization
│   │   ├── errorHandler.ts   # Global error handler
│   │   ├── notFound.ts       # 404 handler
│   │   ├── rateLimiting.ts   # Rate limiting configuration
│   │   └── validation.ts     # Request validation schemas
│   ├── routes/                # API route handlers
│   │   ├── admin.ts          # Admin endpoints
│   │   ├── dashboard.ts      # Dashboard statistics
│   │   ├── groups.ts         # Group management
│   │   ├── health.ts         # Health check endpoints
│   │   ├── setup.ts          # Setup/initialization
│   │   └── workspaces.ts     # Workspace management
│   ├── services/              # Business logic services
│   │   ├── dynamodbService.ts    # DynamoDB operations
│   │   ├── kubernetesService.ts  # Kubernetes operations
│   │   └── userService.ts        # User management
│   ├── types/                 # TypeScript type definitions
│   │   └── index.ts          # Shared interfaces and types
│   └── utils/                 # Utility functions
│       └── errors.ts         # Custom error classes
├── tests/                     # Test files
│   └── api.test.ts           # API integration tests
├── dist/                      # Compiled JavaScript (generated)
├── package.json               # Project dependencies
├── tsconfig.json             # TypeScript configuration
└── jest.config.js            # Jest test configuration
```

## Key Files

### Entry Point
- **src/index.ts**: Main entry point that starts the Express server
- **src/app.ts**: Express application setup with middleware and routes

### Configuration
- **src/config/index.ts**: Centralized configuration with environment variables
- **src/config/logger.ts**: Winston logger setup

### Middleware
- **src/middleware/auth.ts**: JWT authentication and role-based authorization
- **src/middleware/errorHandler.ts**: Centralized error handling
- **src/middleware/validation.ts**: Joi validation schemas
- **src/middleware/rateLimiting.ts**: Rate limiting configuration

### Routes
All routes are organized by resource:
- **/api/health**: Health check endpoints
- **/api/auth**: Authentication endpoints
- **/api/dashboard**: Dashboard statistics
- **/api/groups**: Group management
- **/api/workspaces**: Workspace CRUD operations
- **/api/admin**: Administrative functions

### Services
Business logic is separated into services:
- **dynamodbService**: Database operations
- **kubernetesService**: Kubernetes cluster interactions
- **userService**: User management and JWT operations

### Types
- **src/types/index.ts**: All TypeScript interfaces and types used across the application

## Path Aliases

The project uses TypeScript path aliases for cleaner imports:

```typescript
@config/*     -> src/config/*
@middleware/* -> src/middleware/*
@routes/*     -> src/routes/*
@services/*   -> src/services/*
@types/*      -> src/types/*
@utils/*      -> src/utils/*
```

Example usage:
```typescript
import { logger } from '@config/logger';
import { dynamodbService } from '@services/dynamodbService';
import { User } from '@types';
```

## Scripts

- `npm run build`: Compile TypeScript to JavaScript
- `npm start`: Run the compiled application
- `npm run dev`: Run in development mode with hot reload
- `npm test`: Run tests
- `npm run lint`: Lint TypeScript files
- `npm run lint:fix`: Fix linting issues

## Best Practices

1. **Separation of Concerns**: Keep routes thin, move business logic to services
2. **Type Safety**: Define all interfaces in `src/types/index.ts`
3. **Error Handling**: Use custom error classes from `src/utils/errors.ts`
4. **Logging**: Use the centralized logger from `src/config/logger.ts`
5. **Configuration**: Access all config through `src/config/index.ts`
6. **Validation**: Define validation schemas in `src/middleware/validation.ts`

## Adding New Features

1. **New Route**: Add to `src/routes/` and register in `src/app.ts`
2. **New Service**: Add to `src/services/`
3. **New Types**: Add to `src/types/index.ts`
4. **New Middleware**: Add to `src/middleware/` and apply in `src/app.ts`
