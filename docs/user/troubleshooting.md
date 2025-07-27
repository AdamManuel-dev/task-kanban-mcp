# Troubleshooting Guide

This guide helps you diagnose and fix common issues with MCP Kanban Server, CLI, and MCP integration.

## 🔍 Diagnostic Commands

### System Health Check

```bash
# Check server health
curl http://localhost:3000/health

# Check detailed health
curl http://localhost:3000/health/detailed

# Check server readiness
curl http://localhost:3000/ready

# Check server liveness
curl http://localhost:3000/live
```

### CLI Diagnostics

```bash
# Test CLI connection
kanban config test

# Check CLI configuration
kanban config list

# Check CLI version
kanban --version

# Test API access
kanban health
```

### Database Diagnostics

```bash
# Check database integrity
kanban db check

# Check database statistics
kanban db stats

# Check database connection
kanban db test
```

## 🚨 Common Issues

### Server Won't Start

#### Issue: Port Already in Use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**

```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=8080 npm run dev

# For Docker
docker-compose down
docker-compose up -d
```

#### Issue: Node.js Version Too Old

**Symptoms:**
```
SyntaxError: Unexpected token '?'
```

**Solutions:**

```bash
# Check Node.js version
node --version  # Should be 18.0.0+

# Update Node.js (macOS)
brew install node@18

# Update Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Update Node.js (Windows)
# Download from https://nodejs.org/
```

#### Issue: Missing Dependencies

**Symptoms:**
```
Error: Cannot find module 'express'
```

**Solutions:**

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clear npm cache
npm cache clean --force

# Check for missing dependencies
npm ls
```

#### Issue: Environment File Missing

**Symptoms:**
```
Error: API_KEY_SECRET is required
```

**Solutions:**

```bash
# Copy environment file
cp .env.example .env

# Edit environment file
nano .env

# Set required variables
API_KEY_SECRET=your-secret-key-32-chars
API_KEYS=your-api-key-1,your-api-key-2
```

### CLI Connection Issues

#### Issue: Connection Failed

**Symptoms:**
```
Error: Connection failed: ECONNREFUSED
```

**Solutions:**

```bash
# 1. Check if server is running
curl http://localhost:3000/health

# 2. Check CLI configuration
kanban config get api-url
kanban config get api-key

# 3. Test connection
kanban config test

# 4. Check server logs
npm run dev  # Look for error messages
```

#### Issue: Authentication Failed

**Symptoms:**
```
Error: 401 Unauthorized
```

**Solutions:**

```bash
# 1. Check API key
kanban config get api-key

# 2. Verify API key in server config
cat .env | grep API_KEYS

# 3. Generate new API key
openssl rand -hex 32

# 4. Update both server and CLI
# Edit .env file
kanban config set api-key new-api-key

# 5. Restart server
npm run dev
```

#### Issue: Timeout Errors

**Symptoms:**
```
Error: Request timeout
```

**Solutions:**

```bash
# 1. Increase timeout
kanban config set timeout 60000

# 2. Check server performance
kanban monitor --metrics cpu,memory

# 3. Check network connectivity
ping localhost

# 4. Check firewall settings
sudo ufw status
```

### Database Issues

#### Issue: Database File Not Found

**Symptoms:**
```
Error: no such table: boards
```

**Solutions:**

```bash
# 1. Check database file
ls -la ./data/kanban.db

# 2. Initialize database
npm run db:init

# 3. Run migrations
npm run db:migrate

# 4. Seed with sample data (optional)
npm run db:seed
```

#### Issue: Database Permission Denied

**Symptoms:**
```
Error: EACCES: permission denied
```

**Solutions:**

```bash
# 1. Check file permissions
ls -la ./data/kanban.db

# 2. Fix permissions
chmod 644 ./data/kanban.db
chmod 755 ./data

# 3. Check ownership
sudo chown $USER:$USER ./data/kanban.db
```

#### Issue: Database Corrupted

**Symptoms:**
```
Error: database disk image is malformed
```

**Solutions:**

```bash
# 1. Backup existing data
cp ./data/kanban.db ./data/kanban.db.backup

# 2. Check database integrity
sqlite3 ./data/kanban.db "PRAGMA integrity_check;"

# 3. Try to repair
sqlite3 ./data/kanban.db "VACUUM;"

# 4. If repair fails, reinitialize
rm ./data/kanban.db
npm run db:init
npm run db:migrate
```

#### Issue: Database Locked

**Symptoms:**
```
Error: database is locked
```

**Solutions:**

```bash
# 1. Check for other processes
lsof ./data/kanban.db

