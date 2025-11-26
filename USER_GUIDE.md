# Codex Web User Guide

Welcome to Codex Web - a cloud-based development platform that brings the full power of a code editor to your browser. This guide will help you get started and make the most of the platform.

## Table of Contents

- [Getting Started](#getting-started)
- [Managing Your Profile](#managing-your-profile)
- [Working with Workspaces](#working-with-workspaces)
- [Understanding Groups](#understanding-groups)
- [Admin Features](#admin-features)
- [Troubleshooting](#troubleshooting)

## Getting Started

### First Time Login

1. **Access the Platform**: Navigate to your organization's Codex Web URL
2. **Sign In**: Click "Sign In" and authenticate using one of the available providers:
   - AWS Cognito
   - Google OAuth
3. **Complete Authentication**: Follow the OAuth flow to grant access
4. **Welcome**: You'll be redirected to your dashboard

### Dashboard Overview

After logging in, your dashboard displays:
- **Total Workspaces**: Number of workspaces you have access to
- **Running Workspaces**: Currently active development environments
- **Groups**: Number of groups you belong to
- **Quick Actions**: Links to create workspaces or view groups

## Managing Your Profile

### View Your Profile

1. Click your profile icon or navigate to the **Profile** page
2. View your account information:
   - Name
   - Email address
   - Username
   - User ID
   - Role (User or Administrator)
   - Group memberships

### Update Profile Information

1. Navigate to the **Profile** page
2. Click the **Edit** button in the Profile Information section
3. Update your:
   - Name
   - Email address (note: changing email may require re-authentication)
4. Click **Save Changes**

### Change Your Password

1. Navigate to the **Profile** page
2. Click **Change Password** in the Change Password section
3. Enter:
   - Current password
   - New password (minimum 8 characters)
   - Confirm new password
4. Click **Change Password**

Note: For OAuth providers (Google, Cognito), you may be directed to change your password through the provider's portal.

## Working with Workspaces

Workspaces are your cloud-based development environments, each running a full instance of Codex in the browser.

### Creating a Workspace

1. Navigate to the **Workspaces** page
2. Click **Create Workspace**
3. Fill in the workspace details:
   - **Workspace Name**: A descriptive name (e.g., "My Development Environment")
   - **Description**: Optional description of the workspace purpose
   - **Group**: Select which group this workspace belongs to
   - **Resource Tier**: Select the appropriate tier based on your usage:
     - **Single User** (1 CPU, 2GB RAM): Perfect for individual developers working on personal projects
     - **Small Team** (2 CPU, 4GB RAM): For 2-4 concurrent users collaborating on projects
     - **Enterprise** (Contact Us): For larger teams with 5+ concurrent users - requires custom configuration
4. Click **Create Workspace**

The workspace will begin provisioning. This may take a few moments.

#### Resource Tier Details

**Resource Configuration:**
- **CPU**: Only CPU requests are set (no limits) for optimal burst performance
- **Memory**: Memory limits equal memory requests to ensure consistent performance
- **Storage**: All tiers include 20GB of persistent storage

**Choosing the Right Tier:**
- **Single User**: Best for individual development, testing, or learning
- **Small Team**: Recommended for small collaborative teams or medium-complexity projects
- **Enterprise**: Contact us for custom resource configurations for larger teams or high-performance requirements

### Starting a Workspace

1. Navigate to the **Workspaces** page
2. Find your workspace in the list
3. Click the **Start** button
4. Wait for the status badge to change to "Running"
5. Click **Open Codex** to launch your development environment

### Accessing a Running Workspace

When a workspace is running, you can:
- **Open Codex**: Click the "Open Codex" button to launch it in a new tab
- **Copy URL**: Click the copy icon to copy the workspace URL to your clipboard
- **Share Access**: Share the URL (password required for access)

### Managing Workspace State

Each workspace can be in one of several states:
- **Running**: Active and accessible
- **Stopped**: Paused, not consuming compute resources
- **Starting**: Currently booting up
- **Stopping**: Currently shutting down
- **Pending**: Being provisioned
- **Error**: Issue detected (check logs or contact admin)

Available actions:
- **Start**: Boot up a stopped workspace
- **Stop**: Pause a running workspace (saves your work)
- **Restart**: Stop and start the workspace
- **Delete**: Permanently remove the workspace (cannot be undone)

### Accessing the Terminal (Admin Only)

If you're an administrator, you can access a workspace's terminal directly:
1. Click the three-dot menu on a running workspace
2. Select **Open Terminal**
3. Execute commands directly in the workspace container

### Viewing Workspace Details

1. Click on a workspace name or card
2. View detailed information:
   - Resource allocation and current usage
   - CPU and memory usage graphs
   - Container logs
   - Access URL and credentials
   - Creation and last access time

### Deleting a Workspace

1. Find the workspace you want to delete
2. Click the three-dot menu
3. Select **Delete**
4. Confirm the deletion

**Warning**: This action cannot be undone. All data in the workspace will be permanently lost unless backed up externally.

## Understanding Groups

Groups are organizational units that provide:
- **Team Collaboration**: Share access to workspaces with team members
- **Resource Management**: Group-level resource quotas and limits
- **Namespace Isolation**: Kubernetes namespace isolation for security

### Viewing Your Groups

1. Navigate to the **Groups** page
2. View all groups you belong to
3. Each group displays:
   - Display name and description
   - Kubernetes namespace
   - Member count
   - Resource quotas (CPU, memory, storage, max pods)
   - Creation date

### Understanding Resource Quotas

Each group has resource quotas that limit total resource consumption:
- **CPU**: Total CPU cores available to all workspaces in the group
- **Memory**: Total RAM available across all workspaces
- **Storage**: Total disk storage across all workspaces
- **Max Pods**: Maximum number of workspaces that can run simultaneously

**Example**: If a group has 10 CPU cores and 20Gi memory, you could create:
- 5 workspaces with 2 cores and 4Gi each, OR
- 2 workspaces with 5 cores and 10Gi each

When creating workspaces, ensure your resource allocation fits within the group's available quota.

## Admin Features

If you have administrator privileges, you have additional capabilities.

### Creating Groups

1. Navigate to the **Groups** page
2. Click **Create Group**
3. Fill in the group details:
   - **Group Name**: Lowercase identifier (e.g., "engineering-team")
   - **Display Name**: Human-readable name (e.g., "Engineering Team")
   - **Namespace**: Auto-generated Kubernetes namespace (e.g., "group-engineering-team")
   - **Description**: Optional description
   - **Resource Quotas**:
     - CPU Cores (e.g., "10")
     - Memory (e.g., "20Gi")
     - Storage (e.g., "100Gi")
     - Max Pods (e.g., 20)
4. Click **Create Group**

### Managing Groups

**Deleting a Group**:
1. Navigate to the **Groups** page
2. Click the three-dot menu on the group card
3. Select **Delete Group**
4. Confirm the deletion

**Warning**: Deleting a group will delete its Kubernetes namespace and all associated workspaces.

### Viewing All Workspaces

Administrators can view all workspaces across all groups, not just their own.

### Managing Users

Administrators can:
- View all users in the system
- Promote users to admin status
- View audit logs of user actions
- Monitor platform-wide resource usage

## Best Practices

### Workspace Management

1. **Stop Unused Workspaces**: Stop workspaces when not in use to save resources
2. **Right-Size Resources**: Allocate only what you need - you can always recreate with different specs
3. **Regular Cleanup**: Delete workspaces you no longer need
4. **Descriptive Names**: Use clear names to identify workspace purposes

### Resource Planning

1. **Monitor Usage**: Check resource usage graphs before creating new workspaces
2. **Group Limits**: Be aware of your group's resource quotas
3. **Share When Possible**: Consider sharing workspaces with team members instead of creating duplicates

### Security

1. **Protect Credentials**: Workspace passwords are displayed once - save them securely
2. **Regular Password Changes**: Update your account password periodically
3. **Log Out**: Always log out when using shared computers
4. **Review Access**: Periodically review which groups you belong to

## Troubleshooting

### Cannot Create Workspace

**Possible causes**:
- Group has reached resource quota limit
- Invalid resource specifications
- No groups assigned to your account

**Solutions**:
- Check group resource quotas on the Groups page
- Reduce requested resources (CPU, memory, storage)
- Contact your administrator to be added to a group or increase quotas

### Workspace Won't Start

**Possible causes**:
- Insufficient resources in the group
- Kubernetes cluster issues
- Image pull errors

**Solutions**:
- Stop other workspaces to free up resources
- Wait a few moments and try again
- Check workspace logs for error details
- Contact your administrator if the issue persists

### Cannot Access Running Workspace

**Possible causes**:
- Workspace URL not yet available
- Network connectivity issues
- Browser blocking pop-ups

**Solutions**:
- Wait for workspace to fully start (status shows "Running")
- Copy URL and paste in new tab if click doesn't work
- Check browser pop-up blocker settings
- Try a different browser

### Profile Updates Not Saving

**Possible causes**:
- Validation errors (email format, etc.)
- Authentication token expired
- Network connectivity issues

**Solutions**:
- Check error messages displayed in the form
- Log out and log back in
- Refresh the page and try again
- Contact support if the issue persists

### Forgot Password

1. Click **Sign In** on the login page
2. Select your authentication provider
3. Follow the provider's password reset flow:
   - **Cognito**: Click "Forgot Password" on the Cognito login page
   - **Google**: Use Google's account recovery process

## Getting Help

### Support Resources

- **Platform Documentation**: Check your organization's internal wiki
- **Administrator Contact**: Reach out to your platform administrator
- **Issue Reporting**: Report bugs through your organization's support channel

### Frequently Asked Questions

**Q: How long does it take for a workspace to start?**
A: Typically 30-60 seconds, depending on the container image size and cluster load.

**Q: Will my work be saved if I stop a workspace?**
A: Yes, all data in your workspace is persisted to storage and will be available when you start it again.

**Q: Can I share a workspace with a teammate?**
A: Yes, you can share the workspace URL and password. Both can access simultaneously if within resource limits.

**Q: What happens when a group reaches its resource quota?**
A: You won't be able to create or start additional workspaces until resources are freed or the quota is increased by an admin.

**Q: Can I change the resources of an existing workspace?**
A: Currently, you need to create a new workspace with the desired resources. Export any important work first.

**Q: How do I back up my workspace?**
A: Use git to push your code to a remote repository, or download files directly through Codex before deleting the workspace.

## Tips and Tricks

### Optimizing Your Workflow

1. **Use Git**: Always commit and push your work to a remote repository
2. **Extensions**: Install Codex extensions as needed - they persist across restarts
3. **Terminal Access**: Use the integrated terminal in Codex for all development commands
4. **Settings Sync**: Configure Codex settings sync to maintain your preferences
5. **Resource Monitoring**: Keep an eye on CPU and memory usage in the workspace card

### Keyboard Shortcuts

Within Codex in your workspace, all standard keyboard shortcuts work:
- `Cmd/Ctrl + P`: Quick file open
- `Cmd/Ctrl + Shift + P`: Command palette
- `Cmd/Ctrl + backtick`: Toggle terminal
- See editor documentation for comprehensive shortcuts

### Performance Tips

1. **Close Unused Files**: Close tabs you're not actively working on
2. **Selective Extensions**: Only install extensions you actively use
3. **Right-Size Resources**: If performance is slow, recreate with more CPU/memory
4. **Clear Terminal Output**: Long terminal history can slow down the UI

## Appendix

### Resource Specifications

**CPU Values**:
- Format: String representing cores (e.g., "1", "2", "4")
- Minimum recommended: 1 core
- Typical usage: 2 cores for general development

**Memory Values**:
- Format: Kubernetes notation (e.g., "4Gi", "8Gi")
- Minimum recommended: 2Gi
- Typical usage: 4Gi for general development, 8Gi for resource-intensive tasks

**Storage Values**:
- Format: Kubernetes notation (e.g., "20Gi", "50Gi")
- Minimum recommended: 10Gi
- Typical usage: 20Gi for general development, 50Gi+ for large projects

### Status Badge Colors

- **Green (Running)**: Workspace is active and accessible
- **Yellow (Starting/Stopping)**: Workspace is transitioning states
- **Gray (Stopped)**: Workspace is paused
- **Blue (Pending)**: Workspace is being provisioned
- **Red (Error)**: Issue detected, check logs or contact admin

### Glossary

- **Workspace**: A cloud-based development environment running Codex
- **Group**: An organizational unit for managing users and resources
- **Namespace**: Isolated Kubernetes environment for a group
- **Resource Quota**: Limits on total resources available to a group
- **Pod**: Kubernetes term for a running workspace container
- **OAuth**: Authentication protocol used for secure login
- **JWT**: JSON Web Token used to maintain your session

---

*For technical documentation and developer guides, see the project README files in the backend and frontend directories.*
