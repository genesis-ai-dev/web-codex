# VSCode Platform Backend API

A production-ready backend API for a multi-tenant Kubernetes VSCode platform, providing secure workspace management, group-based access control, and integration with AWS services.


## Features

- 🔐 **Multi-provider Authentication**: AWS Cognito and Google OAuth support
- 🏢 **Multi-tenant Architecture**: Group-based isolation with Kubernetes namespaces
- 🚀 **Workspace Management**: Create, start, stop, and manage VSCode workspaces
- 📊 **Resource Monitoring**: Real-time metrics and usage tracking
- 🛡️ **Security**: Rate limiting, input validation, and audit logging
- ☸️ **Kubernetes Native**: Direct integration with Kubernetes API
- 🗄️ **DynamoDB Storage**: Scalable user and workspace metadata storage

## Architecture

The backend follows a microservices architecture with clear separation of concerns:

- **Authentication Layer**: JWT-based auth with OAuth providers
- **Authorization Layer**: Group-based permissions with namespace isolation
- **Service Layer**: Business logic for users, groups, and workspaces
- **Data Layer**: DynamoDB for metadata, Kubernetes for workloads
- **API Layer**: RESTful endpoints with OpenAPI specification

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- kubectl configured for your cluster
- AWS CLI configured (for production)

### Development Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <repository>
   cd vscode-platform-backend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development services:**
   ```bash
   # Start with Docker Compose (includes Redis and local DynamoDB)
   docker-compose -f docker-compose.dev.yml up -d

   # Or start locally
   npm run dev
   ```

4. **Access the services:**
   - API: http://localhost:3001/api
   - Health Check: http://localhost:3001/api/health
   - DynamoDB Admin: http://localhost:8001

### Production Deployment

1. **Build the Docker image:**
   ```bash
   docker build -t vscode-platform/backend:latest .
   ```

2. **Deploy to Kubernetes:**
   ```bash
   # Update the manifests with your values
   kubectl apply -f k8s/backend-deployment.yaml
   ```

3. **Configure IRSA (AWS):**
   ```bash
   eksctl create iamserviceaccount \
     --cluster=my-cluster \
     --namespace=vscode-platform \
     --name=backend-api-sa \
     --attach-policy-arn=arn:aws:iam::ACCOUNT:policy/VSCodePlatformBackendPolicy \
     --approve
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | JWT signing key | Required |
| `AWS_REGION` | AWS region | `us-west-2` |
| `AWS_COGNITO_USER_POOL_ID` | Cognito User Pool | Optional |
| `AWS_COGNITO_CLIENT_ID` | Cognito Client ID | Optional |
| `GOOGLE_CLIENT_ID` | Google OAuth Client | Optional |
| `DYNAMODB_TABLE_PREFIX` | DynamoDB table prefix | `vscode-platform` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |

### DynamoDB Tables

The application creates these tables automatically:

- `{prefix}-users`: User profiles and group memberships
- `{prefix}-groups`: Group definitions and resource quotas
- `{prefix}-workspaces`: Workspace metadata and configurations
- `{prefix}-audit-logs`: Security and compliance audit trail

### Kubernetes Permissions

The backend service account needs these permissions:

- **Namespace management**: Create, delete, list namespaces
- **Workload management**: Deploy, scale, delete workloads
- **Resource management**: Create ResourceQuotas, PVCs
- **Metrics access**: Read pod and node metrics
- **RBAC management**: Create roles and role bindings

## API Documentation

The API follows OpenAPI 3.0 specification. Key endpoint groups:

### Authentication (`/api/auth`)
- `POST /callback` - OAuth callback handling
- `GET /me` - Current user information
- `POST /refresh` - Token refresh
- `POST /logout` - User logout

### Workspaces (`/api/workspaces`)
- `GET /` - List workspaces
- `POST /` - Create workspace
- `GET /:id` - Get workspace details
- `POST /:id/actions` - Start/stop/restart workspace
- `GET /:id/metrics` - Resource usage metrics
- `GET /:id/logs` - Container logs

### Groups (`/api/groups`)
- `GET /` - List user's groups
- `POST /` - Create group (admin)
- `GET /:id/members` - Group members
- `POST /:id/members` - Add member (admin)
- `GET /:id/usage` - Resource usage

### Admin (`/api/admin`)
- `GET /users` - List all users
- `GET /audit-logs` - Audit trail
- `GET /stats` - Platform statistics
- `POST /users/:id/promote` - Make user admin

## Security Features

### Authentication & Authorization
- JWT tokens with configurable expiration
- Multi-provider OAuth support (Cognito, Google)
- Group-based permissions with namespace isolation
- Admin role separation with audit logging

### Rate Limiting
- Global rate limits: 100 requests/minute
- Workspace operations: 10 requests/minute
- Authentication attempts: 5 per 15 minutes
- Bypass for admin users

### Input Validation
- Joi schema validation for all endpoints
- Kubernetes name format validation
- Resource quota validation
- SQL injection prevention

### Security Headers
- Helmet.js security headers
- CORS configuration
- Content Security Policy
- XSS protection

## Monitoring & Observability

### Health Checks
- `/api/health` - Basic health status
- `/api/health/detailed` - Comprehensive diagnostics
- `/api/health/live` - Kubernetes liveness probe
- `/api/health/ready` - Kubernetes readiness probe

### Logging
- Structured JSON logging with Winston
- Request/response logging with Morgan
- Error tracking with stack traces
- Audit trail for admin operations

### Metrics
- Resource usage per namespace
- Workspace status tracking
- API performance metrics
- Error rate monitoring

## Development

### Project Structure
```
src/
├── app.ts                 # Main application file
├── config/               # Configuration management
├── middleware/           # Express middleware
│   ├── auth.ts          # Authentication
│   ├── validation.ts    # Input validation
│   └── rateLimiting.ts  # Rate limiting
├── routes/              # API route handlers
│   ├── auth.ts
│   ├── workspaces.ts
│   ├── groups.ts
│   └── admin.ts
├── services/            # Business logic
│   ├── kubernetesService.ts
│   ├── dynamodbService.ts
│   └── userService.ts
├── types/               # TypeScript definitions
├── utils/               # Utility functions
│   ├── errors.ts        # Custom error classes
│   └── logger.ts        # Logging configuration
└── validation/          # Validation schemas
```

### Code Quality
- TypeScript for type safety
- ESLint for code standards
- Prettier for formatting
- Jest for testing
- Pre-commit hooks

### Testing
```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Troubleshooting

