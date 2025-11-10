import AWS from 'aws-sdk';
import { config } from '../config';
import { logger } from '../config/logger';
import { DatabaseError, NotFoundError } from '../utils/errors';
import { User, Group, Workspace, AuditLog, DynamoDBItem } from '../types';

class DynamoDBService {
  private dynamodb: AWS.DynamoDB.DocumentClient;
  private ddb: AWS.DynamoDB;
  private tableName: string;

  constructor() {
    try {
      logger.info('Initializing DynamoDB service...');

      const awsConfig: any = { region: config.dynamodbRegion };
      logger.info(`DynamoDB region: ${config.dynamodbRegion}`);

      // Use local DynamoDB endpoint if configured (for testing)
      if (config.dynamodbEndpoint) {
        awsConfig.endpoint = config.dynamodbEndpoint;
        logger.info(`Using custom DynamoDB endpoint: ${config.dynamodbEndpoint}`);
      } else {
        logger.info('Using default AWS DynamoDB endpoint');
      }

      logger.info('Updating AWS config...');
      AWS.config.update(awsConfig);
      logger.info('AWS config updated');

      logger.info('Creating DynamoDB DocumentClient...');
      this.dynamodb = new AWS.DynamoDB.DocumentClient(awsConfig);
      logger.info('DocumentClient created');

      logger.info('Creating DynamoDB low-level client...');
      this.ddb = new AWS.DynamoDB(awsConfig);
      logger.info('Low-level client created');

      // Single table design
      this.tableName = config.dynamodbTableName || `${config.dynamodbTablePrefix}-main`;
      logger.info(`DynamoDB table name: ${this.tableName}`);

      logger.info('DynamoDB service initialized successfully');
    } catch (error) {
      logger.error('FATAL: Failed to initialize DynamoDB service:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  // User operations
  async createUser(user: Omit<User, 'createdAt'>): Promise<User> {
    try {
      const item: any = {
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

      logger.info(`User created: ${user.id}`);
      return item as User;
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
        TableName: this.tableName,
        Key: { PK: `USER#${id}`, SK: `USER#${id}` },
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
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': `EMAIL#${email}`,
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
        TableName: this.tableName,
        Key: { PK: `USER#${id}`, SK: `USER#${id}` },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)',
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
        TableName: this.tableName,
        Key: { PK: `USER#${id}`, SK: `USER#${id}` },
      }).promise();

      logger.info(`User deleted: ${id}`);
    } catch (error) {
      throw new DatabaseError(`Failed to delete user ${id}`, error);
    }
  }

  async listUsers(limit: number = 20, nextToken?: string): Promise<{ users: User[], nextToken?: string }> {
    try {
      const params: AWS.DynamoDB.DocumentClient.QueryInput = {
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
      const item: any = {
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

      logger.info(`Group created: ${group.id}`);
      return item as Group;
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
        TableName: this.tableName,
        Key: { PK: `GROUP#${id}`, SK: `GROUP#${id}` },
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
        TableName: this.tableName,
        Key: { PK: `GROUP#${id}`, SK: `GROUP#${id}` },
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
        TableName: this.tableName,
        Key: { PK: `GROUP#${id}`, SK: `GROUP#${id}` },
      }).promise();

      logger.info(`Group deleted: ${id}`);
    } catch (error) {
      throw new DatabaseError(`Failed to delete group ${id}`, error);
    }
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    try {
      // Get the user to access their groups array
      const user = await this.getUser(userId);
      if (!user || !user.groups || user.groups.length === 0) {
        return [];
      }

      // Fetch all groups the user belongs to
      const groupPromises = user.groups.map(groupId => this.getGroup(groupId));
      const groups = await Promise.all(groupPromises);

      // Filter out any null results (in case a group was deleted)
      return groups.filter(g => g !== null) as Group[];
    } catch (error) {
      throw new DatabaseError(`Failed to get groups for user ${userId}`, error);
    }
  }

  // Workspace operations
  async createWorkspace(workspace: Omit<Workspace, 'createdAt' | 'updatedAt'>): Promise<Workspace> {
    try {
      const item: any = {
        PK: `WORKSPACE#${workspace.id}`,
        SK: `WORKSPACE#${workspace.id}`,
        EntityType: 'WORKSPACE',
        GSI1PK: `USER#${workspace.userId}`,
        GSI1SK: `WORKSPACE#${workspace.id}`,
        ...workspace,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.dynamodb.put({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      }).promise();

      logger.info(`Workspace created: ${workspace.id}`);
      return item as Workspace;
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
        TableName: this.tableName,
        Key: { PK: `WORKSPACE#${id}`, SK: `WORKSPACE#${id}` },
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
        TableName: this.tableName,
        Key: { PK: `WORKSPACE#${id}`, SK: `WORKSPACE#${id}` },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(PK)',
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
        TableName: this.tableName,
        Key: { PK: `WORKSPACE#${id}`, SK: `WORKSPACE#${id}` },
      }).promise();

      logger.info(`Workspace deleted: ${id}`);
    } catch (error) {
      throw new DatabaseError(`Failed to delete workspace ${id}`, error);
    }
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    try {
      const result = await this.dynamodb.query({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)',
        ExpressionAttributeValues: {
          ':gsi1pk': `USER#${userId}`,
          ':gsi1sk': 'WORKSPACE#',
        },
      }).promise();

      return (result.Items || []) as Workspace[];
    } catch (error) {
      throw new DatabaseError(`Failed to get workspaces for user ${userId}`, error);
    }
  }

  async getGroupWorkspaces(groupId: string): Promise<Workspace[]> {
    try {
      // Scan for workspaces with the specified groupId
      // Note: This is less efficient than a GSI query, but works with current schema
      const result = await this.dynamodb.scan({
        TableName: this.tableName,
        FilterExpression: 'EntityType = :entityType AND groupId = :groupId',
        ExpressionAttributeValues: {
          ':entityType': 'WORKSPACE',
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
        TableName: this.tableName,
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
        TableName: this.tableName,
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
      await this.ddb.describeTable({ TableName: this.tableName }).promise();
      return true;
    } catch (error) {
      logger.error('DynamoDB health check failed:', error);
      return false;
    }
  }
}

export const dynamodbService = new DynamoDBService();
