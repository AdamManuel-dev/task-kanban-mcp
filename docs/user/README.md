# MCP Kanban User Documentation

Welcome to the MCP Kanban Server - a headless kanban task management system designed for AI agents and human supervisors to coordinate software development work efficiently.

## 🎯 What is MCP Kanban?

MCP Kanban is a specialized task management system that:

- **Frees up AI agent context windows** by externalizing project management
- **Coordinates multiple AI agents** working on the same codebase
- **Provides real-time task tracking** for human supervisors
- **Integrates seamlessly** with AI coding assistants via MCP (Model Context Protocol)

## 🚀 Quick Start

### For Human Supervisors

1. **Install the CLI**:
   ```bash
   npm install -g @task-kanban-mcp/cli
   ```

2. **Set up your server**:
   ```bash
   # Clone and install
   git clone https://github.com/yourusername/mcp-kanban.git
   cd mcp-kanban
   npm install
   
   # Configure and start
   cp .env.example .env
   npm run dev
   ```

3. **Configure CLI**:
   ```bash
   kanban config set api-url http://localhost:3000
   kanban config set api-key your-api-key
   ```

4. **Create your first board**:
   ```bash
   kanban board create "My Project"
   kanban task create "Set up development environment"
   ```

### For AI Agents

1. **Configure MCP in your AI assistant**:
   ```json
   // .mcp/config.json
   {
     "servers": {
       "kanban": {
         "command": "mcp-kanban",
         "args": ["--api-key", "your-agent-key"]
       }
     }
   }
   ```

2. **Start using MCP tools**:
   ```javascript
   // Get next task
   {
     "tool": "get_next_task",
     "parameters": {
       "capabilities": ["javascript", "react"]
     }
   }
   ```

## 📚 Documentation Sections

### Getting Started
- **[Installation Guide](./installation.md)** - Complete setup instructions
- **[Configuration Guide](./configuration.md)** - Server and client configuration
- **[Quick Start Tutorial](./quick-start.md)** - 5-minute setup tutorial

### Using the System
- **[CLI Usage Guide](./cli-usage.md)** - Complete command-line interface reference
- **[MCP Integration Guide](./mcp-integration.md)** - AI agent integration
- **[WebSocket Real-time Updates](./websocket.md)** - Real-time monitoring
- **[API Reference](./api-reference.md)** - REST API documentation

### Advanced Features
- **[Backup and Recovery](./backup-recovery.md)** - Data management
- **[Performance Tuning](./performance.md)** - Optimization guide
- **[Security Best Practices](./security.md)** - Security configuration
- **[Multi-Agent Coordination](./multi-agent.md)** - Advanced agent workflows

### Troubleshooting
- **[Troubleshooting Guide](./troubleshooting.md)** - Common issues and solutions
- **[FAQ](./faq.md)** - Frequently asked questions
- **[Error Reference](./errors.md)** - Error codes and meanings
- **[Support](./support.md)** - Getting help

## 🎮 Key Features

### For Human Supervisors
- **Interactive CLI** with real-time updates
- **Dashboard** for project overview
- **Task creation and management** with rich context
- **Agent coordination** and boundary setting
- **Backup and data management**

### For AI Agents
- **MCP protocol integration** for seamless access
- **Context-aware task retrieval** with full project context
- **Dependency management** to prevent conflicts
- **Progress reporting** and completion tracking
- **Multi-agent coordination** with automatic conflict resolution

### System Features
- **Real-time WebSocket updates** for live monitoring
- **REST API** for custom integrations
- **SQLite database** for reliable data storage
- **Docker support** for easy deployment
- **Comprehensive logging** and monitoring

## 🔄 Typical Workflow

### 1. Project Setup (Human)
```bash
# Create project board
kanban board create "Feature Sprint"

# Create high-level tasks
kanban task create "Implement authentication" --priority high
kanban task create "Add user management" --priority high
kanban task create "Write documentation" --priority medium
```

### 2. Agent Assignment (Human)
```bash
# Assign tasks to agents
kanban task assign 1 --agent claude-code
kanban task assign 2 --agent cursor

# Set agent boundaries
kanban agent boundary set claude-code --scope "backend/*"
kanban agent boundary set cursor --scope "frontend/*"
```

