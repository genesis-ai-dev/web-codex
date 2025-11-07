"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dynamodbService = void 0;
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const config_1 = require("../config");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
class DynamoDBService {
    constructor() {
        aws_sdk_1.default.config.update({ region: config_1.config.dynamodbRegion });
        this.dynamodb = new aws_sdk_1.default.DynamoDB.DocumentClient();
        // Table names with prefix
        const prefix = config_1.config.dynamodbTablePrefix;
        this.userTable = `${prefix}-users`;
        this.groupTable = `${prefix}-groups`;
        this.workspaceTable = `${prefix}-workspaces`;
        this.auditLogTable = `${prefix}-audit-logs`;
        logger_1.logger.info('DynamoDB service initialized');
    }
    // User operations
    async createUser(user) {
        try {
            const item = {
                ...user,
                createdAt: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.userTable,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            }).promise();
            logger_1.logger.info(`User created: ${user.id}`);
            return item;
        }
        catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                throw new errors_1.DatabaseError('User already exists');
            }
            throw new errors_1.DatabaseError('Failed to create user', error);
        }
    }
    async getUser(id) {
        try {
            const result = await this.dynamodb.get({
                TableName: this.userTable,
                Key: { id },
            }).promise();
            return result.Item || null;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get user ${id}`, error);
        }
    }
    async getUserByEmail(email) {
        try {
            const result = await this.dynamodb.query({
                TableName: this.userTable,
                IndexName: 'email-index',
                KeyConditionExpression: 'email = :email',
                ExpressionAttributeValues: {
                    ':email': email,
                },
            }).promise();
            return result.Items?.[0] || null;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get user by email ${email}`, error);
        }
    }
    async updateUser(id, updates) {
        try {
            const updateExpression = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            for (const [key, value] of Object.entries(updates)) {
                if (key !== 'id' && value !== undefined) {
                    updateExpression.push(`#${key} = :${key}`);
                    expressionAttributeNames[`#${key}`] = key;
                    expressionAttributeValues[`:${key}`] = value;
                }
            }
            const result = await this.dynamodb.update({
                TableName: this.userTable,
                Key: { id },
                UpdateExpression: `SET ${updateExpression.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            }).promise();
            logger_1.logger.info(`User updated: ${id}`);
            return result.Attributes;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to update user ${id}`, error);
        }
    }
    async deleteUser(id) {
        try {
            await this.dynamodb.delete({
                TableName: this.userTable,
                Key: { id },
            }).promise();
            logger_1.logger.info(`User deleted: ${id}`);
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to delete user ${id}`, error);
        }
    }
    async listUsers(limit = 20, nextToken) {
        try {
            const params = {
                TableName: this.userTable,
                Limit: limit,
            };
            if (nextToken) {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            }
            const result = await this.dynamodb.scan(params).promise();
            const users = result.Items;
            const responseNextToken = result.LastEvaluatedKey
                ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
                : undefined;
            return { users, nextToken: responseNextToken };
        }
        catch (error) {
            throw new errors_1.DatabaseError('Failed to list users', error);
        }
    }
    // Group operations
    async createGroup(group) {
        try {
            const item = {
                ...group,
                memberCount: 0,
                createdAt: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.groupTable,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            }).promise();
            logger_1.logger.info(`Group created: ${group.id}`);
            return item;
        }
        catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                throw new errors_1.DatabaseError('Group already exists');
            }
            throw new errors_1.DatabaseError('Failed to create group', error);
        }
    }
    async getGroup(id) {
        try {
            const result = await this.dynamodb.get({
                TableName: this.groupTable,
                Key: { id },
            }).promise();
            return result.Item || null;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get group ${id}`, error);
        }
    }
    async updateGroup(id, updates) {
        try {
            const updateExpression = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            for (const [key, value] of Object.entries(updates)) {
                if (key !== 'id' && value !== undefined) {
                    updateExpression.push(`#${key} = :${key}`);
                    expressionAttributeNames[`#${key}`] = key;
                    expressionAttributeValues[`:${key}`] = value;
                }
            }
            const result = await this.dynamodb.update({
                TableName: this.groupTable,
                Key: { id },
                UpdateExpression: `SET ${updateExpression.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            }).promise();
            logger_1.logger.info(`Group updated: ${id}`);
            return result.Attributes;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to update group ${id}`, error);
        }
    }
    async deleteGroup(id) {
        try {
            await this.dynamodb.delete({
                TableName: this.groupTable,
                Key: { id },
            }).promise();
            logger_1.logger.info(`Group deleted: ${id}`);
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to delete group ${id}`, error);
        }
    }
    async getUserGroups(userId) {
        try {
            const result = await this.dynamodb.query({
                TableName: this.groupTable,
                IndexName: 'userId-index',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId,
                },
            }).promise();
            return result.Items || [];
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get groups for user ${userId}`, error);
        }
    }
    // Workspace operations
    async createWorkspace(workspace) {
        try {
            const item = {
                ...workspace,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.workspaceTable,
                Item: item,
                ConditionExpression: 'attribute_not_exists(id)',
            }).promise();
            logger_1.logger.info(`Workspace created: ${workspace.id}`);
            return item;
        }
        catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                throw new errors_1.DatabaseError('Workspace already exists');
            }
            throw new errors_1.DatabaseError('Failed to create workspace', error);
        }
    }
    async getWorkspace(id) {
        try {
            const result = await this.dynamodb.get({
                TableName: this.workspaceTable,
                Key: { id },
            }).promise();
            return result.Item || null;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get workspace ${id}`, error);
        }
    }
    async updateWorkspace(id, updates) {
        try {
            const updateExpression = [];
            const expressionAttributeNames = {};
            const expressionAttributeValues = {};
            // Always update the updatedAt timestamp
            updates.updatedAt = new Date();
            for (const [key, value] of Object.entries(updates)) {
                if (key !== 'id' && value !== undefined) {
                    updateExpression.push(`#${key} = :${key}`);
                    expressionAttributeNames[`#${key}`] = key;
                    expressionAttributeValues[`:${key}`] = value;
                }
            }
            const result = await this.dynamodb.update({
                TableName: this.workspaceTable,
                Key: { id },
                UpdateExpression: `SET ${updateExpression.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            }).promise();
            logger_1.logger.info(`Workspace updated: ${id}`);
            return result.Attributes;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to update workspace ${id}`, error);
        }
    }
    async deleteWorkspace(id) {
        try {
            await this.dynamodb.delete({
                TableName: this.workspaceTable,
                Key: { id },
            }).promise();
            logger_1.logger.info(`Workspace deleted: ${id}`);
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to delete workspace ${id}`, error);
        }
    }
    async getUserWorkspaces(userId) {
        try {
            const result = await this.dynamodb.query({
                TableName: this.workspaceTable,
                IndexName: 'userId-index',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId,
                },
            }).promise();
            return result.Items || [];
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get workspaces for user ${userId}`, error);
        }
    }
    async getGroupWorkspaces(groupId) {
        try {
            const result = await this.dynamodb.query({
                TableName: this.workspaceTable,
                IndexName: 'groupId-index',
                KeyConditionExpression: 'groupId = :groupId',
                ExpressionAttributeValues: {
                    ':groupId': groupId,
                },
            }).promise();
            return result.Items || [];
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get workspaces for group ${groupId}`, error);
        }
    }
    // Audit log operations
    async createAuditLog(auditLog) {
        try {
            const item = {
                ...auditLog,
                id: `log_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                timestamp: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.auditLogTable,
                Item: item,
            }).promise();
            return item;
        }
        catch (error) {
            logger_1.logger.error('Failed to create audit log', error);
            // Don't throw error for audit logging failures
            return item;
        }
    }
    async getAuditLogs(startDate, endDate, userId, action, limit = 20, nextToken) {
        try {
            // Implementation would depend on your GSI structure
            // This is a simplified version
            const params = {
                TableName: this.auditLogTable,
                Limit: limit,
            };
            if (nextToken) {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            }
            const result = await this.dynamodb.scan(params).promise();
            const logs = result.Items;
            const responseNextToken = result.LastEvaluatedKey
                ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
                : undefined;
            return { logs, nextToken: responseNextToken };
        }
        catch (error) {
            throw new errors_1.DatabaseError('Failed to get audit logs', error);
        }
    }
    // Health check
    async healthCheck() {
        try {
            // Simple check to see if we can access DynamoDB
            await this.dynamodb.describeTable({ TableName: this.userTable }).promise();
            return true;
        }
        catch (error) {
            logger_1.logger.error('DynamoDB health check failed:', error);
            return false;
        }
    }
}
exports.dynamodbService = new DynamoDBService();
