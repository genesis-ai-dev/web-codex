"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const uuid_1 = require("uuid");
const dynamodbService_1 = require("./dynamodbService");
const logger_1 = require("../config/logger");
class UserService {
    async getOrCreateUser(jwtPayload) {
        try {
            // Try to find existing user by email
            let user = await dynamodbService_1.dynamodbService.getUserByEmail(jwtPayload.email);
            if (!user) {
                // Create new user
                user = await dynamodbService_1.dynamodbService.createUser({
                    id: `usr_${(0, uuid_1.v4)().replace(/-/g, '')}`,
                    username: jwtPayload.username || jwtPayload.email.split('@')[0],
                    email: jwtPayload.email,
                    groups: jwtPayload.groups || [],
                    isAdmin: false, // Default to false, admins must be set manually
                });
                logger_1.logger.info(`New user created: ${user.email}`);
            }
            else {
                // Update user's last login and groups
                user = await dynamodbService_1.dynamodbService.updateUser(user.id, {
                    lastLoginAt: new Date(),
                    groups: jwtPayload.groups || user.groups, // Use JWT groups if available
                });
            }
            return user;
        }
        catch (error) {
            logger_1.logger.error('Error in getOrCreateUser:', error);
            throw error;
        }
    }
    async getUserById(id) {
        return await dynamodbService_1.dynamodbService.getUser(id);
    }
    async getUserByEmail(email) {
        return await dynamodbService_1.dynamodbService.getUserByEmail(email);
    }
    async updateUser(id, updates) {
        return await dynamodbService_1.dynamodbService.updateUser(id, updates);
    }
    async deleteUser(id) {
        await dynamodbService_1.dynamodbService.deleteUser(id);
    }
    async listUsers(limit = 20, nextToken) {
        return await dynamodbService_1.dynamodbService.listUsers(limit, nextToken);
    }
    async addUserToGroup(userId, groupId) {
        const user = await dynamodbService_1.dynamodbService.getUser(userId);
        if (!user) {
            throw new Error('User not found');
        }
        if (!user.groups.includes(groupId)) {
            const updatedGroups = [...user.groups, groupId];
            return await dynamodbService_1.dynamodbService.updateUser(userId, { groups: updatedGroups });
        }
        return user;
    }
    async removeUserFromGroup(userId, groupId) {
        const user = await dynamodbService_1.dynamodbService.getUser(userId);
        if (!user) {
            throw new Error('User not found');
        }
        const updatedGroups = user.groups.filter(g => g !== groupId);
        return await dynamodbService_1.dynamodbService.updateUser(userId, { groups: updatedGroups });
    }
    async getUserGroups(userId) {
        const user = await dynamodbService_1.dynamodbService.getUser(userId);
        return user?.groups || [];
    }
    async setUserAdmin(userId, isAdmin) {
        return await dynamodbService_1.dynamodbService.updateUser(userId, { isAdmin });
    }
}
exports.userService = new UserService();
