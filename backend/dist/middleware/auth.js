"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireAdmin = requireAdmin;
exports.requireGroupMembership = requireGroupMembership;
exports.requireGroupRole = requireGroupRole;
exports.optionalAuth = optionalAuth;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const jose = __importStar(require("jose"));
const config_1 = require("../config");
const logger_1 = require("../config/logger");
const errors_1 = require("../utils/errors");
const userService_1 = require("../services/userService");
// Initialize Cognito JWT verifier for ID tokens
const cognitoVerifier = config_1.config.cognitoUserPoolId ? aws_jwt_verify_1.CognitoJwtVerifier.create({
    userPoolId: config_1.config.cognitoUserPoolId,
    tokenUse: 'id',
    clientId: config_1.config.cognitoClientId,
}) : null;
// Google JWT verification
async function verifyGoogleToken(token) {
    try {
        const JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
        const { payload } = await jose.jwtVerify(token, JWKS, {
            issuer: 'https://accounts.google.com',
            audience: config_1.config.googleClientId,
        });
        return {
            sub: payload.sub,
            email: payload.email,
            iat: payload.iat,
            exp: payload.exp,
        };
    }
    catch (error) {
        logger_1.logger.error('Google token verification failed:', error);
        throw new errors_1.AuthenticationError('Invalid Google token');
    }
}
// Cognito JWT verification
async function verifyCognitoToken(token) {
    if (!cognitoVerifier) {
        throw new errors_1.AuthenticationError('Cognito not configured');
    }
    try {
        const payload = await cognitoVerifier.verify(token);
        return {
            sub: payload.sub,
            username: payload['cognito:username'],
            email: payload.email,
            groups: payload['cognito:groups'] || [],
            iat: payload.iat,
            exp: payload.exp,
        };
    }
    catch (error) {
        logger_1.logger.error('Cognito token verification failed:', error);
        throw new errors_1.AuthenticationError('Invalid Cognito token');
    }
}
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new errors_1.AuthenticationError('Authentication token required');
        }
        const token = authHeader.split(' ')[1];
        // Determine token type (simplified - in production, you might use different endpoints or headers)
        let jwtPayload;
        try {
            // Try Cognito first
            jwtPayload = await verifyCognitoToken(token);
        }
        catch (cognitoError) {
            try {
                // Fallback to Google
                jwtPayload = await verifyGoogleToken(token);
            }
            catch (googleError) {
                throw new errors_1.AuthenticationError('Invalid token');
            }
        }
        // Get or create user from database
        const user = await userService_1.userService.getOrCreateUser(jwtPayload);
        req.user = user;
        next();
    }
    catch (error) {
        next(error);
    }
}
function requireAdmin(req, res, next) {
    if (!req.user?.isAdmin) {
        throw new errors_1.AuthorizationError('Admin privileges required');
    }
    next();
}
function requireGroupMembership(groupId) {
    return (req, res, next) => {
        const targetGroupId = groupId || req.params.groupId || req.body.groupId;
        if (!targetGroupId) {
            throw new errors_1.AuthorizationError('Group ID required');
        }
        if (!req.user?.groups.includes(targetGroupId) && !req.user?.isAdmin) {
            throw new errors_1.AuthorizationError('Insufficient group permissions');
        }
        next();
    };
}
function requireGroupRole(requiredRole) {
    return async (req, res, next) => {
        const groupId = req.params.groupId || req.body.groupId;
        if (!groupId) {
            throw new errors_1.AuthorizationError('Group ID required');
        }
        // For now, simplified role checking - in production, you'd check user's specific role in the group
        if (!req.user?.groups.includes(groupId) && !req.user?.isAdmin) {
            throw new errors_1.AuthorizationError('Insufficient group permissions');
        }
        next();
    };
}
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            await authenticate(req, res, next);
        }
        else {
            next();
        }
    }
    catch (error) {
        // For optional auth, we don't throw errors, just continue without user
        next();
    }
}
