# MCP Kanban Documentation Hub

Welcome to the comprehensive documentation for MCP Kanban - a real-time collaborative kanban board system with AI agent integration via Model Context Protocol.

## 🚀 Quick Start

Get up and running with MCP Kanban in minutes:

```bash
# Install globally
npm install -g @kanban/cli

# Configure API access
kanban configure --api-url http://localhost:3000 --api-key your-key

# Create your first board
kanban board create "My Project"

# Create a task
kanban task create "Build awesome feature" --board my-project --priority 3
```

## 📖 Documentation Overview

### For Users
- **[Getting Started](./user/GETTING_STARTED.md)** - First steps with MCP Kanban
- **[User Guide](./user/USER_GUIDE.md)** - Complete user manual
- **[CLI Usage](./guides/CLI_USAGE.md)** - Command-line interface guide
- **[FAQ](./user/FAQ.md)** - Frequently asked questions
- **[Quick Reference](./QUICK_REFERENCE.md)** - Concise overview and commands

### For Developers
- **[Development Guide](./guides/DEVELOPMENT_GUIDE.md)** - Setup and development workflow
- **[API Reference](./api/API_REFERENCE.md)** - Complete API documentation
- **[Architecture Overview](./ARCHITECTURE.md)** - System design and components
- **[Contributing Guidelines](./guides/CONTRIBUTING.md)** - How to contribute to the project
- **[TypeScript Style Guide](./typescript-style-guide.md)** - Coding standards and conventions
- **[TypeScript Patterns](./typescript-patterns.md)** - Common patterns and best practices
- **[Type System Decisions](./type-decisions-rationale.md)** - Design rationale for type system

