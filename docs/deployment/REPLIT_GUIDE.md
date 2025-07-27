# Replit Deployment Guide

Deploy MCP Kanban on Replit for instant access to your task management system from anywhere.

## 🚀 Quick Deploy

### Method 1: Fork from GitHub

1. **Import Repository**
   - Go to [Replit](https://replit.com)
   - Click "Create Repl"
   - Choose "Import from GitHub"
   - Enter: `https://github.com/yourusername/mcp-kanban`
   - Click "Import"

2. **Automatic Setup**
   - Replit will automatically detect the configuration
   - Dependencies will be installed automatically
   - Database will be initialized with sample data

3. **Start the Server**
   - Click the "Run" button
   - Your MCP Kanban server will be available at your Repl URL

### Method 2: Manual Setup

1. **Create New Repl**
   - Create a new Node.js Repl
   - Upload the project files or clone the repository

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build and Start**
   ```bash
   npm run build
   npm run migrate
   npm run seed
   npm start
   ```

## ⚙️ Configuration

### Environment Variables

Set these in the Replit Secrets tab:

```bash
# Required
API_SECRET_KEY=your-secret-key-here
JWT_SECRET=your-jwt-secret-here

# Optional
NODE_ENV=production
LOG_LEVEL=info
ENABLE_ANALYTICS=true
ENABLE_WEBSOCKET=true
```

### Database Setup

The SQLite database is automatically configured:
- **Location**: `./data/kanban.db`
- **Backup**: Automatic backups to Replit storage
- **Migrations**: Run automatically on startup

### Port Configuration

Replit automatically handles port mapping:
- **Main API**: Accessible via your Repl URL
- **WebSocket**: Port 3456 (configured automatically)
- **Health Check**: Available at `/api/health`

## 🛠️ Development Workflow

### Local Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Check code quality
npm run lint

# Database management
npm run db:migrate
npm run db:seed
npm run db:reset
```

### Production Deployment

```bash
# Build for production
npm run build

# Start production server
npm run start:production

# Monitor performance
npm run monitor
```

## 📊 Monitoring & Analytics

### Performance Monitoring

Access performance metrics at:
- **Health Check**: `https://your-repl.replit.co/api/health`
- **Analytics**: `https://your-repl.replit.co/api/analytics/dashboard`
- **Performance**: `https://your-repl.replit.co/api/performance/dashboard`

### Logging

View logs in the Replit console:
```bash
# View real-time logs
npm run logs

# View error logs
npm run logs:error

# Export logs
npm run logs:export
```

## 🔧 Troubleshooting

### Common Issues

**Server Won't Start**
```bash
# Check Node.js version
node --version  # Should be 18.x

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check database
npm run db:check
```

**Database Issues**
```bash
# Reset database
npm run db:reset

# Check database integrity
npm run db:integrity

# Backup database
npm run db:backup
```

**Memory Issues**
```bash
# Check memory usage
npm run health:memory

# Restart server
npm run restart

# Optimize performance
npm run optimize
```

### Performance Optimization

**Reduce Memory Usage**
```bash
# Set memory limits
export NODE_OPTIONS="--max-old-space-size=1024"

# Disable features temporarily
export ENABLE_ANALYTICS=false
export ENABLE_WEBSOCKET=false
```

**Improve Response Times**
```bash
# Enable caching
export ENABLE_CACHE=true

# Optimize database
npm run db:optimize

# Compress responses
export ENABLE_COMPRESSION=true
```

## 🔒 Security

### API Key Management

1. **Generate Secure Keys**
   ```bash
   npm run keys:generate
   ```

2. **Store in Secrets**
   - Go to Replit Secrets tab
   - Add `API_SECRET_KEY` and `JWT_SECRET`
   - Never commit keys to repository

### Access Control

```bash
# Enable authentication
export REQUIRE_AUTH=true

# Set rate limits
export RATE_LIMIT_MAX=1000
export RATE_LIMIT_WINDOW=900000  # 15 minutes
```

### HTTPS Configuration

Replit automatically provides HTTPS:
- **URL**: `https://your-repl.replit.co`
- **Certificate**: Managed by Replit
- **Redirect**: HTTP automatically redirects to HTTPS

## 🌍 Custom Domain

### Setup Custom Domain

1. **Upgrade to Replit Pro**
   - Custom domains require a paid plan

2. **Configure Domain**
   - Go to your Repl settings
   - Add your custom domain
   - Update DNS records as instructed

3. **SSL Certificate**
   - Replit automatically provisions SSL
   - Certificate auto-renewal included

## 📱 Mobile Access

### Progressive Web App

MCP Kanban works as a PWA on Replit:
- **Add to Home Screen**: Available on mobile browsers
- **Offline Support**: Limited offline functionality
- **Push Notifications**: Supported on compatible devices

### Mobile Optimization

```bash
# Enable mobile features
export ENABLE_PWA=true
export ENABLE_PUSH_NOTIFICATIONS=true
```

## 🔄 Backup & Restore

### Automatic Backups

```bash
# Configure backup schedule
export BACKUP_SCHEDULE="0 0 * * *"  # Daily at midnight
export BACKUP_RETENTION_DAYS=30

# Manual backup
npm run backup

# List backups
npm run backup:list
```

### Restore from Backup

```bash
# List available backups
npm run backup:list

# Restore specific backup
npm run backup:restore --date=2024-01-20

# Restore latest backup
npm run backup:restore --latest
```

## 📈 Scaling

### Horizontal Scaling

For high-traffic deployments:
1. **Multiple Repls**: Deploy multiple instances
2. **Load Balancer**: Use external load balancer
3. **Database**: Consider external database (PostgreSQL)

### Vertical Scaling

```bash
# Increase memory allocation
export NODE_OPTIONS="--max-old-space-size=4096"

# Optimize performance
export ENABLE_CLUSTERING=true
export CLUSTER_WORKERS=4
```

## 🧪 Testing in Replit

### Automated Testing

```bash
# Run full test suite
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e

# Performance testing
npm run test:performance
```

### Manual Testing

```bash
# Test API endpoints
curl https://your-repl.replit.co/api/health

# Test WebSocket
npm run test:websocket

# Load testing
npm run test:load
```

## 📚 Resources

### Helpful Commands

```bash
# System information
npm run info

# Health check
npm run health

# Performance metrics
npm run metrics

# Database statistics
npm run db:stats

# Clear caches
npm run cache:clear
```

### Documentation Links

- **Replit Docs**: [docs.replit.com](https://docs.replit.com)
- **Node.js on Replit**: [docs.replit.com/programming-ide/languages/nodejs](https://docs.replit.com/programming-ide/languages/nodejs)
- **Database Guide**: [docs.replit.com/hosting/databases](https://docs.replit.com/hosting/databases)

## 🎯 Best Practices

### Development

1. **Use Environment Variables**: Store all configuration in Replit Secrets
2. **Version Control**: Commit regularly and use meaningful commit messages
3. **Testing**: Run tests before deploying changes
4. **Monitoring**: Check health metrics regularly

### Production

1. **Security**: Enable authentication and rate limiting
2. **Backups**: Schedule regular automated backups
3. **Monitoring**: Set up alerts for critical metrics
4. **Updates**: Keep dependencies updated

### Performance

1. **Caching**: Enable appropriate caching strategies
2. **Optimization**: Regularly run performance optimization
3. **Monitoring**: Track response times and resource usage
4. **Scaling**: Plan for growth with horizontal scaling

## 🆘 Support

### Getting Help

- **Replit Community**: [community.replit.com](https://community.replit.com)
- **MCP Kanban Issues**: [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
- **Documentation**: Check the `/docs` directory
- **Discord**: Join our community server

### Reporting Issues

When reporting issues, include:
1. Repl URL
2. Error messages or logs
3. Steps to reproduce
4. Expected vs actual behavior
5. Browser and device information

---

🎉 **Congratulations!** You now have MCP Kanban running on Replit. Enjoy your cloud-based task management system! 