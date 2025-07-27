# task-kanban-mcp

A headless kanban task management system built specifically for AI coding agents to maintain project context and coordinate work, freeing up their limited context windows for actual coding tasks.

## 🤖 Agent-First Philosophy

This system recognizes that modern software development is increasingly done by AI agents (Claude Code, Cursor, Aider, etc.) supervised by humans. Unlike traditional developer tools, task-kanban-mcp is designed from the ground up for agents that:

- Have limited context windows (100k-200k tokens)
- Need to focus on the current coding task without tracking project state
- Work best with clear, structured task definitions
- Can operate independently when given proper task isolation

## 🎯 Core Purpose

**Free up agent context windows** by externalizing project management, allowing agents to use their full capacity for:
- Understanding complex codebases
- Implementing sophisticated features
- Maintaining code quality
- Following architectural patterns

Instead of wasting tokens on "remember to implement X after Y" or "the previous task was about Z", agents can query the task system when needed and focus entirely on the current implementation.

## 🏗️ Architecture for Agent Workflows

```
┌─────────────────────┐     ┌─────────────────────┐
│  AI Coding Agent 1  │     │  AI Coding Agent 2  │
│   (Claude Code)     │     │     (Cursor)        │
└──────────┬──────────┘     └──────────┬──────────┘
           │                            │
           └─────────┬──────────────────┘
                     │
              ┌──────▼──────┐
              │  MCP Server  │
              │(Task State)  │
              └──────┬──────┘
                     │
           ┌─────────┴─────────┐
           │                   │
    ┌──────▼──────┐    ┌──────▼──────┐
    │   Human     │    │   Human      │
    │ Supervisor  │    │ Supervisor   │
    │   (CLI)     │    │   (CLI)      │
    └─────────────┘    └──────────────┘
```

## 🚀 Key Features for Agent Productivity

### Context Window Optimization
- **Stateless Task Execution**: Agents don't need to remember previous tasks
- **On-Demand Context Loading**: Query only the information needed for current work
- **Task Isolation**: Each task contains all necessary context for completion

### Multi-Agent Coordination
- **Exclusive Task Locking**: Prevents agents from working on conflicting code
- **Dependency Awareness**: Agents automatically wait for blocked tasks
- **Work Distribution**: Intelligently assigns tasks based on agent availability

### Agent-Optimized Task Structure
```json
{
  "task": {
    "id": 42,
    "title": "Implement user authentication",
    "context": {
      "files_to_modify": ["src/auth.js", "src/routes/user.js"],
      "dependencies": ["database-schema-task-41"],
      "acceptance_criteria": [
        "JWT tokens with 24h expiration",
        "Refresh token mechanism",
        "Rate limiting on login endpoint"
      ],
      "technical_notes": "Use bcrypt for password hashing",
      "reference_implementations": ["task-23", "task-31"]
    }
  }
}
```

## 📋 Installation

### For AI Agents (MCP Protocol)

Agents using MCP (like Claude Code) can directly connect:

```json
// .mcp/config.json
{
  "servers": {
    "task-kanban": {
      "url": "http://localhost:3000/mcp",
      "apiKey": "your-agent-api-key"
    }
  }
}
```

### For Human Supervisors (CLI)

```bash
# Install CLI globally
npm install -g @task-kanban-mcp/cli

# Configure connection
kanban config set api-url http://localhost:3000
kanban config set api-key your-supervisor-key

# Monitor agent progress
kanban watch --board main
```

## 🎮 Agent-Centric Commands

### For Agents (MCP Tools)

```javascript
// Get next task with full context
{
  "tool": "get_next_task",
  "parameters": {
    "capabilities": ["javascript", "react", "testing"],
    "exclude_files": ["src/legacy/*"]  // Files already in context
  }
}

// Report task completion
{
  "tool": "complete_task",
  "parameters": {
    "task_id": 42,
    "implementation_notes": "Added middleware for token validation",
    "files_modified": ["src/auth.js", "src/middleware/auth.js"],
    "tests_added": ["test/auth.test.js"]
  }
}

// Check dependencies before starting
{
  "tool": "check_task_dependencies",
  "parameters": {
    "task_id": 43
  }
}
```

### For Human Supervisors (CLI)

```bash
# Create tasks for agents
kanban task create "Refactor payment module" \
  --context-files "src/payments/*" \
  --depends-on 41 \
  --assign-to-agent claude-code

# Monitor agent activity
kanban agents status
kanban agent logs claude-code --follow

# Review completed work
kanban task review 42 --show-diff

# Coordinate multiple agents
kanban orchestrate --agents claude-code,cursor \
  --strategy parallel \
  --board sprint-15
```

