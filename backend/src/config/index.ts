export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN || '3600', 10),

  // AWS
  awsRegion: process.env.AWS_REGION || 'us-west-2',
  cognitoUserPoolId: process.env.AWS_COGNITO_USER_POOL_ID || '',
  cognitoClientId: process.env.AWS_COGNITO_CLIENT_ID || '',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  // Database
  dynamodbRegion: process.env.DYNAMODB_REGION || 'us-west-2',
  dynamodbTablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'vscode-platform',
  dynamodbTableName: process.env.DYNAMODB_TABLE_NAME || '',
  dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT || undefined,

  // Kubernetes
  kubernetesNamespacePrefix: process.env.KUBERNETES_NAMESPACE_PREFIX || 'group-',
  kubernetesServiceAccount: process.env.KUBERNETES_SERVICE_ACCOUNT || 'backend-api-sa',

  // Rate Limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  rateLimitWorkspaceMax: parseInt(process.env.RATE_LIMIT_WORKSPACE_MAX || '10', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Computed values
  get isDevelopment() {
    return this.nodeEnv === 'development';
  },

  get isProduction() {
    return this.nodeEnv === 'production';
  },

  get isTest() {
    return this.nodeEnv === 'test';
  },
};

export default config;
