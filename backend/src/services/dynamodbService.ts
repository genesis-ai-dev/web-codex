import AWS from 'aws-sdk';
import { config } from '../config';
import { logger } from '../config/logger';
import { DatabaseError, NotFoundError } from '../utils/errors';
import { User, Group, Workspace, AuditLog, DynamoDBItem } from '../types';

class DynamoDBService {
  private dynamodb: AWS.DynamoDB.DocumentClient;
  private ddb: AWS.DynamoDB;
  private userTable: string;
  private groupTable: string;
  private workspaceTable: string;
  private auditLogTable: string;

  constructor() {
    const awsConfig: any = { region: config.dynamodbRegion };

    // Use local DynamoDB endpoint if configured (for testing)
    if (config.dynamodbEndpoint) {
      awsConfig.endpoint = config.dynamodbEndpoint;
    }

    AWS.config.update(awsConfig);
    this.dynamodb = new AWS.DynamoDB.DocumentClient(awsConfig);
    this.ddb = new AWS.DynamoDB(awsConfig);

    // Table names with prefix
    const prefix = config.dynamodbTablePrefix;
    this.userTable = `${prefix}-users`;
    this.groupTable = `${prefix}-groups`;
    this.workspaceTable = `${prefix}-workspaces`;
    this.auditLogTable = `${prefix}-audit-logs`;

    logger.info('DynamoDB service initialized');
  }

