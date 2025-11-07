import { User, Group, Workspace, WorkspaceStatus } from '../../src/types';

/**
 * Mock helpers for testing
 */

// Mock users
export const mockUsers = {
  regularUser: (): User => ({
    id: 'usr_123',
    username: 'testuser',
    email: 'test@example.com',
    groups: ['grp_1'],
    isAdmin: false,
    createdAt: new Date('2024-01-01'),
  }),

  adminUser: (): User => ({
    id: 'usr_admin',
    username: 'admin',
    email: 'admin@example.com',
    groups: [],
    isAdmin: true,
    createdAt: new Date('2024-01-01'),
  }),

  userInMultipleGroups: (): User => ({
    id: 'usr_456',
    username: 'multiuser',
    email: 'multi@example.com',
    groups: ['grp_1', 'grp_2', 'grp_3'],
    isAdmin: false,
    createdAt: new Date('2024-01-01'),
  }),
};

// Mock groups
export const mockGroups = {
  group1: (): Group => ({
    id: 'grp_1',
    name: 'test-group',
    displayName: 'Test Group',
    description: 'A test group',
    namespace: 'group-test-group',
    memberCount: 5,
    resourceQuota: {
      cpu: '50',
      memory: '100Gi',
      storage: '500Gi',
      pods: 100,
    },
    createdAt: new Date('2024-01-01'),
  }),

  group2: (): Group => ({
    id: 'grp_2',
    name: 'another-group',
    displayName: 'Another Group',
    namespace: 'group-another-group',
    memberCount: 3,
    resourceQuota: {
      cpu: '30',
      memory: '64Gi',
      storage: '200Gi',
      pods: 50,
    },
    createdAt: new Date('2024-01-01'),
  }),
};

// Mock workspaces
export const mockWorkspaces = {
  runningWorkspace: (): Workspace => ({
    id: 'ws_123',
    name: 'My Workspace',
    description: 'Test workspace',
    groupId: 'grp_1',
    groupName: 'Test Group',
    userId: 'usr_123',
    status: WorkspaceStatus.RUNNING,
    resources: {
      cpu: '2',
      memory: '4Gi',
      storage: '10Gi',
    },
    image: 'codercom/code-server:latest',
    replicas: 1,
    url: 'https://workspace.example.com',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  }),

  stoppedWorkspace: (): Workspace => ({
    id: 'ws_456',
    name: 'Stopped Workspace',
    groupId: 'grp_1',
    groupName: 'Test Group',
    userId: 'usr_123',
    status: WorkspaceStatus.STOPPED,
    resources: {
      cpu: '1',
      memory: '2Gi',
      storage: '5Gi',
    },
    image: 'codercom/code-server:latest',
    replicas: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  }),
};

// Common mock setup for routes
export const setupRouteMocks = () => {
  return {
    standardRateLimit: (req: any, res: any, next: any) => next(),
    workspaceRateLimit: (req: any, res: any, next: any) => next(),
    adminRateLimit: (req: any, res: any, next: any) => next(),
    authRateLimit: (req: any, res: any, next: any) => next(),
    operationRateLimits: {
      createWorkspace: (req: any, res: any, next: any) => next(),
      deleteWorkspace: (req: any, res: any, next: any) => next(),
      workspaceActions: (req: any, res: any, next: any) => next(),
      createGroup: (req: any, res: any, next: any) => next(),
      bulkOperations: (req: any, res: any, next: any) => next(),
    },
  };
};

export const setupAuthMocks = (user?: User) => {
  return {
    authenticate: (req: any, res: any, next: any) => {
      if (user) {
        req.user = user;
        next();
      } else if (!req.user) {
        return res.status(401).json({ code: 'AUTHENTICATION_ERROR' });
      } else {
        next();
      }
    },
    requireAdmin: (req: any, res: any, next: any) => {
      if (!req.user?.isAdmin) {
        return res.status(403).json({ code: 'AUTHORIZATION_ERROR' });
      }
      next();
    },
    requireWorkspaceOwnership: () => (req: any, res: any, next: any) => {
      if (req.user?.isAdmin || req.workspace?.userId === req.user?.id) {
        next();
      } else {
        return res.status(403).json({ code: 'AUTHORIZATION_ERROR' });
      }
    },
    requireGroupMembership: () => (req: any, res: any, next: any) => {
      const groupId = req.params.id || req.params.groupId;
      if (!req.user?.groups.includes(groupId) && !req.user?.isAdmin) {
        return res.status(403).json({ code: 'AUTHORIZATION_ERROR' });
      }
      next();
    },
  };
};

// Helper to create authenticated request
export const createAuthenticatedRequest = (user: User) => {
  return {
    user,
    headers: {
      authorization: 'Bearer mock_token',
    },
  };
};

// Helper for pagination responses
export const createPaginatedResponse = <T>(items: T[], nextToken?: string) => {
  return {
    items,
    nextToken,
    hasMore: !!nextToken,
    total: items.length,
  };
};
