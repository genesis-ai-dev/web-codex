import { userService } from '../../src/services/userService';
import { dynamodbService } from '../../src/services/dynamodbService';
import { User, JwtPayload } from '../../src/types';

// Mock the dynamodbService
jest.mock('../../src/services/dynamodbService');
jest.mock('../../src/config/logger');

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateUser', () => {
    const jwtPayload: JwtPayload = {
      sub: 'sub_123',
      email: 'test@example.com',
      username: 'cognito-uuid-123', // Cognito username (often a UUID)
      name: 'testuser', // User's actual name from OAuth
      groups: ['platform-admins'], // OAuth groups (not application groups)
      iat: Date.now(),
      exp: Date.now() + 3600000,
    };

    it('should create new user if not exists', async () => {
      const newUser: User = {
        id: 'usr_123',
        username: 'test',
        email: 'test@example.com',
        name: 'testuser',
        groups: [],
        isAdmin: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      (dynamodbService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (dynamodbService.createUser as jest.Mock).mockResolvedValue(newUser);
      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(newUser);

      const result = await userService.getOrCreateUser(jwtPayload);

      expect(dynamodbService.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(dynamodbService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test', // Email prefix
          name: 'testuser', // From JWT payload
          email: 'test@example.com',
          groups: [], // Start with empty groups
          isAdmin: true, // User is in platform-admins OAuth group
        })
      );
      expect(result).toEqual(newUser);
    });

    it('should use email prefix as username if username not provided', async () => {
      const payloadWithoutUsername: JwtPayload = {
        sub: 'sub_123',
        email: 'test@example.com',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };

      const newUser: User = {
        id: 'usr_123',
        username: 'test',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      (dynamodbService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (dynamodbService.createUser as jest.Mock).mockResolvedValue(newUser);
      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(newUser);

      await userService.getOrCreateUser(payloadWithoutUsername);

      expect(dynamodbService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test',
          name: undefined, // No name in payload
        })
      );
    });

    it('should update existing user on login', async () => {
      const existingUser: User = {
        id: 'usr_123',
        username: 'test',
        email: 'test@example.com',
        groups: ['oldgroup'],
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };

      const updatedUser: User = {
        ...existingUser,
        name: 'testuser',
        isAdmin: true,
        lastLoginAt: new Date().toISOString(),
      };

      (dynamodbService.getUserByEmail as jest.Mock).mockResolvedValue(existingUser);
      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.getOrCreateUser(jwtPayload);

      expect(dynamodbService.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(dynamodbService.updateUser).toHaveBeenCalledWith(
        'usr_123',
        expect.objectContaining({
          lastLoginAt: expect.any(String),
          isAdmin: true, // Should sync admin status from OAuth groups
          name: 'testuser', // Should update name from JWT
        })
      );
      expect(result).toEqual(updatedUser);
    });

    it('should handle errors during user creation', async () => {
      const error = new Error('Database error');
      (dynamodbService.getUserByEmail as jest.Mock).mockRejectedValue(error);

      await expect(userService.getOrCreateUser(jwtPayload)).rejects.toThrow('Database error');
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

      (dynamodbService.getUser as jest.Mock).mockResolvedValue(user);

      const result = await userService.getUserById('usr_123');

      expect(dynamodbService.getUser).toHaveBeenCalledWith('usr_123');
      expect(result).toEqual(user);
    });

    it('should return null if user not found', async () => {
      (dynamodbService.getUser as jest.Mock).mockResolvedValue(null);

      const result = await userService.getUserById('usr_999');

      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should return user by email', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

      (dynamodbService.getUserByEmail as jest.Mock).mockResolvedValue(user);

      const result = await userService.getUserByEmail('test@example.com');

      expect(dynamodbService.getUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual(user);
    });
  });

  describe('updateUser', () => {
    it('should update user', async () => {
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

      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.updateUser('usr_123', updates);

      expect(dynamodbService.updateUser).toHaveBeenCalledWith('usr_123', updates);
      expect(result).toEqual(updatedUser);
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      (dynamodbService.deleteUser as jest.Mock).mockResolvedValue(undefined);

      await userService.deleteUser('usr_123');

      expect(dynamodbService.deleteUser).toHaveBeenCalledWith('usr_123');
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

      (dynamodbService.listUsers as jest.Mock).mockResolvedValue({
        users,
        nextToken: undefined,
      });

      const result = await userService.listUsers();

      expect(dynamodbService.listUsers).toHaveBeenCalledWith(20, undefined);
      expect(result.users).toEqual(users);
    });

    it('should list users with custom limit and nextToken', async () => {
      const users: User[] = [];
      (dynamodbService.listUsers as jest.Mock).mockResolvedValue({
        users,
        nextToken: 'token_123',
      });

      const result = await userService.listUsers(50, 'token_abc');

      expect(dynamodbService.listUsers).toHaveBeenCalledWith(50, 'token_abc');
      expect(result.nextToken).toBe('token_123');
    });
  });

  describe('addUserToGroup', () => {
    it('should add user to group', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['group1'],
        isAdmin: false,
        createdAt: new Date(),
      };

      const updatedUser: User = {
        ...user,
        groups: ['group1', 'group2'],
      };

      (dynamodbService.getUser as jest.Mock).mockResolvedValue(user);
      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.addUserToGroup('usr_123', 'group2');

      expect(dynamodbService.updateUser).toHaveBeenCalledWith('usr_123', {
        groups: ['group1', 'group2'],
      });
      expect(result.groups).toContain('group2');
    });

    it('should not add duplicate group', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['group1'],
        isAdmin: false,
        createdAt: new Date(),
      };

      (dynamodbService.getUser as jest.Mock).mockResolvedValue(user);

      const result = await userService.addUserToGroup('usr_123', 'group1');

      expect(dynamodbService.updateUser).not.toHaveBeenCalled();
      expect(result).toEqual(user);
    });

    it('should throw error if user not found', async () => {
      (dynamodbService.getUser as jest.Mock).mockResolvedValue(null);

      await expect(userService.addUserToGroup('usr_999', 'group1')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('removeUserFromGroup', () => {
    it('should remove user from group', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['group1', 'group2'],
        isAdmin: false,
        createdAt: new Date(),
      };

      const updatedUser: User = {
        ...user,
        groups: ['group1'],
      };

      (dynamodbService.getUser as jest.Mock).mockResolvedValue(user);
      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.removeUserFromGroup('usr_123', 'group2');

      expect(dynamodbService.updateUser).toHaveBeenCalledWith('usr_123', {
        groups: ['group1'],
      });
      expect(result.groups).not.toContain('group2');
    });

    it('should throw error if user not found', async () => {
      (dynamodbService.getUser as jest.Mock).mockResolvedValue(null);

      await expect(userService.removeUserFromGroup('usr_999', 'group1')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getUserGroups', () => {
    it('should return user groups', async () => {
      const user: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: ['group1', 'group2'],
        isAdmin: false,
        createdAt: new Date(),
      };

      (dynamodbService.getUser as jest.Mock).mockResolvedValue(user);

      const result = await userService.getUserGroups('usr_123');

      expect(result).toEqual(['group1', 'group2']);
    });

    it('should return empty array if user not found', async () => {
      (dynamodbService.getUser as jest.Mock).mockResolvedValue(null);

      const result = await userService.getUserGroups('usr_999');

      expect(result).toEqual([]);
    });
  });

  describe('setUserAdmin', () => {
    it('should set user as admin', async () => {
      const updatedUser: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: true,
        createdAt: new Date(),
      };

      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.setUserAdmin('usr_123', true);

      expect(dynamodbService.updateUser).toHaveBeenCalledWith('usr_123', { isAdmin: true });
      expect(result.isAdmin).toBe(true);
    });

    it('should remove admin privileges', async () => {
      const updatedUser: User = {
        id: 'usr_123',
        username: 'testuser',
        email: 'test@example.com',
        groups: [],
        isAdmin: false,
        createdAt: new Date(),
      };

      (dynamodbService.updateUser as jest.Mock).mockResolvedValue(updatedUser);

      const result = await userService.setUserAdmin('usr_123', false);

      expect(dynamodbService.updateUser).toHaveBeenCalledWith('usr_123', { isAdmin: false });
      expect(result.isAdmin).toBe(false);
    });
  });
});
