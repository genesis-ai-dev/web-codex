import React, { createContext, useContext, ReactNode } from 'react';
import { AuthProvider as OidcAuthProvider, useAuth as useOidcAuth } from 'react-oidc-context';
import { User, AuthConfig } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | undefined;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  config: AuthConfig;
}

// Inner component that uses OIDC hooks
function AuthContextProvider({ children }: { children: ReactNode }) {
  const oidcAuth = useOidcAuth();

  // Map OIDC user to our User type
  const user: User | null = oidcAuth.user
    ? {
        id: oidcAuth.user.profile.sub || '',
        username: oidcAuth.user.profile.preferred_username || oidcAuth.user.profile.email || '',
        email: oidcAuth.user.profile.email || '',
        name: oidcAuth.user.profile.name || oidcAuth.user.profile.email || '',
        groups: (oidcAuth.user.profile['cognito:groups'] as string[]) || [],
        isAdmin: ((oidcAuth.user.profile['cognito:groups'] as string[]) || []).includes('platform-admins'),
      }
    : null;

  const login = async () => {
    await oidcAuth.signinRedirect();
  };

  const logout = async () => {
    // For Cognito, we need to use custom logout URL
    const cognitoDomain = (window as any).__COGNITO_DOMAIN__;
    const clientId = oidcAuth.settings.client_id;
    const logoutUri = oidcAuth.settings.post_logout_redirect_uri || window.location.origin;

    if (cognitoDomain) {
      // Remove user from local storage
      await oidcAuth.removeUser();
      // Redirect to Cognito logout
      window.location.href = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    } else {
      // Fallback to standard OIDC logout
      await oidcAuth.signoutRedirect();
    }
  };

  const getAccessToken = () => {
    return oidcAuth.user?.access_token;
  };

  const value: AuthContextType = {
    user,
    isLoading: oidcAuth.isLoading,
    isAuthenticated: oidcAuth.isAuthenticated,
    login,
    logout,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Main AuthProvider that wraps OIDC provider
export function AuthProvider({ children, config }: AuthProviderProps) {
  // Store cognito domain globally for logout
  if (config.cognitoDomain) {
    (window as any).__COGNITO_DOMAIN__ = config.cognitoDomain;
  }

  const oidcConfig = {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    post_logout_redirect_uri: config.logoutUri || config.redirectUri.replace('/auth/callback', ''),
    response_type: 'code',
    scope: config.scope || 'aws.cognito.signin.user.admin email openid profile',
  };

  return (
    <OidcAuthProvider {...oidcConfig}>
      <AuthContextProvider>{children}</AuthContextProvider>
    </OidcAuthProvider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
