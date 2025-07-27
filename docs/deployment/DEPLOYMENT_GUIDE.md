# MCP Kanban Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the MCP Kanban server to production environments. The deployment system includes automated CI/CD pipelines, monitoring, backup systems, and rollback capabilities.

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+ recommended)
- **Docker**: 20.10+ with Docker Compose
- **Memory**: Minimum 2GB RAM, 4GB+ recommended
- **Storage**: 10GB+ available disk space
- **Network**: Ports 80, 443, 3000, 3001, 9090, 3002 available

### Required Software

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install additional tools
sudo apt-get update
sudo apt-get install -y curl jq nginx certbot python3-certbot-nginx
```

## Quick Start Deployment

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/mcp-kanban.git
cd mcp-kanban

# Create production environment file
cp .env.example .env.production
```

### 2. Configure Environment

Edit `.env.production` with your production settings:

```bash
# Application Configuration
NODE_ENV=production
PORT=3000
WEBSOCKET_PORT=3001

# Database Configuration
DATABASE_PATH=/app/data/kanban.db

# Security
API_KEY_HASH=your-hashed-api-key-here
JWT_SECRET=your-jwt-secret-here

# Backup Configuration
BACKUP_DIR=/app/backups
MAX_BACKUP_SIZE=1073741824
BACKUP_RETENTION_DAYS=30

# Monitoring
GRAFANA_PASSWORD=your-grafana-password

# SSL Configuration (if using Let's Encrypt)
SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem
```

### 3. Generate API Key

```bash
# Generate a secure API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Hash the API key for storage
node -e "const crypto = require('crypto'); const apiKey = 'your-api-key-here'; console.log(crypto.createHash('sha256').update(apiKey).digest('hex'))"
```

### 4. Deploy with Docker Compose

```bash
# Create necessary directories
mkdir -p data logs backups config nginx/ssl

# Deploy the application
docker-compose -f docker-compose.production.yml up -d

# Check deployment status
docker-compose -f docker-compose.production.yml ps
```

### 5. Verify Deployment

```bash
# Check application health
curl http://localhost:3000/health

# Check API documentation
curl http://localhost:3000/api/docs

# Check monitoring
curl http://localhost:9090  # Prometheus
curl http://localhost:3002  # Grafana
```

## Advanced Deployment Options

### SSL/TLS Configuration

#### Option 1: Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Update Nginx configuration
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf
sudo systemctl reload nginx
```

#### Option 2: Custom SSL Certificates

```bash
# Place your certificates
sudo cp your-cert.pem nginx/ssl/cert.pem
sudo cp your-key.pem nginx/ssl/key.pem

# Set proper permissions
sudo chmod 600 nginx/ssl/key.pem
sudo chown root:root nginx/ssl/cert.pem nginx/ssl/key.pem
```

### Database Configuration

#### SQLite (Default)

The application uses SQLite by default, which is suitable for most deployments.

#### PostgreSQL (Optional)

For high-traffic deployments, consider using PostgreSQL:

```yaml
# Add to docker-compose.production.yml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: mcp_kanban
      POSTGRES_USER: mcp_kanban
      POSTGRES_PASSWORD: your-secure-password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - mcp-kanban-network

volumes:
  postgres-data:
```

### Backup Configuration

#### Automated Backups

```bash
# Create backup cron job
sudo crontab -e

# Add the following line for daily backups at 2 AM
0 2 * * * cd /path/to/mcp-kanban && docker-compose -f docker-compose.production.yml --profile backup run --rm backup-service
```

#### Manual Backups

```bash
# Create manual backup
./scripts/deploy.sh backup

# List backups
docker exec mcp-kanban ls -la /app/backups

# Restore from backup
docker exec mcp-kanban sqlite3 /app/data/kanban.db ".restore '/app/backups/backup-20250101.db'"
```

## Monitoring and Observability

### Prometheus Metrics

The application exposes metrics at `/metrics` endpoint:

```bash
# View application metrics
curl http://localhost:3000/metrics

# Common metrics to monitor:
# - http_requests_total
# - http_request_duration_seconds
# - websocket_connections_active
# - database_connections_active
```

### Grafana Dashboards

Access Grafana at `http://your-domain.com:3002`:

- **Username**: admin
- **Password**: Set in GRAFANA_PASSWORD environment variable

