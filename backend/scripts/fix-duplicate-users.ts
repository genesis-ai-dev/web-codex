#!/usr/bin/env ts-node
/**
 * Script to fix duplicate users in DynamoDB
 *
 * This script will:
 * 1. Find users with duplicate emails
 * 2. Merge their data (keeping the admin user or most recent one)
 * 3. Delete the duplicate records
 *
 * IMPORTANT: This script will modify your database. Review the output carefully
 * and make a backup before running with --execute flag.
 *
 * Run with: npx ts-node scripts/fix-duplicate-users.ts [--execute]
 *           Without --execute, it will run in dry-run mode (no changes)
 */

import { dynamodbService } from '../src/services/dynamodbService';
import { userService } from '../src/services/userService';
import { logger } from '../src/config/logger';

const DRY_RUN = !process.argv.includes('--execute');

async function fixDuplicateUsers() {
  try {
    if (DRY_RUN) {
      logger.info('🔍 Running in DRY-RUN mode. No changes will be made.');
      logger.info('   Add --execute flag to apply changes.');
    } else {
      logger.warn('⚠️  EXECUTING CHANGES TO DATABASE!');
    }

    logger.info('\nStarting duplicate user fix...');

    // Get all users
    const { users } = await dynamodbService.listUsers(10000);
    logger.info(`Found ${users.length} users total`);

    // Group by email
    const emailMap = new Map<string, typeof users>();
    users.forEach(user => {
      if (!emailMap.has(user.email)) {
        emailMap.set(user.email, []);
      }
      emailMap.get(user.email)!.push(user);
    });

    // Find duplicates
    const emailDuplicates = Array.from(emailMap.entries()).filter(([_, users]) => users.length > 1);

    if (emailDuplicates.length === 0) {
      logger.info('✅ No duplicate users found!');
      return;
    }

    logger.info(`\nFound ${emailDuplicates.length} duplicate emails to fix\n`);

    for (const [email, duplicateUsers] of emailDuplicates) {
      logger.info(`\n${'='.repeat(80)}`);
      logger.info(`Processing: ${email} (${duplicateUsers.length} users)`);

      // Sort by priority: admin first, then by creation date (newest first)
      const sortedUsers = [...duplicateUsers].sort((a, b) => {
        if (a.isAdmin !== b.isAdmin) {
          return a.isAdmin ? -1 : 1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const userToKeep = sortedUsers[0];
      const usersToDelete = sortedUsers.slice(1);

      logger.info(`\n✅ Keeping user: ${userToKeep.id}`);
      logger.info(`   - Username: ${userToKeep.username}`);
      logger.info(`   - Email: ${userToKeep.email}`);
      logger.info(`   - Admin: ${userToKeep.isAdmin}`);
      logger.info(`   - Created: ${userToKeep.createdAt}`);
      logger.info(`   - Groups: ${userToKeep.groups.length} groups`);

      // Merge groups from duplicates
      const allGroups = new Set(userToKeep.groups);
      let hasNewGroups = false;

      for (const duplicateUser of usersToDelete) {
        logger.info(`\n❌ Will delete user: ${duplicateUser.id}`);
        logger.info(`   - Username: ${duplicateUser.username}`);
        logger.info(`   - Admin: ${duplicateUser.isAdmin}`);
        logger.info(`   - Created: ${duplicateUser.createdAt}`);
        logger.info(`   - Groups: ${duplicateUser.groups.length} groups`);

        // Merge groups
        duplicateUser.groups.forEach(groupId => {
          if (!allGroups.has(groupId)) {
            allGroups.add(groupId);
            hasNewGroups = true;
            logger.info(`   - Will merge group: ${groupId}`);
          }
        });
      }

      // Apply changes
      if (!DRY_RUN) {
        // Update groups if needed
        if (hasNewGroups) {
          logger.info(`\n📝 Updating groups for user ${userToKeep.id}...`);
          await dynamodbService.updateUser(userToKeep.id, {
            groups: Array.from(allGroups)
          });
          logger.info('   ✅ Groups updated');
        }

        // Delete duplicate users
        for (const duplicateUser of usersToDelete) {
          logger.info(`\n🗑️  Deleting user ${duplicateUser.id}...`);
          try {
            await userService.deleteUser(duplicateUser.id);
            logger.info('   ✅ Deleted successfully');
          } catch (error) {
            logger.error(`   ❌ Failed to delete: ${error.message}`);
          }
        }

        logger.info(`\n✅ Finished processing ${email}`);
      } else {
        logger.info('\n   (DRY-RUN: No changes made)');
      }
    }

    logger.info(`\n${'='.repeat(80)}`);
    logger.info('\n✅ Duplicate user fix completed');

    if (DRY_RUN) {
      logger.info('\n💡 To apply these changes, run: npx ts-node scripts/fix-duplicate-users.ts --execute');
    } else {
      logger.info('\n📋 Summary:');
      logger.info(`   - Fixed ${emailDuplicates.length} duplicate emails`);
      logger.info(`   - Merged groups and deleted duplicate records`);
    }

  } catch (error) {
    logger.error('Failed to fix duplicate users:', error);
    throw error;
  }
}

// Run the fix
fixDuplicateUsers()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
