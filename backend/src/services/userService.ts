import { v4 as uuidv4 } from 'uuid';
import { dynamodbService } from './dynamodbService';
import { logger } from '../config/logger';
import { User, JwtPayload, GroupRole, GroupMembership } from '../types';

class UserService {
  async getOrCreateUser(jwtPayload: JwtPayload): Promise<User> {
    try {
      // Determine admin status from JWT groups (Cognito groups like "platform-admins")
      // These are OAuth provider groups, NOT application groups
      const isAdmin = (jwtPayload.groups || []).includes('platform-admins');

      // Check if user exists by email
      let user = await dynamodbService.getUserByEmail(jwtPayload.email);

      if (!user) {
        // User doesn't exist, attempt to create
        try {
          user = await dynamodbService.createUser({
            id: `usr_${uuidv4().replace(/-/g, '')}`,
            username: jwtPayload.email.split('@')[0], // Use email prefix as username
            name: jwtPayload.name, // Use name from OAuth provider if available
            email: jwtPayload.email,
            groups: [], // Start with no application groups
            isAdmin: isAdmin, // Set from OAuth/Cognito groups
          });

          logger.info(`New user created: ${user.email} (admin: ${isAdmin})`);
        } catch (createError: any) {
          // Handle race condition: another request created the user at the same time
          if (createError.message?.includes('User already exists') ||
              createError.code === 'ConditionalCheckFailedException') {
            logger.info(`User creation race condition detected for ${jwtPayload.email}, fetching existing user`);

            // Fetch the user that was created by the other request
            user = await dynamodbService.getUserByEmail(jwtPayload.email);

            if (!user) {
              // This should never happen, but handle it just in case
              throw new Error(`Failed to fetch user after race condition: ${jwtPayload.email}`);
            }
          } else {
            // Some other error occurred
            throw createError;
          }
        }
      }

      // Always update last login, admin status, and name (for both new and existing users)
      // IMPORTANT: Do NOT overwrite application groups with JWT groups
      const updates: Partial<User> = {
        lastLoginAt: new Date().toISOString(),
        isAdmin: isAdmin, // Always sync admin status from OAuth/Cognito
        // groups field is intentionally NOT updated here - preserve application groups
      };

      // Update name if provided in JWT (keep existing name if not provided)
      if (jwtPayload.name) {
        updates.name = jwtPayload.name;
      }

      user = await dynamodbService.updateUser(user.id, updates);

      return user;
    } catch (error) {
      logger.error('Error in getOrCreateUser:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    return await dynamodbService.getUser(id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await dynamodbService.getUserByEmail(email);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    return await dynamodbService.updateUser(id, updates);
  }

  async deleteUser(id: string): Promise<void> {
    await dynamodbService.deleteUser(id);
  }

  async listUsers(limit: number = 20, nextToken?: string): Promise<{ users: User[], nextToken?: string }> {
    return await dynamodbService.listUsers(limit, nextToken);
  }

  async addUserToGroup(userId: string, groupId: string, role: GroupRole = GroupRole.MEMBER): Promise<User> {
    const user = await dynamodbService.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize groupMemberships if it doesn't exist
    const groupMemberships = user.groupMemberships || [];

    // Check if user is already in the group
    const existingMembership = groupMemberships.find(m => m.groupId === groupId);
    if (existingMembership) {
      // Update the role if different
      if (existingMembership.role !== role) {
        const updatedMemberships = groupMemberships.map(m =>
          m.groupId === groupId ? { ...m, role } : m
        );
        return await dynamodbService.updateUser(userId, { groupMemberships: updatedMemberships });
      }
      return user;
    }

    // Add new membership
    const updatedMemberships = [...groupMemberships, { groupId, role }];

    // Also update legacy groups array for backward compatibility
    const updatedGroups = user.groups.includes(groupId) ? user.groups : [...user.groups, groupId];

    return await dynamodbService.updateUser(userId, {
      groups: updatedGroups,
      groupMemberships: updatedMemberships,
    });
  }

  async removeUserFromGroup(userId: string, groupId: string): Promise<User> {
    const user = await dynamodbService.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Remove from groupMemberships
    const updatedMemberships = (user.groupMemberships || []).filter(m => m.groupId !== groupId);

    // Remove from legacy groups array
    const updatedGroups = user.groups.filter(g => g !== groupId);

    return await dynamodbService.updateUser(userId, {
      groups: updatedGroups,
      groupMemberships: updatedMemberships,
    });
  }

  async setUserGroupRole(userId: string, groupId: string, role: GroupRole): Promise<User> {
    const user = await dynamodbService.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize groupMemberships if it doesn't exist
    const groupMemberships = user.groupMemberships || [];

    // Check if user is in the group
    const existingMembership = groupMemberships.find(m => m.groupId === groupId);
    if (!existingMembership) {
      throw new Error('User is not a member of this group');
    }

    // Update the role
    const updatedMemberships = groupMemberships.map(m =>
      m.groupId === groupId ? { ...m, role } : m
    );

    return await dynamodbService.updateUser(userId, { groupMemberships: updatedMemberships });
  }

  async getUserGroupRole(userId: string, groupId: string): Promise<GroupRole | null> {
    const user = await dynamodbService.getUser(userId);
    if (!user) {
      return null;
    }

    const membership = user.groupMemberships?.find(m => m.groupId === groupId);
    return membership?.role || null;
  }

  async getUserGroups(userId: string): Promise<string[]> {
    const user = await dynamodbService.getUser(userId);
    return user?.groups || [];
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<User> {
    return await dynamodbService.updateUser(userId, { isAdmin });
  }
}

export const userService = new UserService();
