# Troubleshooting Guide

This guide covers common issues and their solutions when working with MCP Kanban.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Database Problems](#database-problems)
- [API Errors](#api-errors)
- [Performance Issues](#performance-issues)
- [WebSocket Connection](#websocket-connection)
- [Configuration Problems](#configuration-problems)
- [CLI Issues](#cli-issues)
- [MCP Integration](#mcp-integration)

## Installation Issues

### npm install fails

**Problem:** Dependencies fail to install

**Solutions:**

1. Clear npm cache:
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

2. Check Node.js version:
```bash
node --version  # Must be >= 18.0.0
```

3. Use npm ci for clean install:
```bash
npm ci
```

### TypeScript compilation errors

**Problem:** `npm run build` fails with type errors

**Solutions:**

1. Ensure TypeScript is installed:
```bash
npm install -D typescript@latest
```

2. Check for missing types:
```bash
npm install -D @types/node @types/express
```

3. Clean build:
```bash
rm -rf dist
npm run build
```

## Database Problems

### Database is locked

**Error:** `SQLITE_BUSY: database is locked`

**Solutions:**

1. Increase busy timeout:
```typescript
// In config
DATABASE_TIMEOUT=30000  # 30 seconds
```

2. Check for unclosed connections:
```bash
# Find processes using the database
lsof | grep kanban.db
```

3. Enable WAL mode:
```bash
DATABASE_WAL_MODE=true
```

### Database file not found

**Error:** `SQLITE_CANTOPEN: unable to open database file`

**Solutions:**

1. Check file path:
```bash
# Verify path exists
ls -la ./data/kanban.db
```

2. Create directory:
```bash
mkdir -p ./data
chmod 755 ./data
```

3. Check permissions:
```bash
# Fix permissions
chmod 644 ./data/kanban.db
chown $USER:$USER ./data/kanban.db
```

### Schema validation fails

**Error:** `Schema validation failed: missing tables`

**Solutions:**

1. Recreate schema:
```typescript
import { dbConnection } from '@/database/connection';

const schema = dbConnection.getSchemaManager();
await schema.dropSchema();
await schema.createSchema();
```

2. Run integrity check:
```bash
sqlite3 ./data/kanban.db "PRAGMA integrity_check;"
```

### Foreign key constraint failed

**Error:** `SQLITE_CONSTRAINT: FOREIGN KEY constraint failed`

**Solutions:**

1. Check related records exist:
```sql
-- Verify board exists before creating task
SELECT id FROM boards WHERE id = 'board-id';
```

2. Temporarily disable constraints:
```sql
PRAGMA foreign_keys = OFF;
-- Fix data
PRAGMA foreign_keys = ON;
```

## API Errors

### 401 Unauthorized

**Error:** `{"error": "Unauthorized", "code": "UNAUTHORIZED"}`

**Solutions:**

1. Check API key:
```bash
# Verify key is set
echo $API_KEYS

# Correct header format
curl -H "X-API-Key: your-key" http://localhost:3000/api/v1/boards
```

2. Verify key in .env:
```bash
API_KEYS=key1,key2,key3  # No spaces
```

3. Restart server after changing keys

### 429 Too Many Requests

**Error:** Rate limit exceeded

**Solutions:**

1. Increase rate limit:
```bash
RATE_LIMIT_MAX_REQUESTS=2000
RATE_LIMIT_WINDOW_MS=60000
```

2. Check rate limit headers:
```bash
curl -i http://localhost:3000/api/v1/tasks
# Look for X-RateLimit-* headers
```

### 500 Internal Server Error

**Solutions:**

1. Check logs:
```bash
tail -f ./logs/kanban.log
```

2. Enable debug mode:
```bash
LOG_LEVEL=debug
NODE_ENV=development
```

3. Check stack trace:
```bash
npm run dev  # Shows full errors
```

### CORS errors

**Error:** `Access-Control-Allow-Origin` issues

**Solutions:**

1. Configure CORS:
```bash
CORS_ORIGIN=http://localhost:3001
CORS_CREDENTIALS=true
```

2. Allow multiple origins:
```bash
CORS_ORIGIN=http://localhost:3001,https://myapp.com
```

## Performance Issues

### Slow queries

**Problem:** API responses are slow

**Solutions:**

1. Add indexes:
```sql
-- Check missing indexes
EXPLAIN QUERY PLAN SELECT ...;
```

2. Optimize queries:
```typescript
// Use pagination
const tasks = await db.query(
  'SELECT * FROM tasks LIMIT ? OFFSET ?',
  [50, 0]
);
```

3. Enable query caching:
```bash
# In-memory caching
CACHE_TTL=300  # 5 minutes
```

### High memory usage

**Problem:** Node.js using too much memory

**Solutions:**

1. Increase memory limit:
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

2. Monitor memory:
```typescript
console.log(process.memoryUsage());
```

3. Check for leaks:
```bash
npm install -D clinic
clinic doctor -- node dist/index.js
```

### Database file too large

**Solutions:**

1. Run VACUUM:
```sql
VACUUM;  -- Reclaim space
ANALYZE; -- Update statistics
```

2. Archive old data:
```typescript
// Move old tasks to archive
await db.execute(`
  INSERT INTO tasks_archive 
  SELECT * FROM tasks 
  WHERE created_at < date('now', '-1 year')
`);
```

## WebSocket Connection

### Connection fails

**Error:** WebSocket connection error

**Solutions:**

1. Check WebSocket port:
```bash
WEBSOCKET_PORT=3001
lsof -i :3001  # Verify port is open
```

2. Verify client connection:
```javascript
const socket = io('http://localhost:3001', {
  auth: { apiKey: 'valid-key' },
  transports: ['websocket', 'polling']
});
```

### Events not received

**Solutions:**

1. Check subscription:
```javascript
socket.emit('subscribe', { board_id: 'valid-board-id' });
socket.on('subscribed', () => console.log('Subscribed!'));
```

2. Enable debug:
```javascript
localStorage.debug = 'socket.io-client:*';
```

## Configuration Problems

### Environment variables not loading

**Solutions:**

1. Check .env file location:
```bash
ls -la .env  # Should be in project root
```

2. Force reload:
```typescript
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
```

3. Debug loading:
```bash
DEBUG=dotenv npm run dev
```

### Invalid configuration

**Error:** Zod validation errors

**Solutions:**

1. Check required fields:
```bash
# Minimum required
API_KEY_SECRET=at-least-16-characters
```

2. Validate types:
```bash
PORT=3000  # Not "3000" or 3000.0
DATABASE_WAL_MODE=true  # Not "yes" or 1
```

## CLI Issues

### Command not found

**Solutions:**

1. Install globally:
```bash
npm install -g @mcp-kanban/cli
```

2. Use npx:
```bash
npx kanban task list
```

3. Add to PATH:
```bash
export PATH="$PATH:./node_modules/.bin"
```

### CLI configuration not saved

**Solutions:**

1. Check config location:
```bash
kanban config show
# Config file: ~/.kanban/config.json
```

2. Fix permissions:
```bash
chmod 755 ~/.kanban
chmod 644 ~/.kanban/config.json
```

## MCP Integration

### MCP tools not available

**Solutions:**

1. Enable MCP:
```bash
MCP_TOOLS_ENABLED=true
```

2. Restart server and AI assistant

3. Check MCP logs:
```bash
tail -f ./logs/mcp.log
```

### Context generation slow

**Solutions:**

1. Increase cache TTL:
```bash
CONTEXT_CACHE_TTL=600  # 10 minutes
```

2. Limit context items:
```bash
MCP_MAX_CONTEXT_ITEMS=25
```

## Debug Techniques

### Enable verbose logging

```bash
# Environment
LOG_LEVEL=debug
DATABASE_VERBOSE=true

# Code
import { logger } from '@/utils/logger';
logger.debug('Debug info', { data });
```

### Database debugging

```sql
-- Check table contents
SELECT * FROM tasks LIMIT 10;

-- View query plans
EXPLAIN QUERY PLAN SELECT ...;

-- Check indexes
.indexes tasks

-- Database statistics
SELECT * FROM sqlite_stat1;
```

### API debugging

```bash
# Verbose curl
curl -v http://localhost:3000/api/v1/boards

# With timing
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/v1/tasks
```

### Memory profiling

```javascript
// Add to your code
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);
}, 5000);
```

## Getting More Help

If these solutions don't resolve your issue:

1. **Check logs**: `./logs/kanban.log`
2. **Enable debug mode**: `DEBUG=* npm run dev`
3. **Search issues**: [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
4. **Ask community**: [Discord/Forum](#)
5. **File bug report**: Include:
   - Error message
   - Steps to reproduce
   - Environment details
   - Log excerpts