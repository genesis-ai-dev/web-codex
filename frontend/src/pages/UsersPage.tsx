import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { User, Group, GroupRole, GroupMembership } from '../types';
import { apiService } from '../services/api';
import { getErrorMessage } from '../utils';

interface UsersPageProps {
  isEmbedded?: boolean;
}

export const UsersPage: React.FC<UsersPageProps> = ({ isEmbedded = false }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showManageGroupsModal, setShowManageGroupsModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showUserActionsModal, setShowUserActionsModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [usersData, groupsData] = await Promise.all([
        apiService.getUsers(),
        apiService.getGroups()
      ]);

      setUsers(usersData.items);
      setGroups(groupsData);
    } catch (error) {
      console.error('Failed to load data:', error);
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageGroups = (user: User) => {
    setSelectedUser(user);
    setShowManageGroupsModal(true);
  };

  const handleUserActions = (user: User) => {
    setSelectedUser(user);
    setShowUserActionsModal(true);
  };

  const handleCreateUser = async (userData: any) => {
    try {
      const newUser = await apiService.createUser(userData);
      setUsers(prev => [...prev, newUser]);
      setShowCreateUserModal(false);
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  };

  const handleAddUserToGroup = async (userId: string, groupId: string) => {
    try {
      const updatedUser = await apiService.addUserToGroup(userId, groupId);
      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      if (selectedUser?.id === userId) {
        setSelectedUser(updatedUser);
      }
    } catch (error) {
      console.error('Failed to add user to group:', error);
      throw error;
    }
  };

  const handleRemoveUserFromGroup = async (userId: string, groupId: string) => {
    try {
      const updatedUser = await apiService.removeUserFromGroup(userId, groupId);
      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      if (selectedUser?.id === userId) {
        setSelectedUser(updatedUser);
      }
    } catch (error) {
      console.error('Failed to remove user from group:', error);
      throw error;
    }
  };

  const handleToggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    try {
      const updatedUser = isCurrentlyAdmin
        ? await apiService.demoteUserFromAdmin(userId)
        : await apiService.promoteUserToAdmin(userId);

      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      if (selectedUser?.id === userId) {
        setSelectedUser(updatedUser);
      }
    } catch (error) {
      console.error('Failed to toggle admin status:', error);
      throw error;
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      await apiService.deleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setShowUserActionsModal(false);
      setSelectedUser(null);
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw error;
    }
  };

  const loadingContent = (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="spinner w-8 h-8 mx-auto mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400">Loading users...</p>
      </div>
    </div>
  );

  const errorContent = (
    <div className="min-h-[400px] flex items-center justify-center">
      <Card className="max-w-md">
        <CardContent className="text-center">
          <div className="w-12 h-12 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-error-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            Failed to load users
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <Button onClick={loadData}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  if (isLoading) {
    return isEmbedded ? loadingContent : <Layout>{loadingContent}</Layout>;
  }

  if (error) {
    return isEmbedded ? errorContent : <Layout>{errorContent}</Layout>;
  }

  const pageContent = (
    <div className={isEmbedded ? '' : 'px-4 sm:px-6 lg:px-8 py-8'}>
        {/* Page header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Users</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage users and their group memberships across the platform.
            </p>
          </div>
          <Button
            onClick={() => setShowCreateUserModal(true)}
            className="ml-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create User
          </Button>
        </div>

        {/* Users table */}
        {users.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>All Users ({users.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        User
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Email
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Role
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Groups
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {users.map((user) => (
                      <UserRow
                        key={user.id}
                        user={user}
                        groups={groups}
                        onManageGroups={handleManageGroups}
                        onToggleAdmin={handleToggleAdmin}
                        onDeleteUser={handleDeleteUser}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No users found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              Users will appear here once they sign in to the platform.
            </p>
          </div>
        )}

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        onCreateUser={handleCreateUser}
        groups={groups}
      />

      {/* Manage Groups Modal */}
      {selectedUser && (
        <ManageGroupsModal
          isOpen={showManageGroupsModal}
          onClose={() => {
            setShowManageGroupsModal(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          groups={groups}
          onAddToGroup={handleAddUserToGroup}
          onRemoveFromGroup={handleRemoveUserFromGroup}
        />
      )}
    </div>
  );

  return isEmbedded ? pageContent : <Layout>{pageContent}</Layout>;
};

interface UserRowProps {
  user: User;
  groups: Group[];
  onManageGroups: (user: User) => void;
  onToggleAdmin: (userId: string, isCurrentlyAdmin: boolean) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
}

const UserRow: React.FC<UserRowProps> = ({ user, groups, onManageGroups, onToggleAdmin, onDeleteUser }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleToggleAdmin = async () => {
    setIsProcessing(true);
    try {
      await onToggleAdmin(user.id, user.isAdmin);
    } catch (error) {
      console.error('Failed to toggle admin:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    try {
      await onDeleteUser(user.id);
    } catch (error) {
      console.error('Failed to delete user:', error);
      setIsProcessing(false);
    }
  };

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10">
            <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {user.name || user.username}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {user.username}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 dark:text-gray-100">{user.email}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {user.isAdmin ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            Admin
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            User
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {user.groups.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {user.groups.slice(0, 2).map(groupId => {
                const group = groups.find(g => g.id === groupId);
                const membership = user.groupMemberships?.find(m => m.groupId === groupId);
                const isGroupAdmin = membership?.role === GroupRole.ADMIN;
                return (
                  <span
                    key={groupId}
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      isGroupAdmin
                        ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                        : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                    }`}
                    title={isGroupAdmin ? `Group Admin of ${group?.displayName}` : undefined}
                  >
                    {group?.displayName || groupId}
                    {isGroupAdmin && (
                      <svg className="ml-1 w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                );
              })}
              {user.groups.length > 2 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                  +{user.groups.length - 2} more
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 text-xs">No groups</span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end space-x-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onManageGroups(user)}
            disabled={isProcessing}
          >
            Groups
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleToggleAdmin}
            disabled={isProcessing}
            className={user.isAdmin ? 'text-purple-600' : ''}
          >
            {user.isAdmin ? 'Demote' : 'Promote'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={isProcessing}
            className="text-error-600 hover:text-error-700"
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
};

interface ManageGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  groups: Group[];
  onAddToGroup: (userId: string, groupId: string) => Promise<void>;
  onRemoveFromGroup: (userId: string, groupId: string) => Promise<void>;
}

const ManageGroupsModal: React.FC<ManageGroupsModalProps> = ({
  isOpen,
  onClose,
  user,
  groups,
  onAddToGroup,
  onRemoveFromGroup,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to get user's role in a group
  const getUserGroupRole = (groupId: string): GroupRole | null => {
    const membership = user.groupMemberships?.find(m => m.groupId === groupId);
    return membership?.role || null;
  };

  const handleToggleGroup = async (groupId: string, isCurrentlyMember: boolean) => {
    setIsProcessing(true);
    setError(null);

    try {
      if (isCurrentlyMember) {
        await onRemoveFromGroup(user.id, groupId);
      } else {
        await onAddToGroup(user.id, groupId);
      }
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetRole = async (groupId: string, role: GroupRole) => {
    setIsProcessing(true);
    setError(null);

    try {
      await apiService.setUserGroupRole(user.id, groupId, role);
      // The parent will reload and the user state will update
      window.location.reload(); // Simple reload for now
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Manage Groups - ${user.name || user.username}`}
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-error-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-error-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-error-800">Error</h3>
                <div className="mt-1 text-sm text-error-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Select groups for <span className="font-medium text-gray-900 dark:text-gray-100">{user.email}</span>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {groups.length > 0 ? (
            groups.map((group) => {
              const isMember = user.groups.includes(group.id);
              const currentRole = getUserGroupRole(group.id);

              return (
                <div
                  key={group.id}
                  className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{group.displayName}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{group.namespace}</div>
                    {group.description && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{group.description}</div>
                    )}
                    {isMember && currentRole && (
                      <div className="mt-2 flex items-center space-x-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Role:</span>
                        <select
                          value={currentRole}
                          onChange={(e) => handleSetRole(group.id, e.target.value as GroupRole)}
                          disabled={isProcessing}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        >
                          <option value={GroupRole.MEMBER}>Member</option>
                          <option value={GroupRole.ADMIN}>Group Admin</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isMember ? 'secondary' : 'primary'}
                    onClick={() => handleToggleGroup(group.id, isMember)}
                    disabled={isProcessing}
                  >
                    {isMember ? 'Remove' : 'Add'}
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No groups available. Create a group first.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t dark:border-gray-700">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateUser: (userData: any) => Promise<void>;
  groups: Group[];
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({
  isOpen,
  onClose,
  onCreateUser,
  groups,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    temporaryPassword: '',
    sendInvite: true,
    isAdmin: false,
    groups: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);

    try {
      await onCreateUser(formData);
      // Reset form
      setFormData({
        email: '',
        name: '',
        temporaryPassword: '',
        sendInvite: true,
        isAdmin: false,
        groups: [],
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGroupToggle = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      groups: prev.groups.includes(groupId)
        ? prev.groups.filter(id => id !== groupId)
        : [...prev.groups, groupId],
    }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New User"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-error-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-error-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-error-800">Error</h3>
                <div className="mt-1 text-sm text-error-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        <div>
          <Input
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
            placeholder="user@example.com"
          />
        </div>

        <div>
          <Input
            label="Full Name (optional)"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="John Doe"
          />
        </div>

        <div>
          <Input
            label="Temporary Password"
            type="password"
            value={formData.temporaryPassword}
            onChange={(e) => setFormData({ ...formData, temporaryPassword: e.target.value })}
            required
            placeholder="Minimum 8 characters"
            helperText="User will be prompted to change this on first login"
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="sendInvite"
            checked={formData.sendInvite}
            onChange={(e) => setFormData({ ...formData, sendInvite: e.target.checked })}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="sendInvite" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Send invitation email
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="isAdmin"
            checked={formData.isAdmin}
            onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="isAdmin" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Grant admin privileges
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Assign to Groups (optional)
          </label>
          <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-3">
            {groups.length > 0 ? (
              groups.map((group) => (
                <div key={group.id} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`group-${group.id}`}
                    checked={formData.groups.includes(group.id)}
                    onChange={() => handleGroupToggle(group.id)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label
                    htmlFor={`group-${group.id}`}
                    className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    {group.displayName}
                  </label>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No groups available</p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="submit" disabled={isProcessing}>
            {isProcessing ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
