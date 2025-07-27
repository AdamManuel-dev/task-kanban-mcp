# Quick Reference Guide

A concise overview of the MCP Kanban Server features and commands.

## 🚀 Quick Start

```bash
# Install CLI
npm install -g @task-kanban-mcp/cli

# Configure
kanban config set api-url http://localhost:3000
kanban config set api-key your-key

# Create board and task
kanban board create "My Project"
kanban task create "First task" --board "My Project"
```

## 📋 Core Commands

### Boards
```bash
kanban board create "Board Name"           # Create board
kanban board list                          # List boards
kanban board show "Board Name"             # Show board details
kanban board delete "Board Name"           # Delete board
```

### Tasks
```bash
kanban task create "Task Title"            # Create task
kanban task list                           # List tasks
kanban task show <id>                      # Show task details
kanban task update <id> --status "done"    # Update task
kanban task delete <id>                    # Delete task
```

### Agents
```bash
kanban agent list                          # List agents
kanban agent status <agent>                # Show agent status
kanban task assign <id> --agent <agent>    # Assign task
kanban agent logs <agent>                  # View agent logs
```

## 🔌 MCP Tools

### Task Management
- `get_next_task` - Get next available task
- `complete_task` - Report task completion
- `update_task_progress` - Update task progress

### Context Management
- `get_project_context` - Get project context
- `check_task_dependencies` - Check dependencies
- `search_related_tasks` - Find related tasks

### Agent Coordination
- `lock_task` - Lock task for exclusive access
- `get_agent_boundaries` - Get agent work boundaries
- `report_agent_metrics` - Report performance metrics

## 🏗️ Architecture Components

### Core Services
- **TaskService** - Task CRUD operations
- **BoardService** - Board management
- **ContextService** - Context and dependency management
- **AgentService** - Agent coordination and metrics

### Interfaces
- **REST API** - HTTP endpoints for all operations
- **MCP Server** - Model Context Protocol for AI agents
- **WebSocket** - Real-time updates and notifications
- **CLI** - Command-line interface for humans

### Database
- **SQLite** - Local database with migrations
- **Kysely** - Type-safe query builder
- **Migrations** - Schema versioning

## 📊 Data Models

### Task
```typescript
interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'todo' | 'in-progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  board_id: number;
  assigned_agent?: string;
  context_files?: string[];
  dependencies?: number[];
  created_at: Date;
  updated_at: Date;
}
```

### Board
```typescript
interface Board {
  id: number;
  name: string;
  description?: string;
  columns: string[];
  default_column: string;
  created_at: Date;
  updated_at: Date;
}
```

### Agent
```typescript
interface Agent {
  id: string;
  name: string;
  capabilities: string[];
  boundaries?: {
    scope: string[];
    exclude: string[];
  };
  status: 'idle' | 'working' | 'offline';
  current_task_id?: number;
}
```

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000                    # Server port
DATABASE_URL=./kanban.db     # Database path
LOG_LEVEL=info              # Logging level
API_KEY=your-secret-key     # API authentication
```

### CLI Configuration
```bash
kanban config set api-url http://localhost:3000
kanban config set api-key your-key
kanban config set default-board "Main"
kanban config set output-format json
```

## 🧪 Testing

### Run Tests
```bash
npm test                     # Unit tests
npm run test:integration     # Integration tests
npm run test:e2e            # End-to-end tests
npm run test:performance    # Performance tests
```

### Test Coverage
```bash
npm run test:coverage       # Generate coverage report
npm run test:watch          # Watch mode for development
```

## 📈 Monitoring

### Dashboard
```bash
kanban dashboard             # Launch interactive dashboard
kanban watch --board "Main"  # Watch board changes
```

### Metrics
```bash
kanban monitor --metrics cpu,memory
kanban agent stats claude-code
kanban context analyze --agent claude-code
```

## 🔄 Workflows

### Single Agent
1. `get_next_task` - Get task
2. `check_task_dependencies` - Check dependencies
3. `get_project_context` - Get context
4. Execute task
5. `complete_task` - Report completion

### Multi-Agent
1. Set agent boundaries
2. `lock_task` - Lock task
3. Work on task
4. `release_task_lock` - Release lock
5. Coordinate at boundaries

### Human Supervisor
1. Create board and tasks
2. Assign tasks to agents
3. Monitor progress via dashboard
4. Review and approve completed work

## 🚨 Common Issues

### Connection Issues
```bash
kanban config test          # Test connection
kanban health               # Check server status
```

### Task Issues
```bash
kanban validate --check-dependencies
kanban task show <id>       # Check task details
```

### Agent Issues
```bash
kanban agent status <agent> # Check agent status
kanban agent logs <agent>   # View agent logs
```

## 📚 Key Files

### Configuration
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `jest.config.js` - Test configuration
- `.env` - Environment variables

### Source Code
- `src/server.ts` - Main server entry point
- `src/mcp/server.ts` - MCP server implementation
- `src/cli/index.ts` - CLI entry point
- `src/database/` - Database schema and migrations

### Documentation
- `docs/README.md` - Documentation overview
- `docs/API.md` - Complete API documentation
- `docs/guides/` - Usage guides
- `docs/modules/` - Module documentation

## 🎯 Best Practices

### For Agents
- Request only needed context
- Report progress for long tasks
- Check dependencies before starting
- Use task-specific context

### For Humans
- Keep tasks under 50k tokens
- Define clear boundaries for parallel work
- Monitor agent performance
- Review completed work regularly

### For Development
- Follow TypeScript style guide
- Write tests for new features
- Use proper error handling
- Document API changes

## 🔗 Related Documentation

- [Getting Started](./guides/GETTING_STARTED.md)
- [API Reference](./API.md)
- [CLI Usage](./guides/CLI_USAGE.md)
- [Agent Integration](./guides/AGENT_INTEGRATION.md)
- [Architecture](./ARCHITECTURE.md)
- [Troubleshooting](./TROUBLESHOOTING.md) 