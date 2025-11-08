import '../setup/integration';
import request from 'supertest';
import app from '../../src/app';
import { dynamodbService } from '../../src/services/dynamodbService';
import { User, Group } from '../../src/types';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

// Mock logger to reduce noise
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
    createNamespace: jest.fn().mockResolvedValue(undefined),
    deleteNamespace: jest.fn().mockResolvedValue(undefined),
    applyResourceQuota: jest.fn().mockResolvedValue(undefined),
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

describe('Groups Routes Integration Tests', () => {
  const generateTestId = (prefix: string) => `${prefix}_test_${uuidv4().substring(0, 8)}`;

  let adminUser: User;
  let regularUser: User;
  let adminToken: string;
  let regularToken: string;
  let testGroup: Group;

  // Helper to generate JWT token
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

    adminUser = await dynamodbService.createUser({
      id: adminUserId,
      username: 'integrationadmin',
      email: `admin_${adminUserId}@example.com`,
      groups: [],
      isAdmin: true,
    });

    regularUser = await dynamodbService.createUser({
      id: regularUserId,
      username: 'integrationuser',
      email: `user_${regularUserId}@example.com`,
      groups: [],
      isAdmin: false,
    });

    adminToken = generateToken(adminUser);
    regularToken = generateToken(regularUser);
  });

  afterAll(async () => {
    // Cleanup test users
    try {
      await dynamodbService.deleteUser(adminUser.id);
      await dynamodbService.deleteUser(regularUser.id);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/groups', () => {
    it('should create a group as admin', async () => {
      const groupId = generateTestId('grp');
      const groupData = {
        id: groupId,
        name: 'integration-test-group',
        displayName: 'Integration Test Group',
        description: 'Created by integration test',
        namespace: `group-integration-test-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(groupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.group).toBeDefined();
      expect(response.body.group.id).toBe(groupId);
      expect(response.body.group.name).toBe('integration-test-group');
      expect(response.body.group.memberCount).toBe(0);

      // Verify group was created in database
      const dbGroup = await dynamodbService.getGroup(groupId);
      expect(dbGroup).not.toBeNull();
      expect(dbGroup?.displayName).toBe('Integration Test Group');

      // Cleanup
      await dynamodbService.deleteGroup(groupId);
    });

    it('should reject group creation for non-admin', async () => {
      const groupData = {
        id: generateTestId('grp'),
        name: 'test-group',
        displayName: 'Test Group',
        namespace: 'group-test',
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(groupData)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should validate group data', async () => {
      const invalidData = {
        name: 'Invalid Name!', // Invalid characters
        displayName: 'Test',
        namespace: 'group-test',
      };

      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent duplicate group creation', async () => {
      const groupId = generateTestId('grp');
      const groupData = {
        id: groupId,
        name: 'duplicate-test',
        displayName: 'Duplicate Test',
        namespace: `group-duplicate-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      };

      // Create first group
      await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(groupData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(groupData)
        .expect(409);

      expect(response.body.code).toBe('CONFLICT_ERROR');

      // Cleanup
      await dynamodbService.deleteGroup(groupId);
    });
  });

  describe('GET /api/groups', () => {
    beforeAll(async () => {
      // Create a test group
      const groupId = generateTestId('grp');
      testGroup = await dynamodbService.createGroup({
        id: groupId,
        name: 'list-test-group',
        displayName: 'List Test Group',
        namespace: `group-list-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      // Add regular user to group
      await dynamodbService.updateUser(regularUser.id, {
        groups: [testGroup.id],
      });
    });

    afterAll(async () => {
      // Cleanup
      await dynamodbService.deleteGroup(testGroup.id);
      await dynamodbService.updateUser(regularUser.id, {
        groups: [],
      });
    });

    it('should list groups for admin', async () => {
      const response = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.groups).toBeDefined();
      expect(Array.isArray(response.body.groups)).toBe(true);
      expect(response.body.groups.length).toBeGreaterThan(0);
    });

    it('should list only user groups for regular user', async () => {
      const response = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.groups).toBeDefined();
      const groupIds = response.body.groups.map((g: Group) => g.id);
      expect(groupIds).toContain(testGroup.id);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/groups')
        .expect(401);

      expect(response.body.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('GET /api/groups/:id', () => {
    let testGroupForGet: Group;

    beforeAll(async () => {
      const groupId = generateTestId('grp');
      testGroupForGet = await dynamodbService.createGroup({
        id: groupId,
        name: 'get-test-group',
        displayName: 'Get Test Group',
        namespace: `group-get-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      await dynamodbService.updateUser(regularUser.id, {
        groups: [testGroupForGet.id],
      });
    });

    afterAll(async () => {
      await dynamodbService.deleteGroup(testGroupForGet.id);
      await dynamodbService.updateUser(regularUser.id, {
        groups: [],
      });
    });

    it('should get group details as admin', async () => {
      const response = await request(app)
        .get(`/api/groups/${testGroupForGet.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.group).toBeDefined();
      expect(response.body.group.id).toBe(testGroupForGet.id);
      expect(response.body.group.displayName).toBe('Get Test Group');
    });

    it('should get group details as member', async () => {
      const response = await request(app)
        .get(`/api/groups/${testGroupForGet.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.group.id).toBe(testGroupForGet.id);
    });

    it('should return 404 for non-existent group', async () => {
      const response = await request(app)
        .get('/api/groups/grp_nonexistent')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND_ERROR');
    });
  });

  describe('PATCH /api/groups/:id', () => {
    let testGroupForUpdate: Group;

    beforeEach(async () => {
      const groupId = generateTestId('grp');
      testGroupForUpdate = await dynamodbService.createGroup({
        id: groupId,
        name: 'update-test-group',
        displayName: 'Update Test Group',
        namespace: `group-update-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });
    });

    afterEach(async () => {
      try {
        await dynamodbService.deleteGroup(testGroupForUpdate.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should update group as admin', async () => {
      const updates = {
        displayName: 'Updated Group Name',
        description: 'Updated description',
      };

      const response = await request(app)
        .patch(`/api/groups/${testGroupForUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updates)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.group.displayName).toBe('Updated Group Name');
      expect(response.body.group.description).toBe('Updated description');

      // Verify in database
      const dbGroup = await dynamodbService.getGroup(testGroupForUpdate.id);
      expect(dbGroup?.displayName).toBe('Updated Group Name');
    });

    it('should reject update for non-admin', async () => {
      const updates = {
        displayName: 'Hacked Name',
      };

      const response = await request(app)
        .patch(`/api/groups/${testGroupForUpdate.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(updates)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should validate update data', async () => {
      const invalidUpdate = {
        displayName: '', // Too short
      };

      const response = await request(app)
        .patch(`/api/groups/${testGroupForUpdate.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidUpdate)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/groups/:id', () => {
    it('should delete group as admin', async () => {
      const groupId = generateTestId('grp');
      const group = await dynamodbService.createGroup({
        id: groupId,
        name: 'delete-test',
        displayName: 'Delete Test',
        namespace: `group-delete-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      const response = await request(app)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify deletion
      const dbGroup = await dynamodbService.getGroup(group.id);
      expect(dbGroup).toBeNull();
    });

    it('should reject delete for non-admin', async () => {
      const groupId = generateTestId('grp');
      const group = await dynamodbService.createGroup({
        id: groupId,
        name: 'delete-test2',
        displayName: 'Delete Test 2',
        namespace: `group-delete2-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      const response = await request(app)
        .delete(`/api/groups/${group.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');

      // Cleanup
      await dynamodbService.deleteGroup(group.id);
    });
  });

  describe('POST /api/groups/:id/members', () => {
    let testGroupForMembers: Group;
    let newMemberUser: User;

    beforeAll(async () => {
      const groupId = generateTestId('grp');
      testGroupForMembers = await dynamodbService.createGroup({
        id: groupId,
        name: 'member-test-group',
        displayName: 'Member Test Group',
        namespace: `group-member-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      const userId = generateTestId('usr');
      newMemberUser = await dynamodbService.createUser({
        id: userId,
        username: 'newmember',
        email: `newmember_${userId}@example.com`,
        groups: [],
        isAdmin: false,
      });
    });

    afterAll(async () => {
      await dynamodbService.deleteGroup(testGroupForMembers.id);
      await dynamodbService.deleteUser(newMemberUser.id);
    });

    it('should add member to group as admin', async () => {
      const memberData = {
        userId: newMemberUser.id,
        role: 'developer',
      };

      const response = await request(app)
        .post(`/api/groups/${testGroupForMembers.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(memberData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify user was added to group
      const user = await dynamodbService.getUser(newMemberUser.id);
      expect(user?.groups).toContain(testGroupForMembers.id);
    });

    it('should reject invalid role', async () => {
      const memberData = {
        userId: newMemberUser.id,
        role: 'invalid_role',
      };

      const response = await request(app)
        .post(`/api/groups/${testGroupForMembers.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(memberData)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should require admin for adding members', async () => {
      const memberData = {
        userId: newMemberUser.id,
        role: 'developer',
      };

      const response = await request(app)
        .post(`/api/groups/${testGroupForMembers.id}/members`)
        .set('Authorization', `Bearer ${regularToken}`)
        .send(memberData)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('DELETE /api/groups/:id/members/:userId', () => {
    let testGroupForRemoval: Group;
    let memberToRemove: User;

    beforeEach(async () => {
      const groupId = generateTestId('grp');
      testGroupForRemoval = await dynamodbService.createGroup({
        id: groupId,
        name: 'removal-test-group',
        displayName: 'Removal Test Group',
        namespace: `group-removal-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      const userId = generateTestId('usr');
      memberToRemove = await dynamodbService.createUser({
        id: userId,
        username: 'membertoremove',
        email: `remove_${userId}@example.com`,
        groups: [testGroupForRemoval.id],
        isAdmin: false,
      });
    });

    afterEach(async () => {
      await dynamodbService.deleteGroup(testGroupForRemoval.id);
      await dynamodbService.deleteUser(memberToRemove.id);
    });

    it('should remove member from group as admin', async () => {
      const response = await request(app)
        .delete(`/api/groups/${testGroupForRemoval.id}/members/${memberToRemove.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify user was removed from group
      const user = await dynamodbService.getUser(memberToRemove.id);
      expect(user?.groups).not.toContain(testGroupForRemoval.id);
    });

    it('should reject removal for non-admin', async () => {
      const response = await request(app)
        .delete(`/api/groups/${testGroupForRemoval.id}/members/${memberToRemove.id}`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('GET /api/groups/:id/members', () => {
    let testGroupForMemberList: Group;
    let groupMember: User;

    beforeAll(async () => {
      const groupId = generateTestId('grp');
      testGroupForMemberList = await dynamodbService.createGroup({
        id: groupId,
        name: 'memberlist-test',
        displayName: 'Member List Test',
        namespace: `group-memberlist-${groupId}`,
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 50,
        },
      });

      const userId = generateTestId('usr');
      groupMember = await dynamodbService.createUser({
        id: userId,
        username: 'listmember',
        email: `listmember_${userId}@example.com`,
        groups: [testGroupForMemberList.id],
        isAdmin: false,
      });
    });

    afterAll(async () => {
      await dynamodbService.deleteGroup(testGroupForMemberList.id);
      await dynamodbService.deleteUser(groupMember.id);
    });

    it('should list group members as admin', async () => {
      const response = await request(app)
        .get(`/api/groups/${testGroupForMemberList.id}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.members).toBeDefined();
      expect(Array.isArray(response.body.members)).toBe(true);
    });

    it('should list group members as member', async () => {
      const memberToken = generateToken(groupMember);

      const response = await request(app)
        .get(`/api/groups/${testGroupForMemberList.id}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.members).toBeDefined();
    });

    it('should reject non-member access', async () => {
      const response = await request(app)
        .get(`/api/groups/${testGroupForMemberList.id}/members`)
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      expect(response.body.code).toBe('AUTHORIZATION_ERROR');
    });
  });
});
