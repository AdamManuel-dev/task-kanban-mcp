# Logging Module

## Purpose

The logging module provides structured, centralized logging for the MCP Kanban server using Winston. It supports multiple log levels, automatic rotation, and environment-specific formatting.

## Dependencies

### Internal
- Configuration Module: Log level and file settings

### External
- `winston`: Core logging framework
- `fs`: File system operations for log directory

## Architecture

```
┌─────────────────────────────────────┐
│         Logging Module              │
├─────────────────────────────────────┤
│   Winston Logger Configuration      │
│   - Multiple transports             │
│   - Structured JSON format          │
│   - Automatic rotation              │
│   - Environment-aware               │
├─────────────────────────────────────┤
│         Log Transports              │
│   - File: error.log                 │
│   - File: combined.log              │
│   - Console: Development only       │
└─────────────────────────────────────┘
```

## Key Features

### Log Levels

| Level | Priority | Use Case |
|-------|----------|----------|
| `error` | 0 | Critical errors requiring immediate attention |
| `warn` | 1 | Warning conditions that should be reviewed |
| `info` | 2 | Informational messages about normal operations |
| `debug` | 3 | Detailed debug information for troubleshooting |

### Log Formats

#### Production Format (JSON)
```json
{
  "timestamp": "2025-01-26 10:00:00",
  "level": "info",
  "message": "Server started",
  "service": "mcp-kanban",
  "version": "0.1.0",
  "port": 3000,
  "environment": "production"
}
```

#### Development Format (Console)
```
2025-01-26 10:00:00 [info]: Server started {
  "port": 3000,
  "environment": "development"
}
```

### Log Rotation

- Maximum file size: 10MB
- Maximum files kept: 5
- Automatic rotation when size exceeded
- Old files renamed with numeric suffix

## Usage Examples

### Basic Logging

```typescript
import { logger } from '@/utils/logger';

// Simple messages
logger.info('Application started');
logger.warn('Deprecated API endpoint used');
logger.error('Database connection failed');
logger.debug('Cache miss for key: user-123');
```

### Structured Logging

```typescript
// Log with metadata
logger.info('User action', {
  userId: 'user-123',
  action: 'create_task',
  boardId: 'board-456',
  duration: 45
});

// Error with context
logger.error('API request failed', {
  endpoint: '/api/v1/tasks',
  method: 'POST',
  statusCode: 500,
  error: error.message,
  stack: error.stack
});
```

### Request Logging

```typescript
// Express middleware example
app.use((req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('content-length')
    });
  });
  
  next();
});
```

### Database Query Logging

```typescript
// Log query execution
export async function loggedQuery<T>(sql: string, params: any[]): Promise<T[]> {
  const start = Date.now();
  
  try {
    logger.debug('Executing query', { sql, params });
    const results = await db.query<T>(sql, params);
    
    logger.debug('Query completed', {
      sql,
      duration: Date.now() - start,
      rowCount: results.length
    });
    
    return results;
  } catch (error) {
    logger.error('Query failed', {
      sql,
      params,
      duration: Date.now() - start,
      error: error.message
    });
    throw error;
  }
}
```

### Error Handling

```typescript
// Global error handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
    type: 'uncaughtException'
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', {
    reason,
    promise,
    type: 'unhandledRejection'
  });
});
```

### Child Loggers

```typescript
// Create child logger with additional context
const requestLogger = logger.child({
  requestId: generateRequestId(),
  sessionId: req.session.id
});

// All logs from this logger include the context
requestLogger.info('Processing payment');
requestLogger.info('Payment successful', { amount: 100 });

// Output includes requestId and sessionId automatically
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Minimum log level to output |
| `LOG_FILE` | `./logs/kanban.log` | Log file path |
| `LOG_MAX_SIZE` | `10485760` | Max file size in bytes (10MB) |
| `LOG_MAX_FILES` | `5` | Number of rotated files to keep |
| `LOG_CONSOLE` | `true` | Enable console output |
| `LOG_CONSOLE_LEVEL` | `debug` | Console log level |

### Dynamic Configuration

```typescript
// Change log level at runtime
logger.level = 'debug';

// Add custom transport
logger.add(new winston.transports.Http({
  host: 'logs.example.com',
  port: 443,
  path: '/logs',
  ssl: true
}));

// Remove console transport
logger.remove(logger.transports[2]);
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
// Good: Appropriate levels
logger.error('Database connection lost', { error });  // Critical
logger.warn('API rate limit approaching', { remaining: 10 });  // Warning
logger.info('User logged in', { userId });  // Normal operation
logger.debug('Cache hit', { key, ttl });  // Debug info

// Bad: Wrong levels
logger.info('CRITICAL ERROR!!!', { error });  // Should be error
logger.debug('User logged in', { userId });  // Should be info
```

### 2. Include Relevant Context

```typescript
// Good: Rich context
logger.error('Payment failed', {
  userId: user.id,
  orderId: order.id,
  amount: order.total,
  paymentMethod: 'credit_card',
  error: error.message,
  errorCode: error.code
});

// Bad: Missing context
logger.error('Payment failed');
```

### 3. Avoid Logging Sensitive Data

```typescript
// Good: Sanitized data
logger.info('User authenticated', {
  userId: user.id,
  email: user.email,
  method: 'password'
});

