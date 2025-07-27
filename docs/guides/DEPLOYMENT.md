# Deployment Guide

## Overview

This guide covers deploying the MCP Kanban CLI in production environments with optimized builds, security considerations, and monitoring.

## Production Build

### 1. Optimized Build Process

```bash
# Clean production build
npm run build:production

# This runs:
# 1. Clean previous builds
# 2. Security bundle compilation
# 3. Asset copying
# 4. Bundle optimization
# 5. Size analysis
```

### 2. Build Artifacts

The production build creates:

```
dist/
├── index.js                 # Main server entry point
├── server.js               # Express server
├── mcp/
│   └── server.js           # MCP server
├── cli/
│   ├── index.js            # CLI entry point
│   ├── commands/           # Command modules
│   ├── utils/              # Utility modules
│   └── ui/                 # UI components
├── security/               # Security bundles
│   ├── input-sanitizer.js
│   ├── command-injection-prevention.js
│   ├── secure-cli-wrapper.js
│   └── ...
└── database/               # Database files
    └── schema.sql
```

### 3. Bundle Optimization

The webpack configuration optimizes for:

- **Size**: Tree shaking and code splitting
- **Performance**: Lazy loading and caching
- **Security**: External dependency isolation
- **Compatibility**: Node.js target optimization

## Deployment Options

### 1. Docker Deployment

#### Dockerfile

```dockerfile
FROM node:18-alpine

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build:production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set permissions
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose ports
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/cli/index.js health

# Start application
CMD ["node", "dist/index.js"]
```

#### Docker Compose

```yaml
version: '3.8'

services:
  mcp-kanban:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/data/kanban.db
    volumes:
      - kanban-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "dist/cli/index.js", "health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  kanban-data:
```

### 2. Kubernetes Deployment

#### Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-kanban
  labels:
    app: mcp-kanban
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-kanban
  template:
    metadata:
      labels:
        app: mcp-kanban
    spec:
      containers:
      - name: mcp-kanban
        image: mcp-kanban:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_PATH
          value: "/data/kanban.db"
        volumeMounts:
        - name: kanban-data
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: kanban-data
        persistentVolumeClaim:
          claimName: kanban-pvc
```

#### Service YAML

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-kanban-service
spec:
  selector:
    app: mcp-kanban
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

### 3. Cloud Deployment

#### AWS ECS

```json
{
  "family": "mcp-kanban",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "mcp-kanban",
      "image": "mcp-kanban:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/mcp-kanban",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

#### Google Cloud Run

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: mcp-kanban
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "10"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
      - image: gcr.io/PROJECT_ID/mcp-kanban:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          limits:
            cpu: "1000m"
            memory: "512Mi"
```

## Security Considerations

### 1. Environment Variables

```bash
# Required for production
NODE_ENV=production
DATABASE_PATH=/data/kanban.db
SERVER_PORT=3000

# Optional security settings
API_KEY=your-secure-api-key
CORS_ORIGIN=https://yourdomain.com
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000
```

### 2. Network Security

- **Firewall**: Restrict access to necessary ports only
- **SSL/TLS**: Use HTTPS in production
- **CORS**: Configure allowed origins
- **Rate Limiting**: Enable API rate limiting

### 3. Data Security

- **Database**: Use encrypted storage
- **Backups**: Regular automated backups
- **Access Control**: Implement proper authentication
- **Audit Logging**: Log all operations

## Monitoring and Observability

### 1. Health Checks

```bash
# Built-in health check
curl http://localhost:3000/health

# CLI health check
kanban health
```

### 2. Logging

Configure logging levels:

```bash
# Development
LOG_LEVEL=debug

# Production
LOG_LEVEL=info
```

### 3. Metrics

Monitor key metrics:

- **Response Time**: API endpoint performance
- **Error Rate**: Failed requests percentage
- **Throughput**: Requests per second
- **Resource Usage**: CPU, memory, disk

### 4. Alerting

Set up alerts for:

- Service unavailability
- High error rates
- Resource exhaustion
- Security events

## Performance Optimization

### 1. Database Optimization

```bash
# Run database optimization
kanban database optimize

# Check database health
kanban database health
```

### 2. Caching

Enable caching for:

- API responses
- Database queries
- Static assets

### 3. Load Balancing

For high availability:

- Use multiple instances
- Implement health checks
- Configure load balancer
- Enable auto-scaling

## Backup and Recovery

### 1. Automated Backups

```bash
# Create backup schedule
kanban backup schedule create \
  --name "daily-backup" \
  --cron "0 2 * * *" \
  --retention 30 \
  --compression \
  --verification
```

### 2. Disaster Recovery

```bash
# Restore from backup
kanban backup restore --backup-id backup-123

# Verify restoration
kanban health
```

## Troubleshooting

### 1. Common Issues

#### Service Won't Start

```bash
# Check logs
docker logs mcp-kanban

# Verify configuration
kanban config validate

# Check dependencies
npm ls
```

#### Performance Issues

```bash
# Monitor resources
kanban health --verbose

# Check database
kanban database stats

# Analyze performance
npm run test:performance
```

#### Security Issues

```bash
# Run security checks
npm run test:security

# Validate inputs
kanban config validate

# Check permissions
ls -la /data/
```

### 2. Debug Mode

```bash
# Enable debug logging
DEBUG=* kanban task list

# Verbose output
kanban --verbose task create

# Trace mode
kanban --trace board view
```

## Maintenance

### 1. Regular Maintenance

```bash
# Weekly database maintenance
kanban database vacuum

# Monthly optimization
kanban database optimize

# Quarterly security audit
npm run test:security
```

### 2. Updates

```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Test after update
npm run test:all
```

## Support

For deployment issues:

1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Review [Performance Tuning](PERFORMANCE_TUNING.md)
3. Open an issue on GitHub
4. Contact support team

---

**Note**: This deployment guide covers production scenarios. For development setup, see [Development Guide](DEVELOPMENT.md). 