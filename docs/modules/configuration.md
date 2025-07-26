# Configuration Module

## Purpose

The configuration module provides centralized management of all application settings, environment variables, and runtime configuration. It uses Zod for type-safe validation and dotenv for environment variable loading.

## Dependencies

### Internal
- None (foundational module)

### External
- `dotenv`: Environment variable loading
- `zod`: Schema validation and type safety

## Key Components

### Configuration Schema

The configuration is organized into logical sections:

#### Server Configuration
```typescript
{
  port: number,              // Server port (1-65535)
  host: string,              // Server host address
  nodeEnv: 'development' | 'production' | 'test'
}
```

#### Database Configuration
```typescript
{
  path: string,              // SQLite database file path
  backupPath: string,        // Backup directory path
  walMode: boolean,          // Write-Ahead Logging mode
  memoryLimit: number,       // Memory-mapped I/O limit (bytes)
  timeout: number,           // Connection timeout (ms)
  verbose: boolean           // Verbose logging
}
```

#### API Security
```typescript
{
  keySecret: string,         // Secret for API key generation (min 16 chars)
  keys: string[],            // Valid API keys
  corsOrigin: string | string[],  // CORS allowed origins
  corsCredentials: boolean   // Allow credentials in CORS
}
```

## Usage Examples

### Basic Usage

```typescript
import { config } from '@/config';

// Access server settings
const port = config.server.port;
const isDev = config.server.nodeEnv === 'development';

// Access database settings
const dbPath = config.database.path;
console.log(`Database location: ${dbPath}`);

// Check feature flags
if (config.development.enableDebugRoutes) {
  app.use('/debug', debugRouter);
}
```

### Environment-Specific Logic

```typescript
import { config } from '@/config';

// Production-only features
if (config.server.nodeEnv === 'production') {
  app.use(securityMiddleware);
  app.use(compressionMiddleware);
}

// Development conveniences
if (config.server.nodeEnv === 'development') {
  app.use(errorHandlerWithStackTrace);
}

// Test environment setup
if (config.server.nodeEnv === 'test') {
  config.database.path = ':memory:';
}
```

### Dynamic Configuration

```typescript
// Rate limiting based on environment
const rateLimitConfig = {
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  skip: (req) => {
    // Skip rate limiting in development
    return config.server.nodeEnv === 'development';
  }
};
```

## Environment Variables

### Required Variables

None - all configuration has sensible defaults.

### Common Overrides

```bash
# Server
PORT=8080
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_PATH=/var/lib/mcp-kanban/kanban.db
DATABASE_WAL_MODE=true
DATABASE_TIMEOUT=60000

# API Security
API_KEY_SECRET=your-secure-secret-key-at-least-16-chars
API_KEYS=key1,key2,key3

# Logging
LOG_LEVEL=warn
LOG_FILE=/var/log/mcp-kanban/app.log
LOG_CONSOLE=false
```

### Advanced Configuration

```bash
# WebSocket
WEBSOCKET_PORT=3001
WEBSOCKET_HEARTBEAT_INTERVAL=30000

# Git Integration
GIT_AUTO_DETECT=true
GIT_DEFAULT_BOARD=engineering

# Backup System
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=7

# Performance
MAX_MEMORY_USAGE=1024
REQUEST_TIMEOUT=60000

# MCP Protocol
MCP_MAX_CONTEXT_ITEMS=100
MCP_CONTEXT_LOOKBACK_DAYS=30
```

## Configuration Sections

### Rate Limiting
Controls API request throttling:
- `windowMs`: Time window for rate limiting
- `maxRequests`: Maximum requests per window
- `skipSuccessfulRequests`: Don't count successful requests

### WebSocket
Real-time communication settings:
- `port`: WebSocket server port
- `path`: Socket.io endpoint path
- `heartbeatInterval`: Keep-alive interval
- `heartbeatTimeout`: Connection timeout

### Git Integration
Repository detection and mapping:
- `autoDetect`: Automatically detect git repositories
- `branchPatterns`: Patterns for branch-to-task mapping
- `commitKeywords`: Keywords for commit-to-task linking

### Backup Configuration
Automated backup settings:
- `enabled`: Enable automatic backups
- `schedule`: Cron expression for backup timing
- `retentionDays`: How long to keep backups
- `compress`: Enable backup compression
- `encrypt`: Enable backup encryption

### Logging
Application logging configuration:
- `level`: Minimum log level
- `file`: Log file path
- `maxSize`: Maximum log file size
- `maxFiles`: Number of log files to retain
- `console`: Enable console output

### Performance
Resource limits and timeouts:
- `maxRequestSize`: Maximum request body size
- `requestTimeout`: API request timeout
- `maxMemoryUsage`: Memory usage limit (MB)
- `memoryCheckInterval`: Memory monitoring interval