Pre-configured dashboards include:
- API performance metrics
- WebSocket connection monitoring
- Database performance
- System resource usage

### Log Management

```bash
# View application logs
docker-compose -f docker-compose.production.yml logs -f mcp-kanban

# View Nginx logs
docker-compose -f docker-compose.production.yml logs -f nginx

# Log rotation is configured automatically
```

## CI/CD Pipeline

### GitHub Actions Setup

1. **Repository Secrets**: Configure the following secrets in your GitHub repository:

```
DOCKER_REGISTRY=your-registry.com
DOCKER_USERNAME=your-username
DOCKER_PASSWORD=your-password
STAGING_HEALTH_CHECK_URL=http://staging.your-domain.com/health
PRODUCTION_HEALTH_CHECK_URL=https://your-domain.com/health
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook
EMAIL_RECIPIENTS=admin@your-domain.com
```

2. **Deployment Triggers**:
   - **Staging**: Push to `develop` branch
   - **Production**: Create a tag starting with `v` (e.g., `v1.0.0`)

### Manual Deployment

```bash
# Deploy to staging
DEPLOYMENT_ENV=staging ./scripts/deploy.sh deploy

# Deploy to production
DEPLOYMENT_ENV=production ./scripts/deploy.sh deploy

# Rollback deployment
./scripts/deploy.sh rollback

# Check deployment health
./scripts/deploy.sh health
```

## Security Considerations

### Network Security

```bash
# Configure firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### API Security

- Use strong API keys
- Implement rate limiting
- Enable HTTPS only
- Regular security updates

### Data Security

- Encrypt sensitive data
- Regular backups
- Access control
- Audit logging

## Troubleshooting

### Common Issues

#### Application Won't Start

```bash
# Check logs
docker-compose -f docker-compose.production.yml logs mcp-kanban

# Check configuration
docker-compose -f docker-compose.production.yml config

# Verify environment variables
docker exec mcp-kanban env | grep -E "(NODE_ENV|DATABASE_PATH|API_KEY)"
```

#### Database Issues

```bash
# Check database integrity
docker exec mcp-kanban sqlite3 /app/data/kanban.db "PRAGMA integrity_check;"

# Backup and restore
docker exec mcp-kanban sqlite3 /app/data/kanban.db ".backup '/app/backups/emergency-backup.db'"
```

#### Performance Issues

```bash
# Check resource usage
docker stats mcp-kanban

# Monitor logs for errors
docker-compose -f docker-compose.production.yml logs -f mcp-kanban | grep ERROR

# Check database performance
docker exec mcp-kanban sqlite3 /app/data/kanban.db "PRAGMA optimize;"
```

### Health Checks

```bash
# Application health
curl -f http://localhost:3000/health

# API endpoints
curl -H "Authorization: Bearer your-api-key" http://localhost:3000/api/v1/boards

# WebSocket connection
wscat -c ws://localhost:3001/ws
```

## Maintenance

### Regular Maintenance Tasks

```bash
# Weekly: Update dependencies
npm audit fix
docker-compose -f docker-compose.production.yml build --no-cache

# Monthly: Database maintenance
docker exec mcp-kanban sqlite3 /app/data/kanban.db "VACUUM; ANALYZE;"

# Quarterly: Security audit
npm audit
docker scan mcp-kanban:latest
```

### Updates and Upgrades

```bash
# Pull latest changes
git pull origin main

# Rebuild and deploy
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml build --no-cache
docker-compose -f docker-compose.production.yml up -d

# Verify deployment
./scripts/deploy.sh health
```

## Support and Resources

### Documentation

- [API Documentation](http://localhost:3000/api/docs)
- [User Guide](../USER_GUIDE.md)
- [Configuration Guide](../CONFIGURATION.md)

### Monitoring URLs

- **Application**: https://your-domain.com
- **API Docs**: https://your-domain.com/api/docs
- **Grafana**: https://your-domain.com:3002
- **Prometheus**: https://your-domain.com:9090

### Contact

For deployment issues or questions:
- Create an issue on GitHub
- Check the troubleshooting section above
- Review application logs for error details

## Conclusion

This deployment guide provides a comprehensive approach to deploying the MCP Kanban server in production. The system includes automated deployment, monitoring, backup, and rollback capabilities to ensure high availability and reliability.

For additional customization or enterprise deployments, refer to the advanced configuration options and consider implementing additional security measures based on your specific requirements. 