# 2. Kill processes using database
kill -9 <PID>

# 3. Enable WAL mode
echo "PRAGMA journal_mode=WAL;" | sqlite3 ./data/kanban.db

# 4. Restart server
npm run dev
```

### MCP Integration Issues

#### Issue: MCP Server Not Responding

**Symptoms:**
```
Error: MCP server not available
```

**Solutions:**

```bash
# 1. Check MCP server status
curl http://localhost:3000/mcp/health

# 2. Verify MCP configuration
cat .env | grep MCP

# 3. Enable MCP server
echo "MCP_TOOLS_ENABLED=true" >> .env

# 4. Restart server
npm run dev
```

#### Issue: MCP Authentication Failed

**Symptoms:**
```
Error: MCP authentication failed
```

**Solutions:**

```bash
# 1. Check MCP API key
echo $MCP_KANBAN_API_KEY

# 2. Verify MCP configuration
cat .mcp/config.json

# 3. Update MCP API key
# Edit .mcp/config.json with correct API key

# 4. Test MCP connection
# (Depends on your AI assistant)
```

#### Issue: MCP Tools Not Available

**Symptoms:**
```
Error: Tool 'get_next_task' not found
```

**Solutions:**

```bash
# 1. Check MCP server tools
curl http://localhost:3000/mcp/tools

# 2. Verify MCP server configuration
cat .env | grep MCP_TOOLS

# 3. Check MCP server logs
npm run dev  # Look for MCP-related errors

# 4. Restart MCP server
# Restart the main server
npm run dev
```

### WebSocket Issues

#### Issue: WebSocket Connection Failed

**Symptoms:**
```
Error: WebSocket connection failed
```

**Solutions:**

```bash
# 1. Check WebSocket endpoint
curl -I http://localhost:3000/ws

# 2. Test WebSocket connection
wscat -c ws://localhost:3000/ws -H "X-API-Key: your-api-key"

# 3. Check WebSocket configuration
cat .env | grep WS_

# 4. Restart server
npm run dev
```

#### Issue: WebSocket Authentication Failed

**Symptoms:**
```
Error: WebSocket authentication failed
```

**Solutions:**

```bash
# 1. Check API key in WebSocket request
wscat -c ws://localhost:3000/ws -H "X-API-Key: your-api-key"

# 2. Verify API key is valid
kanban config test

# 3. Check WebSocket authentication logs
npm run dev  # Look for auth errors
```

### Performance Issues

#### Issue: Slow Response Times

**Symptoms:**
```
Response times > 5 seconds
```

**Solutions:**

```bash
# 1. Check database performance
kanban db stats

# 2. Optimize database
kanban db optimize

# 3. Check server resources
kanban monitor --metrics cpu,memory,disk

# 4. Enable database optimizations
echo "DATABASE_WAL_MODE=true" >> .env
echo "DATABASE_MEMORY_LIMIT=1073741824" >> .env

# 5. Restart server
npm run dev
```

#### Issue: High Memory Usage

**Symptoms:**
```
Memory usage > 80%
```

**Solutions:**

```bash
# 1. Check memory usage
kanban monitor --metrics memory

# 2. Optimize database cache
echo "DATABASE_CACHE_SIZE=5000" >> .env

# 3. Reduce log level
echo "LOG_LEVEL=warn" >> .env

# 4. Restart server
npm run dev

# 5. Consider increasing server memory
NODE_OPTIONS="--max-old-space-size=2048" npm run dev
```

#### Issue: Database Queries Slow

**Symptoms:**
```
Database queries taking > 1 second
```

**Solutions:**

```bash
# 1. Analyze database
kanban db analyze

# 2. Optimize database
kanban db optimize

# 3. Check for missing indexes
kanban db check --check-indexes

# 4. Vacuum database
kanban db vacuum
```

## 🔧 Advanced Troubleshooting

### Debug Mode

#### Enable Debug Logging

```bash
# Set debug log level
echo "LOG_LEVEL=debug" >> .env

# Enable debug routes
echo "DEV_ENABLE_DEBUG_ROUTES=true" >> .env

# Restart server
npm run dev
```

#### Debug CLI

```bash
# Enable debug mode
kanban --debug task list

# Enable verbose logging
kanban --verbose config test