### For AI/Agent Developers
- **[Agent Integration Guide](./guides/AGENT_INTEGRATION.md)** - MCP integration for AI agents
- **[MCP Tools Reference](./api/MCP.md)** - Model Context Protocol tools and prompts
- **[Context APIs](./api/API_REFERENCE.md#context-tools)** - Context generation endpoints

### For DevOps
- **[Deployment Guide](./guides/DEPLOYMENT.md)** - Production deployment and cloud hosting
- **[Docker Setup](./deployment/DOCKER.md)** - Container deployment
- **[Monitoring Setup](./deployment/MONITORING.md)** - Logging and monitoring
- **[Backup & Recovery](./deployment/BACKUP_RECOVERY.md)** - Data protection
- **[Performance Tuning Guide](./guides/PERFORMANCE_TUNING.md)** - Performance optimization techniques

## 🏗️ Module Documentation

Detailed documentation for each system module:

### Core Modules
- **[Middleware Module](./modules/middleware.md)** - Authentication, validation, and request handling
- **[Routes Module](./modules/routes.md)** - REST API endpoints and routing
- **[Types Module](./modules/types.md)** - TypeScript types and interfaces
- **[Utils Module](./modules/utils.md)** - Utility functions and helpers

### Service Modules
- **[Services Module](./modules/services.md)** - Core business logic services
- **[CLI Module](./modules/cli.md)** - Command-line interface architecture
- **[API Module](./modules/api.md)** - REST API structure and middleware
- **[WebSocket Module](./modules/websocket.md)** - Real-time communication layer
- **[MCP Module](./modules/mcp.md)** - Model Context Protocol integration

### Infrastructure Modules
- **[Configuration Module](./modules/configuration.md)** - Environment and settings management
- **[Database Module](./modules/database.md)** - SQLite connection, schema, and operations
- **[Logging Module](./modules/logging.md)** - Winston logger configuration and usage

## 🔧 Operations & Support

### Troubleshooting
- **[Troubleshooting Guide](./guides/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Database Schema Documentation](./guides/DATABASE_SCHEMA.md)** - Complete database schema reference
- **[Performance Diagnostics](./guides/PERFORMANCE_TUNING.md#diagnostics)** - Performance troubleshooting

### Testing & Quality
- **[Testing Guide](./guides/TESTING.md)** - Writing and running tests
- **[Documentation Report](./documentation-report.md)** - Documentation coverage and recommendations

## 📚 Complete Documentation Index

### Core Documentation
- **README.md** - Documentation overview and navigation
- **INDEX.md** - This file - complete documentation index
- **QUICK_REFERENCE.md** - Concise overview and commands
- **ARCHITECTURE.md** - System architecture and design patterns
- **API.md** - Comprehensive API documentation
- **TROUBLESHOOTING.md** - Common issues and solutions
- **documentation-report.md** - Documentation status and coverage report

### API Documentation
- **api/REST.md** - REST API endpoints and usage examples
- **api/WEBSOCKET.md** - WebSocket events and real-time features
- **api/MCP.md** - MCP tools and prompts for AI assistants

### Development Guides
- **guides/GETTING_STARTED.md** - Initial setup and configuration
- **guides/DEVELOPMENT.md** - Development environment and workflow
- **guides/CONTRIBUTING.md** - Contributing guidelines and standards
- **guides/PLUGIN_DEVELOPMENT.md** - Plugin development and extension system
- **guides/PERFORMANCE_TUNING.md** - Performance optimization and monitoring
- **guides/DATABASE_SCHEMA.md** - Complete database schema documentation
- **guides/TESTING.md** - Testing strategies and practices
- **guides/CLI_USAGE.md** - Command-line interface usage
- **guides/AGENT_INTEGRATION.md** - MCP integration for AI agents
- **guides/DEPLOYMENT.md** - Production deployment and cloud hosting

### Module Documentation
- **modules/services.md** - TaskService, BoardService, and other core services
- **modules/cli.md** - CLI commands, formatters, and interactive features
- **modules/api.md** - Express routes, middleware, and error handling
- **modules/websocket.md** - Socket.io server and real-time events
- **modules/mcp.md** - MCP server, tools, and prompts
- **modules/configuration.md** - Configuration management
- **modules/database.md** - Database schema and operations
- **modules/logging.md** - Logging system and configuration

### TypeScript & Code Quality
- **typescript-style-guide.md** - TypeScript coding standards
- **typescript-patterns.md** - Common patterns and best practices
- **type-decisions-rationale.md** - Type system design decisions

## 🎯 Quick Reference

### API Endpoints
```
GET    /api/v1/tasks          # List tasks
POST   /api/v1/tasks          # Create task
GET    /api/v1/tasks/:id      # Get task
PUT    /api/v1/tasks/:id      # Update task
DELETE /api/v1/tasks/:id      # Delete task
```

### CLI Commands
```bash
kanban task list              # List all tasks
kanban task create <title>    # Create new task
kanban board create <name>    # Create new board
kanban dashboard              # Launch interactive UI
```

### WebSocket Events
```javascript
socket.on('task:created', handler)
socket.on('task:updated', handler)
socket.on('board:updated', handler)
socket.on('presence:update', handler)
```

## 🚸 Learning Paths

### For New Users
1. Start with **[Getting Started Guide](./user/GETTING_STARTED.md)**
2. Review **[User Guide](./user/USER_GUIDE.md)**
3. Explore **[CLI Usage](./guides/CLI_USAGE.md)**

### For Developers
1. Follow **[Development Guide](./guides/DEVELOPMENT_GUIDE.md)**
2. Read **[API Reference](./api/API_REFERENCE.md)**
3. Check **[TypeScript Style Guide](./typescript-style-guide.md)**
4. Review **[Testing Guide](./guides/TESTING.md)**
5. Explore **[Plugin Development Guide](./guides/PLUGIN_DEVELOPMENT.md)**

### For API Integration
1. Review **[Complete API Documentation](./api/API_REFERENCE.md)**
2. Check **[REST API Reference](./api/REST.md)**
3. See **[Agent Integration Guide](./guides/AGENT_INTEGRATION.md)** for MCP usage
4. See **[Troubleshooting Guide](./guides/TROUBLESHOOTING.md)** for common issues

### For Operations
1. Review **[Deployment Guide](./guides/DEPLOYMENT.md)** for production setup
2. Check **[Performance Tuning Guide](./guides/PERFORMANCE_TUNING.md)** for optimization
3. Follow **[Monitoring Setup](./deployment/MONITORING.md)** for observability
4. Use **[Troubleshooting Guide](./guides/TROUBLESHOOTING.md)** for issue resolution

## 🤝 Community & Support

- **GitHub**: [github.com/your-org/mcp-kanban](https://github.com/your-org/mcp-kanban)
- **Discord**: [Join our community](https://discord.gg/mcp-kanban)
- **Email**: support@mcp-kanban.com
- **Status**: [status.mcp-kanban.com](https://status.mcp-kanban.com)

## 📄 License & Legal

- [License](../LICENSE) - MIT License
- [Security Policy](../SECURITY.md) - Security guidelines
- [Code of Conduct](../CODE_OF_CONDUCT.md) - Community standards

---

*This documentation is actively maintained. For the latest updates, visit our [GitHub repository](https://github.com/your-org/mcp-kanban).*