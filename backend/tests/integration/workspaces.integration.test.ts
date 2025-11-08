import '../setup/integration';
import request from 'supertest';
import app from '../../src/app';
import { dynamodbService } from '../../src/services/dynamodbService';
import { User, Group, Workspace, WorkspaceStatus } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

// Mock logger
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Kubernetes service
jest.mock('../../src/services/kubernetesService', () => ({
  kubernetesService: {
    createDeployment: jest.fn().mockResolvedValue(undefined),
    createService: jest.fn().mockResolvedValue(undefined),
    createPVC: jest.fn().mockResolvedValue(undefined),
    deleteDeployment: jest.fn().mockResolvedValue(undefined),
    deleteNamespace: jest.fn().mockResolvedValue(undefined),
    scaleDeployment: jest.fn().mockResolvedValue(undefined),
    getDeploymentStatus: jest.fn().mockResolvedValue({ ready: true, replicas: 1 }),
    getPodLogs: jest.fn().mockResolvedValue('Mock logs'),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

// Mock rate limiting
jest.mock('../../src/middleware/rateLimiting', () => ({
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
}));

describe('Workspaces Routes Integration Tests', () => {
  const generateTestId = (prefix: string) => `${prefix}_test_${uuidv4().substring(0, 8)}`;

  let adminUser: User;
  let regularUser: User;
  let otherUser: User;
  let adminToken: string;
  let regularToken: string;
  let otherToken: string;
  let testGroup: Group;

  const generateToken = (user: User): string => {
    const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret';
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      jwtSecret
    );
  };

  beforeAll(async () => {
    // Create test users
    const adminUserId = generateTestId('usr_admin');
    const regularUserId = generateTestId('usr');
    const otherUserId = generateTestId('usr_other');

    adminUser = await dynamodbService.createUser({
      id: adminUserId,
      username: 'wsadmin',
      email: `wsadmin_${adminUserId}@example.com`,
      groups: [],
      isAdmin: true,
    });

    regularUser = await dynamodbService.createUser({
      id: regularUserId,
      username: 'wsuser',
      email: `wsuser_${regularUserId}@example.com`,
      groups: [],
      isAdmin: false,
    });

    otherUser = await dynamodbService.createUser({
      id: otherUserId,
      username: 'otheruser',
      email: `otheruser_${otherUserId}@example.com`,
      groups: [],
      isAdmin: false,
    });

    // Create test group
    const groupId = generateTestId('grp');
    testGroup = await dynamodbService.createGroup({
      id: groupId,
      name: 'ws-test-group',
      displayName: 'Workspace Test Group',
      namespace: `group-ws-test-${groupId}`,
      resourceQuota: {
        cpu: '50',
        memory: '100Gi',
        storage: '500Gi',
        pods: 100,
      },
    });

    // Add regular user to group
    await dynamodbService.updateUser(regularUser.id, {
      groups: [testGroup.id],
    });

    adminToken = generateToken(adminUser);
    regularToken = generateToken(regularUser);
    otherToken = generateToken(otherUser);
  });

  afterAll(async () => {
    // Cleanup
    try {
      await dynamodbService.deleteUser(adminUser.id);
      await dynamodbService.deleteUser(regularUser.id);
      await dynamodbService.deleteUser(otherUser.id);
      await dynamodbService.deleteGroup(testGroup.id);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/workspaces', () => {
    it('should create workspace as group member', async () => {
      const workspaceId = generateTestId('ws');
      const workspaceData = {
        id: workspaceId,
        name: 'Integration Test Workspace',
        description: 'Created by integration test',
        groupId: testGroup.id,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
      };

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(workspaceData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace).toBeDefined();
      expect(response.body.workspace.id).toBe(workspaceId);
      expect(response.body.workspace.userId).toBe(regularUser.id);
      expect(response.body.workspace.status).toBe(WorkspaceStatus.PENDING);

      // Verify workspace in database
      const dbWorkspace = await dynamodbService.getWorkspace(workspaceId);
      expect(dbWorkspace).not.toBeNull();
      expect(dbWorkspace?.name).toBe('Integration Test Workspace');

      // Cleanup
      await dynamodbService.deleteWorkspace(workspaceId);
    });

    it('should reject workspace creation for non-group-member', async () => {
      const workspaceData = {
        id: generateTestId('ws'),
        name: 'Unauthorized Workspace',
        groupId: testGroup.id,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
      };

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${otherToken}`)
        .send(workspaceData)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should validate workspace data', async () => {
      const invalidData = {
        name: '', // Too short
        groupId: testGroup.id,
      };

      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent duplicate workspace IDs', async () => {
      const workspaceId = generateTestId('ws');
      const workspaceData = {
        id: workspaceId,
        name: 'Duplicate Test',
        groupId: testGroup.id,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
      };

      // Create first workspace
      await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(workspaceData)
        .expect(201);

      // Try duplicate
      const response = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(workspaceData)
        .expect(409);

      expect(response.body.code).toBe('CONFLICT_ERROR');

      // Cleanup
      await dynamodbService.deleteWorkspace(workspaceId);
    });
  });

  describe('GET /api/workspaces', () => {
    let userWorkspace: Workspace;

    beforeAll(async () => {
      const wsId = generateTestId('ws');
      userWorkspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'List Test Workspace',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.RUNNING,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 1,
      });
    });

    afterAll(async () => {
      await dynamodbService.deleteWorkspace(userWorkspace.id);
    });

    it('should list user workspaces', async () => {
      const response = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspaces).toBeDefined();
      expect(Array.isArray(response.body.workspaces)).toBe(true);

      const workspaceIds = response.body.workspaces.map((w: Workspace) => w.id);
      expect(workspaceIds).toContain(userWorkspace.id);
    });

    it('should not show other users workspaces', async () => {
      const response = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      const workspaceIds = response.body.workspaces.map((w: Workspace) => w.id);
      expect(workspaceIds).not.toContain(userWorkspace.id);
    });

    it('should list all workspaces for admin', async () => {
      const response = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspaces).toBeDefined();
      expect(Array.isArray(response.body.workspaces)).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/workspaces')
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/workspaces/:id', () => {
    let testWorkspace: Workspace;

    beforeAll(async () => {
      const wsId = generateTestId('ws');
      testWorkspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Get Test Workspace',
        description: 'For getting',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.RUNNING,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 1,
        url: 'https://workspace.example.com',
      });
    });

    afterAll(async () => {
      await dynamodbService.deleteWorkspace(testWorkspace.id);
    });

    it('should get workspace as owner', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace).toBeDefined();
      expect(response.body.workspace.id).toBe(testWorkspace.id);
      expect(response.body.workspace.name).toBe('Get Test Workspace');
      expect(response.body.workspace.url).toBe('https://workspace.example.com');
    });

    it('should get workspace as admin', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace.id).toBe(testWorkspace.id);
    });

    it('should reject access for non-owner', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${testWorkspace.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await request(app)
        .get('/api/workspaces/ws_nonexistent')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND_ERROR');
    });
  });

  describe('PATCH /api/workspaces/:id', () => {
    let testWorkspaceForUpdate: Workspace;

    beforeEach(async () => {
      const wsId = generateTestId('ws');
      testWorkspaceForUpdate = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Update Test Workspace',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.STOPPED,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      });
    });

    afterEach(async () => {
      try {
        await dynamodbService.deleteWorkspace(testWorkspaceForUpdate.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should update workspace as owner', async () => {
      const updates = {
        name: 'Updated Workspace Name',
        description: 'Updated description',
      };

      const response = await request(app)
        .patch(`/api/workspaces/${testWorkspaceForUpdate.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace.name).toBe('Updated Workspace Name');
      expect(response.body.workspace.description).toBe('Updated description');

      // Verify in database
      const dbWorkspace = await dynamodbService.getWorkspace(testWorkspaceForUpdate.id);
      expect(dbWorkspace?.name).toBe('Updated Workspace Name');
    });

    it('should update workspace as admin', async () => {
      const updates = {
        status: WorkspaceStatus.RUNNING,
      };

      const response = await request(app)
        .patch(`/api/workspaces/${testWorkspaceForUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace.status).toBe(WorkspaceStatus.RUNNING);
    });

    it('should reject update for non-owner', async () => {
      const updates = {
        name: 'Hacked Name',
      };

      const response = await request(app)
        .patch(`/api/workspaces/${testWorkspaceForUpdate.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send(updates)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should validate update data', async () => {
      const invalidUpdate = {
        name: '', // Too short
      };

      const response = await request(app)
        .patch(`/api/workspaces/${testWorkspaceForUpdate.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('should delete workspace as owner', async () => {
      const wsId = generateTestId('ws');
      const workspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Delete Test',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.STOPPED,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      });

      const response = await request(app)
        .delete(`/api/workspaces/${workspace.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify deletion
      const dbWorkspace = await dynamodbService.getWorkspace(workspace.id);
      expect(dbWorkspace).toBeNull();
    });

    it('should delete workspace as admin', async () => {
      const wsId = generateTestId('ws');
      const workspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Admin Delete Test',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.STOPPED,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      });

      const response = await request(app)
        .delete(`/api/workspaces/${workspace.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject delete for non-owner', async () => {
      const wsId = generateTestId('ws');
      const workspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Protected Workspace',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.STOPPED,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      });

      const response = await request(app)
        .delete(`/api/workspaces/${workspace.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');

      // Cleanup
      await dynamodbService.deleteWorkspace(workspace.id);
    });
  });

  describe('POST /api/workspaces/:id/start', () => {
    let stoppedWorkspace: Workspace;

    beforeEach(async () => {
      const wsId = generateTestId('ws');
      stoppedWorkspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Start Test Workspace',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.STOPPED,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      });
    });

    afterEach(async () => {
      try {
        await dynamodbService.deleteWorkspace(stoppedWorkspace.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should start workspace as owner', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${stoppedWorkspace.id}/start`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace.status).toBe(WorkspaceStatus.STARTING);

      // Verify in database
      const dbWorkspace = await dynamodbService.getWorkspace(stoppedWorkspace.id);
      expect(dbWorkspace?.status).toBe(WorkspaceStatus.STARTING);
    });

    it('should reject start for non-owner', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${stoppedWorkspace.id}/start`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('POST /api/workspaces/:id/stop', () => {
    let runningWorkspace: Workspace;

    beforeEach(async () => {
      const wsId = generateTestId('ws');
      runningWorkspace = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Stop Test Workspace',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.RUNNING,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 1,
      });
    });

    afterEach(async () => {
      try {
        await dynamodbService.deleteWorkspace(runningWorkspace.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should stop workspace as owner', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${runningWorkspace.id}/stop`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.workspace.status).toBe(WorkspaceStatus.STOPPING);

      // Verify in database
      const dbWorkspace = await dynamodbService.getWorkspace(runningWorkspace.id);
      expect(dbWorkspace?.status).toBe(WorkspaceStatus.STOPPING);
    });

    it('should reject stop for non-owner', async () => {
      const response = await request(app)
        .post(`/api/workspaces/${runningWorkspace.id}/stop`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('GET /api/workspaces/:id/logs', () => {
    let workspaceWithLogs: Workspace;

    beforeAll(async () => {
      const wsId = generateTestId('ws');
      workspaceWithLogs = await dynamodbService.createWorkspace({
        id: wsId,
        name: 'Logs Test Workspace',
        groupId: testGroup.id,
        groupName: testGroup.displayName,
        userId: regularUser.id,
        status: WorkspaceStatus.RUNNING,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 1,
      });
    });

    afterAll(async () => {
      await dynamodbService.deleteWorkspace(workspaceWithLogs.id);
    });

    it('should get workspace logs as owner', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${workspaceWithLogs.id}/logs`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.logs).toBeDefined();
    });

    it('should get workspace logs as admin', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${workspaceWithLogs.id}/logs`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject logs access for non-owner', async () => {
      const response = await request(app)
        .get(`/api/workspaces/${workspaceWithLogs.id}/logs`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });
});
