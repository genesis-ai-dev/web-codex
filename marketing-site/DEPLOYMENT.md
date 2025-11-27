# Docker Deployment Guide

This guide covers deploying the Codex Web marketing site using Docker.

## Quick Start

### Build and Run with Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The site will be available at `http://localhost:8080`

### Build and Run with Docker

```bash
# Build the image
docker build -t codex-marketing:latest .

# Run the container
docker run -d \
  --name codex-marketing \
  -p 8080:80 \
  --restart unless-stopped \
  codex-marketing:latest

# View logs
docker logs -f codex-marketing

# Stop and remove
docker stop codex-marketing
docker rm codex-marketing
```

## Architecture

The deployment uses:
- **Base Image**: `nginx:alpine` (lightweight, ~25MB)
- **Web Server**: Nginx with custom configuration
- **Port**: 80 (exposed as 8080 on host)
- **Resources**: Limited to 0.5 CPU cores and 128MB RAM

## Configuration

### Environment Variables

Currently, the site is static with no environment variables. For dynamic configuration:

```yaml
# docker-compose.yml
environment:
  - API_URL=https://api.codexweb.dev
  - ENVIRONMENT=production
```

### Port Mapping

Change the host port in `docker-compose.yml`:

```yaml
ports:
  - "3000:80"  # Access at http://localhost:3000
```

### Custom Domain

Update the Traefik labels in `docker-compose.yml`:

```yaml
labels:
  - "traefik.http.routers.marketing.rule=Host(`yourdomain.com`)"
```

## Production Deployment

### Docker Compose (Simple)

1. **Deploy to a VM or VPS**:
```bash
# SSH into your server
ssh user@your-server.com

# Clone the repository
git clone <repository-url>
cd web-codex/marketing-site

# Start the service
docker-compose up -d

# Enable firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

2. **Add SSL with Nginx Proxy**:
```bash
# Use nginx-proxy with Let's Encrypt
docker network create nginx-proxy

# Update docker-compose.yml
environment:
  - VIRTUAL_HOST=codexweb.dev
  - LETSENCRYPT_HOST=codexweb.dev
  - LETSENCRYPT_EMAIL=admin@codexweb.dev
```

### Kubernetes Deployment

1. **Build and Push Image**:
```bash
# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 \
  -t your-registry/codex-marketing:latest \
  --push .
```

2. **Create Kubernetes Manifests** (`k8s/marketing-deployment.yaml`):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: marketing-site
  namespace: codex-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: marketing-site
  template:
    metadata:
      labels:
        app: marketing-site
    spec:
      containers:
      - name: marketing
        image: your-registry/codex-marketing:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: 100m
            memory: 64Mi
          limits:
            cpu: 500m
            memory: 128Mi
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: marketing-site
  namespace: codex-platform
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
  selector:
    app: marketing-site
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: marketing-site
  namespace: codex-platform
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - codexweb.dev
    - www.codexweb.dev
    secretName: marketing-tls
  rules:
  - host: codexweb.dev
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: marketing-site
            port:
              number: 80
  - host: www.codexweb.dev
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: marketing-site
            port:
              number: 80
```

3. **Deploy**:
```bash
kubectl apply -f k8s/marketing-deployment.yaml
```

### AWS ECS Deployment

1. **Create ECR Repository**:
```bash
aws ecr create-repository --repository-name codex-marketing

# Login to ECR
aws ecr get-login-password --region us-west-2 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-west-2.amazonaws.com
```

2. **Build and Push**:
```bash
docker build -t codex-marketing .
docker tag codex-marketing:latest \
  123456789012.dkr.ecr.us-west-2.amazonaws.com/codex-marketing:latest
docker push 123456789012.dkr.ecr.us-west-2.amazonaws.com/codex-marketing:latest
```

3. **Create Task Definition** (`ecs-task-definition.json`):
```json
{
  "family": "codex-marketing",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "marketing",
      "image": "123456789012.dkr.ecr.us-west-2.amazonaws.com/codex-marketing:latest",
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/codex-marketing",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

4. **Deploy Service**:
```bash
aws ecs create-service \
  --cluster codex-cluster \
  --service-name marketing-site \
  --task-definition codex-marketing \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=marketing,containerPort=80"
