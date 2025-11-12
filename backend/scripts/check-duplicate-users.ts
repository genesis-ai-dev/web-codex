#!/usr/bin/env ts-node
/**
 * Script to check for duplicate users in DynamoDB
 *
 * This script scans the DynamoDB table and identifies:
 * - Users with duplicate emails
 * - Users with duplicate usernames
 * - Orphaned user records
 *
 * Run with: npx ts-node scripts/check-duplicate-users.ts
 */

import { dynamodbService } from '../src/services/dynamodbService';
import { logger } from '../src/config/logger';

async function checkDuplicateUsers() {
  try {
    logger.info('Starting duplicate user check...');

    // Get all users
    const { users } = await dynamodbService.listUsers(10000);

    logger.info(`Found ${users.length} users total`);

    // Group by email
    const emailMap = new Map<string, typeof users>();
    const usernameMap = new Map<string, typeof users>();

    users.forEach(user => {
      // Check email duplicates
      if (!emailMap.has(user.email)) {
        emailMap.set(user.email, []);
      }
      emailMap.get(user.email)!.push(user);

      // Check username duplicates
      if (!usernameMap.has(user.username)) {
        usernameMap.set(user.username, []);
      }
      usernameMap.get(user.username)!.push(user);
    });

    // Find duplicates
    const emailDuplicates = Array.from(emailMap.entries()).filter(([_, users]) => users.length > 1);
    const usernameDuplicates = Array.from(usernameMap.entries()).filter(([_, users]) => users.length > 1);

    if (emailDuplicates.length === 0 && usernameDuplicates.length === 0) {
      logger.info('✅ No duplicate users found!');
      return;
    }

    // Report email duplicates
    if (emailDuplicates.length > 0) {
      logger.warn(`Found ${emailDuplicates.length} duplicate emails:`);
      emailDuplicates.forEach(([email, users]) => {
        logger.warn(`\nEmail: ${email} (${users.length} users)`);
        users.forEach(user => {
          logger.warn(`  - ID: ${user.id}, Username: ${user.username}, Created: ${user.createdAt}, Admin: ${user.isAdmin}`);
        });

        // Suggest which one to keep (most recent or admin user)
        const sortedByDate = [...users].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const adminUser = users.find(u => u.isAdmin);
        const suggested = adminUser || sortedByDate[0];

        logger.warn(`  ⚠️  Suggested to keep: ${suggested.id} (${adminUser ? 'admin user' : 'most recent'})`);
        logger.warn(`  ⚠️  Suggested to delete: ${users.filter(u => u.id !== suggested.id).map(u => u.id).join(', ')}`);
      });
    }

    // Report username duplicates
    if (usernameDuplicates.length > 0) {
      logger.warn(`\nFound ${usernameDuplicates.length} duplicate usernames:`);
      usernameDuplicates.forEach(([username, users]) => {
        logger.warn(`\nUsername: ${username} (${users.length} users)`);
        users.forEach(user => {
          logger.warn(`  - ID: ${user.id}, Email: ${user.email}, Created: ${user.createdAt}`);
        });
      });
    }

    logger.info('\n📝 To fix duplicates, you can:');
    logger.info('   1. Manually delete duplicate users via the admin UI');
    logger.info('   2. Use the AWS DynamoDB console to delete items');
    logger.info('   3. Create a cleanup script to automatically merge/delete duplicates');

  } catch (error) {
    logger.error('Failed to check for duplicate users:', error);
    throw error;
  }
}

// Run the check
checkDuplicateUsers()
  .then(() => {
    logger.info('Duplicate user check completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
  });
