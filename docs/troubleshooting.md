# Troubleshooting Guide

**MCP Kanban Board** - Common issues and solutions

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Database Problems](#database-problems)
3. [CLI Issues](#cli-issues)
4. [API & Server Issues](#api--server-issues)
5. [MCP Integration Issues](#mcp-integration-issues)
6. [Performance Issues](#performance-issues)
7. [Configuration Problems](#configuration-problems)
8. [Development Issues](#development-issues)
9. [Error Messages Reference](#error-messages-reference)

## Installation Issues

### Node.js Version Compatibility

**Problem**: Installation fails with Node.js version errors

```bash
Error: The engine "node" is incompatible with this module
```

**Solution**:
```bash
# Check your Node.js version
node --version

# Update to Node.js 18.x or later
# Using nvm (recommended):
nvm install 18
nvm use 18

# Or download from nodejs.org
```

### Permission Errors During Install

**Problem**: `EACCES` permission errors when installing globally

```bash
npm ERR! Error: EACCES: permission denied
```

**Solution**:
```bash
# Option 1: Use npm prefix (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 2: Use sudo (not recommended for security)
sudo npm install -g

# Option 3: Use npx instead
npx kanban --version
```

### Missing Dependencies

**Problem**: Native dependencies fail to build

```bash
Error: python executable not found
Error: Microsoft Visual Studio not found
```

**Solution**:

**Windows**:
```bash
# Install build tools
npm install -g windows-build-tools

# Or install Visual Studio Build Tools manually
# Download from: https://visualstudio.microsoft.com/downloads/
```

**macOS**:
```bash
# Install Xcode command line tools
xcode-select --install

# Install Python if needed
brew install python
```

**Linux**:
```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install python3
```

## Database Problems

### Database Locked Error

**Problem**: `SQLITE_BUSY: database is locked`

**Symptoms**:
- Commands hang or timeout
- "Database is locked" error messages
- Multiple processes accessing database

**Solution**:
```bash
# 1. Find and kill processes using the database
lsof data/kanban.db
kill <process-id>

# 2. Remove lock files
rm -f data/kanban.db-wal data/kanban.db-shm

# 3. Reset database connections
npm run db:reset

# 4. Restart the application
npm run dev
```

**Prevention**:
- Always gracefully shut down the application
- Don't run multiple instances simultaneously
- Use proper connection pooling (already implemented)

### Database Corruption

**Problem**: Database file is corrupted

**Symptoms**:
- `SQLITE_CORRUPT: database disk image is malformed`
- Unexpected query results
- Application crashes on database operations

**Solution**:
```bash
# 1. Create backup if possible
cp data/kanban.db data/kanban.db.backup

# 2. Check database integrity
sqlite3 data/kanban.db "PRAGMA integrity_check;"

# 3. Try to repair
sqlite3 data/kanban.db ".recover" | sqlite3 data/kanban_recovered.db

# 4. If repair fails, restore from backup
npm run backup:restore --backup=<backup-file>

# 5. If no backup, reinitialize (DATA LOSS!)
rm data/kanban.db
npm run db:init
```

### Migration Failures

**Problem**: Database migration fails

**Symptoms**:
- Schema version mismatch
- Missing tables or columns
- Migration script errors

**Solution**:
```bash
# 1. Check current schema version
sqlite3 data/kanban.db "PRAGMA user_version;"

# 2. Manually run migrations
npm run db:migrate

# 3. If migrations fail, check logs
npm run db:migrate --verbose

# 4. Reset and re-migrate (DATA LOSS!)
npm run db:reset
npm run db:init
```

### Performance Issues

**Problem**: Slow database queries

**Symptoms**:
- CLI commands take too long
- API responses are slow
- High CPU usage

**Solution**:
```bash
# 1. Analyze query performance
SQLITE_DEBUG=1 npm run dev

# 2. Check database size
ls -lh data/kanban.db

# 3. Vacuum database
sqlite3 data/kanban.db "VACUUM;"

# 4. Update statistics
sqlite3 data/kanban.db "ANALYZE;"

# 5. Check for missing indexes
sqlite3 data/kanban.db ".schema" | grep -i index
```

## CLI Issues

### Command Not Found

**Problem**: `kanban: command not found`

**Solution**:
```bash
# 1. Check if installed globally
npm list -g kanban

# 2. Reinstall globally
npm uninstall -g kanban
npm run build
npm install -g .

# 3. Or use npx
npx kanban --version

# 4. Check PATH
echo $PATH | grep npm

# 5. Add to PATH if needed
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### CLI Hangs or Freezes

**Problem**: CLI commands hang indefinitely

**Symptoms**:
- Commands don't return
- No output or error messages
- Process must be killed with Ctrl+C

**Solution**:
```bash
# 1. Check for hanging processes
ps aux | grep kanban
kill <process-id>

# 2. Clear any lock files
rm -f data/*.lock

# 3. Reset configuration
rm -f ~/.kanban-config.json

# 4. Run with debug output
DEBUG=kanban:* kanban task list

# 5. Try with timeout
timeout 30s kanban task list
```

### Interactive Mode Issues

**Problem**: Interactive prompts don't work

**Symptoms**:
- Prompts appear but input is ignored
- Terminal formatting issues
- Broken keyboard navigation

**Solution**:
```bash
# 1. Check terminal compatibility
echo $TERM

# 2. Update terminal if needed
# macOS: Update Terminal.app or use iTerm2
# Windows: Use Windows Terminal or WSL
# Linux: Use modern terminal emulator

# 3. Reset terminal state
reset

# 4. Try non-interactive mode
kanban task create --title "Test" --non-interactive

# 5. Check TTY
tty
```

### Configuration Issues

**Problem**: Invalid configuration or defaults

**Symptoms**:
- Unexpected behavior
- Missing default board
- Authentication errors

**Solution**:
```bash
# 1. Check current configuration
kanban config list

# 2. Reset to defaults
kanban config reset

# 3. Set required defaults
kanban config set defaults.board <board-id>
kanban config set api.url http://localhost:3000

# 4. Validate configuration
kanban config validate

# 5. Manual config file edit
nano ~/.kanban-config.json
```

## API & Server Issues

### Server Won't Start

**Problem**: API server fails to start

**Symptoms**:
- Port already in use
- Permission denied
- Module not found errors

**Solution**:
```bash
# 1. Check if port is in use
lsof -i :3000
netstat -tlnp | grep :3000

# 2. Kill existing processes
kill $(lsof -t -i:3000)

# 3. Try different port
PORT=3001 npm run dev

# 4. Check environment variables
cat .env

# 5. Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### API Authentication Errors

**Problem**: API requests fail with 401/403 errors

**Symptoms**:
- "Unauthorized" or "Forbidden" responses
- API key rejection
- Permission denied errors

**Solution**:
```bash
# 1. Check API key configuration
echo $API_KEY

# 2. Generate new API key
kanban config generate-key

# 3. Verify API key header
curl -H "X-API-Key: your-key" http://localhost:3000/api/health

# 4. Check server logs
npm run dev | grep -i auth

# 5. Reset authentication
kanban config reset-auth
```

### Request Timeout Issues

**Problem**: API requests timeout

**Symptoms**:
- Long response times
- Connection timeouts
- 504 Gateway Timeout errors

**Solution**:
```bash
# 1. Check server status
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/health

# 2. Monitor server resources
top -p $(pgrep -f "node.*server")

# 3. Increase timeout settings
export REQUEST_TIMEOUT=30000

# 4. Check network connectivity
ping localhost
telnet localhost 3000

# 5. Restart server
npm run dev:restart
```

### CORS Issues

**Problem**: Cross-origin requests blocked

**Symptoms**:
- Browser console CORS errors
- OPTIONS requests failing
- Web interface not working

**Solution**:
```bash
# 1. Check CORS configuration
grep -r "cors" src/

# 2. Add allowed origins
export CORS_ORIGIN="http://localhost:3000,http://localhost:3001"

# 3. Disable CORS for development (not recommended for production)
export DISABLE_CORS=true

# 4. Use proxy or same-origin requests
# Configure your web server to proxy API requests
```

## MCP Integration Issues

### MCP Server Connection Failed

**Problem**: Cannot connect to MCP server

**Symptoms**:
- "Connection refused" errors
- MCP tools not available
- AI agent integration failing

**Solution**:
```bash
# 1. Check MCP server status
curl http://localhost:3001/mcp/status

# 2. Start MCP server separately
npm run mcp:start

# 3. Check MCP configuration
cat mcp-config.json

# 4. Test MCP tools manually
echo '{"tool": "list_tasks", "arguments": {}}' | node dist/mcp/server.js

# 5. Restart with debug
DEBUG=mcp:* npm run mcp:start
```

### MCP Tool Execution Errors

**Problem**: MCP tools fail to execute

**Symptoms**:
- Tool not found errors
- Invalid argument errors
- Unexpected tool responses

**Solution**:
```bash
# 1. List available tools
kanban mcp list-tools

# 2. Validate tool arguments
kanban mcp validate-tool create_task '{"title": "test"}'

# 3. Check tool logs
tail -f logs/mcp.log

# 4. Test tools individually
node -e "
const { MCPToolRegistry } = require('./dist/mcp/tools');
const registry = new MCPToolRegistry();
registry.executeTool('list_tasks', {}).then(console.log);
"

# 5. Update tool definitions
npm run mcp:update-tools
```

### Claude Desktop Integration

**Problem**: Claude Desktop doesn't recognize MCP server

**Symptoms**:
- Tools not appearing in Claude
- Connection errors in Claude Desktop
- Configuration not loading

**Solution**:

1. **Check Claude Desktop Configuration**:
```json
// ~/.config/claude-desktop/config.json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["path/to/mcp-kanban/dist/mcp/server.js"],
      "env": {
        "DATABASE_PATH": "path/to/data/kanban.db"
      }
    }
  }
}
```

2. **Verify Permissions**:
```bash
# Make sure Claude Desktop can access the files
chmod +x dist/mcp/server.js
chmod 644 data/kanban.db
```

3. **Test Server Standalone**:
```bash
# Test the MCP server independently
node dist/mcp/server.js
# Should show server initialization logs
```

4. **Check Claude Desktop Logs**:
- macOS: `~/Library/Logs/Claude/`
- Windows: `%APPDATA%/Claude/logs/`
- Linux: `~/.local/share/claude/logs/`

## Performance Issues

### High Memory Usage

**Problem**: Application uses excessive memory

**Symptoms**:
- System becomes slow
- Out of memory errors
- Node.js heap limit exceeded

**Solution**:
```bash
# 1. Monitor memory usage
node --expose-gc --inspect dist/cli/index.js

# 2. Increase heap size if needed
node --max-old-space-size=4096 dist/cli/index.js

# 3. Check for memory leaks
npm install -g clinic
clinic doctor -- node dist/cli/index.js

# 4. Profile memory usage
node --prof dist/cli/index.js
node --prof-process isolate-*.log > processed.txt

# 5. Restart application periodically
# Set up monitoring to restart on high memory usage
```

### Slow Query Performance

**Problem**: Database queries are slow

**Symptoms**:
- Commands take long time to complete
- High CPU usage during queries
- Delayed responses

**Solution**:
```bash
# 1. Enable query logging
SQLITE_DEBUG=1 npm run dev

# 2. Analyze slow queries
sqlite3 data/kanban.db -cmd ".timer on" "SELECT * FROM tasks;"

# 3. Check query plans
sqlite3 data/kanban.db "EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE board_id = ?;"

# 4. Add missing indexes
sqlite3 data/kanban.db "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);"

# 5. Optimize database
sqlite3 data/kanban.db "PRAGMA optimize;"
```

### WebSocket Performance

**Problem**: Real-time updates are slow or missing

**Symptoms**:
- Delayed notifications
- Connection timeouts
- High latency

**Solution**:
```bash
# 1. Check WebSocket connections
netstat -tn | grep :3000

# 2. Monitor WebSocket events
DEBUG=websocket:* npm run dev

# 3. Optimize WebSocket configuration
export WS_HEARTBEAT_INTERVAL=30000
export WS_MAX_CONNECTIONS=100

# 4. Use WebSocket testing tool
npm install -g wscat
wscat -c ws://localhost:3000

# 5. Implement connection pooling
# Check src/websocket/server.ts for optimization options
```

## Configuration Problems

### Environment Variables Not Loading

**Problem**: Environment variables are ignored

**Symptoms**:
- Default values used instead of custom config
- Database path incorrect
- Server starts on wrong port

**Solution**:
```bash
# 1. Check if .env file exists and is readable
ls -la .env
cat .env

# 2. Verify dotenv loading
node -e "require('dotenv').config(); console.log(process.env.PORT);"

# 3. Check for syntax errors in .env
# Remove quotes around values, check for spaces

# 4. Export manually for testing
export PORT=3001
export DATABASE_PATH=./test.db

# 5. Check environment loading order
grep -r "dotenv" src/
```

### Path Configuration Issues

**Problem**: File paths are incorrect

**Symptoms**:
- Database file not found
- Backup directory errors
- Log files in wrong location

**Solution**:
```bash
# 1. Use absolute paths
DATABASE_PATH=/full/path/to/data/kanban.db

# 2. Create directories if missing
mkdir -p data/backups logs

# 3. Check current working directory
pwd
node -e "console.log(process.cwd());"

# 4. Fix relative paths
# Ensure paths are relative to project root

# 5. Verify permissions
ls -la data/
chmod 755 data/
chmod 644 data/kanban.db
```

## Development Issues

### TypeScript Compilation Errors

**Problem**: TypeScript compilation fails

**Solution**:
```bash
# 1. Check TypeScript version
npx tsc --version

# 2. Clean and rebuild
rm -rf dist/
npm run build

# 3. Check for type errors
npm run type-check

# 4. Update type definitions
npm update @types/node

# 5. Check tsconfig.json
npx tsc --showConfig
```

### Hot Reload Not Working

**Problem**: Changes don't trigger rebuild

**Solution**:
```bash
# 1. Check file watcher limits (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 2. Use polling mode
npm run dev -- --poll

# 3. Check ignored files
cat .gitignore
cat .eslintignore

# 4. Restart development server
npm run dev:restart
```

### Import/Export Errors

**Problem**: Module import/export errors

**Solution**:
```bash
# 1. Check module resolution
npx tsc --traceResolution

# 2. Verify path mapping
cat tsconfig.json | grep -A 10 "paths"

# 3. Check file extensions
# Use .js for compiled output, .ts for source

# 4. Update import statements
# Use relative paths or configured aliases

# 5. Clear module cache
rm -rf node_modules/.cache
npm run build
```

## Error Messages Reference

### Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| `SQLITE_BUSY` | Database is locked | Kill processes, remove lock files |
| `SQLITE_CORRUPT` | Database corruption | Restore from backup or rebuild |
| `EACCES` | Permission denied | Check file permissions |
| `ECONNREFUSED` | Connection refused | Start server, check port |
| `ENOENT` | File not found | Check file paths, create missing files |
| `ETIMEDOUT` | Operation timeout | Increase timeout, check network |

### API Error Messages

#### Authentication Errors
```json
{
  "status": "error",
  "code": "UNAUTHORIZED",
  "message": "Invalid or missing API key"
}
```
**Solution**: Check API key in request headers

#### Validation Errors
```json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Invalid input data",
  "details": { "field": "title", "error": "required" }
}
```
**Solution**: Check request body format and required fields

#### Resource Not Found
```json
{
  "status": "error",
  "code": "NOT_FOUND",
  "message": "Task not found: task-123"
}
```
**Solution**: Verify resource ID exists in database

### CLI Error Messages

#### Missing Configuration
```
Error: No default board set. Use 'kanban config set defaults.board <board-id>'
```
**Solution**: Set default board in configuration

#### Network Errors
```
Error: Failed to connect to API server at http://localhost:3000
```
**Solution**: Start API server, check URL configuration

#### Command Not Found
```
Error: Unknown command 'taskss'. Did you mean 'tasks'?
```
**Solution**: Check command spelling, use `kanban --help`

## Getting Additional Help

### Debug Mode

Enable comprehensive debugging:

```bash
# Set debug environment
export DEBUG=kanban:*,mcp:*,websocket:*
export LOG_LEVEL=debug
export NODE_ENV=development

# Run with debugging
npm run dev
```

### Log Files

Check log files for detailed error information:

```bash
# Application logs
tail -f logs/app.log

# MCP server logs
tail -f logs/mcp.log

# WebSocket logs
tail -f logs/websocket.log

# Error logs
tail -f logs/error.log
```

### Health Checks

Verify system health:

```bash
# API health check
curl http://localhost:3000/api/health

# Database health
kanban db:status

# MCP health
kanban mcp:status

# Overall system check
kanban system:check
```

### Support Channels

1. **GitHub Issues**: Report bugs and feature requests
2. **Documentation**: Check docs/ directory for additional guides
3. **Community**: Join community forums or chat
4. **Professional Support**: Contact development team for enterprise issues

---

## Quick Reference

### Emergency Commands

```bash
# Reset everything (DATA LOSS!)
npm run system:reset

# Backup current state
npm run backup:create emergency-backup

# Restore from backup
npm run backup:restore <backup-file>

# Force quit all processes
pkill -f kanban
```

### System Information

```bash
# Get system information
kanban system:info

# Check versions
kanban --version
node --version
npm --version

# Environment check
kanban env:check
```

---

**Still having issues?** 

1. Search existing [GitHub Issues](https://github.com/your-repo/mcp-kanban/issues)
2. Create a new issue with:
   - System information (`kanban system:info`)
   - Complete error message
   - Steps to reproduce
   - Expected vs actual behavior

*Last updated: $(date)*