```

### Google Cloud Run

```bash
# Build and push to GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/codex-marketing

# Deploy to Cloud Run
gcloud run deploy marketing-site \
  --image gcr.io/PROJECT_ID/codex-marketing \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 80 \
  --memory 128Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/deploy-marketing.yml`:

```yaml
name: Deploy Marketing Site

on:
  push:
    branches: [main]
    paths:
      - 'marketing-site/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: ./marketing-site
          push: true
          tags: your-registry/codex-marketing:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/codex-marketing
            docker-compose pull
            docker-compose up -d
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
stages:
  - build
  - deploy

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:latest marketing-site/
    - docker push $CI_REGISTRY_IMAGE:latest
  only:
    - main

deploy:
  stage: deploy
  script:
    - ssh user@server "cd /opt/codex && docker-compose pull && docker-compose up -d"
  only:
    - main
```

## Monitoring

### Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker ps

# View health check logs
docker inspect --format='{{json .State.Health}}' codex-marketing | jq
```

### Logs

```bash
# Docker Compose
docker-compose logs -f

# Docker
docker logs -f codex-marketing

# Last 100 lines
docker logs --tail 100 codex-marketing
```

### Metrics

For production monitoring, integrate with:

**Prometheus**:
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'nginx'
    static_configs:
      - targets: ['marketing-site:9113']
```

**Datadog**:
```bash
docker run -d \
  --name dd-agent \
  -e DD_API_KEY=<your-key> \
  -e DD_LOGS_ENABLED=true \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  datadog/agent:latest
```

## Scaling

### Docker Compose (Manual)

```bash
docker-compose up -d --scale marketing-site=3
```

### Kubernetes (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: marketing-site-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: marketing-site
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs codex-marketing

# Inspect container
docker inspect codex-marketing

# Check nginx config
docker exec codex-marketing nginx -t
```

### Port already in use

```bash
# Find process using port 8080
lsof -i :8080

# Change port in docker-compose.yml
ports:
  - "8081:80"
```

### Permission errors

```bash
# Fix file permissions
chmod -R 755 marketing-site/

# Rebuild image
docker-compose build --no-cache
```

## Security Best Practices

1. **Keep base image updated**:
```bash
docker pull nginx:alpine
docker-compose build --no-cache
```

2. **Scan for vulnerabilities**:
```bash
docker scan codex-marketing:latest
```

3. **Use non-root user** (already configured in Dockerfile)

4. **Enable SSL/TLS** in production with Let's Encrypt

5. **Set security headers** (already configured in nginx.conf)

## Backup and Recovery

### Backup

The site is static, so backup the source files:
```bash
tar -czf marketing-site-backup.tar.gz marketing-site/
```

### Recovery

```bash
# Extract backup
tar -xzf marketing-site-backup.tar.gz

# Rebuild and deploy
cd marketing-site
docker-compose up -d --build
```

## Performance Optimization

The current setup includes:
- ✅ Gzip compression
- ✅ Static asset caching (1 year)
- ✅ Lightweight Alpine Linux base
- ✅ Resource limits

Additional optimizations:
- Use a CDN (CloudFlare, AWS CloudFront)
- Enable HTTP/2 (requires SSL)
- Implement service worker for offline support

## Cost Estimation

### Cloud Providers (Monthly)

- **AWS ECS Fargate**: ~$15-30 (2 tasks, 0.25 vCPU, 512MB each)
- **Google Cloud Run**: ~$5-10 (100,000 requests/month)
- **Digital Ocean**: $5 (single droplet)
- **Linode**: $5 (1GB Nanode)

### Self-Hosted

- VPS (2GB RAM): $10-20/month
- Domain: $12/year
- SSL: Free (Let's Encrypt)

## Support

For deployment issues:
- Check container logs: `docker-compose logs -f`
- Verify nginx config: `docker exec codex-marketing nginx -t`
- Review the main README.md for site customization
- Create an issue in the repository

---

Built for easy deployment and scalability
