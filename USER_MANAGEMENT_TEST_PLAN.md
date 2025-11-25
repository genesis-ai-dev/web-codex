# User Management System - Test Plan

This document outlines test cases to verify the new unified user management system that integrates AWS Cognito with the dashboard.

## Prerequisites

1. **Backend running** with environment variables configured:
   - `AWS_COGNITO_USER_POOL_ID` - Your Cognito User Pool ID
   - `AWS_COGNITO_CLIENT_ID` - Your Cognito App Client ID
   - `AWS_REGION` - AWS region (e.g., us-west-2)

2. **Admin user authenticated** in the frontend
3. At least one **group created** in the system

## Test Cases

### Test Case 1: Create User via Dashboard (Happy Path)

**Objective:** Verify that a new user can be created from the dashboard and syncs to Cognito.

**Steps:**
1. Log in as an admin user
2. Navigate to the **Users** page
3. Click the **"Create User"** button
4. Fill in the form:
   - Email: `testuser1@example.com`
   - Name: `Test User One`
   - Temporary Password: `TempPass123!`
   - Check "Send invitation email"
   - Leave "Grant admin privileges" unchecked
   - Select one group to assign
5. Click **"Create User"**

**Expected Results:**
- ✅ Success message appears
- ✅ New user appears in the users table
- ✅ User has "User" role badge (not "Admin")
- ✅ User shows assigned group
- ✅ Check AWS Cognito Console: User exists with email `testuser1@example.com`
- ✅ User status in Cognito: "FORCE_CHANGE_PASSWORD"
- ✅ If email sending is configured, user receives invitation email

**Backend Verification:**
```bash
# Check backend logs for successful user creation
tail -f backend/logs/app.log | grep "User.*created by admin"

# Expected log: "User testuser1@example.com created by admin <admin-id>"
```

---

### Test Case 2: Create Admin User

**Objective:** Verify admin users are created with proper permissions in both systems.

**Steps:**
1. Navigate to **Users** page
2. Click **"Create User"**
3. Fill in the form:
   - Email: `adminuser@example.com`
   - Name: `Admin User`
   - Temporary Password: `AdminPass123!`
   - **Check "Grant admin privileges"**
   - Optionally select groups
4. Click **"Create User"**

**Expected Results:**
- ✅ User appears with "Admin" role badge (purple)
- ✅ User shows in Cognito
- ✅ Check Cognito Console: User is member of `platform-admins` group
- ✅ User has `isAdmin: true` in database

**Verification Query:**
Check the audit logs to verify the action was logged:
```bash
# Via API (replace with your admin token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/admin/audit-logs?limit=5
```

---

### Test Case 3: Promote User to Admin

**Objective:** Verify existing users can be promoted to admin role.

**Steps:**
1. Find the user created in Test Case 1 (`testuser1@example.com`)
2. Click the **"Promote"** button next to their name
3. Confirm the action

**Expected Results:**
- ✅ Button changes from "Promote" to "Demote"
- ✅ User badge changes from "User" to "Admin"
- ✅ Button text turns purple
- ✅ User is added to `platform-admins` group in Cognito
- ✅ Page refreshes and still shows admin status

**Backend Logs:**
```bash
# Expected log
tail -f backend/logs/app.log | grep "promoted to admin"
# Output: "User <user-id> promoted to admin by <admin-id>"
```

---

### Test Case 4: Demote Admin User

**Objective:** Verify admin users can be demoted to regular users.

**Steps:**
1. Find the user promoted in Test Case 3
2. Click the **"Demote"** button
3. Confirm the action

**Expected Results:**
- ✅ Button changes from "Demote" to "Promote"
- ✅ User badge changes from "Admin" to "User"
- ✅ User is removed from `platform-admins` group in Cognito
- ✅ User can no longer access admin pages

**Edge Case Test:**
- Try to demote yourself (should be prevented)
- Expected: Error message "Cannot demote yourself"

---

### Test Case 5: Delete User

**Objective:** Verify users can be deleted from both systems.

**Steps:**
1. Find a test user to delete
2. Click the **"Delete"** button
3. Confirm the deletion in the dialog

**Expected Results:**
- ✅ Confirmation dialog appears with warning message
- ✅ User disappears from the users table
- ✅ User is deleted from Cognito
- ✅ User is deleted from DynamoDB

**Verification:**
```bash
# Check Cognito Console - user should not exist
# Check backend logs
tail -f backend/logs/app.log | grep "deleted by admin"
```

---

### Test Case 6: Manage User Groups

**Objective:** Verify users can be added/removed from groups.

**Steps:**
1. Find a user in the users table
2. Click **"Groups"** button
3. In the modal, click **"Add"** next to a group they're not in
4. Wait for success
5. Click **"Remove"** on a group they're in
6. Close the modal

**Expected Results:**
- ✅ Groups column updates immediately
- ✅ User shows new group badge
- ✅ Removed group no longer appears
- ✅ Changes persist after page refresh

---

