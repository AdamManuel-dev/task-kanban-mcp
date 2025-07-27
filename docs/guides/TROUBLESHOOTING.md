# MCP Kanban Troubleshooting Guide

## Table of Contents

- [Common Issues](#common-issues)
  - [Installation Problems](#installation-problems)
  - [Database Issues](#database-issues)
  - [API Errors](#api-errors)
  - [WebSocket Connection Issues](#websocket-connection-issues)
  - [MCP Integration Problems](#mcp-integration-problems)
  - [CLI Issues](#cli-issues)
- [Error Messages](#error-messages)
- [Performance Issues](#performance-issues)
- [Security Issues](#security-issues)
- [Development Environment](#development-environment)
- [Production Issues](#production-issues)
- [Debugging Techniques](#debugging-techniques)
- [Logs and Monitoring](#logs-and-monitoring)
- [Getting Help](#getting-help)

## Common Issues

### Installation Problems

#### Issue: npm install fails with dependency errors

**Symptoms:**
```bash
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solutions:**

1. **Clear npm cache and reinstall**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Use legacy peer deps (temporary fix)**
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Update npm and Node.js**
   ```bash
   npm install -g npm@latest
   # Use nvm to update Node.js
   nvm install --lts
   nvm use --lts
   ```

#### Issue: TypeScript compilation errors

**Symptoms:**
```bash
error TS2307: Cannot find module '@/types' or its corresponding type declarations.
```

**Solutions:**

1. **Check tsconfig.json paths**
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

2. **Ensure all type dependencies are installed**
   ```bash
   npm install --save-dev @types/node @types/express @types/jest
   ```

3. **Rebuild TypeScript project**
   ```bash
   npm run clean
   npm run build
   ```

### Database Issues

#### Issue: Database connection fails

**Symptoms:**
```
DatabaseError: SQLITE_CANTOPEN: unable to open database file
```

**Solutions:**

1. **Check database file permissions**
   ```bash
   # Ensure database directory exists
   mkdir -p data
   
   # Fix permissions
   chmod 755 data
   chmod 644 data/kanban.db
   ```

2. **Verify database path in .env**
   ```env
   DATABASE_PATH=./data/kanban.db
   ```

3. **Run migrations**
   ```bash
   npm run db:migrate
   ```

#### Issue: Migration fails

**Symptoms:**
```
Error: Migration failed: table tasks already exists
```

**Solutions:**

1. **Check migration status**
   ```bash
   npm run db:status
   ```

2. **Reset database (development only)**
   ```bash
   npm run db:reset
   ```

3. **Manual rollback**
   ```bash
   npm run db:rollback
   ```

#### Issue: Database locked error

**Symptoms:**
```
DatabaseError: SQLITE_BUSY: database is locked
```

**Solutions:**

1. **Close other connections**
   - Stop all running instances of the application
   - Close database GUI tools

2. **Increase busy timeout**
   ```typescript
   // In database configuration
   const db = new Database(dbPath, {
     busyTimeout: 5000 // 5 seconds
   });
   ```

3. **Use WAL mode**
   ```sql
   PRAGMA journal_mode = WAL;
   ```

### API Errors

#### Issue: 401 Unauthorized errors

**Symptoms:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

**Solutions:**

1. **Check API key configuration**
   ```env
   API_KEY=your-api-key-here
   ```

2. **Verify request headers**
   ```typescript
   // Correct header
   headers: {
     'x-api-key': 'your-api-key'
   }
   ```

3. **Check authentication middleware**
   ```typescript
   // Ensure middleware is applied
   app.use('/api', authenticate());
   ```

#### Issue: 429 Rate limit exceeded

**Symptoms:**
```json
{
  "error": {
    "code": "RATE_LIMIT",
    "message": "Too many requests",
    "retry_after": 60
  }
}
```

**Solutions:**

1. **Implement request throttling**
   ```typescript
   // Add delay between requests
   const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
   await delay(1000); // 1 second delay
   ```

2. **Use exponential backoff**
   ```typescript
   async function retryWithBackoff(fn, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.status === 429 && i < maxRetries - 1) {
           const delay = Math.pow(2, i) * 1000;
           await new Promise(resolve => setTimeout(resolve, delay));
         } else {
           throw error;
         }
       }
     }
   }
   ```

3. **Check rate limit configuration**
   ```env
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

#### Issue: CORS errors

**Symptoms:**
```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Solutions:**

1. **Configure CORS properly**
   ```typescript
   app.use(cors({
     origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
     credentials: true,
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
     allowedHeaders: ['Content-Type', 'x-api-key']
   }));
   ```

2. **Set proper headers**
   ```typescript
   res.header('Access-Control-Allow-Origin', '*');
   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
   res.header('Access-Control-Allow-Headers', 'Content-Type');
   ```

### WebSocket Connection Issues

#### Issue: WebSocket fails to connect

**Symptoms:**
```
WebSocket connection to 'ws://localhost:3001' failed
```

**Solutions:**

1. **Check WebSocket server is running**
   ```bash
   # Check if port is in use
   lsof -i :3001
   ```

2. **Verify WebSocket URL**
   ```typescript
   // Use correct protocol
   const ws = new WebSocket(
     window.location.protocol === 'https:' 
       ? 'wss://...' 
       : 'ws://...'
   );
   ```

3. **Configure proxy for development**
   ```json
   // In package.json for React apps
   "proxy": "http://localhost:3000"
   ```

#### Issue: WebSocket disconnects frequently

**Solutions:**

1. **Implement reconnection logic**
   ```typescript
   class ReconnectingWebSocket {
     private reconnectInterval = 1000;
     private maxReconnectInterval = 30000;
     
     connect() {
       this.ws = new WebSocket(this.url);
       
       this.ws.onclose = () => {
         setTimeout(() => this.connect(), this.reconnectInterval);
         this.reconnectInterval = Math.min(
           this.reconnectInterval * 2,
           this.maxReconnectInterval
         );
       };
       
       this.ws.onopen = () => {
         this.reconnectInterval = 1000;
       };
     }
   }
   ```

2. **Add heartbeat/ping-pong**
   ```typescript
   // Server side
   io.on('connection', (socket) => {
     const interval = setInterval(() => {
       socket.emit('ping');
     }, 30000);
     
     socket.on('pong', () => {
       // Client is alive
     });
     
     socket.on('disconnect', () => {
       clearInterval(interval);
     });
   });
   ```

### MCP Integration Problems

#### Issue: MCP server fails to start

**Symptoms:**
```
Error: Failed to initialize MCP server
```

**Solutions:**

1. **Check MCP configuration**
   ```env
   MCP_ENABLED=true
   MCP_PORT=3002
   ```

2. **Verify tool registration**
   ```typescript
   // Ensure all tools are registered
   const registry = new MCPToolRegistry(services);
   await registry.initialize();
   ```

3. **Check service dependencies**
   ```typescript
   // All services must be initialized
   const services = {
     taskService: new TaskService(db),
     boardService: new BoardService(db),
     // ... other services
   };
   ```

#### Issue: MCP tools not working

**Solutions:**

1. **Validate tool schemas**
   ```typescript
   // Check input schema matches
   const result = validateSchema(input, tool.inputSchema);
   if (!result.valid) {
     console.error('Schema validation failed:', result.errors);
   }
   ```

2. **Enable MCP debug logging**
   ```env
   DEBUG=mcp:*
   ```

### CLI Issues

#### Issue: CLI command not found

**Symptoms:**
```bash
command not found: kanban
```

**Solutions:**

1. **Install globally**
   ```bash
   npm install -g @kanban/cli
   ```

2. **Use npx**
   ```bash
   npx kanban task list
   ```

3. **Check PATH**
   ```bash
   echo $PATH
   # Ensure npm global bin is in PATH
   export PATH="$PATH:$(npm bin -g)"
   ```

#### Issue: CLI can't connect to API

**Solutions:**

1. **Configure API endpoint**
   ```bash
   kanban configure --api-url http://localhost:3000
   ```

2. **Check API key**
   ```bash
   kanban configure --api-key your-api-key
   ```

3. **Verify with curl**
   ```bash
   curl -H "x-api-key: your-api-key" http://localhost:3000/api/v1/tasks
   ```

## Error Messages

### Common Error Codes and Solutions

| Error Code | Description | Solution |
|------------|-------------|----------|
| `VALIDATION_ERROR` | Invalid input data | Check request payload matches schema |
| `NOT_FOUND_ERROR` | Resource not found | Verify resource ID exists |
| `CONFLICT_ERROR` | Resource conflict | Check for duplicate entries |
| `DATABASE_ERROR` | Database operation failed | Check database connection and logs |
| `TRANSACTION_TIMEOUT` | Transaction took too long | Optimize queries or increase timeout |
| `DEPENDENCY_ERROR` | Missing dependency | Check all required fields are provided |
| `EXTERNAL_SERVICE_ERROR` | External API failed | Check external service status |

### Detailed Error Analysis

```typescript
// Error structure
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid task data",
    "details": {
      "field": "title",
      "constraint": "minLength",
      "value": ""
    },
    "timestamp": "2024-01-20T10:30:00Z",
    "request_id": "req_123456"
  }
}
```

**How to debug:**

1. **Check the error code** - Identifies the type of error
2. **Read the message** - Human-readable description
3. **Examine details** - Specific information about what failed
4. **Use request_id** - Search logs for this request
5. **Check timestamp** - When the error occurred

## Performance Issues

### Slow API Response Times

**Diagnosis:**
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:3000/api/v1/tasks"
```

**Solutions:**

1. **Add database indexes**
   ```sql
   CREATE INDEX idx_tasks_board_id ON tasks(board_id);
   CREATE INDEX idx_tasks_assignee ON tasks(assignee);
   CREATE INDEX idx_tasks_status ON tasks(status);
   ```

2. **Implement caching**
   ```typescript
   const cache = new NodeCache({ ttl: 300 }); // 5 minutes
   
   async function getCachedTasks(boardId: string) {
     const key = `tasks:${boardId}`;
     const cached = cache.get(key);
     if (cached) return cached;
     
     const tasks = await taskService.listTasks({ board_id: boardId });
     cache.set(key, tasks);
     return tasks;
   }
   ```

3. **Enable query optimization**
   ```typescript
   // Use query builder efficiently
   const tasks = await db
     .selectFrom('tasks')
     .select(['id', 'title', 'status']) // Select only needed fields
     .where('board_id', '=', boardId)
     .limit(100) // Add pagination
     .execute();
   ```

### High Memory Usage

**Diagnosis:**
```bash
# Monitor memory usage
node --inspect app.js
# Open chrome://inspect
```

**Solutions:**

1. **Fix memory leaks**
   ```typescript
   // Clear event listeners
   socket.on('disconnect', () => {
     socket.removeAllListeners();
     clearInterval(intervalId);
   });
   ```

2. **Limit concurrent operations**
   ```typescript
   import pLimit from 'p-limit';
   const limit = pLimit(5); // Max 5 concurrent
   
   await Promise.all(
     items.map(item => limit(() => processItem(item)))
   );
   ```

3. **Use streams for large data**
   ```typescript
   // Stream large exports
   const stream = db.selectFrom('tasks').stream();
   stream.on('data', (task) => {
     // Process each task
   });
   ```

## Security Issues

### SQL Injection Prevention

**Bad:**
```typescript
const tasks = await db.raw(`SELECT * FROM tasks WHERE title = '${userInput}'`);
```

**Good:**
```typescript
const tasks = await db
  .selectFrom('tasks')
  .where('title', '=', userInput) // Parameterized
  .execute();
```

### XSS Prevention

**Bad:**
```typescript
res.send(`<h1>${userInput}</h1>`);
```

**Good:**
```typescript
import { escape } from 'html-escaper';
res.send(`<h1>${escape(userInput)}</h1>`);
```

### Authentication Issues

1. **Validate all tokens**
   ```typescript
   try {
     const decoded = jwt.verify(token, process.env.JWT_SECRET);
   } catch (error) {
     throw new UnauthorizedError('Invalid token');
   }
   ```

2. **Use secure sessions**
   ```typescript
   app.use(session({
     secret: process.env.SESSION_SECRET,
     secure: true, // HTTPS only
     httpOnly: true,
     sameSite: 'strict'
   }));
   ```

## Development Environment

### Hot Reload Not Working

**Solutions:**

1. **Check nodemon configuration**
   ```json
   {
     "watch": ["src"],
     "ext": "ts,js",
     "ignore": ["src/**/*.test.ts"],
     "exec": "ts-node -r tsconfig-paths/register src/index.ts"
   }
   ```

2. **Clear build cache**
   ```bash
   rm -rf dist .cache
   npm run dev
   ```

### TypeScript Errors in IDE

**Solutions:**

1. **Restart TypeScript service**
   - VSCode: Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"

2. **Check workspace settings**
   ```json
   {
     "typescript.tsdk": "./node_modules/typescript/lib"
   }
   ```

## Production Issues

### Application Crashes

**Diagnosis:**
```bash
# Check logs
pm2 logs
journalctl -u kanban-api

# Check system resources
free -h
df -h
top
```

**Solutions:**

1. **Implement process manager**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'kanban-api',
       script: './dist/index.js',
       instances: 'max',
       autorestart: true,
       max_memory_restart: '1G',
       error_file: './logs/err.log',
       out_file: './logs/out.log'
     }]
   };
   ```

2. **Add health checks**
   ```typescript
   app.get('/health', async (req, res) => {
     try {
       await db.raw('SELECT 1');
       res.json({ status: 'healthy' });
     } catch (error) {
       res.status(503).json({ status: 'unhealthy' });
     }
   });
   ```

### Memory Leaks in Production

**Diagnosis:**
```bash
# Generate heap snapshot
node --inspect=0.0.0.0:9229 app.js
# Use Chrome DevTools to analyze
```

**Solutions:**

1. **Profile memory usage**
   ```typescript
   import v8 from 'v8';
   import fs from 'fs';
   
   // Take heap snapshot
   const snapshot = v8.writeHeapSnapshot();
   ```

2. **Implement memory monitoring**
   ```typescript
   setInterval(() => {
     const usage = process.memoryUsage();
     logger.info('Memory usage', {
       heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
       heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
       rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
     });
   }, 60000); // Every minute
   ```

## Debugging Techniques

### Enable Debug Logging

```bash
# Enable all debug logs
DEBUG=* npm run dev

# Enable specific namespaces
DEBUG=mcp-kanban:* npm run dev
DEBUG=mcp-kanban:database,mcp-kanban:api npm run dev
```

### Use Debugger

```typescript
// Add breakpoint
debugger;

// Run with debugger
node --inspect-brk app.js
```

### Request Tracing

```typescript
// Add request ID to all logs
app.use((req, res, next) => {
  req.id = generateRequestId();
  logger.info('Request started', {
    request_id: req.id,
    method: req.method,
    path: req.path
  });
  next();
});
```

### Database Query Logging

```typescript
// Log all queries in development
if (process.env.NODE_ENV === 'development') {
  db.on('query', ({ query, bindings }) => {
    logger.debug('SQL Query', { query, bindings });
  });
}
```

## Logs and Monitoring

### Log Locations

```bash
# Application logs
./logs/app.log
./logs/error.log

# System logs
/var/log/syslog
/var/log/nginx/access.log
/var/log/nginx/error.log

# PM2 logs
~/.pm2/logs/
```

### Log Analysis

```bash
# Search for errors
grep -i error logs/app.log

# Count error occurrences
grep -c "ERROR" logs/app.log

# Find specific request
grep "request_id:req_123456" logs/app.log

# Monitor logs in real-time
tail -f logs/app.log
```

### Structured Logging

```typescript
// Use structured logging
logger.error('Operation failed', {
  error: error.message,
  stack: error.stack,
  context: {
    user_id: req.user?.id,
    request_id: req.id,
    operation: 'createTask',
    input: req.body
  }
});
```

## Getting Help

### Before Asking for Help

1. **Check the documentation**
   - [README](../../README.md)
   - [API Documentation](../api/API_REFERENCE.md)
   - [Development Guide](./DEVELOPMENT_GUIDE.md)

2. **Search existing issues**
   - GitHub Issues: `is:issue [your problem]`
   - Stack Overflow: `[mcp-kanban] [your problem]`

3. **Gather information**
   - Error messages and stack traces
   - Steps to reproduce
   - Environment details (OS, Node version, etc.)
   - Relevant code snippets
   - Log files

### Reporting Issues

**Template:**
```markdown
## Description
Brief description of the issue

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: macOS 13.0
- Node: v18.0.0
- npm: 9.0.0
- Database: SQLite 3.40.0

## Logs
```
[Include relevant logs]
```

## Additional Context
Any other relevant information
```

### Community Resources

- **GitHub Discussions**: Technical questions and discussions
- **Discord Server**: Real-time help and community chat
- **Stack Overflow**: Tag questions with `mcp-kanban`
- **Documentation**: https://docs.mcp-kanban.com

### Professional Support

For enterprise support:
- Email: support@mcp-kanban.com
- SLA: 24-hour response time
- Priority bug fixes
- Custom feature development