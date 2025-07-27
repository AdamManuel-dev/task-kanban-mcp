# Deployment Guide

This guide covers deploying the MCP Kanban Server in various environments, from local development to production cloud deployments.

## 🚀 Quick Start

### Local Development
```bash
# Clone and setup
git clone https://github.com/AdamManuel-dev/task-kanban-mcp.git
cd task-kanban-mcp
npm install
npm run build
npm start
```

### Docker Quick Start
```bash
# Production
docker-compose --profile prod up -d

# Development
docker-compose --profile dev up -d
```

## 📋 Prerequisites

### System Requirements
- **Node.js**: 18.x or higher
- **npm**: 8.x or higher
- **SQLite**: 3.x (included with Node.js)
- **Memory**: 512MB minimum, 1GB recommended
- **Storage**: 100MB minimum for application + data

### Optional Dependencies
- **Docker**: 20.x or higher (for containerized deployment)
- **Docker Compose**: 2.x or higher
- **PM2**: For process management (production)
- **Nginx**: For reverse proxy (production)

## 🏠 Local Development Deployment

### Standard Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/AdamManuel-dev/task-kanban-mcp.git
   cd task-kanban-mcp
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build Application**
   ```bash
   npm run build
   ```

4. **Setup Environment**
   ```bash
   # Create environment file
   cp .env.example .env
   
   # Edit configuration
   nano .env
   ```

5. **Initialize Database**
   ```bash
   npm run migrate:up
   npm run seed:run
   ```

6. **Start Server**
   ```bash
   npm start
   ```

### Development Mode

```bash
# Start development server with hot reload
npm run dev

# Start specific components
npm run dev:server    # REST API server
npm run dev:mcp       # MCP server only
npm run dev:cli       # CLI interface
```

### Environment Configuration

Create a `.env` file with the following variables:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database Configuration
DATABASE_PATH=./data/kanban.db
DATABASE_BACKUP_PATH=./backups

# Authentication
API_KEY=your-secret-api-key
JWT_SECRET=your-jwt-secret-key

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/kanban.log

# Security
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100

# MCP Configuration
MCP_ENABLED=true
MCP_PORT=3001

# WebSocket Configuration
WS_ENABLED=true
WS_PORT=3000

# Performance
MAX_CONCURRENT_TASKS=10
TASK_TIMEOUT_MINUTES=30
```

## 🐳 Docker Deployment

### Using Docker Compose

1. **Production Deployment**
   ```bash
   # Build and start production services
   docker-compose --profile prod up -d
   
   # View logs
   docker-compose logs -f mcp-kanban
   
   # Stop services
   docker-compose --profile prod down
   ```

2. **Development Deployment**
   ```bash
   # Start development environment
   docker-compose --profile dev up -d
   
   # Access development server
   curl http://localhost:3000/health
   ```

3. **CLI Testing**
   ```bash
   # Start CLI container for testing
   docker-compose --profile cli up -d
   
   # Execute CLI commands
   docker exec -it mcp-kanban-cli kanban board list
   ```

### Manual Docker Build

1. **Build Production Image**
   ```bash
   docker build --target production -t mcp-kanban:latest .
   ```

2. **Run Container**
   ```bash
   docker run -d \
     --name mcp-kanban \
     -p 3000:3000 \
     -v kanban-data:/app/data \
     -v kanban-logs:/app/logs \
     -v kanban-backups:/app/backups \
     -e NODE_ENV=production \
     -e API_KEY=your-production-key \
     mcp-kanban:latest
   ```

3. **Create Volumes**
   ```bash
   docker volume create kanban-data
   docker volume create kanban-logs
   docker volume create kanban-backups
   ```

### Docker Configuration

#### Production Dockerfile
The project uses a multi-stage build for optimized production images:

```dockerfile
# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:18-alpine AS production
RUN addgroup -g 1001 -S nodejs
RUN adduser -S kanban -u 1001
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=build /app/dist ./dist
USER kanban
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

#### Docker Compose Services

```yaml
# Production service
mcp-kanban:
  build:
    context: .
    target: production
  ports:
    - "3000:3000"
  volumes:
    - kanban-data:/app/data
    - kanban-logs:/app/logs
    - kanban-backups:/app/backups
  environment:
    - NODE_ENV=production
    - DATABASE_PATH=/app/data/kanban.db
  restart: unless-stopped

# Development service
mcp-kanban-dev:
  build:
    context: .
    target: development
  ports:
    - "3000:3000"
    - "3001:3001"
  volumes:
    - .:/app
    - /app/node_modules
  environment:
    - NODE_ENV=development
  restart: unless-stopped
```

## ☁️ Cloud Deployment

### AWS Deployment

#### EC2 Instance

1. **Launch EC2 Instance**
   ```bash
   # Ubuntu 22.04 LTS recommended
   # t3.small or larger
   # Security group: 3000, 22
   ```

