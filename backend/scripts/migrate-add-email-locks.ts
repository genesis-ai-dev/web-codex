#!/usr/bin/env ts-node
/**
 * Migration script to add EMAIL_LOCK records for existing users
 *
 * This script:
 * 1. Scans all existing users
 * 2. Creates EMAIL_LOCK records for each user to prevent future duplicates
 * 3. Reports any email conflicts (duplicate emails)
 *
 * Run with: npx ts-node scripts/migrate-add-email-locks.ts [--execute]
 *           Without --execute, it will run in dry-run mode (no changes)
 */

import AWS from 'aws-sdk';
import { config } from '../src/config';
import { logger } from '../src/config/logger';
import { dynamodbService } from '../src/services/dynamodbService';

const DRY_RUN = !process.argv.includes('--execute');

async function migrateEmailLocks() {
  try {
    if (DRY_RUN) {
      logger.info('🔍 Running in DRY-RUN mode. No changes will be made.');
      logger.info('   Add --execute flag to apply changes.');
    } else {
      logger.warn('⚠️  EXECUTING CHANGES TO DATABASE!');
    }

    logger.info('\nStarting email lock migration...');

    // Initialize DynamoDB client
    const awsConfig: any = { region: config.dynamodbRegion };
    if (config.dynamodbEndpoint) {
      awsConfig.endpoint = config.dynamodbEndpoint;
    }
    AWS.config.update(awsConfig);
    const dynamodb = new AWS.DynamoDB.DocumentClient(awsConfig);
    const tableName = config.dynamodbTableName || `${config.dynamodbTablePrefix}-main`;

    // Get all users
    const { users } = await dynamodbService.listUsers(10000);
    logger.info(`Found ${users.length} users`);

    // Track emails we've seen
    const emailMap = new Map<string, string[]>(); // email -> [userId1, userId2, ...]
    const locksToCreate: Array<{ email: string; userId: string }> = [];

    // Group users by email
    users.forEach(user => {
      if (!emailMap.has(user.email)) {
        emailMap.set(user.email, []);
      }
      emailMap.get(user.email)!.push(user.id);
      locksToCreate.push({ email: user.email, userId: user.id });
    });

    // Check for duplicates
    const duplicateEmails = Array.from(emailMap.entries()).filter(([_, userIds]) => userIds.length > 1);
    if (duplicateEmails.length > 0) {
      logger.warn(`\n⚠️  Found ${duplicateEmails.length} duplicate emails:`);
      duplicateEmails.forEach(([email, userIds]) => {
        logger.warn(`   - ${email}: ${userIds.length} users (${userIds.join(', ')})`);
      });
      logger.warn('\n   Run fix-duplicate-users.ts to clean up duplicates before migrating!');

      if (!DRY_RUN) {
        logger.error('\n❌ Migration aborted due to duplicate emails. Fix duplicates first.');
        process.exit(1);
      }
    }

    // Create email lock records
    logger.info(`\n📝 Creating ${locksToCreate.length} email lock records...`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const { email, userId } of locksToCreate) {
      const emailLockItem = {
        PK: `EMAIL_LOCK#${email}`,
        SK: `EMAIL_LOCK#${email}`,
        EntityType: 'EMAIL_LOCK',
        userId: userId,
        email: email,
        createdAt: new Date().toISOString(),
      };

      if (!DRY_RUN) {
        try {
          // Try to create the lock with a conditional check
          await dynamodb.put({
            TableName: tableName,
            Item: emailLockItem,
            ConditionExpression: 'attribute_not_exists(PK)',
          }).promise();

          successCount++;
          if (successCount % 10 === 0) {
            logger.info(`   Created ${successCount} locks...`);
          }
        } catch (error: any) {
          if (error.code === 'ConditionalCheckFailedException') {
            // Lock already exists, skip
            skipCount++;
          } else {
            logger.error(`   Failed to create lock for ${email}: ${error.message}`);
            errorCount++;
          }
        }
      } else {
        successCount++;
      }
    }

    logger.info(`\n✅ Migration completed!`);
    logger.info(`   - Success: ${successCount} locks ${DRY_RUN ? 'would be created' : 'created'}`);
    if (skipCount > 0) {
      logger.info(`   - Skipped: ${skipCount} (already exist)`);
    }
    if (errorCount > 0) {
      logger.error(`   - Errors: ${errorCount}`);
    }

    if (DRY_RUN) {
      logger.info('\n💡 To apply these changes, run: npx ts-node scripts/migrate-add-email-locks.ts --execute');
    }

  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
}

// Run the migration
migrateEmailLocks()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