### 3. Agent Work (AI)
```javascript
// Agent gets next task
{
  "tool": "get_next_task",
  "parameters": {
    "capabilities": ["javascript", "api"]
  }
}

// Agent reports completion
{
  "tool": "complete_task",
  "parameters": {
    "task_id": 1,
    "implementation_notes": "JWT authentication implemented"
  }
}
```

### 4. Monitoring (Human)
```bash
# Watch progress in real-time
kanban dashboard --board "Feature Sprint"

# Review completed work
kanban task review 1 --show-diff
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Agent 1    │    │   AI Agent 2    │    │   Human         │
│  (Claude Code)  │    │    (Cursor)     │    │  Supervisor     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────┬───────────┴──────────────────────┘
                     │
              ┌──────▼──────┐
              │ MCP Server  │
              │ (Port 3000) │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   SQLite    │
              │  Database   │
              └─────────────┘
```

## 📊 System Requirements

### Server Requirements
- **Node.js**: 18.0.0 or higher
- **npm**: 9.0.0 or higher
- **SQLite**: 3.35.0 or higher
- **Memory**: 512MB minimum, 2GB recommended
- **Storage**: 1GB minimum for database and logs

### Client Requirements
- **CLI**: Node.js 16.0.0 or higher
- **MCP**: Compatible with Claude Code, Cursor, and other MCP-enabled assistants
- **WebSocket**: Modern browser for dashboard (optional)

## 🔧 Configuration Overview

### Essential Settings
```bash
# Server configuration
PORT=3000                           # API server port
API_KEY_SECRET=your-secret-key      # Secret for API keys
API_KEYS=key1,key2,key3            # Valid API keys
DATABASE_PATH=./data/kanban.db      # Database location

# MCP configuration
MCP_TOOLS_ENABLED=true              # Enable MCP server
MCP_SERVER_NAME=mcp-kanban          # MCP server name
```

### Performance Settings
```bash
# Database optimization
DATABASE_WAL_MODE=true              # Write-Ahead Logging
DATABASE_MEMORY_LIMIT=536870912     # 512MB memory limit

# API optimization
RATE_LIMIT_WINDOW_MS=60000          # 1-minute rate limit window
RATE_LIMIT_MAX_REQUESTS=1000        # Max requests per window
```

## 🚦 Best Practices

### For Human Supervisors
1. **Task Sizing**: Keep tasks under 50k tokens of required context
2. **Clear Boundaries**: Define explicit file/module boundaries for parallel work
3. **Dependency Chains**: Keep chains shallow to maximize parallelism
4. **Regular Monitoring**: Use dashboard to track progress and identify blockers

### For AI Agents
1. **Stateless Execution**: Don't assume memory between tasks
2. **Context Queries**: Request only needed information
3. **Progress Updates**: Report progress for long-running tasks
4. **Graceful Handling**: Check dependencies before starting

### System Administration
1. **Regular Backups**: Set up automated backup schedules
2. **Performance Monitoring**: Monitor database size and query performance
3. **Security Updates**: Keep dependencies updated
4. **Log Rotation**: Configure log rotation to prevent disk space issues

## 🆘 Getting Help

### Documentation
- **This Guide**: Start here for overview and quick start
- **Installation Guide**: Detailed setup instructions
- **CLI Reference**: Complete command documentation
- **API Reference**: REST API documentation

### Support Channels
- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share experiences
- **Documentation Issues**: Report documentation problems

### Community
- **Contributing**: See [CONTRIBUTING.md](../../CONTRIBUTING.md)
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)
- **License**: MIT License - see [LICENSE](../../LICENSE)

## 📈 What's Next?

1. **Start with Installation**: Follow the [Installation Guide](./installation.md)
2. **Configure Your Setup**: Use the [Configuration Guide](./configuration.md)
3. **Learn the CLI**: Master the [CLI Usage Guide](./cli-usage.md)
4. **Integrate AI Agents**: Set up [MCP Integration](./mcp-integration.md)
5. **Explore Advanced Features**: Dive into [Multi-Agent Coordination](./multi-agent.md)

---

**Ready to get started?** Begin with the [Installation Guide](./installation.md) or jump straight to the [Quick Start Tutorial](./quick-start.md) for a 5-minute setup. 