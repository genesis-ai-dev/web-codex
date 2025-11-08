import '../setup/integration';
import { dynamodbService } from '../../src/services/dynamodbService';
import { User, Group, Workspace, WorkspaceStatus } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';

// Mock logger to reduce noise
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('DynamoDB Service Integration Tests', () => {
  // Helper to generate unique IDs for test isolation
  const generateTestId = (prefix: string) => `${prefix}_test_${uuidv4().substring(0, 8)}`;

  describe('User Operations', () => {
    let testUserId: string;

    beforeEach(() => {
      testUserId = generateTestId('usr');
    });

    it('should create a user', async () => {
      const userData: Omit<User, 'createdAt'> = {
        id: testUserId,
        username: 'testuser',
        email: `test_${testUserId}@example.com`,
        groups: [],
        isAdmin: false,
      };

      const user = await dynamodbService.createUser(userData);

      expect(user.id).toBe(testUserId);
      expect(user.username).toBe('testuser');
      expect(user.email).toBe(userData.email);
      expect(user.createdAt).toBeDefined();
    });

    it('should get a user by id', async () => {
      const userData: Omit<User, 'createdAt'> = {
        id: testUserId,
        username: 'gettest',
        email: `get_${testUserId}@example.com`,
        groups: ['grp_1'],
        isAdmin: false,
      };

      await dynamodbService.createUser(userData);
      const user = await dynamodbService.getUser(testUserId);

      expect(user).not.toBeNull();
      expect(user?.id).toBe(testUserId);
      expect(user?.groups).toContain('grp_1');
    });

    it('should return null for non-existent user', async () => {
      const user = await dynamodbService.getUser('usr_nonexistent');
      expect(user).toBeNull();
    });

    it('should get user by email', async () => {
      const email = `email_${testUserId}@example.com`;
      const userData: Omit<User, 'createdAt'> = {
        id: testUserId,
        username: 'emailtest',
        email,
        groups: [],
        isAdmin: false,
      };

      await dynamodbService.createUser(userData);
      const user = await dynamodbService.getUserByEmail(email);

      expect(user).not.toBeNull();
      expect(user?.email).toBe(email);
    });

    it('should update a user', async () => {
      const userData: Omit<User, 'createdAt'> = {
        id: testUserId,
        username: 'updatetest',
        email: `update_${testUserId}@example.com`,
        groups: [],
        isAdmin: false,
      };

      await dynamodbService.createUser(userData);

      const updates = {
        name: 'Updated Name',
        isAdmin: true,
        groups: ['grp_1', 'grp_2'],
      };

      const updatedUser = await dynamodbService.updateUser(testUserId, updates);

      expect(updatedUser.name).toBe('Updated Name');
      expect(updatedUser.isAdmin).toBe(true);
      expect(updatedUser.groups).toEqual(['grp_1', 'grp_2']);
    });

    it('should delete a user', async () => {
      const userData: Omit<User, 'createdAt'> = {
        id: testUserId,
        username: 'deletetest',
        email: `delete_${testUserId}@example.com`,
        groups: [],
        isAdmin: false,
      };

      await dynamodbService.createUser(userData);
      await dynamodbService.deleteUser(testUserId);

      const user = await dynamodbService.getUser(testUserId);
      expect(user).toBeNull();
    });

    it('should list users', async () => {
      const userId1 = generateTestId('usr');
      const userId2 = generateTestId('usr');

      await dynamodbService.createUser({
        id: userId1,
        username: 'listuser1',
        email: `list1_${userId1}@example.com`,
        groups: [],
        isAdmin: false,
      });

      await dynamodbService.createUser({
        id: userId2,
        username: 'listuser2',
        email: `list2_${userId2}@example.com`,
        groups: [],
        isAdmin: false,
      });

      const { users, nextToken } = await dynamodbService.listUsers(50);

      expect(users.length).toBeGreaterThanOrEqual(2);
      expect(users.some(u => u.id === userId1)).toBe(true);
      expect(users.some(u => u.id === userId2)).toBe(true);
    });

    it('should handle duplicate user creation', async () => {
      const userData: Omit<User, 'createdAt'> = {
        id: testUserId,
        username: 'duplicate',
        email: `dup_${testUserId}@example.com`,
        groups: [],
        isAdmin: false,
      };

      await dynamodbService.createUser(userData);

      await expect(dynamodbService.createUser(userData)).rejects.toThrow();
    });
  });

  describe('Group Operations', () => {
    let testGroupId: string;

    beforeEach(() => {
      testGroupId = generateTestId('grp');
    });

    it('should create a group', async () => {
      const groupData: Omit<Group, 'createdAt' | 'memberCount'> = {
        id: testGroupId,
        name: 'test-group',
        displayName: 'Test Group',
        description: 'Integration test group',
        namespace: `group-test-${testGroupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      const group = await dynamodbService.createGroup(groupData);

      expect(group.id).toBe(testGroupId);
      expect(group.name).toBe('test-group');
      expect(group.memberCount).toBe(0);
      expect(group.createdAt).toBeDefined();
    });

    it('should get a group by id', async () => {
      const groupData: Omit<Group, 'createdAt' | 'memberCount'> = {
        id: testGroupId,
        name: 'get-group',
        displayName: 'Get Group',
        namespace: `group-get-${testGroupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      await dynamodbService.createGroup(groupData);
      const group = await dynamodbService.getGroup(testGroupId);

      expect(group).not.toBeNull();
      expect(group?.id).toBe(testGroupId);
      expect(group?.name).toBe('get-group');
    });

    it('should update a group', async () => {
      const groupData: Omit<Group, 'createdAt' | 'memberCount'> = {
        id: testGroupId,
        name: 'update-group',
        displayName: 'Update Group',
        namespace: `group-update-${testGroupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      await dynamodbService.createGroup(groupData);

      const updates = {
        displayName: 'Updated Display Name',
        description: 'Updated description',
      };

      const updatedGroup = await dynamodbService.updateGroup(testGroupId, updates);

      expect(updatedGroup.displayName).toBe('Updated Display Name');
      expect(updatedGroup.description).toBe('Updated description');
    });

    it('should delete a group', async () => {
      const groupData: Omit<Group, 'createdAt' | 'memberCount'> = {
        id: testGroupId,
        name: 'delete-group',
        displayName: 'Delete Group',
        namespace: `group-delete-${testGroupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      await dynamodbService.createGroup(groupData);
      await dynamodbService.deleteGroup(testGroupId);

      const group = await dynamodbService.getGroup(testGroupId);
      expect(group).toBeNull();
    });
  });

  describe('Workspace Operations', () => {
    let testWorkspaceId: string;
    let testUserId: string;
    let testGroupId: string;

    beforeEach(() => {
      testWorkspaceId = generateTestId('ws');
      testUserId = generateTestId('usr');
      testGroupId = generateTestId('grp');
    });

    it('should create a workspace', async () => {
      const workspaceData: Omit<Workspace, 'createdAt' | 'updatedAt'> = {
        id: testWorkspaceId,
        name: 'Test Workspace',
        description: 'Integration test workspace',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.PENDING,
        resources: {
          cpu: '2',
          memory: '4Gi',
          storage: '10Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 1,
      };

      const workspace = await dynamodbService.createWorkspace(workspaceData);

      expect(workspace.id).toBe(testWorkspaceId);
      expect(workspace.name).toBe('Test Workspace');
      expect(workspace.status).toBe(WorkspaceStatus.PENDING);
      expect(workspace.createdAt).toBeDefined();
      expect(workspace.updatedAt).toBeDefined();
    });

    it('should get a workspace by id', async () => {
      const workspaceData: Omit<Workspace, 'createdAt' | 'updatedAt'> = {
        id: testWorkspaceId,
        name: 'Get Workspace',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.RUNNING,
        resources: {
          cpu: '1',
          memory: '2Gi',
          storage: '5Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 1,
      };

      await dynamodbService.createWorkspace(workspaceData);
      const workspace = await dynamodbService.getWorkspace(testWorkspaceId);

      expect(workspace).not.toBeNull();
      expect(workspace?.id).toBe(testWorkspaceId);
      expect(workspace?.status).toBe(WorkspaceStatus.RUNNING);
    });

    it('should update a workspace', async () => {
      const workspaceData: Omit<Workspace, 'createdAt' | 'updatedAt'> = {
        id: testWorkspaceId,
        name: 'Update Workspace',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.PENDING,
        resources: {
          cpu: '1',
          memory: '2Gi',
          storage: '5Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      };

      await dynamodbService.createWorkspace(workspaceData);

      const updates = {
        status: WorkspaceStatus.RUNNING,
        replicas: 1,
        url: 'https://workspace.example.com',
      };

      const updatedWorkspace = await dynamodbService.updateWorkspace(testWorkspaceId, updates);

      expect(updatedWorkspace.status).toBe(WorkspaceStatus.RUNNING);
      expect(updatedWorkspace.replicas).toBe(1);
      expect(updatedWorkspace.url).toBe('https://workspace.example.com');
    });

    it('should delete a workspace', async () => {
      const workspaceData: Omit<Workspace, 'createdAt' | 'updatedAt'> = {
        id: testWorkspaceId,
        name: 'Delete Workspace',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.STOPPED,
        resources: {
          cpu: '1',
          memory: '2Gi',
          storage: '5Gi',
        },
        image: 'codercom/code-server:latest',
        replicas: 0,
      };

      await dynamodbService.createWorkspace(workspaceData);
      await dynamodbService.deleteWorkspace(testWorkspaceId);

      const workspace = await dynamodbService.getWorkspace(testWorkspaceId);
      expect(workspace).toBeNull();
    });

    it('should get user workspaces', async () => {
      const ws1Id = generateTestId('ws');
      const ws2Id = generateTestId('ws');

      await dynamodbService.createWorkspace({
        id: ws1Id,
        name: 'User WS 1',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.RUNNING,
        resources: { cpu: '1', memory: '2Gi', storage: '5Gi' },
        image: 'codercom/code-server:latest',
        replicas: 1,
      });

      await dynamodbService.createWorkspace({
        id: ws2Id,
        name: 'User WS 2',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.STOPPED,
        resources: { cpu: '1', memory: '2Gi', storage: '5Gi' },
        image: 'codercom/code-server:latest',
        replicas: 0,
      });

      const workspaces = await dynamodbService.getUserWorkspaces(testUserId);

      expect(workspaces.length).toBeGreaterThanOrEqual(2);
      expect(workspaces.some(w => w.id === ws1Id)).toBe(true);
      expect(workspaces.some(w => w.id === ws2Id)).toBe(true);
    });

    it('should get group workspaces', async () => {
      const ws1Id = generateTestId('ws');

      await dynamodbService.createWorkspace({
        id: ws1Id,
        name: 'Group WS',
        groupId: testGroupId,
        groupName: 'Test Group',
        userId: testUserId,
        status: WorkspaceStatus.RUNNING,
        resources: { cpu: '1', memory: '2Gi', storage: '5Gi' },
        image: 'codercom/code-server:latest',
        replicas: 1,
      });

      const workspaces = await dynamodbService.getGroupWorkspaces(testGroupId);

      expect(workspaces.length).toBeGreaterThanOrEqual(1);
      expect(workspaces.some(w => w.id === ws1Id)).toBe(true);
    });
  });

  describe('Audit Log Operations', () => {
    it('should create an audit log entry', async () => {
      const logData: Omit<any, 'id' | 'timestamp'> = {
        userId: 'usr_test',
        username: 'testuser',
        action: 'CREATE_WORKSPACE',
        resource: 'workspace:ws_123',
        success: true,
        details: { workspaceId: 'ws_123' },
      };

      const log = await dynamodbService.createAuditLog(logData);

      expect(log.id).toBeDefined();
      expect(log.timestamp).toBeDefined();
      expect(log.action).toBe('CREATE_WORKSPACE');
      expect(log.success).toBe(true);
    });

    it('should get audit logs', async () => {
      const logData: Omit<any, 'id' | 'timestamp'> = {
        userId: 'usr_test',
        username: 'testuser',
        action: 'DELETE_WORKSPACE',
        resource: 'workspace:ws_456',
        success: false,
        error: 'Permission denied',
      };

      await dynamodbService.createAuditLog(logData);

      const { logs } = await dynamodbService.getAuditLogs(undefined, undefined, undefined, undefined, 50);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(l => l.action === 'DELETE_WORKSPACE')).toBe(true);
    });
  });

  describe('Health Check', () => {
    it('should pass health check', async () => {
      const isHealthy = await dynamodbService.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });
});
