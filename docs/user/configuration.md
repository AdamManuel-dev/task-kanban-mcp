# Configuration Guide

This guide covers all configuration options for the MCP Kanban Server, CLI, and MCP integration.

## 🔧 Server Configuration

### Environment Variables

The server is configured through environment variables. Copy `.env.example` to `.env` and modify the settings:

```bash
# Copy example configuration
cp .env.example .env

# Edit configuration
nano .env  # or use your preferred editor
```

### Essential Configuration

#### Basic Settings

```bash
# Server Configuration
PORT=3000                                    # API server port
NODE_ENV=development                         # Environment (development/production)
LOG_LEVEL=debug                              # Logging level (debug/info/warn/error)

# Security
API_KEY_SECRET=your-secret-key-32-chars      # Secret for API key hashing
API_KEYS=key1,key2,key3                      # Comma-separated valid API keys

# Database
DATABASE_PATH=./data/kanban.db               # SQLite database file path
```

#### MCP Configuration

```bash
# MCP Server Settings
MCP_TOOLS_ENABLED=true                       # Enable MCP server
MCP_SERVER_NAME=mcp-kanban                   # MCP server name
MCP_SERVER_VERSION=0.1.0                     # MCP server version
MCP_SERVER_DESCRIPTION="Kanban task management for AI agents"

# MCP Authentication
MCP_AUTH_REQUIRED=true                       # Require authentication for MCP
MCP_API_KEY=your-mcp-api-key                 # API key for MCP access
```

#### Performance Settings

```bash
# Database Performance
DATABASE_WAL_MODE=true                       # Enable Write-Ahead Logging
DATABASE_MEMORY_LIMIT=536870912              # 512MB memory limit
DATABASE_CACHE_SIZE=10000                    # SQLite cache size
DATABASE_JOURNAL_MODE=WAL                    # Journal mode (WAL/DELETE/TRUNCATE)

# API Performance
RATE_LIMIT_WINDOW_MS=60000                   # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=1000                 # Max requests per window
REQUEST_TIMEOUT=30000                        # Request timeout (30 seconds)
BODY_PARSER_LIMIT=10mb                       # Request body size limit

# WebSocket Performance
WS_HEARTBEAT_INTERVAL=30000                  # Heartbeat interval (30 seconds)
WS_CONNECTION_TIMEOUT=60000                  # Connection timeout (60 seconds)
WS_MAX_CONNECTIONS=100                       # Max concurrent connections
```

#### Development Settings

```bash
# Development Features
DEV_ENABLE_DEBUG_ROUTES=true                 # Enable debug endpoints
DEV_SEED_DATABASE=true                       # Auto-seed database on startup
DEV_ENABLE_CORS=true                         # Enable CORS for development
DEV_LOG_REQUESTS=true                        # Log all requests

# Logging
LOG_CONSOLE=true                             # Log to console
LOG_FILE=true                                # Log to file
LOG_FILE_PATH=./logs/kanban.log              # Log file path
LOG_MAX_SIZE=10mb                            # Max log file size
LOG_MAX_FILES=5                              # Max log files to keep
```

### Production Configuration

#### Security Hardening

```bash
# Production Security
NODE_ENV=production                          # Production environment
LOG_LEVEL=info                               # Info level logging
API_KEY_SECRET=your-production-secret-key    # Strong secret key
API_KEYS=prod-key-1,prod-key-2,prod-key-3   # Production API keys

# HTTPS (if using reverse proxy)
TRUST_PROXY=true                             # Trust proxy headers
SECURE_COOKIES=true                          # Use secure cookies

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000                   # 1-minute window
RATE_LIMIT_MAX_REQUESTS=500                  # Conservative limit
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false    # Count all requests
```

#### Performance Optimization

