import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { config } from '../config';
import { logger } from '../config/logger';
import { ValidationError } from '../utils/errors';

class CognitoService {
  private client: CognitoIdentityProviderClient | null = null;
  private readonly userPoolId: string;
  private readonly adminGroupName = 'platform-admins';

  constructor() {
    this.userPoolId = config.cognitoUserPoolId;

    // Only initialize if Cognito is configured
    if (this.userPoolId) {
      this.client = new CognitoIdentityProviderClient({
        region: config.awsRegion,
      });
      logger.info('Cognito service initialized');
    } else {
      logger.warn('Cognito User Pool ID not configured, Cognito service disabled');
    }
  }

  /**
   * Check if Cognito is enabled
   */
  isEnabled(): boolean {
    return !!this.client && !!this.userPoolId;
  }

  /**
   * Ensure Cognito is enabled before operations
   */
  private ensureEnabled(): void {
    if (!this.isEnabled()) {
      throw new ValidationError('Cognito is not configured. Set AWS_COGNITO_USER_POOL_ID environment variable.');
    }
  }

  /**
   * Create a new user in Cognito
   * @param email User's email address (will be username)
   * @param temporaryPassword Temporary password (user must change on first login)
   * @param name User's full name
   * @param sendInvite Whether to send invitation email (default: true)
   */
  async createUser(
    email: string,
    temporaryPassword: string,
    name?: string,
    sendInvite: boolean = true
  ): Promise<void> {
    this.ensureEnabled();

    try {
      const userAttributes = [
        {
          Name: 'email',
          Value: email,
        },
        {
          Name: 'email_verified',
          Value: 'true',
        },
      ];

      if (name) {
        userAttributes.push({
          Name: 'name',
          Value: name,
        });
      }

      const command = new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        UserAttributes: userAttributes,
        TemporaryPassword: temporaryPassword,
        MessageAction: sendInvite ? MessageActionType.RESEND : MessageActionType.SUPPRESS,
        DesiredDeliveryMediums: ['EMAIL'],
      });

      await this.client!.send(command);
      logger.info(`User created in Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to create user in Cognito: ${email}`, error);

      if (error.name === 'UsernameExistsException') {
        throw new ValidationError(`User with email ${email} already exists in Cognito`);
      }

      throw error;
    }
  }

  /**
   * Set user password (without requiring old password)
   * @param email User's email/username
   * @param password New password
   * @param permanent Whether password is permanent (false = temporary, user must change on next login)
   */
  async setUserPassword(
    email: string,
    password: string,
    permanent: boolean = false
  ): Promise<void> {
    this.ensureEnabled();

    try {
      const command = new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        Password: password,
        Permanent: permanent,
      });

      await this.client!.send(command);
      logger.info(`Password updated for user in Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to set password for user in Cognito: ${email}`, error);
      throw error;
    }
  }

  /**
   * Add user to admin group
   * @param email User's email/username
   */
  async promoteToAdmin(email: string): Promise<void> {
    this.ensureEnabled();

    try {
      const command = new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: this.adminGroupName,
      });

      await this.client!.send(command);
      logger.info(`User promoted to admin in Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to promote user to admin in Cognito: ${email}`, error);

      if (error.name === 'ResourceNotFoundException') {
        logger.warn(`Admin group '${this.adminGroupName}' does not exist in Cognito. User promoted in database only.`);
        // Don't throw - allow DB-only promotion
        return;
      }

      throw error;
    }
  }

  /**
   * Remove user from admin group
   * @param email User's email/username
   */
  async demoteFromAdmin(email: string): Promise<void> {
    this.ensureEnabled();

    try {
      const command = new AdminRemoveUserFromGroupCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        GroupName: this.adminGroupName,
      });

      await this.client!.send(command);
      logger.info(`User demoted from admin in Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to demote user from admin in Cognito: ${email}`, error);

      if (error.name === 'ResourceNotFoundException') {
        logger.warn(`Admin group '${this.adminGroupName}' does not exist in Cognito. User demoted in database only.`);
        // Don't throw - allow DB-only demotion
        return;
      }

      throw error;
    }
  }

  /**
   * Disable user account
   * @param email User's email/username
   */
  async disableUser(email: string): Promise<void> {
    this.ensureEnabled();

    try {
      const command = new AdminDisableUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
      });

      await this.client!.send(command);
      logger.info(`User disabled in Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to disable user in Cognito: ${email}`, error);
      throw error;
    }
  }

  /**
   * Enable user account
   * @param email User's email/username
   */
  async enableUser(email: string): Promise<void> {
    this.ensureEnabled();

    try {
      const command = new AdminEnableUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
      });

      await this.client!.send(command);
      logger.info(`User enabled in Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to enable user in Cognito: ${email}`, error);
      throw error;
    }
  }

  /**
   * Delete user from Cognito
   * @param email User's email/username
   */
  async deleteUser(email: string): Promise<void> {
    this.ensureEnabled();

    try {
      const command = new AdminDeleteUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
      });

      await this.client!.send(command);
      logger.info(`User deleted from Cognito: ${email}`);
    } catch (error: any) {
      logger.error(`Failed to delete user from Cognito: ${email}`, error);

      if (error.name === 'UserNotFoundException') {
        logger.warn(`User ${email} not found in Cognito, skipping deletion`);
        return;
      }

      throw error;
    }
  }

  /**
   * Get user details from Cognito
   * @param email User's email/username
   */
  async getUser(email: string): Promise<any> {
    this.ensureEnabled();

    try {
      const command = new AdminGetUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
      });

      const response = await this.client!.send(command);
      return response;
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        return null;
      }

      logger.error(`Failed to get user from Cognito: ${email}`, error);
      throw error;
    }
  }

  /**
   * Update user attributes in Cognito
   * @param email User's email/username
   * @param attributes Map of attribute names to values
   */
  async updateUserAttributes(
    email: string,
    attributes: Record<string, string>
  ): Promise<void> {
    this.ensureEnabled();

    try {
      const userAttributes = Object.entries(attributes).map(([name, value]) => ({
        Name: name,
        Value: value,
      }));

      const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        UserAttributes: userAttributes,
      });

      await this.client!.send(command);
      logger.info(`User attributes updated in Cognito: ${email}`, attributes);
    } catch (error: any) {
      logger.error(`Failed to update user attributes in Cognito: ${email}`, error);
      throw error;
    }
  }

  /**
   * List all users in Cognito (paginated)
   * @param limit Maximum number of users to return
   * @param paginationToken Token for pagination
   */
  async listUsers(limit: number = 60, paginationToken?: string): Promise<{
    users: any[];
    nextToken?: string;
  }> {
    this.ensureEnabled();

    try {
      const command = new ListUsersCommand({
        UserPoolId: this.userPoolId,
        Limit: limit,
        PaginationToken: paginationToken,
      });

      const response = await this.client!.send(command);

      return {
        users: response.Users || [],
        nextToken: response.PaginationToken,
      };
    } catch (error: any) {
      logger.error('Failed to list users from Cognito', error);
      throw error;
    }
  }
}

export const cognitoService = new CognitoService();