### Test Case 7: Create User Without Cognito

**Objective:** Verify system works when Cognito is not configured.

**Steps:**
1. Stop backend
2. Comment out `AWS_COGNITO_USER_POOL_ID` in backend `.env`
3. Restart backend
4. Try to create a user

**Expected Results:**
- ✅ User is created in database only
- ✅ Warning logged: "Cognito not configured"
- ✅ User still appears in users table
- ✅ Admin promotion/demotion still works in database
- ⚠️ Password reset/enable/disable features throw error (expected)

---

### Test Case 8: Duplicate Email Prevention

**Objective:** Verify system prevents duplicate user creation.

**Steps:**
1. Try to create a user with email from Test Case 1
2. Fill form with `testuser1@example.com`
3. Click "Create User"

**Expected Results:**
- ❌ Error message: "User with email testuser1@example.com already exists"
- ✅ Form remains open
- ✅ No duplicate user created
- ✅ Existing user unchanged

---

### Test Case 9: Validation Tests

**Objective:** Verify form validation works correctly.

**Test 9A - Invalid Email:**
1. Click "Create User"
2. Enter invalid email: `notanemail`
3. Try to submit

Expected: Browser validation error

**Test 9B - Short Password:**
1. Enter valid email
2. Enter password: `short`
3. Submit

Expected: Server validation error "Password must be at least 8 characters"

**Test 9C - Invalid Group:**
1. Open browser console
2. Manually call API with non-existent group:
```javascript
fetch('/api/admin/users', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'test@example.com',
    temporaryPassword: 'Password123!',
    groups: ['invalid-group-id']
  })
})
```

Expected: Error "Group invalid-group-id not found"

---

### Test Case 10: UI/UX Tests

**Objective:** Verify user interface responds correctly.

**Test 10A - Loading States:**
1. Create a user
2. Verify button shows "Creating..." during request
3. Verify button is disabled during request

**Test 10B - Error Display:**
1. Stop backend
2. Try to create user
3. Verify error message displays in red
4. Restart backend
5. Try again - should work

**Test 10C - Modal Behavior:**
1. Open "Create User" modal
2. Fill some fields
3. Click "Cancel"
4. Re-open modal
5. Verify fields are cleared

**Test 10D - Responsive Actions:**
1. Click "Promote" on a user
2. Verify button is disabled during request
3. Verify all buttons for that user are disabled
4. Verify other users' buttons remain enabled

---

## Integration Test Checklist

Run through this complete workflow to test all features together:

- [ ] **Step 1:** Create 3 new users (one admin, two regular)
- [ ] **Step 2:** Assign users to different groups
- [ ] **Step 3:** Promote one regular user to admin
- [ ] **Step 4:** Verify all users appear in Cognito
- [ ] **Step 5:** Demote the promoted user
- [ ] **Step 6:** Remove a user from a group
- [ ] **Step 7:** Delete one test user
- [ ] **Step 8:** Verify audit logs show all actions
- [ ] **Step 9:** Test with Cognito disabled (optional)
- [ ] **Step 10:** Re-enable Cognito and verify sync

---

## API Testing (Optional)

If you want to test the API directly:

### Create User:
```bash
curl -X POST http://localhost:3001/api/admin/users \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "apitest@example.com",
    "name": "API Test User",
    "temporaryPassword": "ApiTest123!",
    "sendInvite": false,
    "isAdmin": false,
    "groups": []
  }'
```

### Promote User:
```bash
curl -X POST http://localhost:3001/api/admin/users/{userId}/promote \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Delete User:
```bash
curl -X DELETE http://localhost:3001/api/admin/users/{userId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

**Issue:** User created in dashboard but not in Cognito

**Solution:**
- Check `AWS_COGNITO_USER_POOL_ID` is set correctly
- Verify AWS credentials have permissions
- Check backend logs for Cognito errors
- User may still be created in database (database-only mode)

**Issue:** "Cognito not configured" error

**Solution:**
- This is expected if `AWS_COGNITO_USER_POOL_ID` is not set
- Some features (password reset, enable/disable) require Cognito
- User creation and role management still work in database

**Issue:** Promote/Demote not syncing to Cognito

**Solution:**
- Ensure `platform-admins` group exists in Cognito User Pool
- Check backend logs for sync warnings
- Role still updates in database even if Cognito sync fails

---

## Success Criteria

All test cases should pass with these results:
- ✅ Users can be created from dashboard
- ✅ Users sync to Cognito when configured
- ✅ Admin promotion/demotion works in both systems
- ✅ Group management works correctly
- ✅ User deletion removes from both systems
- ✅ System gracefully handles Cognito being disabled
- ✅ All actions are logged in audit logs
- ✅ UI provides clear feedback for all actions
- ✅ Validation prevents invalid data

---

## Cleanup

After testing, remove test users:
1. Delete test users from dashboard
2. Verify they're removed from Cognito
3. Check audit logs for deletion records

Alternatively, use AWS Cognito Console to clean up any remaining test users.
