import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input, TextArea } from '../components/Input';
import { Group, ResourceQuota } from '../types';
import { apiService } from '../services/api';
import { formatCPU, formatMemory, getErrorMessage } from '../utils';
import { useAuth } from '../contexts/AuthContext';

export const GroupsPage: React.FC = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const isAdmin = user?.isAdmin || false;

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const groupsData = await apiService.getGroups();
      setGroups(groupsData);
    } catch (error) {
      console.error('Failed to load groups:', error);
      setError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGroup = async (group: CreateGroupRequest) => {
    try {
      const newGroup = await apiService.createGroup(group);
      setGroups(prev => [newGroup, ...prev]);
      setShowCreateModal(false);
    } catch (error) {
      throw error;
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await apiService.deleteGroup(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (error) {
      console.error('Failed to delete group:', error);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="spinner w-8 h-8 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading groups...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="min-h-[400px] flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="text-center">
              <div className="w-12 h-12 bg-error-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-error-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Failed to load groups
              </h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={loadGroups}>
                Try again
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
            <p className="text-gray-600 mt-2">
              {isAdmin
                ? 'Manage groups, members, and resource quotas for your organization.'
                : 'View your groups and their resource quotas.'
              }
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateModal(true)}>
              Create Group
            </Button>
          )}
        </div>

        {/* Groups grid */}
        {groups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isAdmin={isAdmin}
                onDelete={handleDeleteGroup}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {isAdmin ? 'No groups yet' : 'You are not a member of any groups'}
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm mx-auto">
              {isAdmin
                ? 'Create your first group to organize workspaces and manage resources.'
                : 'Contact your administrator to be added to a group.'
              }
            </p>
            {isAdmin && (
              <Button onClick={() => setShowCreateModal(true)}>
                Create Your First Group
              </Button>
            )}
          </div>
        )}

        {/* Create group modal */}
        {isAdmin && (
          <CreateGroupModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            onSubmit={handleCreateGroup}
          />
        )}
      </div>
    </Layout>
  );
};

interface GroupCardProps {
  group: Group;
  isAdmin: boolean;
  onDelete: (groupId: string) => void;
}

const GroupCard: React.FC<GroupCardProps> = ({ group, isAdmin, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm(`Are you sure you want to delete "${group.displayName}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(group.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{group.displayName}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">{group.namespace}</p>
            {group.description && (
              <p className="text-sm text-gray-600 mt-2">{group.description}</p>
            )}
          </div>
          {isAdmin && (
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowMenu(!showMenu)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </Button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-20 border border-gray-200">
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-error-600 hover:bg-error-50 rounded-md"
                      onClick={() => {
                        handleDelete();
                        setShowMenu(false);
                      }}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <div className="flex items-center">
                          <div className="spinner w-4 h-4 mr-2"></div>
                          Deleting...
                        </div>
                      ) : (
                        'Delete Group'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Member count */}
          <div className="flex items-center text-sm text-gray-600">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
          </div>

          {/* Resource quotas */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Resource Quotas</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-md p-2">
                <div className="text-gray-500 text-xs">CPU</div>
                <div className="font-medium text-gray-900">{formatCPU(group.resourceQuota.cpu)}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-2">
                <div className="text-gray-500 text-xs">Memory</div>
                <div className="font-medium text-gray-900">{formatMemory(group.resourceQuota.memory)}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-2">
                <div className="text-gray-500 text-xs">Storage</div>
                <div className="font-medium text-gray-900">{formatMemory(group.resourceQuota.storage)}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-2">
                <div className="text-gray-500 text-xs">Max Pods</div>
                <div className="font-medium text-gray-900">{group.resourceQuota.pods}</div>
              </div>
            </div>
          </div>

          {/* Created date */}
          <div className="text-xs text-gray-500 pt-3 border-t border-gray-100">
            Created: {new Date(group.createdAt).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface CreateGroupRequest {
  name: string;
  displayName: string;
  description?: string;
  namespace: string;
  resourceQuota: ResourceQuota;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (group: CreateGroupRequest) => Promise<void>;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<CreateGroupRequest>({
    name: '',
    displayName: '',
    description: '',
    namespace: '',
    resourceQuota: {
      cpu: '10',
      memory: '20Gi',
      storage: '100Gi',
      pods: 20,
    },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate namespace from name
  const handleNameChange = (value: string) => {
    const sanitizedName = value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    setFormData(prev => ({
      ...prev,
      name: sanitizedName,
      namespace: sanitizedName ? `group-${sanitizedName}` : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Group name is required');
      return;
    }

    if (!formData.displayName.trim()) {
      setError('Display name is required');
      return;
    }

    if (!formData.namespace.startsWith('group-')) {
      setError('Namespace must start with "group-"');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Remove empty description to avoid validation errors
      const submitData = {
        ...formData,
        description: formData.description?.trim() || undefined,
      };
      await onSubmit(submitData);
      // Reset form
      setFormData({
        name: '',
        displayName: '',
        description: '',
        namespace: '',
        resourceQuota: {
          cpu: '10',
          memory: '20Gi',
          storage: '100Gi',
          pods: 20,
        },
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Group"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
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

        <Input
          label="Group Name"
          placeholder="e.g. engineering-team"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          helpText="Lowercase letters, numbers, and hyphens only"
          required
        />

        <Input
          label="Display Name"
          placeholder="e.g. Engineering Team"
          value={formData.displayName}
          onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
          helpText="Human-readable name for the group"
          required
        />

        <Input
          label="Namespace"
          placeholder="group-engineering-team"
          value={formData.namespace}
          onChange={(e) => setFormData(prev => ({ ...prev, namespace: e.target.value }))}
          helpText="Kubernetes namespace (auto-generated from name)"
          required
          disabled
        />

        <TextArea
          label="Description (optional)"
          placeholder="Brief description of this group..."
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          rows={3}
        />

        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Resource Quotas</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="CPU Cores"
              placeholder="10"
              value={formData.resourceQuota?.cpu || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                resourceQuota: { ...prev.resourceQuota!, cpu: e.target.value }
              }))}
              helpText="Total CPU cores for all workspaces"
            />

            <Input
              label="Memory"
              placeholder="20Gi"
              value={formData.resourceQuota?.memory || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                resourceQuota: { ...prev.resourceQuota!, memory: e.target.value }
              }))}
              helpText="Total memory (e.g. 20Gi)"
            />

            <Input
              label="Storage"
              placeholder="100Gi"
              value={formData.resourceQuota?.storage || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                resourceQuota: { ...prev.resourceQuota!, storage: e.target.value }
              }))}
              helpText="Total storage (e.g. 100Gi)"
            />

            <Input
              label="Max Pods"
              type="number"
              placeholder="20"
              value={formData.resourceQuota?.pods?.toString() || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                resourceQuota: { ...prev.resourceQuota!, pods: parseInt(e.target.value) || 0 }
              }))}
              helpText="Maximum number of workspaces"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-6 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Create Group
          </Button>
        </div>
      </form>
    </Modal>
  );
};