### Priority Calculation
Task prioritization settings:
- `recalcInterval`: How often to recalculate priorities
- `staleThresholdDays`: When tasks become stale
- `factors`: Weight factors for priority calculation

## Error Handling

### Validation Errors

If configuration validation fails, the application will not start:

```
ZodError: [
  {
    "code": "too_small",
    "minimum": 16,
    "type": "string",
    "message": "String must contain at least 16 character(s)",
    "path": ["api", "keySecret"]
  }
]
```

### Common Issues

1. **Invalid Port Number**
   ```bash
   PORT=99999  # Error: Must be 1-65535
   ```

2. **Invalid Environment**
   ```bash
   NODE_ENV=staging  # Error: Must be development|production|test
   ```

3. **Type Mismatches**
   ```bash
   DATABASE_TIMEOUT=30s  # Error: Must be number (milliseconds)
   ```

## Security Considerations

### Sensitive Values

Never commit these to version control:
- `API_KEY_SECRET`
- `API_KEYS`
- `BACKUP_ENCRYPTION_KEY`

### Production Settings

Recommended production configuration:

```typescript
// Strict security
API_KEY_SECRET=<32+ character random string>
API_KEYS=<rotate regularly>
CORS_ORIGIN=https://your-domain.com
CORS_CREDENTIALS=false

// Disable development features
DEV_SEED_DATABASE=false
DEV_RESET_ON_START=false
DEV_ENABLE_DEBUG_ROUTES=false

// Production logging
LOG_LEVEL=warn
LOG_CONSOLE=false

// Performance tuning
DATABASE_WAL_MODE=true
DATABASE_MEMORY_LIMIT=536870912  // 512MB
REQUEST_TIMEOUT=30000
```

## Best Practices

### 1. Use Type-Safe Access

Always use the typed config object:

```typescript
// Good
import { config } from '@/config';
const port = config.server.port;

// Bad
const port = process.env.PORT; // No type safety
```

### 2. Environment-Specific Files

Use `.env` files for different environments:
- `.env` - Default/development
- `.env.production` - Production overrides
- `.env.test` - Test settings
- `.env.local` - Local overrides (gitignored)

### 3. Validate Early

Configuration is validated at startup, so invalid configs fail fast.

### 4. Document Custom Variables

If adding new configuration:

```typescript
// In config schema
myFeature: z.object({
  enabled: z.boolean().default(false)
    .describe('Enable experimental feature X'),
  timeout: z.number().default(5000)
    .describe('Timeout for feature X operations in ms')
})
```

### 5. Use Defaults Wisely

Provide sensible defaults that work for development:

```typescript
// Good: Safe default
apiRateLimit: z.number().default(1000)

// Bad: Production-only default
apiRateLimit: z.number().default(10) // Too restrictive for dev
```

## Testing Configuration

### Unit Tests

```typescript
import { parseEnvVar } from '@/config/parser';

describe('Configuration Parser', () => {
  it('should parse boolean values', () => {
    expect(parseEnvVar('true', false)).toBe(true);
    expect(parseEnvVar('false', true)).toBe(false);
  });

  it('should parse arrays', () => {
    expect(parseEnvVar('a,b,c', [])).toEqual(['a', 'b', 'c']);
  });
});
```

### Integration Tests

```typescript
describe('Configuration Loading', () => {
  it('should load test configuration', () => {
    process.env.NODE_ENV = 'test';
    const { config } = require('@/config');
    
    expect(config.server.nodeEnv).toBe('test');
    expect(config.database.path).toBe(':memory:');
  });
});
```

## Extending Configuration

To add new configuration options:

1. Update the schema:
```typescript
const configSchema = z.object({
  // ... existing config
  myNewFeature: z.object({
    enabled: z.boolean().default(false),
    setting: z.string().default('value')
  })
});
```

2. Add environment mapping:
```typescript
const rawConfig = {
  // ... existing mappings
  myNewFeature: {
    enabled: parseEnvVar(process.env.MY_FEATURE_ENABLED, false),
    setting: parseEnvVar(process.env.MY_FEATURE_SETTING, 'value')
  }
};
```

3. Document in `.env.example`:
```bash
# My New Feature
MY_FEATURE_ENABLED=false
MY_FEATURE_SETTING=value
```

## Debugging Configuration

Enable configuration debugging:

```bash
# Show loaded configuration (masks secrets)
DEBUG=config npm start

# Validate configuration without starting
npm run config:validate
```

## Migration Guide

When updating configuration:

1. Add backward compatibility
2. Log deprecation warnings
3. Update documentation
4. Provide migration script if needed

Example:
```typescript
// Support old and new config names
const port = config.server.port ?? config.port; // Legacy support
if ('port' in config) {
  logger.warn('config.port is deprecated, use config.server.port');
}
```