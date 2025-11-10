# Frontend Build Configuration

This document explains how to build the frontend Docker image with the correct environment configuration.

## Build-time Configuration

The frontend uses **build-time environment variables** that are baked into the static assets during the Docker build process. This approach is intentional to make the application CDN-ready and ensure optimal performance.

### Required Build Arguments

The following build arguments must be provided when building the Docker image:

- `REACT_APP_AUTH_CLIENT_ID` - AWS Cognito client ID
- `REACT_APP_AUTH_REGION` - AWS region (e.g., `ca-west-1`)
- `REACT_APP_USER_POOL_ID` - AWS Cognito user pool ID

### Building the Docker Image

#### Production Build (with Cognito configuration)

```bash
docker build \
  --build-arg REACT_APP_AUTH_CLIENT_ID=4ffda6ruo971oko0q62fsh5qr8 \
  --build-arg REACT_APP_AUTH_REGION=ca-west-1 \
  --build-arg REACT_APP_USER_POOL_ID=ca-west-1_nnIouSRAD \
  -t ghcr.io/genesis-ai-dev/web-codex/frontend:main \
  .
```

#### Using GitHub Actions

In your CI/CD pipeline, you can use secrets to inject these values:

```yaml
- name: Build Docker image
  run: |
    docker build \
      --build-arg REACT_APP_AUTH_CLIENT_ID=${{ secrets.COGNITO_CLIENT_ID }} \
      --build-arg REACT_APP_AUTH_REGION=${{ secrets.AWS_REGION }} \
      --build-arg REACT_APP_USER_POOL_ID=${{ secrets.COGNITO_USER_POOL_ID }} \
      -t ghcr.io/genesis-ai-dev/web-codex/frontend:${GITHUB_SHA} \
      .
```

## API Configuration

The frontend is configured to make API calls to `/api` (relative path). This works because:

1. **In Kubernetes**: The Ingress routes both frontend (`/`) and backend (`/api`) through the same domain
2. **In Development**: The `package.json` includes a proxy configuration that forwards API requests to `http://localhost:3001`
3. **In CDN deployment**: You would configure the CDN to forward `/api` requests to your backend origin

## Deployment

### Kubernetes

The Kubernetes manifests are located in the `k8s/` directory:

```bash
kubectl apply -f k8s/k8s-deployment.yaml
kubectl apply -f k8s/k8s-service.yaml
kubectl apply -f k8s/k8s-ingress.yaml
```

**Note**: The environment variables are already baked into the Docker image, so no ConfigMap or Secret is needed for the frontend deployment.

### CDN Deployment (Future)

For CDN deployment:

1. Build the Docker image with the appropriate build args
2. Extract the static files from the built image:
   ```bash
   docker create --name frontend-temp ghcr.io/genesis-ai-dev/web-codex/frontend:main
   docker cp frontend-temp:/usr/share/nginx/html ./build
   docker rm frontend-temp
   ```
3. Upload the `build/` directory to your CDN
4. Configure the CDN to forward `/api/*` requests to your backend origin

## Environment-Specific Builds

For different environments (dev, staging, production), build separate Docker images with environment-specific build arguments:

```bash
# Development
docker build \
  --build-arg REACT_APP_AUTH_CLIENT_ID=<dev-client-id> \
  --build-arg REACT_APP_AUTH_REGION=ca-west-1 \
  --build-arg REACT_APP_USER_POOL_ID=<dev-pool-id> \
  -t ghcr.io/genesis-ai-dev/web-codex/frontend:dev \
  .

# Production
docker build \
  --build-arg REACT_APP_AUTH_CLIENT_ID=<prod-client-id> \
  --build-arg REACT_APP_AUTH_REGION=ca-west-1 \
  --build-arg REACT_APP_USER_POOL_ID=<prod-pool-id> \
  -t ghcr.io/genesis-ai-dev/web-codex/frontend:prod \
  .
```

## Current Configuration Values

The current production values (as of the Terraform output) are:

- **Client ID**: `4ffda6ruo971oko0q62fsh5qr8`
- **Region**: `ca-west-1`
- **User Pool ID**: `ca-west-1_nnIouSRAD`

**Important**: Store these values securely in your CI/CD secrets manager, not in version control.
