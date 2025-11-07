import AWS from 'aws-sdk';
import { dynamodbService } from '../../src/services/dynamodbService';
import { User, Group, Workspace, WorkspaceStatus, AuditLog } from '../../src/types';
import { DatabaseError } from '../../src/utils/errors';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockPromise = jest.fn();
  const mockPut = jest.fn(() => ({ promise: mockPromise }));
  const mockGet = jest.fn(() => ({ promise: mockPromise }));
  const mockQuery = jest.fn(() => ({ promise: mockPromise }));
  const mockUpdate = jest.fn(() => ({ promise: mockPromise }));
  const mockDelete = jest.fn(() => ({ promise: mockPromise }));
  const mockScan = jest.fn(() => ({ promise: mockPromise }));
  const mockBatchWrite = jest.fn(() => ({ promise: mockPromise }));
  const mockDescribeTable = jest.fn(() => ({ promise: mockPromise }));

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        put: mockPut,
        get: mockGet,
        query: mockQuery,
        update: mockUpdate,
        delete: mockDelete,
        scan: mockScan,
        batchWrite: mockBatchWrite,
      })),
    },
    config: {
      update: jest.fn(),
    },
  };
});

jest.mock('../../src/config/logger');

describe('DynamoDBService', () => {
  let mockDocumentClient: any;
  let mockPromise: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDocumentClient = new AWS.DynamoDB.DocumentClient();
    mockPromise = mockDocumentClient.put().promise;
  });

  describe('User Operations', () => {
    describe('createUser', () => {
      it('should create a user successfully', async () => {
        const userData: Omit<User, 'createdAt'> = {
          id: 'usr_123',
          username: 'testuser',
          email: 'test@example.com',
          groups: [],
          isAdmin: false,
        };

        mockPromise.mockResolvedValue({});

        const result = await dynamodbService.createUser(userData);

        expect(result).toHaveProperty('createdAt');
        expect(result.id).toBe('usr_123');
        expect(mockDocumentClient.put).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-users'),
            Item: expect.objectContaining(userData),
            ConditionExpression: 'attribute_not_exists(id)',
          })
        );
      });

      it('should throw DatabaseError if user already exists', async () => {
        const userData: Omit<User, 'createdAt'> = {
          id: 'usr_123',
          username: 'testuser',
          email: 'test@example.com',
          groups: [],
          isAdmin: false,
        };

        mockPromise.mockRejectedValue({ code: 'ConditionalCheckFailedException' });

        await expect(dynamodbService.createUser(userData)).rejects.toThrow('User already exists');
      });

      it('should throw DatabaseError on other errors', async () => {
        const userData: Omit<User, 'createdAt'> = {
          id: 'usr_123',
          username: 'testuser',
          email: 'test@example.com',
          groups: [],
          isAdmin: false,
        };

        mockPromise.mockRejectedValue(new Error('DynamoDB error'));

        await expect(dynamodbService.createUser(userData)).rejects.toThrow(DatabaseError);
      });
    });

    describe('getUser', () => {
      it('should get a user by id', async () => {
        const user: User = {
          id: 'usr_123',
          username: 'testuser',
          email: 'test@example.com',
          groups: [],
          isAdmin: false,
          createdAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Item: user });

        const result = await dynamodbService.getUser('usr_123');

        expect(result).toEqual(user);
        expect(mockDocumentClient.get).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-users'),
            Key: { id: 'usr_123' },
          })
        );
      });

      it('should return null if user not found', async () => {
        mockPromise.mockResolvedValue({});

        const result = await dynamodbService.getUser('usr_999');

        expect(result).toBeNull();
      });

      it('should throw DatabaseError on error', async () => {
        mockPromise.mockRejectedValue(new Error('DynamoDB error'));

        await expect(dynamodbService.getUser('usr_123')).rejects.toThrow(DatabaseError);
      });
    });

    describe('getUserByEmail', () => {
      it('should get a user by email', async () => {
        const user: User = {
          id: 'usr_123',
          username: 'testuser',
          email: 'test@example.com',
          groups: [],
          isAdmin: false,
          createdAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Items: [user] });

        const result = await dynamodbService.getUserByEmail('test@example.com');

        expect(result).toEqual(user);
        expect(mockDocumentClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-users'),
            IndexName: 'email-index',
            KeyConditionExpression: 'email = :email',
          })
        );
      });

      it('should return null if user not found by email', async () => {
        mockPromise.mockResolvedValue({ Items: [] });

        const result = await dynamodbService.getUserByEmail('notfound@example.com');

        expect(result).toBeNull();
      });

      it('should throw DatabaseError on error', async () => {
        mockPromise.mockRejectedValue(new Error('DynamoDB error'));

        await expect(dynamodbService.getUserByEmail('test@example.com')).rejects.toThrow(
          DatabaseError
        );
      });
    });

    describe('updateUser', () => {
      it('should update a user', async () => {
        const updates = { name: 'John Doe', isAdmin: true };
        const updatedUser: User = {
          id: 'usr_123',
          username: 'testuser',
          email: 'test@example.com',
          name: 'John Doe',
          groups: [],
          isAdmin: true,
          createdAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Attributes: updatedUser });

        const result = await dynamodbService.updateUser('usr_123', updates);

        expect(result).toEqual(updatedUser);
        expect(mockDocumentClient.update).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-users'),
            Key: { id: 'usr_123' },
            ReturnValues: 'ALL_NEW',
          })
        );
      });

      it('should throw DatabaseError on error', async () => {
        mockPromise.mockRejectedValue(new Error('DynamoDB error'));

        await expect(dynamodbService.updateUser('usr_123', { name: 'Test' })).rejects.toThrow(
          DatabaseError
        );
      });
    });

    describe('deleteUser', () => {
      it('should delete a user', async () => {
        mockPromise.mockResolvedValue({});

        await dynamodbService.deleteUser('usr_123');

        expect(mockDocumentClient.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-users'),
            Key: { id: 'usr_123' },
          })
        );
      });

      it('should throw DatabaseError on error', async () => {
        mockPromise.mockRejectedValue(new Error('DynamoDB error'));

        await expect(dynamodbService.deleteUser('usr_123')).rejects.toThrow(DatabaseError);
      });
    });

    describe('listUsers', () => {
      it('should list users with default limit', async () => {
        const users: User[] = [
          {
            id: 'usr_1',
            username: 'user1',
            email: 'user1@example.com',
            groups: [],
            isAdmin: false,
            createdAt: new Date(),
          },
          {
            id: 'usr_2',
            username: 'user2',
            email: 'user2@example.com',
            groups: [],
            isAdmin: false,
            createdAt: new Date(),
          },
        ];

        mockPromise.mockResolvedValue({ Items: users });

        const result = await dynamodbService.listUsers();

        expect(result.users).toEqual(users);
        expect(result.nextToken).toBeUndefined();
        expect(mockDocumentClient.scan).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-users'),
            Limit: 20,
          })
        );
      });

      it('should list users with pagination', async () => {
        const users: User[] = [
          {
            id: 'usr_1',
            username: 'user1',
            email: 'user1@example.com',
            groups: [],
            isAdmin: false,
            createdAt: new Date(),
          },
        ];

        const lastKey = { id: 'usr_1' };
        mockPromise.mockResolvedValue({ Items: users, LastEvaluatedKey: lastKey });

        const result = await dynamodbService.listUsers(50);

        expect(result.users).toEqual(users);
        expect(result.nextToken).toBeDefined();
      });

      it('should throw DatabaseError on error', async () => {
        mockPromise.mockRejectedValue(new Error('DynamoDB error'));

        await expect(dynamodbService.listUsers()).rejects.toThrow(DatabaseError);
      });
    });
  });

  describe('Group Operations', () => {
    describe('createGroup', () => {
      it('should create a group successfully', async () => {
        const groupData: Omit<Group, 'createdAt' | 'memberCount'> = {
          id: 'grp_123',
          name: 'test-group',
          displayName: 'Test Group',
          namespace: 'group-test-group',
          resourceQuota: { cpu: '50', memory: '100Gi', storage: '500Gi', pods: 100 },
        };

        mockPromise.mockResolvedValue({});

        const result = await dynamodbService.createGroup(groupData);

        expect(result).toHaveProperty('createdAt');
        expect(result.memberCount).toBe(0);
        expect(mockDocumentClient.put).toHaveBeenCalled();
      });

      it('should throw DatabaseError if group already exists', async () => {
        const groupData: Omit<Group, 'createdAt' | 'memberCount'> = {
          id: 'grp_123',
          name: 'test-group',
          displayName: 'Test Group',
          namespace: 'group-test-group',
          resourceQuota: { cpu: '50', memory: '100Gi', storage: '500Gi', pods: 100 },
        };

        mockPromise.mockRejectedValue({ code: 'ConditionalCheckFailedException' });

        await expect(dynamodbService.createGroup(groupData)).rejects.toThrow(
          'Group already exists'
        );
      });
    });

    describe('getGroup', () => {
      it('should get a group by id', async () => {
        const group: Group = {
          id: 'grp_123',
          name: 'test-group',
          displayName: 'Test Group',
          namespace: 'group-test-group',
          memberCount: 5,
          resourceQuota: { cpu: '50', memory: '100Gi', storage: '500Gi', pods: 100 },
          createdAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Item: group });

        const result = await dynamodbService.getGroup('grp_123');

        expect(result).toEqual(group);
      });

      it('should return null if group not found', async () => {
        mockPromise.mockResolvedValue({});

        const result = await dynamodbService.getGroup('grp_999');

        expect(result).toBeNull();
      });
    });

    describe('updateGroup', () => {
      it('should update a group', async () => {
        const updates = { displayName: 'Updated Group' };
        const updatedGroup: Group = {
          id: 'grp_123',
          name: 'test-group',
          displayName: 'Updated Group',
          namespace: 'group-test-group',
          memberCount: 5,
          resourceQuota: { cpu: '50', memory: '100Gi', storage: '500Gi', pods: 100 },
          createdAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Attributes: updatedGroup });

        const result = await dynamodbService.updateGroup('grp_123', updates);

        expect(result).toEqual(updatedGroup);
      });
    });

    describe('deleteGroup', () => {
      it('should delete a group', async () => {
        mockPromise.mockResolvedValue({});

        await dynamodbService.deleteGroup('grp_123');

        expect(mockDocumentClient.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-groups'),
            Key: { id: 'grp_123' },
          })
        );
      });
    });
  });

  describe('Workspace Operations', () => {
    describe('createWorkspace', () => {
      it('should create a workspace successfully', async () => {
        const workspaceData: Omit<Workspace, 'createdAt' | 'updatedAt'> = {
          id: 'ws_123',
          name: 'My Workspace',
          groupId: 'grp_123',
          groupName: 'Test Group',
          userId: 'usr_123',
          status: WorkspaceStatus.PENDING,
          resources: { cpu: '2', memory: '4Gi', storage: '10Gi' },
          image: 'codercom/code-server:latest',
          replicas: 1,
        };

        mockPromise.mockResolvedValue({});

        const result = await dynamodbService.createWorkspace(workspaceData);

        expect(result).toHaveProperty('createdAt');
        expect(result).toHaveProperty('updatedAt');
        expect(mockDocumentClient.put).toHaveBeenCalled();
      });
    });

    describe('getWorkspace', () => {
      it('should get a workspace by id', async () => {
        const workspace: Workspace = {
          id: 'ws_123',
          name: 'My Workspace',
          groupId: 'grp_123',
          groupName: 'Test Group',
          userId: 'usr_123',
          status: WorkspaceStatus.RUNNING,
          resources: { cpu: '2', memory: '4Gi', storage: '10Gi' },
          image: 'codercom/code-server:latest',
          replicas: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Item: workspace });

        const result = await dynamodbService.getWorkspace('ws_123');

        expect(result).toEqual(workspace);
      });
    });

    describe('updateWorkspace', () => {
      it('should update a workspace', async () => {
        const updates = { status: WorkspaceStatus.RUNNING };
        const updatedWorkspace: Workspace = {
          id: 'ws_123',
          name: 'My Workspace',
          groupId: 'grp_123',
          groupName: 'Test Group',
          userId: 'usr_123',
          status: WorkspaceStatus.RUNNING,
          resources: { cpu: '2', memory: '4Gi', storage: '10Gi' },
          image: 'codercom/code-server:latest',
          replicas: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPromise.mockResolvedValue({ Attributes: updatedWorkspace });

        const result = await dynamodbService.updateWorkspace('ws_123', updates);

        expect(result.status).toBe(WorkspaceStatus.RUNNING);
      });
    });

    describe('deleteWorkspace', () => {
      it('should delete a workspace', async () => {
        mockPromise.mockResolvedValue({});

        await dynamodbService.deleteWorkspace('ws_123');

        expect(mockDocumentClient.delete).toHaveBeenCalledWith(
          expect.objectContaining({
            TableName: expect.stringContaining('-workspaces'),
            Key: { id: 'ws_123' },
          })
        );
      });
    });

    describe('listWorkspaces', () => {
      it('should list workspaces', async () => {
        const workspaces: Workspace[] = [
          {
            id: 'ws_1',
            name: 'Workspace 1',
            groupId: 'grp_123',
            groupName: 'Test Group',
            userId: 'usr_123',
            status: WorkspaceStatus.RUNNING,
            resources: { cpu: '2', memory: '4Gi', storage: '10Gi' },
            image: 'codercom/code-server:latest',
            replicas: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ];

        mockPromise.mockResolvedValue({ Items: workspaces });

        const result = await dynamodbService.listWorkspaces();

        expect(result.workspaces).toEqual(workspaces);
      });
    });
  });

  describe('Audit Log Operations', () => {
    describe('createAuditLog', () => {
      it('should create an audit log entry', async () => {
        const logData: Omit<AuditLog, 'timestamp'> = {
          id: 'log_123',
          userId: 'usr_123',
          username: 'testuser',
          action: 'CREATE_WORKSPACE',
          resource: 'workspace:ws_123',
          success: true,
        };

        mockPromise.mockResolvedValue({});

        const result = await dynamodbService.createAuditLog(logData);

        expect(result).toHaveProperty('timestamp');
        expect(mockDocumentClient.put).toHaveBeenCalled();
      });
    });

    describe('getAuditLogs', () => {
      it('should get audit logs', async () => {
        const logs: AuditLog[] = [
          {
            id: 'log_1',
            userId: 'usr_123',
            username: 'testuser',
            action: 'CREATE_WORKSPACE',
            resource: 'workspace:ws_123',
            success: true,
            timestamp: new Date(),
          },
        ];

        mockPromise.mockResolvedValue({ Items: logs });

        const result = await dynamodbService.getAuditLogs();

        expect(result.logs).toEqual(logs);
      });
    });
  });
});