2. **Install Dependencies**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PM2
   sudo npm install -g pm2
   ```

3. **Deploy Application**
   ```bash
   # Clone repository
   git clone https://github.com/AdamManuel-dev/task-kanban-mcp.git
   cd task-kanban-mcp
   
   # Install and build
   npm install
   npm run build
   
   # Setup environment
   cp .env.example .env
   nano .env
   
   # Initialize database
   npm run migrate:up
   npm run seed:run
   ```

4. **Start with PM2**
   ```bash
   # Create PM2 ecosystem file
   cat > ecosystem.config.js << EOF
   module.exports = {
     apps: [{
       name: 'mcp-kanban',
       script: 'dist/index.js',
       instances: 1,
       autorestart: true,
       watch: false,
       max_memory_restart: '1G',
       env: {
         NODE_ENV: 'production',
         PORT: 3000
       }
     }]
   };
   EOF
   
   # Start application
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

#### AWS ECS/Fargate

1. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name mcp-kanban
   ```

2. **Build and Push Image**
   ```bash
   # Login to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
   
   # Build and tag
   docker build -t mcp-kanban .
   docker tag mcp-kanban:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/mcp-kanban:latest
   
   # Push to ECR
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/mcp-kanban:latest
   ```

3. **Create ECS Task Definition**
   ```json
   {
     "family": "mcp-kanban",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "256",
     "memory": "512",
     "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
     "containerDefinitions": [
       {
         "name": "mcp-kanban",
         "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/mcp-kanban:latest",
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
             "awslogs-region": "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

### Google Cloud Platform

#### Google Cloud Run

1. **Enable APIs**
   ```bash
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

2. **Build and Deploy**
   ```bash
   # Build image
   docker build -t gcr.io/<project-id>/mcp-kanban .
   
   # Push to Container Registry
   docker push gcr.io/<project-id>/mcp-kanban
   
   # Deploy to Cloud Run
   gcloud run deploy mcp-kanban \
     --image gcr.io/<project-id>/mcp-kanban \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 3000 \
     --memory 512Mi \
     --cpu 1
   ```

### Azure Deployment

#### Azure Container Instances

1. **Build and Push to Azure Container Registry**
   ```bash
   # Login to Azure
   az login
   
   # Create ACR
   az acr create --resource-group myResourceGroup --name mcpkanbanacr --sku Basic
   
   # Build and push
   az acr build --registry mcpkanbanacr --image mcp-kanban .
   ```

2. **Deploy to Container Instances**
   ```bash
   az container create \
     --resource-group myResourceGroup \
     --name mcp-kanban \
     --image mcpkanbanacr.azurecr.io/mcp-kanban:latest \
     --ports 3000 \
     --dns-name-label mcp-kanban \
     --environment-variables NODE_ENV=production
   ```

## 🔧 Production Configuration

### Environment Variables

#### Required Variables
```bash
NODE_ENV=production
PORT=3000
API_KEY=your-secure-production-key
JWT_SECRET=your-secure-jwt-secret
DATABASE_PATH=/app/data/kanban.db
```

#### Security Variables
```bash
# CORS Configuration
CORS_ORIGIN=https://yourdomain.com
CORS_CREDENTIALS=true

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX=100

# Security Headers
HELMET_ENABLED=true
CONTENT_SECURITY_POLICY=true
```

#### Performance Variables
```bash
# Database
DATABASE_CONNECTION_LIMIT=10
DATABASE_TIMEOUT=30000

# Task Management
MAX_CONCURRENT_TASKS=20
TASK_TIMEOUT_MINUTES=60

# WebSocket
WS_MAX_CONNECTIONS=100
WS_HEARTBEAT_INTERVAL=30000
```

### Process Management

#### PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'mcp-kanban',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

#### Systemd Service
```ini
# /etc/systemd/system/mcp-kanban.service
[Unit]
Description=MCP Kanban Server
After=network.target

[Service]
Type=simple
User=kanban
WorkingDirectory=/opt/mcp-kanban
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

### Reverse Proxy Configuration

#### Nginx Configuration
```nginx
# /etc/nginx/sites-available/mcp-kanban
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### Apache Configuration
```apache
# /etc/apache2/sites-available/mcp-kanban.conf
<VirtualHost *:80>
    ServerName yourdomain.com
    
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
    
    RewriteEngine on
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://localhost:3000/$1" [P,L]
</VirtualHost>
```

## 📊 Monitoring and Logging

### Health Checks

#### Application Health Endpoint
```bash
# Check application health
curl http://localhost:3000/health

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-12-01T10:00:00.000Z",
  "version": "0.1.0",
  "database": "connected",
  "uptime": 3600
}
```

#### Docker Health Check
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"
```

### Logging Configuration

#### Winston Logger Setup
```javascript
// Production logging configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-kanban' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
```

#### Log Rotation
```bash
# Install logrotate
sudo apt-get install logrotate

# Configure log rotation
sudo nano /etc/logrotate.d/mcp-kanban

# Add configuration
/opt/mcp-kanban/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 kanban kanban
    postrotate
        systemctl reload mcp-kanban
    endscript
}
```

### Metrics and Monitoring

#### Application Metrics
```javascript
// Basic metrics collection
const metrics = {
  requests: 0,
  errors: 0,
  activeConnections: 0,
  taskCompletions: 0
};

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    ...metrics,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});
```

#### Prometheus Integration
```javascript
// Install prometheus client
npm install prom-client

// Setup metrics
const prometheus = require('prom-client');
const collectDefaultMetrics = prometheus.collectDefaultMetrics;
collectDefaultMetrics();

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', prometheus.register.contentType);
  res.end(await prometheus.register.metrics());
});
```

## 🔒 Security Configuration

### SSL/TLS Setup

#### Let's Encrypt with Certbot
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

#### Self-Signed Certificate (Development)
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Use in application
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(3000);
```

### Security Headers

#### Helmet Configuration
```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

### API Security

#### Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

#### API Key Authentication
```javascript
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

app.use('/api/', authenticateApiKey);
```

## 🔄 Backup and Recovery

### Database Backup

#### Automated Backup Script
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/mcp-kanban/backups"
DB_PATH="/opt/mcp-kanban/data/kanban.db"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/kanban_$DATE.db'"

# Compress backup
gzip $BACKUP_DIR/kanban_$DATE.db

# Keep only last 30 days of backups
find $BACKUP_DIR -name "kanban_*.db.gz" -mtime +30 -delete

echo "Backup completed: kanban_$DATE.db.gz"
```

#### Cron Job for Automated Backups
```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /opt/mcp-kanban/scripts/backup.sh
```

### Recovery Procedures

#### Database Recovery
```bash
# Stop application
sudo systemctl stop mcp-kanban

# Restore database
gunzip -c backups/kanban_20241201_020000.db.gz > data/kanban.db

# Verify database integrity
sqlite3 data/kanban.db "PRAGMA integrity_check;"

# Start application
sudo systemctl start mcp-kanban
```

#### Full System Recovery
```bash
# Clone fresh repository
git clone https://github.com/AdamManuel-dev/task-kanban-mcp.git
cd task-kanban-mcp

# Install dependencies
npm install
npm run build

# Restore configuration
cp /backup/.env .env
cp /backup/data/kanban.db data/

# Start application
npm start
```

## 🚨 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

#### Database Connection Issues
```bash
# Check database file permissions
ls -la data/kanban.db

# Fix permissions
sudo chown kanban:kanban data/kanban.db
sudo chmod 644 data/kanban.db

# Check database integrity
sqlite3 data/kanban.db "PRAGMA integrity_check;"
```

#### Memory Issues
```bash
# Check memory usage
free -h
ps aux | grep node

# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

### Debug Mode

#### Enable Debug Logging
```bash
# Set debug environment variable
DEBUG=* npm start

# Or specific debug categories
DEBUG=mcp-kanban:*,express:* npm start
```

#### Docker Debug
```bash
# Run with debug output
docker run -it --rm \
  -e DEBUG=* \
  -p 3000:3000 \
  mcp-kanban:latest
```

## 📈 Performance Optimization

### Database Optimization

#### SQLite Configuration
```javascript
// Database optimization settings
const db = new Database('data/kanban.db', {
  verbose: process.env.NODE_ENV === 'development',
  pragma: {
    journal_mode: 'WAL',
    synchronous: 'NORMAL',
    cache_size: -64000, // 64MB cache
    temp_store: 'MEMORY',
    mmap_size: 268435456 // 256MB mmap
  }
});
```

#### Query Optimization
```javascript
// Use prepared statements
const getTask = db.prepare('SELECT * FROM tasks WHERE id = ?');

// Use transactions for multiple operations
const transaction = db.transaction((tasks) => {
  for (const task of tasks) {
    insertTask.run(task);
  }
});
```

### Application Optimization

#### Caching Strategy
```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

// Cache frequently accessed data
app.get('/api/boards', (req, res) => {
  const cacheKey = 'boards:all';
  let boards = cache.get(cacheKey);
  
  if (!boards) {
    boards = getAllBoards();
    cache.set(cacheKey, boards);
  }
  
  res.json(boards);
});
```

#### Connection Pooling
```javascript
// For multiple database connections
const pool = new DatabasePool({
  max: 10,
  min: 2,
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000
});
```

## 🔗 Related Documentation

- [Getting Started Guide](./GETTING_STARTED.md)
- [Development Guide](./DEVELOPMENT.md)
- [API Documentation](../API.md)
- [Architecture Overview](../ARCHITECTURE.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md) 