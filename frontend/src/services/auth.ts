import { User, AuthConfig } from '../types';

class AuthService {
  private config: AuthConfig | null = null;

  configure(config: AuthConfig) {
    this.config = config;
  }

  async signIn(): Promise<void> {
    if (!this.config) {
      throw new Error('Auth service not configured');
    }

    if (this.config.provider === 'cognito') {
      return this.signInWithCognito();
    } else if (this.config.provider === 'google') {
      return this.signInWithGoogle();
    } else {
      throw new Error('Unsupported auth provider');
    }
  }

  private async signInWithCognito(): Promise<void> {
    // For Cognito, we'll use the Hosted UI
    const cognitoUrl = `https://cognito-idp.${this.config!.region}.amazoncognito.com/${this.config!.userPoolId}`;
    const params = new URLSearchParams({
      client_id: this.config!.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: window.location.origin + '/auth/callback',
    });

    window.location.href = `${cognitoUrl}?${params.toString()}`;
  }

  private async signInWithGoogle(): Promise<void> {
    // For Google OAuth, redirect to Google's OAuth endpoint
    const googleUrl = 'https://accounts.google.com/oauth/v2/auth';
    const params = new URLSearchParams({
      client_id: this.config!.clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: window.location.origin + '/auth/callback',
      state: Math.random().toString(36).substring(7), // CSRF protection
    });

    window.location.href = `${googleUrl}?${params.toString()}`;
  }

  async handleAuthCallback(code: string): Promise<User> {
    // Exchange authorization code for tokens via backend
    const response = await fetch('/api/auth/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        provider: this.config!.provider,
      }),
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const { user, token } = await response.json();
    
    // Store token for API requests
    localStorage.setItem('authToken', token);
    
    return user;
  }

  async getCurrentUser(): Promise<User> {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        throw new Error('Token expired');
      }
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  async refreshSession(): Promise<void> {
    const token = localStorage.getItem('authToken');
    if (!token) {
      throw new Error('No authentication token');
    }

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      localStorage.removeItem('authToken');
      throw new Error('Failed to refresh token');
    }

    const { token: newToken } = await response.json();
    localStorage.setItem('authToken', newToken);
  }

  async signOut(): Promise<void> {
    const token = localStorage.getItem('authToken');
    
    // Call backend to invalidate session
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.warn('Failed to invalidate session on backend:', error);
      }
    }

    // Clear local storage
    localStorage.removeItem('authToken');

    // Redirect to logout URL for provider
    if (this.config?.provider === 'cognito') {
      const logoutUrl = `https://${this.config.userPoolId}.auth.${this.config.region}.amazoncognito.com/logout`;
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        logout_uri: window.location.origin,
      });
      window.location.href = `${logoutUrl}?${params.toString()}`;
    } else {
      // For Google or other providers, just redirect to home
      window.location.href = '/';
    }
  }

  getAuthToken(): string | null {
    return localStorage.getItem('authToken');
  }
}

export const authService = new AuthService();