## 🔄 Workflow Examples

### Single Agent Deep Work

```bash
# Human creates focused task batch
kanban batch create authentication-sprint \
  --tasks auth.yaml \
  --agent claude-code \
  --strategy sequential

# Agent works through tasks autonomously
# Each task query returns complete context
# No need to maintain state between tasks
```

### Multi-Agent Parallel Development

```bash
# Human defines work boundaries
kanban boundary create \
  --agent-1 claude-code --scope "backend/*" \
  --agent-2 cursor --scope "frontend/*" \
  --coordination-point "api-contracts"

# Agents work independently
# System prevents conflicts
# Automatic synchronization at coordination points
```

### Context-Aware Task Generation

```yaml
# tasks.yaml - Human-defined high-level tasks
- title: "Implement OAuth2 flow"
  agent_context:
    pattern: "server-side-flow"
    reference_docs: ["RFC-6749"]
    security_requirements: ["PKCE", "state-parameter"]
  decomposition: auto  # Let system break this down
```

## 🧠 Advanced Features

### Semantic Task Routing (Coming Soon)
- Vector embeddings for task similarity
- Automatic task assignment based on agent history
- Pattern learning from completed tasks

### Context Window Analytics
```bash
# Monitor agent context usage
kanban agent stats claude-code --metric context-efficiency

# Optimize task sizing
kanban analyze tasks --suggest-split --max-context 50000
```

### Agent Performance Insights
- Track completion time by task type
- Identify optimal task sizes for each agent
- Suggest task batching strategies

## 🔧 Configuration

### Agent-Specific Settings

```env
# Agent Configuration
MAX_CONTEXT_PER_TASK=50000  # Tokens
AGENT_TIMEOUT_MINUTES=30
PARALLEL_AGENT_LIMIT=3

# Task Chunking
AUTO_DECOMPOSE_THRESHOLD=100000  # Auto-split large tasks
OVERLAP_PREVENTION=true
CONFLICT_RESOLUTION=queue  # or 'reject'

# Context Optimization
INCLUDE_RELATED_TASKS=true
MAX_RELATED_CONTEXT=10000
COMPRESS_HISTORICAL_CONTEXT=true
```

### Multi-Agent Coordination

```json
{
  "coordination": {
    "lock_timeout": "15m",
    "heartbeat_interval": "1m",
    "conflict_strategy": "queue",
    "boundary_enforcement": "strict"
  }
}
```

## 📊 Observability for Supervisors

### Real-Time Dashboard
```bash
# Launch monitoring interface
kanban dashboard

# Shows:
# - Active agents and current tasks
# - Context window utilization
# - Task completion velocity
# - Dependency graph visualization
```

### Agent Behavior Logs
```bash
# Detailed agent decision tracking
kanban agent trace claude-code --verbose

# Context usage analysis
kanban analyze context-usage --by-task-type
```

## 🚦 Best Practices

### For Human Supervisors

1. **Task Sizing**: Keep tasks under 50k tokens of required context
2. **Clear Boundaries**: Define explicit file/module boundaries for parallel work
3. **Dependency Chains**: Keep chains shallow to maximize parallelism
4. **Context Hints**: Include examples and patterns in task context

### For Agent Implementers

1. **Stateless Execution**: Don't assume memory between tasks
2. **Context Queries**: Request only needed information
3. **Progress Updates**: Report progress for long-running tasks
4. **Graceful Handling**: Check dependencies before starting

## 🔮 Roadmap

### Phase 1: Enhanced Agent Coordination (Current)
- ✅ Basic MCP integration
- ✅ Task isolation and locking
- 🚧 Multi-agent orchestration
- 🚧 Context window optimization

### Phase 2: Intelligent Task Management
- Vector embeddings for semantic search
- Pattern learning from completions
- Automatic task decomposition
- Predictive task assignment

### Phase 3: Agent Ecosystem
- Plugin system for different agent types
- Cross-agent knowledge sharing
- Automated code review workflows
- Performance optimization recommendations

## 🤝 Contributing

We welcome contributions that enhance agent productivity:

1. Fork the repository
2. Create a feature branch (`git checkout -b agent-feature/amazing-enhancement`)
3. Ensure changes maintain agent-first philosophy
4. Add tests for agent interactions
5. Submit a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Agent Integration Guide**: [docs/agent-integration.md](docs/agent-integration.md)
- **Discussions**: [GitHub Discussions](https://github.com/AdamManuel-dev/task-kanban-mcp/discussions)
- **Issues**: [GitHub Issues](https://github.com/AdamManuel-dev/task-kanban-mcp/issues)

---

Built for the future of software development where AI agents do the coding and humans do the thinking.