```bash
# Database Optimization
DATABASE_WAL_MODE=true                       # Enable WAL mode
DATABASE_MEMORY_LIMIT=1073741824             # 1GB memory limit
DATABASE_CACHE_SIZE=20000                    # Larger cache
DATABASE_SYNCHRONOUS=NORMAL                  # Normal sync mode

# API Optimization
REQUEST_TIMEOUT=60000                        # 60-second timeout
BODY_PARSER_LIMIT=5mb                        # Smaller body limit
COMPRESSION_ENABLED=true                     # Enable compression

# Monitoring
METRICS_ENABLED=true                         # Enable metrics collection
HEALTH_CHECK_INTERVAL=30000                  # Health check interval
```

### Docker Configuration

#### Docker Environment

```bash
# Docker-specific settings
DATABASE_PATH=/app/data/kanban.db            # Container database path
LOG_FILE_PATH=/app/logs/kanban.log           # Container log path
NODE_ENV=production                          # Production environment

# Volume mounts
DATA_VOLUME=/app/data                        # Data volume path
LOGS_VOLUME=/app/logs                        # Logs volume path
```

#### Docker Compose Example

```yaml
version: '3.8'

services:
  mcp-kanban:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_KEY_SECRET=${API_KEY_SECRET}
      - API_KEYS=${API_KEYS}
      - DATABASE_PATH=/app/data/kanban.db
      - LOG_FILE_PATH=/app/logs/kanban.log
      - DATABASE_WAL_MODE=true
      - RATE_LIMIT_MAX_REQUESTS=500
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## 🖥️ CLI Configuration

### CLI Setup

The CLI can be configured using the `kanban config` command:

```bash
# Set up initial configuration
kanban config set api-url http://localhost:3000
kanban config set api-key your-api-key

# Test configuration
kanban config test
```

### CLI Configuration Options

#### Connection Settings

```bash
# API Connection
kanban config set api-url http://localhost:3000    # Server URL
kanban config set api-key your-api-key             # API key for authentication
kanban config set timeout 30000                    # Request timeout (30 seconds)

# WebSocket Connection
kanban config set ws-url ws://localhost:3000       # WebSocket URL
kanban config set ws-reconnect true                # Auto-reconnect on disconnect
kanban config set ws-reconnect-delay 5000          # Reconnect delay (5 seconds)
```

#### Display Settings

```bash
# Output Formatting
kanban config set output-format table              # Output format (table/json/yaml)
kanban config set color true                       # Enable colored output
kanban config set unicode true                     # Use Unicode characters
kanban config set compact false                    # Compact output mode

# Table Settings
kanban config set table-width auto                 # Table width (auto/fixed)
kanban config set table-max-width 120              # Max table width
kanban config set table-sort-by id                 # Default sort column
kanban config set table-sort-order asc             # Default sort order
```

#### Default Values

```bash
# Default Board
kanban config set default-board main               # Default board for commands
kanban config set default-column todo              # Default column for new tasks

# Default Task Settings
kanban config set default-priority medium          # Default task priority
kanban config set default-status todo              # Default task status
kanban config set auto-assign false                # Auto-assign tasks to current user
```

#### Advanced Settings

```bash
# Caching
kanban config set cache-enabled true               # Enable response caching
kanban config set cache-ttl 300000                 # Cache TTL (5 minutes)
kanban config set cache-max-size 100               # Max cache entries

# Logging
kanban config set log-level info                   # CLI log level
kanban config set log-file ~/.kanban/cli.log       # CLI log file
kanban config set verbose false                    # Verbose output

# Development
kanban config set debug false                      # Debug mode
kanban config set trace false                      # Trace API calls
```

### CLI Configuration File

The CLI configuration is stored in `~/.kanban/config.json`:

```json
{
  "api": {
    "url": "http://localhost:3000",
    "key": "your-api-key",
    "timeout": 30000
  },
  "ws": {
    "url": "ws://localhost:3000",
    "reconnect": true,
    "reconnectDelay": 5000
  },
  "output": {
    "format": "table",
    "color": true,
    "unicode": true,
    "compact": false
  },
  "table": {
    "width": "auto",
    "maxWidth": 120,
    "sortBy": "id",
    "sortOrder": "asc"
  },
  "defaults": {
    "board": "main",
    "column": "todo",
    "priority": "medium",
    "status": "todo"
  },
  "cache": {
    "enabled": true,
    "ttl": 300000,
    "maxSize": 100
  },
  "logging": {
    "level": "info",
    "file": "~/.kanban/cli.log"
  }
}
```

### CLI Configuration Commands

```bash
# View all configuration
kanban config list

