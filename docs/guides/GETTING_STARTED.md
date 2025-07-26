# Getting Started with MCP Kanban

This guide will help you set up and run the MCP Kanban server for the first time.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher (comes with Node.js)
- **Git**: For cloning the repository
- **SQLite**: Usually pre-installed on most systems

To verify your setup:

```bash
node --version  # Should output v18.0.0 or higher
npm --version   # Should output 9.0.0 or higher
sqlite3 --version  # Should show SQLite version
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required dependencies and set up Git hooks for code quality.

### 3. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` to configure your installation:

```bash
# Essential settings
PORT=3000
API_KEY_SECRET=your-secret-key-at-least-16-characters-long
API_KEYS=your-api-key-1,your-api-key-2

# Database location
DATABASE_PATH=./data/kanban.db

# Development settings
NODE_ENV=development
LOG_LEVEL=debug
```

### 4. Initialize the Database

The database will be automatically created and initialized on first run. The schema includes all necessary tables, indexes, and views.

## Running the Server

### Development Mode

Run with hot-reloading:

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured port).

### Production Mode

Build and run:

```bash
npm run build
npm start
```

### Using Docker

Build and run with Docker:

```bash
# Development
docker-compose up dev

# Production
docker-compose up prod
```

## Verify Installation

### 1. Check Health Endpoint

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "database": {
    "connected": true,
    "responsive": true
  }
}
```

### 2. Test API Access

Create your first board:

```bash
curl -X POST http://localhost:3000/api/v1/boards \
  -H "X-API-Key: your-api-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Board",
    "description": "Getting started with MCP Kanban"
  }'
```

## Using the CLI

The MCP Kanban CLI provides a convenient way to interact with your server:

### Set Up CLI Configuration

```bash
# Set API endpoint
kanban config set api.url http://localhost:3000

# Set API key
kanban config set api.key your-api-key-1

# Set default board
kanban config set defaults.board my-first-board
```

### Basic CLI Commands

```bash
# List all boards
kanban board list

# Create a task
kanban task create "Set up development environment"

# List tasks
kanban task list

# Get next suggested task
kanban next
```

## MCP Integration

To use MCP Kanban with AI assistants:

### 1. Configure MCP Server

The MCP server runs alongside the main API. Ensure it's enabled:

```bash
MCP_TOOLS_ENABLED=true
MCP_SERVER_NAME=mcp-kanban
```

### 2. Connect Your AI Assistant

Add to your AI assistant's MCP configuration:

```json
{
  "mcpServers": {
    "kanban": {
      "command": "mcp-kanban",
      "args": ["--api-key", "your-api-key"],
      "env": {
        "MCP_KANBAN_URL": "http://localhost:3000"
      }
    }
  }
}
```

### 3. Available MCP Tools

Your AI assistant can now use:
- `create_task` - Create new tasks
- `update_task` - Modify existing tasks
- `search_tasks` - Find tasks
- `get_context` - Get work context
- `prioritize_tasks` - Get task priorities

## Common Tasks

### Creating a Complete Project Setup

```bash
# Create a board
kanban board create "My Project"

# Switch to the board
kanban board use my-project

# Create some initial tasks
kanban task create "Design database schema" --priority high
kanban task create "Implement authentication" --priority high
kanban task create "Create API endpoints" --priority medium
kanban task create "Write documentation" --priority low

# Add tags
kanban tag create "backend"
kanban tag create "frontend"
kanban tag add task-1 backend
kanban tag add task-2 backend
```

### Managing Tasks with Dependencies

```bash
# Create a parent task
kanban task create "Implement user system" --priority high

# Create subtasks
kanban subtask create task-1 "Design user model"
kanban subtask create task-1 "Create user API"
kanban subtask create task-1 "Add authentication"

# Set dependencies
kanban task depend task-3 task-2  # task-3 depends on task-2
```

### Using Real-time Updates

Connect to WebSocket for live updates:

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3001', {
  auth: {
    apiKey: 'your-api-key-1'
  }
});

// Subscribe to a board
socket.emit('subscribe', { board_id: 'my-project' });

// Listen for updates
socket.on('task:created', (task) => {
  console.log('New task:', task.title);
});

socket.on('task:updated', (task) => {
  console.log('Task updated:', task.title);
});
```

## Configuration Options

### Essential Settings

| Setting | Environment Variable | Default | Description |
|---------|---------------------|---------|-------------|
| Server Port | `PORT` | 3000 | API server port |
| Database Path | `DATABASE_PATH` | ./data/kanban.db | SQLite file location |
| API Secret | `API_KEY_SECRET` | (required) | Secret for API keys |
| API Keys | `API_KEYS` | (required) | Comma-separated valid keys |

### Performance Tuning

```bash
# Database performance
DATABASE_WAL_MODE=true
DATABASE_MEMORY_LIMIT=536870912  # 512MB

# API performance
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000
REQUEST_TIMEOUT=30000
```

### Development Settings

```bash
# Enable debug features
DEV_ENABLE_DEBUG_ROUTES=true
DEV_SEED_DATABASE=true

# Logging
LOG_LEVEL=debug
LOG_CONSOLE=true
```

## Next Steps

1. **Explore the API**: See the [API Reference](../API.md) for all endpoints
2. **Set up backups**: Configure automated backups in production
3. **Customize**: Modify settings for your workflow
4. **Integrate**: Connect with your existing tools via API
5. **Contribute**: Check [Contributing Guide](../CONTRIBUTING.md)

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Use a different port
PORT=8080 npm run dev
```

### Database Permission Issues

```bash
# Fix permissions
chmod 755 ./data
chmod 644 ./data/kanban.db
```

### API Key Not Working

1. Ensure the key is in your `.env` file
2. Restart the server after changes
3. Check the key format (no spaces, proper length)

### Memory Issues

For large databases:

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

## Getting Help

- **Documentation**: Check the [full documentation](../INDEX.md)
- **Issues**: Report bugs on [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
- **Community**: Join our [Discord server](#)
- **Email**: support@mcp-kanban.example.com