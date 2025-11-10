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
        try {
            logger_1.logger.info('Initializing DynamoDB service...');
            const awsConfig = { region: config_1.config.dynamodbRegion };
            logger_1.logger.info(`DynamoDB region: ${config_1.config.dynamodbRegion}`);
            // Use local DynamoDB endpoint if configured (for testing)
            if (config_1.config.dynamodbEndpoint) {
                awsConfig.endpoint = config_1.config.dynamodbEndpoint;
                logger_1.logger.info(`Using custom DynamoDB endpoint: ${config_1.config.dynamodbEndpoint}`);
            }
            else {
                logger_1.logger.info('Using default AWS DynamoDB endpoint');
            }
            logger_1.logger.info('Updating AWS config...');
            aws_sdk_1.default.config.update(awsConfig);
            logger_1.logger.info('AWS config updated');
            logger_1.logger.info('Creating DynamoDB DocumentClient...');
            this.dynamodb = new aws_sdk_1.default.DynamoDB.DocumentClient(awsConfig);
            logger_1.logger.info('DocumentClient created');
            logger_1.logger.info('Creating DynamoDB low-level client...');
            this.ddb = new aws_sdk_1.default.DynamoDB(awsConfig);
            logger_1.logger.info('Low-level client created');
            // Single table design
            this.tableName = config_1.config.dynamodbTableName || `${config_1.config.dynamodbTablePrefix}-main`;
            logger_1.logger.info(`DynamoDB table name: ${this.tableName}`);
            logger_1.logger.info('DynamoDB service initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('FATAL: Failed to initialize DynamoDB service:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
    }
    // User operations
    async createUser(user) {
        try {
            const item = {
                PK: `USER#${user.id}`,
                SK: `USER#${user.id}`,
                EntityType: 'USER',
                ...user,
                createdAt: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.tableName,
                Item: item,
                ConditionExpression: 'attribute_not_exists(PK)',
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
                TableName: this.tableName,
                Key: { PK: `USER#${id}`, SK: `USER#${id}` },
            }).promise();
            // DynamoDB returns undefined for Item when not found, but could also return empty object
            if (!result.Item || Object.keys(result.Item).length === 0) {
                return null;
            }
            return result.Item;
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get user ${id}`, error);
        }
    }
    async getUserByEmail(email) {
        try {
            const result = await this.dynamodb.query({
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :gsi1pk',
                ExpressionAttributeValues: {
                    ':gsi1pk': `EMAIL#${email}`,
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
                TableName: this.tableName,
                Key: { PK: `USER#${id}`, SK: `USER#${id}` },
                UpdateExpression: `SET ${updateExpression.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ConditionExpression: 'attribute_exists(PK)',
                ReturnValues: 'ALL_NEW',
            }).promise();
            logger_1.logger.info(`User updated: ${id}`);
            return result.Attributes;
        }
        catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                throw new errors_1.NotFoundError(`User ${id} not found`);
            }
            throw new errors_1.DatabaseError(`Failed to update user ${id}`, error);
        }
    }
    async deleteUser(id) {
        try {
            await this.dynamodb.delete({
                TableName: this.tableName,
                Key: { PK: `USER#${id}`, SK: `USER#${id}` },
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
                TableName: this.tableName,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :entityType',
                ExpressionAttributeValues: {
                    ':entityType': 'USER',
                },
                Limit: limit,
            };
            if (nextToken) {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            }
            const result = await this.dynamodb.query(params).promise();
            const users = (result.Items || []);
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
                PK: `GROUP#${group.id}`,
                SK: `GROUP#${group.id}`,
                EntityType: 'GROUP',
                GSI1PK: 'GROUP',
                GSI1SK: group.id,
                ...group,
                memberCount: 0,
                createdAt: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.tableName,
                Item: item,
                ConditionExpression: 'attribute_not_exists(PK)',
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
                TableName: this.tableName,
                Key: { PK: `GROUP#${id}`, SK: `GROUP#${id}` },
            }).promise();
            // DynamoDB returns undefined for Item when not found, but could also return empty object
            if (!result.Item || Object.keys(result.Item).length === 0) {
                return null;
            }
            return result.Item;
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
                TableName: this.tableName,
                Key: { PK: `GROUP#${id}`, SK: `GROUP#${id}` },
                UpdateExpression: `SET ${updateExpression.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ConditionExpression: 'attribute_exists(id)',
                ReturnValues: 'ALL_NEW',
            }).promise();
            logger_1.logger.info(`Group updated: ${id}`);
            return result.Attributes;
        }
        catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                throw new errors_1.NotFoundError(`Group ${id} not found`);
            }
            throw new errors_1.DatabaseError(`Failed to update group ${id}`, error);
        }
    }
    async deleteGroup(id) {
        try {
            await this.dynamodb.delete({
                TableName: this.tableName,
                Key: { PK: `GROUP#${id}`, SK: `GROUP#${id}` },
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
                TableName: this.tableName,
                IndexName: 'userId-index',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId,
                },
            }).promise();
            return (result.Items || []);
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get groups for user ${userId}`, error);
        }
    }
    // Workspace operations
    async createWorkspace(workspace) {
        try {
            const item = {
                PK: `WORKSPACE#${workspace.id}`,
                SK: `WORKSPACE#${workspace.id}`,
                EntityType: 'WORKSPACE',
                GSI1PK: 'WORKSPACE',
                GSI1SK: workspace.id,
                ...workspace,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            await this.dynamodb.put({
                TableName: this.tableName,
                Item: item,
                ConditionExpression: 'attribute_not_exists(PK)',
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
                TableName: this.tableName,
                Key: { PK: `WORKSPACE#${id}`, SK: `WORKSPACE#${id}` },
            }).promise();
            // DynamoDB returns undefined for Item when not found, but could also return empty object
            if (!result.Item || Object.keys(result.Item).length === 0) {
                return null;
            }
            return result.Item;
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
                TableName: this.tableName,
                Key: { PK: `WORKSPACE#${id}`, SK: `WORKSPACE#${id}` },
                UpdateExpression: `SET ${updateExpression.join(', ')}`,
                ExpressionAttributeNames: expressionAttributeNames,
                ExpressionAttributeValues: expressionAttributeValues,
                ConditionExpression: 'attribute_exists(PK)',
                ReturnValues: 'ALL_NEW',
            }).promise();
            logger_1.logger.info(`Workspace updated: ${id}`);
            return result.Attributes;
        }
        catch (error) {
            if (error.code === 'ConditionalCheckFailedException') {
                throw new errors_1.NotFoundError(`Workspace ${id} not found`);
            }
            throw new errors_1.DatabaseError(`Failed to update workspace ${id}`, error);
        }
    }
    async deleteWorkspace(id) {
        try {
            await this.dynamodb.delete({
                TableName: this.tableName,
                Key: { PK: `WORKSPACE#${id}`, SK: `WORKSPACE#${id}` },
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
                TableName: this.tableName,
                IndexName: 'userId-index',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId,
                },
            }).promise();
            return (result.Items || []);
        }
        catch (error) {
            throw new errors_1.DatabaseError(`Failed to get workspaces for user ${userId}`, error);
        }
    }
    async getGroupWorkspaces(groupId) {
        try {
            const result = await this.dynamodb.query({
                TableName: this.tableName,
                IndexName: 'groupId-index',
                KeyConditionExpression: 'groupId = :groupId',
                ExpressionAttributeValues: {
                    ':groupId': groupId,
                },
            }).promise();
            return (result.Items || []);
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
                TableName: this.tableName,
                Item: item,
            }).promise();
            return item;
        }
        catch (error) {
            logger_1.logger.error('Failed to create audit log', error);
            // Don't throw error for audit logging failures
            return null;
        }
    }
    async getAuditLogs(startDate, endDate, userId, action, limit = 20, nextToken) {
        try {
            // Implementation would depend on your GSI structure
            // This is a simplified version
            const params = {
                TableName: this.tableName,
                Limit: limit,
            };
            if (nextToken) {
                params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            }
            const result = await this.dynamodb.scan(params).promise();
            const logs = (result.Items || []);
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
            await this.ddb.describeTable({ TableName: this.tableName }).promise();
            return true;
        }
        catch (error) {
            logger_1.logger.error('DynamoDB health check failed:', error);
            return false;
        }
    }
}
exports.dynamodbService = new DynamoDBService();