# Get specific value
kanban config get api-url

# Set configuration value
kanban config set api-url http://localhost:3000

# Remove configuration
kanban config unset api-url

# Reset to defaults
kanban config reset

# Export configuration
kanban config export > config.json

# Import configuration
kanban config import < config.json

# Test configuration
kanban config test
```

## 🤖 MCP Configuration

### MCP Server Configuration

The MCP server is configured through environment variables:

```bash
# MCP Server Settings
MCP_TOOLS_ENABLED=true                       # Enable MCP server
MCP_SERVER_NAME=mcp-kanban                   # Server name
MCP_SERVER_VERSION=0.1.0                     # Server version
MCP_SERVER_DESCRIPTION="Kanban task management for AI agents"

# MCP Authentication
MCP_AUTH_REQUIRED=true                       # Require authentication
MCP_API_KEY=your-mcp-api-key                 # API key for MCP access

# MCP Performance
MCP_REQUEST_TIMEOUT=60000                    # Request timeout (60 seconds)
MCP_MAX_CONCURRENT_REQUESTS=10               # Max concurrent requests
MCP_RATE_LIMIT_ENABLED=true                  # Enable rate limiting
MCP_RATE_LIMIT_WINDOW=60000                  # Rate limit window (1 minute)
MCP_RATE_LIMIT_MAX_REQUESTS=100              # Max requests per window
```

### MCP Client Configuration

#### Claude Code Configuration

Create `.mcp/config.json` in your project:

```json
{
  "servers": {
    "kanban": {
      "command": "mcp-kanban",
      "args": [
        "--api-key", "your-mcp-api-key",
        "--server-url", "http://localhost:3000"
      ],
      "env": {
        "MCP_KANBAN_URL": "http://localhost:3000",
        "MCP_KANBAN_API_KEY": "your-mcp-api-key"
      }
    }
  }
}
```

#### Cursor Configuration

Add to your Cursor settings:

```json
{
  "mcp.servers": {
    "kanban": {
      "command": "mcp-kanban",
      "args": ["--api-key", "your-mcp-api-key"],
      "env": {
        "MCP_KANBAN_URL": "http://localhost:3000"
      }
    }
  }
}
```

#### Aider Configuration

Create `.aider/config.json`:

```json
{
  "mcp_servers": {
    "kanban": {
      "command": "mcp-kanban",
      "args": ["--api-key", "your-mcp-api-key"],
      "env": {
        "MCP_KANBAN_URL": "http://localhost:3000"
      }
    }
  }
}
```

### MCP Tool Configuration

#### Tool-Specific Settings

```bash
# Task Management Tools
MCP_TASK_DEFAULT_PRIORITY=medium              # Default task priority
MCP_TASK_DEFAULT_STATUS=todo                  # Default task status
MCP_TASK_AUTO_ASSIGN=false                    # Auto-assign tasks
MCP_TASK_MAX_CONTEXT_SIZE=50000               # Max context size (tokens)

# Context Tools
MCP_CONTEXT_MAX_RESULTS=10                    # Max context results
MCP_CONTEXT_RELEVANCE_THRESHOLD=0.7           # Relevance threshold
MCP_CONTEXT_CACHE_TTL=300000                  # Context cache TTL (5 minutes)

# Search Tools
MCP_SEARCH_MAX_RESULTS=20                     # Max search results
MCP_SEARCH_FUZZY_MATCH=true                   # Enable fuzzy matching
MCP_SEARCH_INCLUDE_ARCHIVED=false             # Include archived items
```

## 🔐 Security Configuration

### API Key Management

#### Generate Secure API Keys

```bash
# Generate API key
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### API Key Configuration

