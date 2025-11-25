import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import * as jose from 'jose';
import { config } from '../config';
import { logger } from '../config/logger';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { AuthenticatedRequest, User, JwtPayload, GroupRole } from '../types';
import { userService } from '../services/userService';

// Initialize Cognito JWT verifier for ID tokens
const cognitoIdTokenVerifier = config.cognitoUserPoolId ? CognitoJwtVerifier.create({
  userPoolId: config.cognitoUserPoolId,
  tokenUse: 'id',
  clientId: config.cognitoClientId,
}) : null;

// Initialize Cognito JWT verifier for access tokens
const cognitoAccessTokenVerifier = config.cognitoUserPoolId ? CognitoJwtVerifier.create({
  userPoolId: config.cognitoUserPoolId,
  tokenUse: 'access',
  clientId: config.cognitoClientId,
}) : null;

// Google JWT verification
async function verifyGoogleToken(token: string): Promise<JwtPayload> {
  try {
    const JWKS = jose.createRemoteJWKSet(
      new URL('https://www.googleapis.com/oauth2/v3/certs')
    );

    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: 'https://accounts.google.com',
      audience: config.googleClientId,
    });

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch (error) {
    logger.error('Google token verification failed:', error);
    throw new AuthenticationError('Invalid Google token');
  }
}

// Cognito JWT verification - accepts both ID and access tokens
async function verifyCognitoToken(token: string): Promise<JwtPayload> {
  if (!cognitoIdTokenVerifier || !cognitoAccessTokenVerifier) {
    throw new AuthenticationError('Cognito not configured');
  }

  try {
    // Try to verify as ID token first
    const payload = await cognitoIdTokenVerifier.verify(token);

    return {
      sub: payload.sub,
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: payload['cognito:groups'] as string[] || [],
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (idTokenError) {
    // If ID token verification fails, try access token
    try {
      const payload = await cognitoAccessTokenVerifier.verify(token);

      // Access tokens don't contain email or username, so we need to get user from sub
      // We'll return minimal info and let the calling code handle fetching full user details
      return {
        sub: payload.sub,
        username: payload.username as string,
        groups: payload['cognito:groups'] as string[] || [],
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch (accessTokenError) {
      logger.error('Cognito token verification failed for both ID and access tokens:', {
        idTokenError: idTokenError instanceof Error ? idTokenError.message : idTokenError,
        accessTokenError: accessTokenError instanceof Error ? accessTokenError.message : accessTokenError,
      });
      throw new AuthenticationError('Invalid Cognito token');
    }
  }
}

/**
 * Verify JWT token and return user (for use in WebSocket handlers)
 */
export async function verifyToken(token: string): Promise<User> {
  // Determine token type (simplified - in production, you might use different endpoints or headers)
  let jwtPayload: JwtPayload;

  try {
    // Try Cognito first
    jwtPayload = await verifyCognitoToken(token);
  } catch (cognitoError) {
    try {
      // Fallback to Google
      jwtPayload = await verifyGoogleToken(token);
    } catch (googleError) {
      throw new AuthenticationError('Invalid token');
    }
  }

  // Get or create user from database
  const user = await userService.getOrCreateUser(jwtPayload);
  return user;
}

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Authentication token required');
    }

    const token = authHeader.split(' ')[1];
    const user = await verifyToken(token);

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Helper function to check if user has a specific role in a group
 */
export function hasGroupRole(user: User, groupId: string, role: GroupRole): boolean {
  // Platform admins have all permissions
  if (user.isAdmin) {
    return true;
  }

  // Check groupMemberships array for role
  if (user.groupMemberships) {
    const membership = user.groupMemberships.find(m => m.groupId === groupId);
    if (membership) {
      // Admin role has all permissions
      if (membership.role === GroupRole.ADMIN) {
        return true;
      }
      // Otherwise check if the role matches
      return membership.role === role;
    }
  }

  // Fallback: check legacy groups array (all legacy members are treated as members, not admins)
  if (user.groups.includes(groupId)) {
    return role === GroupRole.MEMBER;
  }

  return false;
}

/**
 * Helper function to check if user is a group admin
 */
export function isGroupAdmin(user: User, groupId: string): boolean {
  return hasGroupRole(user, groupId, GroupRole.ADMIN);
}

/**
 * Helper function to check if user has any access to a group
 */
export function hasGroupAccess(user: User, groupId: string): boolean {
  // Platform admins have access to all groups
  if (user.isAdmin) {
    return true;
  }

  // Check in groupMemberships
  if (user.groupMemberships?.some(m => m.groupId === groupId)) {
    return true;
  }

  // Check in legacy groups array
  return user.groups.includes(groupId);
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.isAdmin) {
    throw new AuthorizationError('Admin privileges required');
  }
  next();
}

export function requireGroupMembership(groupId?: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const targetGroupId = groupId || req.params.groupId || req.body.groupId;

    if (!targetGroupId) {
      throw new AuthorizationError('Group ID required');
    }

    if (!hasGroupAccess(req.user!, targetGroupId)) {
      throw new AuthorizationError('Insufficient group permissions');
    }

    next();
  };
}

export function requireGroupRole(requiredRole: GroupRole) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const groupId = req.params.groupId || req.body.groupId;

    if (!groupId) {
      throw new AuthorizationError('Group ID required');
    }

    if (!hasGroupRole(req.user!, groupId, requiredRole)) {
      throw new AuthorizationError('Insufficient group permissions');
    }

    next();
  };
}

/**
 * Middleware that requires user to be either a platform admin or a group admin for the specified group
 */
export function requireGroupAdmin(groupId?: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const targetGroupId = groupId || req.params.groupId || req.body.groupId;

    if (!targetGroupId) {
      throw new AuthorizationError('Group ID required');
    }

    const user = req.user!;

    // Platform admins always have access
    if (user.isAdmin) {
      return next();
    }

    // Check if user is a group admin
    if (!isGroupAdmin(user, targetGroupId)) {
      throw new AuthorizationError('Group admin privileges required');
    }

    next();
  };
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      await authenticate(req, res, next);
    } else {
      next();
    }
  } catch (error) {
    // For optional auth, we don't throw errors, just continue without user
    next();
  }
}
