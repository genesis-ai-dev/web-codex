import React, { useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setErrors({});

    try {
      const updates: { name?: string; email?: string } = {};

      if (profileForm.name !== user?.name) {
        updates.name = profileForm.name;
      }

      if (profileForm.email !== user?.email) {
        updates.email = profileForm.email;
      }

      if (Object.keys(updates).length === 0) {
        setMessage({ type: 'error', text: 'No changes to save' });
        setLoading(false);
        return;
      }

      await apiService.updateProfile(updates);
      setMessage({ type: 'success', text: 'Profile updated successfully' });
      setIsEditingProfile(false);

      // Refresh the page to update the user context
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to update profile'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setErrors({});

    // Validation
    const newErrors: Record<string, string> = {};

    if (!passwordForm.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
    }

    if (!passwordForm.newPassword) {
      newErrors.newPassword = 'New password is required';
    } else if (passwordForm.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    }

    if (!passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      const response = await apiService.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );

      // For OAuth providers, show message with provider URL
      if (response.providerUrl) {
        setMessage({
          type: 'success',
          text: response.message
        });
      } else {
        setMessage({ type: 'success', text: 'Password changed successfully' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setIsChangingPassword(false);
      }
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || 'Failed to change password'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelProfileEdit = () => {
    setProfileForm({
      name: user?.name || '',
      email: user?.email || '',
    });
    setIsEditingProfile(false);
    setMessage(null);
    setErrors({});
  };

  const handleCancelPasswordChange = () => {
    setPasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setIsChangingPassword(false);
    setMessage(null);
    setErrors({});
  };

  return (
    <Layout>
      <div className="py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Profile Settings</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Manage your account settings and preferences
            </p>
          </div>

          {/* Success/Error Message */}
          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <p className={`text-sm ${
                message.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          <div className="space-y-6">
            {/* Profile Information */}
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      Profile Information
                    </h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Update your name and email address
                    </p>
                  </div>
                  {!isEditingProfile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingProfile(true)}
                    >
                      Edit
                    </Button>
                  )}
                </div>

                {!isEditingProfile ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                        Name
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                        {user?.name || 'Not set'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                        Email
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                        {user?.email}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                        Username
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                        {user?.username}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                        Role
                      </label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                        {user?.isAdmin ? 'Administrator' : 'User'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleProfileSubmit}>
                    <div className="space-y-4">
                      <Input
                        label="Name"
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        error={errors.name}
                        placeholder="Enter your name"
                      />
                      <Input
                        label="Email"
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                        error={errors.email}
                        placeholder="Enter your email"
                        helpText="Changing your email may require re-authentication"
                      />
                      <div className="flex justify-end space-x-3 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancelProfileEdit}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                        >
                          {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </Card>

            {/* Change Password */}
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      Change Password
                    </h2>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Update your password to keep your account secure
                    </p>
                  </div>
                  {!isChangingPassword && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsChangingPassword(true)}
                    >
                      Change Password
                    </Button>
                  )}
                </div>

                {isChangingPassword && (
                  <form onSubmit={handlePasswordSubmit}>
                    <div className="space-y-4">
                      <Input
                        label="Current Password"
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        error={errors.currentPassword}
                        placeholder="Enter current password"
                      />
                      <Input
                        label="New Password"
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        error={errors.newPassword}
                        placeholder="Enter new password"
                        helpText="Must be at least 8 characters"
                      />
                      <Input
                        label="Confirm New Password"
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        error={errors.confirmPassword}
                        placeholder="Confirm new password"
                      />
                      <div className="flex justify-end space-x-3 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancelPasswordChange}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                        >
                          {loading ? 'Changing...' : 'Change Password'}
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </Card>

            {/* Account Information */}
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Account Information
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                      User ID
                    </label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                      {user?.id}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                      Groups
                    </label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                      {user?.groups && user.groups.length > 0
                        ? user.groups.join(', ')
                        : 'No groups assigned'}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};