```bash
# Server-side API keys
API_KEYS=key1,key2,key3,key4                  # Comma-separated keys

# Different keys for different purposes
API_KEY_ADMIN=admin-key                       # Admin API key
API_KEY_AGENT=agent-key                       # Agent API key
API_KEY_CLI=cli-key                           # CLI API key
API_KEY_MCP=mcp-key                           # MCP API key
```

### Authentication Configuration

```bash
# Authentication settings
AUTH_REQUIRED=true                            # Require authentication
AUTH_METHOD=api-key                           # Authentication method
AUTH_SESSION_TIMEOUT=3600000                  # Session timeout (1 hour)
AUTH_MAX_FAILED_ATTEMPTS=5                    # Max failed attempts
AUTH_LOCKOUT_DURATION=900000                  # Lockout duration (15 minutes)
```

### Rate Limiting Configuration

```bash
# Rate limiting settings
RATE_LIMIT_ENABLED=true                       # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                    # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=1000                  # Max requests per window
RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS=false     # Count all requests
RATE_LIMIT_HEADERS=true                       # Include rate limit headers
```

## 📊 Monitoring Configuration

### Logging Configuration

```bash
# Logging settings
LOG_LEVEL=info                                # Log level (debug/info/warn/error)
LOG_CONSOLE=true                              # Log to console
LOG_FILE=true                                 # Log to file
LOG_FILE_PATH=./logs/kanban.log               # Log file path
LOG_MAX_SIZE=10mb                             # Max log file size
LOG_MAX_FILES=5                               # Max log files to keep
LOG_FORMAT=json                               # Log format (json/text)
LOG_TIMESTAMP=true                            # Include timestamps
```

### Metrics Configuration

```bash
# Metrics settings
METRICS_ENABLED=true                          # Enable metrics collection
METRICS_PORT=9090                             # Metrics server port
METRICS_PATH=/metrics                         # Metrics endpoint path
METRICS_COLLECTION_INTERVAL=60000             # Collection interval (1 minute)
METRICS_RETENTION_PERIOD=86400000             # Retention period (24 hours)
```

### Health Check Configuration

```bash
# Health check settings
HEALTH_CHECK_ENABLED=true                     # Enable health checks
HEALTH_CHECK_INTERVAL=30000                   # Check interval (30 seconds)
HEALTH_CHECK_TIMEOUT=5000                     # Check timeout (5 seconds)
HEALTH_CHECK_RETRIES=3                        # Max retries
HEALTH_CHECK_GRACE_PERIOD=30000               # Grace period (30 seconds)
```

## 🔄 Backup Configuration

### Backup Settings

```bash
# Backup settings
BACKUP_ENABLED=true                           # Enable automated backups
BACKUP_SCHEDULE=0 2 * * *                     # Cron schedule (daily at 2 AM)
BACKUP_RETENTION_DAYS=30                      # Backup retention (30 days)
BACKUP_COMPRESSION=true                       # Enable compression
BACKUP_ENCRYPTION=false                       # Enable encryption
BACKUP_PATH=./backups                         # Backup directory
BACKUP_FILENAME=kanban-backup-{date}.sqlite   # Backup filename template
```

### Backup Scheduling

```bash
# Daily backup at 2 AM
BACKUP_SCHEDULE=0 2 * * *

# Hourly backup
BACKUP_SCHEDULE=0 * * * *

# Weekly backup on Sunday at 3 AM
BACKUP_SCHEDULE=0 3 * * 0

# Monthly backup on 1st at 4 AM
BACKUP_SCHEDULE=0 4 1 * *
```

## 🚀 Performance Configuration

### Database Optimization

```bash
# SQLite optimization
DATABASE_WAL_MODE=true                        # Write-Ahead Logging
DATABASE_MEMORY_LIMIT=536870912               # 512MB memory limit
DATABASE_CACHE_SIZE=10000                     # Cache size
DATABASE_JOURNAL_MODE=WAL                     # Journal mode
DATABASE_SYNCHRONOUS=NORMAL                   # Synchronous mode
DATABASE_TEMP_STORE=MEMORY                    # Temp store location
DATABASE_MMAP_SIZE=268435456                  # MMAP size (256MB)
```

