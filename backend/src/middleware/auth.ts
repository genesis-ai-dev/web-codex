import { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import * as jose from 'jose';
import { config } from '../config';
import { logger } from '../config/logger';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { AuthenticatedRequest, User, JwtPayload } from '../types';
import { userService } from '../services/userService';

// Initialize Cognito JWT verifier
const cognitoVerifier = config.cognitoUserPoolId ? CognitoJwtVerifier.create({
  userPoolId: config.cognitoUserPoolId,
  tokenUse: 'id',
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

// Cognito JWT verification
async function verifyCognitoToken(token: string): Promise<JwtPayload> {
  if (!cognitoVerifier) {
    throw new AuthenticationError('Cognito not configured');
  }

  try {
    const payload = await cognitoVerifier.verify(token);
    
    return {
      sub: payload.sub,
      username: payload['cognito:username'] as string,
      email: payload.email as string,
      groups: payload['cognito:groups'] as string[] || [],
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    logger.error('Cognito token verification failed:', error);
    throw new AuthenticationError('Invalid Cognito token');
  }
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
    
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
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

    if (!req.user?.groups.includes(targetGroupId) && !req.user?.isAdmin) {
      throw new AuthorizationError('Insufficient group permissions');
    }

    next();
  };
}

export function requireGroupRole(requiredRole: 'admin' | 'developer' | 'viewer') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const groupId = req.params.groupId || req.body.groupId;
    
    if (!groupId) {
      throw new AuthorizationError('Group ID required');
    }

    // For now, simplified role checking - in production, you'd check user's specific role in the group
    if (!req.user?.groups.includes(groupId) && !req.user?.isAdmin) {
      throw new AuthorizationError('Insufficient group permissions');
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
