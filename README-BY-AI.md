# MCP Kanban Server

A headless kanban task management system designed specifically for AI agents and developers using the Model Context Protocol (MCP).

## Overview

The MCP Kanban Server provides AI agents (like Claude Code, Cursor, etc.) with direct access to a powerful task management system. It automatically detects git repository context, provides real-time updates via WebSocket, and uses SQLite for reliable local data storage.

## Key Features

- **🤖 AI-First Design**: Built specifically for AI agent integration via MCP protocol
- **🔄 Context-Aware**: Automatically maps git repositories to appropriate kanban boards
- **⚡ Real-Time Updates**: WebSocket-based live synchronization across all connected clients
- **📊 Smart Prioritization**: AI-powered task prioritization based on dependencies and context
- **🏗️ Hierarchical Tasks**: Support for subtasks and complex dependency relationships
- **🔍 Full-Text Search**: Search across tasks, notes, and tags with advanced filtering
- **💾 Local-First**: SQLite database with automatic backups and data integrity
- **🛠️ Developer-Friendly**: Comprehensive CLI and REST API for all operations

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### CLI Usage

```bash
# Install CLI globally
npm install -g @mcp-kanban/cli

# Configure connection
kanban config set api-url http://localhost:3000
kanban config set api-key your-api-key

# Create your first task
kanban task create "Implement user authentication" --tags backend,security

# Get next recommended task
kanban next

# Search tasks and notes
kanban search tasks "authentication"
```

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   AI Agent (MCP)    │────▶│   MCP Server     │◀────│   CLI Client     │
└─────────────────────┘     └──────────────────┘     └──────────────────┘
                                     │
                            ┌────────┴────────┐
                            │                 │
                      ┌─────▼─────┐    ┌─────▼─────┐
                      │  REST API │    │ WebSocket │
                      └─────┬─────┘    └─────┬─────┘
                            │                │
                      ┌─────▼─────────────────▼─────┐
                      │    Business Logic Layer     │
                      └─────────────┬───────────────┘
                                    │
                            ┌───────▼────────┐
                            │     SQLite     │
                            │   (local.db)   │
                            └────────────────┘
```

## Core Concepts

### Boards & Tasks

- **Boards**: Project-specific kanban boards with customizable columns
- **Tasks**: Core work items with rich metadata, notes, and relationships
- **Subtasks**: Hierarchical task breakdown with automatic progress tracking
- **Dependencies**: Block/unblock relationships with critical path analysis

### AI Integration

- **Context Awareness**: Understands current work state and provides relevant suggestions
- **Smart Prioritization**: Considers dependencies, deadlines, and work patterns
- **Natural Language**: Create and update tasks using conversational commands
- **Pattern Recognition**: Learns from past work to suggest similar solutions

### Git Integration

- **Auto-Detection**: Automatically maps git repositories to appropriate boards
- **Branch Parsing**: Extracts task IDs from branch names for automatic updates
- **Commit Integration**: Links commits to tasks and updates progress
- **Flexible Mapping**: Configurable repository-to-board mapping rules

## Development

### Project Structure

See [DIRECTORY_STRUCTURE.md](./DIRECTORY_STRUCTURE.md) for detailed project organization.

### Scripts

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run test         # Run test suite
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors automatically
npm run format       # Format code with Prettier
npm run typecheck    # Run TypeScript type checking
```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage
```

## API Documentation

### REST API

The server provides a comprehensive REST API for all operations:

- `POST /api/tasks` - Create tasks
- `GET /api/tasks` - List and filter tasks
- `PATCH /api/tasks/:id` - Update tasks
- `GET /api/context` - Get current work context
- `GET /api/priorities/next` - Get next recommended task

See [API Documentation](./docs/api/) for complete endpoint reference.

### WebSocket Events

Real-time updates are provided via WebSocket:

- `task:created` - New task created
- `task:updated` - Task modified
- `task:moved` - Task moved between columns
- `priority:changed` - Task priority updated
- `dependency:blocked` - Task blocked by dependency

### MCP Tools

For AI agents, the following MCP tools are available:

- `create_task` - Create new tasks with rich metadata
- `get_context` - Get comprehensive work context
- `get_next_task` - Get AI-recommended next task
- `search_tasks` - Search across all tasks and notes
- `add_note` - Add implementation notes to tasks

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_PATH=./kanban.db
DATABASE_BACKUP_PATH=./backups

# API Security
API_KEY_SECRET=your-secret-key
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# Git Integration
GIT_AUTO_DETECT=true
GIT_BRANCH_PATTERNS=feature/{taskId}-*,{taskId}-*

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
```

### Repository Mapping

Configure automatic repository-to-board mapping:

```json
{
  "mappings": [
    {
      "pattern": "github.com/myorg/project-*",
      "boardId": "work-projects"
    },
    {
      "pattern": "personal-blog",
      "boardId": "blog-tasks"
    }
  ]
}
```

## Deployment

### Docker

```bash
# Build image
docker build -t mcp-kanban .

# Run container
docker run -p 3000:3000 -v ./data:/app/data mcp-kanban
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## Performance

- **Response Time**: < 100ms for task operations
- **WebSocket Latency**: < 50ms for real-time updates
- **Concurrent Connections**: Supports 10+ simultaneous clients
- **Database**: Optimized SQLite with WAL mode and indexes
- **Memory Usage**: < 256MB under normal operation

## Security

- **API Key Authentication**: Simple but secure for personal deployment
- **Rate Limiting**: 1000 requests per minute per API key
- **Input Validation**: Comprehensive sanitization and validation
- **CORS**: Configurable cross-origin resource sharing
- **Audit Logging**: Complete audit trail of all operations

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/mcp-kanban/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/mcp-kanban/discussions)

## Roadmap

- [ ] **v0.1.0**: Core MVP with basic task management
- [ ] **v0.2.0**: Full MCP integration and AI features
- [ ] **v0.3.0**: Advanced dependency management and prioritization
- [ ] **v0.4.0**: Plugin system and extensibility
- [ ] **v1.0.0**: Production-ready release with full feature set

---

**Made with ❤️ for AI-powered development workflows**