### API Optimization

```bash
# API performance
REQUEST_TIMEOUT=30000                         # Request timeout (30 seconds)
BODY_PARSER_LIMIT=10mb                        # Body size limit
COMPRESSION_ENABLED=true                      # Enable compression
COMPRESSION_THRESHOLD=1024                    # Compression threshold
COMPRESSION_LEVEL=6                           # Compression level
```

### WebSocket Optimization

```bash
# WebSocket performance
WS_HEARTBEAT_INTERVAL=30000                   # Heartbeat interval (30 seconds)
WS_CONNECTION_TIMEOUT=60000                   # Connection timeout (60 seconds)
WS_MAX_CONNECTIONS=100                        # Max connections
WS_MAX_MESSAGE_SIZE=1048576                   # Max message size (1MB)
WS_PING_TIMEOUT=5000                          # Ping timeout (5 seconds)
WS_PONG_TIMEOUT=10000                         # Pong timeout (10 seconds)
```

## 🔧 Configuration Validation

### Validate Configuration

```bash
# Validate server configuration
npm run config:validate

# Validate CLI configuration
kanban config validate

# Test all connections
kanban config test
```

### Configuration Testing

```bash
# Test API connection
curl -H "X-API-Key: your-api-key" http://localhost:3000/health

# Test MCP connection
curl http://localhost:3000/mcp/health

# Test WebSocket connection
wscat -c ws://localhost:3000/ws -H "X-API-Key: your-api-key"
```

## 📚 Configuration Examples

### Development Configuration

```bash
# .env (Development)
NODE_ENV=development
PORT=3000
API_KEY_SECRET=dev-secret-key-32-chars
API_KEYS=dev-key-1,dev-key-2
DATABASE_PATH=./data/kanban-dev.db
LOG_LEVEL=debug
DEV_ENABLE_DEBUG_ROUTES=true
DEV_SEED_DATABASE=true
MCP_TOOLS_ENABLED=true
```

### Production Configuration

```bash
# .env (Production)
NODE_ENV=production
PORT=3000
API_KEY_SECRET=prod-secret-key-32-chars
API_KEYS=prod-key-1,prod-key-2,prod-key-3
DATABASE_PATH=/app/data/kanban.db
LOG_LEVEL=info
DATABASE_WAL_MODE=true
RATE_LIMIT_MAX_REQUESTS=500
BACKUP_ENABLED=true
METRICS_ENABLED=true
```

### Docker Configuration

```bash
# .env (Docker)
NODE_ENV=production
PORT=3000
API_KEY_SECRET=docker-secret-key-32-chars
API_KEYS=docker-key-1,docker-key-2
DATABASE_PATH=/app/data/kanban.db
LOG_FILE_PATH=/app/logs/kanban.log
DATABASE_WAL_MODE=true
RATE_LIMIT_MAX_REQUESTS=500
BACKUP_ENABLED=true
```

## 🆘 Configuration Troubleshooting

### Common Issues

#### Configuration Not Loading

```bash
# Check environment file
ls -la .env

# Check file permissions
chmod 600 .env

# Verify syntax
cat .env | grep -v '^#' | grep -v '^$'
```

#### API Key Issues

```bash
# Generate new API key
openssl rand -hex 32

# Update configuration
kanban config set api-key new-api-key

# Test connection
kanban config test
```

#### Database Issues

```bash
# Check database file
ls -la ./data/kanban.db

# Fix permissions
chmod 644 ./data/kanban.db

# Reinitialize database
npm run db:init
```

### Configuration Validation

```bash
# Validate all configuration
npm run config:validate

# Check specific settings
kanban config get api-url
kanban config get api-key

# Test all connections
kanban config test
```

---

**Configuration complete?** Move on to the [CLI Usage Guide](./cli-usage.md) to learn how to use the system effectively. 