# Trace API calls
kanban --trace task create "Test task"
```

#### Debug MCP

```bash
# Enable MCP debug logging
echo "MCP_DEBUG=true" >> .env

# Check MCP server logs
npm run dev  # Look for MCP debug messages

# Test MCP tools manually
curl -X POST http://localhost:3000/mcp/tools \
  -H "Content-Type: application/json" \
  -d '{"name": "get_next_task"}'
```

### Log Analysis

#### Check Server Logs

```bash
# View real-time logs
tail -f ./logs/kanban.log

# Search for errors
grep -i error ./logs/kanban.log

# Search for specific issues
grep -i "connection failed" ./logs/kanban.log

# Check log file size
ls -lh ./logs/kanban.log
```

#### Check CLI Logs

```bash
# View CLI logs
cat ~/.kanban/cli.log

# Search for errors
grep -i error ~/.kanban/cli.log

# Check CLI log level
kanban config get log-level
```

#### Check Database Logs

```bash
# Check SQLite logs (if enabled)
sqlite3 ./data/kanban.db "PRAGMA journal_mode;"

# Check database integrity
sqlite3 ./data/kanban.db "PRAGMA integrity_check;"

# Check database statistics
sqlite3 ./data/kanban.db "PRAGMA stats;"
```

### Network Troubleshooting

#### Check Network Connectivity

```bash
# Test localhost connectivity
ping localhost

# Test port connectivity
telnet localhost 3000

# Check firewall
sudo ufw status

# Check network interfaces
ifconfig
```

#### Check DNS Resolution

```bash
# Test DNS resolution
nslookup localhost

# Check hosts file
cat /etc/hosts

# Test with IP address
curl http://127.0.0.1:3000/health
```

### System Resource Issues

#### Check System Resources

```bash
# Check CPU usage
top

# Check memory usage
free -h

# Check disk usage
df -h

# Check disk I/O
iostat
```

#### Check Process Limits

```bash
# Check file descriptor limits
ulimit -n

# Check process limits
ulimit -a

# Increase limits if needed
ulimit -n 4096
```

## 🚨 Emergency Procedures

### Database Recovery

#### Complete Database Reset

```bash
# 1. Stop server
pkill -f "npm run dev"

# 2. Backup current database
cp ./data/kanban.db ./data/kanban.db.emergency-backup

# 3. Remove database
rm ./data/kanban.db

# 4. Reinitialize
npm run db:init
npm run db:migrate

# 5. Restart server
npm run dev
```

#### Restore from Backup

```bash
# 1. Stop server
pkill -f "npm run dev"

# 2. Restore backup
cp ./backups/kanban-backup-20241201.sqlite ./data/kanban.db

# 3. Check integrity
sqlite3 ./data/kanban.db "PRAGMA integrity_check;"

# 4. Restart server
npm run dev
```

### Server Recovery

#### Complete Server Reset

```bash
# 1. Stop all processes
pkill -f "npm run dev"
pkill -f "node"

# 2. Clear logs
rm -rf ./logs/*

# 3. Reset configuration
cp .env.example .env

# 4. Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# 5. Restart server
npm run dev
```

#### Docker Recovery

```bash
# 1. Stop containers
docker-compose down

# 2. Remove containers
docker-compose rm -f

# 3. Rebuild images
docker-compose build --no-cache

# 4. Start fresh
docker-compose up -d

# 5. Check logs
docker-compose logs -f
```

## 📞 Getting Help

### Before Asking for Help

1. **Check this guide** for your specific issue
2. **Search existing issues** on GitHub
3. **Gather diagnostic information**:

```bash
# System information
node --version
npm --version
sqlite3 --version
uname -a

# Configuration
kanban config list
cat .env | grep -v "^#"

# Logs
tail -n 50 ./logs/kanban.log
tail -n 50 ~/.kanban/cli.log

# Health check
curl http://localhost:3000/health
kanban health
```

### Reporting Issues

When reporting an issue, include:

1. **Clear description** of the problem
2. **Steps to reproduce** the issue
3. **Expected vs actual behavior**
4. **System information** (OS, Node.js version, etc.)
5. **Configuration files** (sanitized)
6. **Relevant logs** and error messages
7. **What you've already tried**

### Support Channels

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and help
- **Documentation**: Check the [full documentation](./README.md)
- **Community**: Join our Discord server

---

**Still having issues?** Check the [FAQ](./faq.md) for more solutions, or ask for help in [GitHub Discussions](https://github.com/yourusername/mcp-kanban/discussions). 