// Bad: Sensitive data exposed
logger.info('User authenticated', {
  userId: user.id,
  password: user.password,  // Never log passwords!
  creditCard: user.creditCard  // Never log payment info!
});
```

### 4. Use Structured Data

```typescript
// Good: Structured metadata
logger.info('API request', {
  method: 'POST',
  path: '/api/v1/tasks',
  userId: 'user-123',
  duration: 45
});

// Bad: Unstructured string
logger.info(`POST /api/v1/tasks by user-123 took 45ms`);
```

### 5. Handle Circular References

```typescript
// Good: Safe object logging
logger.debug('Object state', {
  id: obj.id,
  name: obj.name,
  // Avoid circular references
  parent: obj.parent?.id
});

// Use util.inspect for complex objects
import { inspect } from 'util';
logger.debug('Complex object', {
  data: inspect(complexObject, { depth: 3 })
});
```

## Performance Considerations

### Async Logging

Winston uses async I/O for file operations:

```typescript
// Logs are queued and written asynchronously
logger.info('Fast operation');  // Returns immediately

// For critical logs, ensure they're written
logger.error('Critical error', error);
logger.on('finish', () => {
  process.exit(1);
});
```

### Log Level Performance

```typescript
// Debug logs are skipped in production
if (logger.level === 'debug') {
  // Expensive operation only runs in debug mode
  const debugInfo = calculateExpensiveDebugInfo();
  logger.debug('Debug info', debugInfo);
}
```

### Batching Logs

```typescript
// For high-frequency events, batch logs
const logBuffer = [];
const LOG_INTERVAL = 5000; // 5 seconds

function bufferLog(message, meta) {
  logBuffer.push({ message, meta, timestamp: Date.now() });
}

setInterval(() => {
  if (logBuffer.length > 0) {
    logger.info('Batch log', {
      count: logBuffer.length,
      logs: logBuffer
    });
    logBuffer.length = 0;
  }
}, LOG_INTERVAL);
```

## Log Analysis

### Searching Logs

```bash
# Find all errors
grep '"level":"error"' logs/combined.log

# Find specific user actions
grep '"userId":"user-123"' logs/combined.log

# Parse JSON logs with jq
cat logs/combined.log | jq 'select(.level == "error")'
```

### Log Aggregation

```typescript
// Count errors by type
const errorCounts = {};
const logs = fs.readFileSync('logs/error.log', 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line))
  .forEach(log => {
    const errorType = log.error?.code || 'unknown';
    errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
  });
```

## Testing with Logs

### Capturing Logs in Tests

```typescript
import { logger } from '@/utils/logger';

describe('User Service', () => {
  let logSpy: jest.SpyInstance;
  
  beforeEach(() => {
    logSpy = jest.spyOn(logger, 'info').mockImplementation();
  });
  
  afterEach(() => {
    logSpy.mockRestore();
  });
  
  it('should log user creation', async () => {
    await createUser({ name: 'Test User' });
    
    expect(logSpy).toHaveBeenCalledWith(
      'User created',
      expect.objectContaining({
        userId: expect.any(String),
        name: 'Test User'
      })
    );
  });
});
```

### Test-Specific Logger

```typescript
// Test logger configuration
if (process.env.NODE_ENV === 'test') {
  logger.clear();  // Remove all transports
  logger.add(new winston.transports.Console({
    level: 'error',  // Only show errors in tests
    silent: process.env.SILENT_TESTS === 'true'
  }));
}
```

## Security Considerations

### Log Injection Prevention

```typescript
// Sanitize user input in logs
function sanitizeForLogging(input: string): string {
  return input
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

logger.info('User search', {
  query: sanitizeForLogging(userInput)
});
```

### Access Control

```bash
# Restrict log file access
chmod 640 logs/*.log
chown appuser:appgroup logs/*.log
```

### Log Retention

```typescript
// Automatic cleanup of old logs
import { scheduleJob } from 'node-schedule';

scheduleJob('0 2 * * *', async () => {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const files = await fs.readdir('./logs');
  
  for (const file of files) {
    const stats = await fs.stat(`./logs/${file}`);
    if (stats.mtimeMs < thirtyDaysAgo) {
      await fs.unlink(`./logs/${file}`);
      logger.info('Deleted old log file', { file });
    }
  }
});
```

## Troubleshooting

### Logs Not Appearing

1. Check log level:
```typescript
console.log('Current log level:', logger.level);
```

2. Verify transports:
```typescript
console.log('Active transports:', logger.transports.length);
```

3. Check file permissions:
```bash
ls -la logs/
```

### Log File Too Large

1. Verify rotation settings:
```typescript
// Check transport settings
logger.transports.forEach(transport => {
  console.log(transport.maxsize, transport.maxFiles);
});
```

2. Manual rotation:
```bash
mv logs/combined.log logs/combined.log.old
kill -USR2 <process-pid>  # Signal app to reopen logs
```

### Performance Impact

1. Reduce log level in production:
```bash
LOG_LEVEL=warn npm start
```

2. Use conditional logging:
```typescript
if (config.debug) {
  logger.debug('Expensive debug info', calculateDebugInfo());
}
```