### Common Issues

1. **Kubernetes connection failures**
   - Verify kubeconfig is properly mounted
   - Check service account permissions
   - Ensure cluster network connectivity

2. **DynamoDB access issues**
   - Verify IRSA configuration
   - Check IAM policy permissions
   - Confirm table names and regions

3. **Authentication failures**
   - Verify OAuth provider configuration
   - Check JWT secret configuration
   - Validate token expiration settings

4. **Rate limiting issues**
   - Check Redis connectivity
   - Verify rate limit configuration
   - Review user permissions for bypasses

### Debug Commands

```bash
# Check API health
curl http://localhost:3001/api/health

# Verify Kubernetes connectivity
kubectl auth can-i --list --as=system:serviceaccount:vscode-platform:backend-api-sa

# Check DynamoDB tables
aws dynamodb list-tables --region us-west-2

# View application logs
kubectl logs -f deployment/backend-api -n vscode-platform

# Check Redis connection
redis-cli ping
```

## Contributing

### Development Workflow

1. **Fork and clone the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Install dependencies**: `npm install`
4. **Make your changes** with proper tests
5. **Run the test suite**: `npm test`
6. **Check code quality**: `npm run lint`
7. **Commit your changes**: `git commit -m 'Add amazing feature'`
8. **Push to the branch**: `git push origin feature/amazing-feature`
9. **Open a Pull Request**

### Coding Standards

- Use TypeScript for all new code
- Follow the existing code style (ESLint + Prettier)
- Write tests for new functionality
- Update documentation for API changes
- Use conventional commit messages

## Deployment Guide

### AWS Infrastructure Setup

1. **Create EKS Cluster:**
   ```bash
   eksctl create cluster \
     --name vscode-platform \
     --version 1.27 \
     --region us-west-2 \
     --nodegroup-name workers \
     --node-type m5.large \
     --nodes 3 \
     --nodes-min 1 \
     --nodes-max 10 \
     --with-oidc \
     --managed
   ```

2. **Install AWS Load Balancer Controller:**
   ```bash
   helm repo add eks https://aws.github.io/eks-charts
   helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
     -n kube-system \
     --set clusterName=vscode-platform \
     --set serviceAccount.create=false \
     --set serviceAccount.name=aws-load-balancer-controller
   ```

3. **Create DynamoDB Tables:**
   ```bash
   # Use AWS CLI or Terraform to create tables
   aws dynamodb create-table \
     --table-name vscode-platform-users \
     --attribute-definitions \
       AttributeName=id,AttributeType=S \
       AttributeName=email,AttributeType=S \
     --key-schema \
       AttributeName=id,KeyType=HASH \
     --global-secondary-indexes \
       IndexName=email-index,KeySchema=[{AttributeName=email,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5} \
     --provisioned-throughput \
       ReadCapacityUnits=5,WriteCapacityUnits=5
   ```

### Production Checklist

- [ ] Environment variables configured
- [ ] SSL certificates provisioned
- [ ] Database tables created with backups
- [ ] Monitoring and alerting setup
- [ ] Security groups configured
- [ ] Resource limits and quotas set
- [ ] Backup and disaster recovery tested
- [ ] Load testing completed
- [ ] Security audit performed

## Performance Tuning

### Database Optimization

- Use DynamoDB On-Demand billing for variable workloads
- Configure appropriate GSI for query patterns
- Enable Point-in-Time Recovery for data protection
- Set up DynamoDB Streams for real-time processing

### Kubernetes Optimization

- Set appropriate resource requests and limits
- Configure horizontal pod autoscaling
- Use pod disruption budgets for availability
- Implement network policies for security

## Security Considerations

### Network Security

- Use VPC with private subnets for worker nodes
- Configure security groups with minimal access
- Enable VPC Flow Logs for network monitoring
- Use AWS WAF for application-level protection

### Data Security

- Encrypt data at rest in DynamoDB and EBS
- Use AWS KMS for key management
- Enable encryption in transit with TLS
- Implement proper secret management

## License

This project is licensed under the MIT License.

## Support

For support and questions:

- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review the API documentation
- Contact the platform team

## Roadmap

### Version 2.0 (Planned)

- [ ] Multi-region support
- [ ] Advanced resource scheduling
- [ ] Workspace templates and presets
- [ ] Integration with GitOps workflows
- [ ] Enhanced monitoring dashboards
- [ ] Backup and restore functionality

### Version 2.1 (Future)

- [ ] Machine learning workload support
- [ ] Advanced networking features
- [ ] Integration with CI/CD pipelines
- [ ] Mobile app support
- [ ] Advanced analytics and reporting