  // User operations
  async createUser(user: Omit<User, 'createdAt'>): Promise<User> {
    try {
      const item: User = {
        ...user,
        createdAt: new Date(),
      };

      await this.dynamodb.put({
        TableName: this.userTable,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)',
      }).promise();

      logger.info(`User created: ${user.id}`);
      return item;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new DatabaseError('User already exists');
      }
      throw new DatabaseError('Failed to create user', error);
    }
  }

  async getUser(id: string): Promise<User | null> {
    try {
      const result = await this.dynamodb.get({
        TableName: this.userTable,
        Key: { id },
      }).promise();

      // DynamoDB returns undefined for Item when not found, but could also return empty object
      if (!result.Item || Object.keys(result.Item).length === 0) {
        return null;
      }
      return result.Item as User;
    } catch (error) {
      throw new DatabaseError(`Failed to get user ${id}`, error);
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.userTable,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': email,
        },
      }).promise();

      return result.Items?.[0] as User || null;
    } catch (error) {
      throw new DatabaseError(`Failed to get user by email ${email}`, error);
    }
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    try {
      const updateExpression = [];
      const expressionAttributeNames: any = {};
      const expressionAttributeValues: any = {};

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
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
      }).promise();

      logger.info(`User updated: ${id}`);
      return result.Attributes as User;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new NotFoundError(`User ${id} not found`);
      }
      throw new DatabaseError(`Failed to update user ${id}`, error);
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      await this.dynamodb.delete({
        TableName: this.userTable,
        Key: { id },
      }).promise();

      logger.info(`User deleted: ${id}`);
    } catch (error) {
      throw new DatabaseError(`Failed to delete user ${id}`, error);
    }
  }

  async listUsers(limit: number = 20, nextToken?: string): Promise<{ users: User[], nextToken?: string }> {
    try {
      const params: AWS.DynamoDB.DocumentClient.ScanInput = {
        TableName: this.userTable,
        Limit: limit,
      };

      if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
      }

      const result = await this.dynamodb.scan(params).promise();

      const users = (result.Items || []) as User[];
      const responseNextToken = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      return { users, nextToken: responseNextToken };
    } catch (error) {
      throw new DatabaseError('Failed to list users', error);
    }
  }

  // Group operations
  async createGroup(group: Omit<Group, 'createdAt' | 'memberCount'>): Promise<Group> {
    try {
      const item: Group = {
        ...group,
        memberCount: 0,
        createdAt: new Date(),
      };

      await this.dynamodb.put({
        TableName: this.groupTable,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)',
      }).promise();

      logger.info(`Group created: ${group.id}`);
      return item;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new DatabaseError('Group already exists');
      }
      throw new DatabaseError('Failed to create group', error);
    }
  }

  async getGroup(id: string): Promise<Group | null> {
    try {
      const result = await this.dynamodb.get({
        TableName: this.groupTable,
        Key: { id },
      }).promise();

      // DynamoDB returns undefined for Item when not found, but could also return empty object
      if (!result.Item || Object.keys(result.Item).length === 0) {
        return null;
      }
      return result.Item as Group;
    } catch (error) {
      throw new DatabaseError(`Failed to get group ${id}`, error);
    }
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    try {
      const updateExpression = [];
      const expressionAttributeNames: any = {};
      const expressionAttributeValues: any = {};

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
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
      }).promise();

      logger.info(`Group updated: ${id}`);
      return result.Attributes as Group;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new NotFoundError(`Group ${id} not found`);
      }
      throw new DatabaseError(`Failed to update group ${id}`, error);
    }
  }

  async deleteGroup(id: string): Promise<void> {
    try {
      await this.dynamodb.delete({
        TableName: this.groupTable,
        Key: { id },
      }).promise();

      logger.info(`Group deleted: ${id}`);
    } catch (error) {
      throw new DatabaseError(`Failed to delete group ${id}`, error);
    }
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.groupTable,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }).promise();

      return (result.Items || []) as Group[];
    } catch (error) {
      throw new DatabaseError(`Failed to get groups for user ${userId}`, error);
    }
  }

  // Workspace operations
  async createWorkspace(workspace: Omit<Workspace, 'createdAt' | 'updatedAt'>): Promise<Workspace> {
    try {
      const item: Workspace = {
        ...workspace,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.dynamodb.put({
        TableName: this.workspaceTable,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)',
      }).promise();

      logger.info(`Workspace created: ${workspace.id}`);
      return item;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new DatabaseError('Workspace already exists');
      }
      throw new DatabaseError('Failed to create workspace', error);
    }
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    try {
      const result = await this.dynamodb.get({
        TableName: this.workspaceTable,
        Key: { id },
      }).promise();

      // DynamoDB returns undefined for Item when not found, but could also return empty object
      if (!result.Item || Object.keys(result.Item).length === 0) {
        return null;
      }
      return result.Item as Workspace;
    } catch (error) {
      throw new DatabaseError(`Failed to get workspace ${id}`, error);
    }
  }

  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<Workspace> {
    try {
      const updateExpression = [];
      const expressionAttributeNames: any = {};
      const expressionAttributeValues: any = {};

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
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
      }).promise();

      logger.info(`Workspace updated: ${id}`);
      return result.Attributes as Workspace;
    } catch (error) {
      if (error.code === 'ConditionalCheckFailedException') {
        throw new NotFoundError(`Workspace ${id} not found`);
      }
      throw new DatabaseError(`Failed to update workspace ${id}`, error);
    }
  }

  async deleteWorkspace(id: string): Promise<void> {
    try {
      await this.dynamodb.delete({
        TableName: this.workspaceTable,
        Key: { id },
      }).promise();

      logger.info(`Workspace deleted: ${id}`);
    } catch (error) {
      throw new DatabaseError(`Failed to delete workspace ${id}`, error);
    }
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.workspaceTable,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }).promise();

      return (result.Items || []) as Workspace[];
    } catch (error) {
      throw new DatabaseError(`Failed to get workspaces for user ${userId}`, error);
    }
  }

  async getGroupWorkspaces(groupId: string): Promise<Workspace[]> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.workspaceTable,
        IndexName: 'groupId-index',
        KeyConditionExpression: 'groupId = :groupId',
        ExpressionAttributeValues: {
          ':groupId': groupId,
        },
      }).promise();

      return (result.Items || []) as Workspace[];
    } catch (error) {
      throw new DatabaseError(`Failed to get workspaces for group ${groupId}`, error);
    }
  }

  // Audit log operations
  async createAuditLog(auditLog: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    try {
      const item: AuditLog = {
        ...auditLog,
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2)}`,
        timestamp: new Date(),
      };

      await this.dynamodb.put({
        TableName: this.auditLogTable,
        Item: item,
      }).promise();

      return item;
    } catch (error) {
      logger.error('Failed to create audit log', error);
      // Don't throw error for audit logging failures
      return null as any;
    }
  }

  async getAuditLogs(
    startDate?: Date,
    endDate?: Date,
    userId?: string,
    action?: string,
    limit: number = 20,
    nextToken?: string
  ): Promise<{ logs: AuditLog[], nextToken?: string }> {
    try {
      // Implementation would depend on your GSI structure
      // This is a simplified version
      const params: AWS.DynamoDB.DocumentClient.ScanInput = {
        TableName: this.auditLogTable,
        Limit: limit,
      };

      if (nextToken) {
        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
      }

      const result = await this.dynamodb.scan(params).promise();

      const logs = (result.Items || []) as AuditLog[];
      const responseNextToken = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      return { logs, nextToken: responseNextToken };
    } catch (error) {
      throw new DatabaseError('Failed to get audit logs', error);
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      // Simple check to see if we can access DynamoDB
      await this.ddb.describeTable({ TableName: this.userTable }).promise();
      return true;
    } catch (error) {
      logger.error('DynamoDB health check failed:', error);
      return false;
    }
  }
}

export const dynamodbService = new DynamoDBService();
