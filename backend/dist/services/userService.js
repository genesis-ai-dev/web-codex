"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const uuid_1 = require("uuid");
const dynamodbService_1 = require("./dynamodbService");
const logger_1 = require("../config/logger");
class UserService {
    async getOrCreateUser(jwtPayload) {
        try {
            // Determine admin status from JWT groups (Cognito groups like "platform-admins")
            // These are OAuth provider groups, NOT application groups
            const isAdmin = (jwtPayload.groups || []).includes('platform-admins');
            // IMPORTANT: Always check by email first before creating
            // This is the ONLY place where we check, to avoid race conditions
            let user = await dynamodbService_1.dynamodbService.getUserByEmail(jwtPayload.email);
            if (!user) {
                // Double-check by email one more time RIGHT before creating
                // to minimize race condition window
                user = await dynamodbService_1.dynamodbService.getUserByEmail(jwtPayload.email);
                if (!user) {
                    // Create new user - only if still doesn't exist
                    user = await dynamodbService_1.dynamodbService.createUser({
                        id: `usr_${(0, uuid_1.v4)().replace(/-/g, '')}`,
                        username: jwtPayload.username || jwtPayload.email.split('@')[0],
                        email: jwtPayload.email,
                        groups: [], // Start with no application groups
                        isAdmin: isAdmin, // Set from OAuth/Cognito groups
                    });
                    logger_1.logger.info(`New user created: ${user.email} (admin: ${isAdmin})`);
                }
                else {
                    logger_1.logger.info(`User appeared between checks (race condition handled): ${user.email}`);
                }
            }
            // Always update last login and admin status (for both new and existing users)
            // IMPORTANT: Do NOT overwrite application groups with JWT groups
            user = await dynamodbService_1.dynamodbService.updateUser(user.id, {
                lastLoginAt: new Date().toISOString(),
                isAdmin: isAdmin, // Always sync admin status from OAuth/Cognito
                // groups field is intentionally NOT updated here - preserve application groups
            });
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
