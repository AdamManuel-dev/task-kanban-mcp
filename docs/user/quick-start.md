# Quick Start Tutorial

Get up and running with MCP Kanban in 5 minutes! This tutorial will guide you through the essential setup and basic usage.

## 🚀 5-Minute Setup

### Step 1: Install the CLI (1 minute)

```bash
# Install the CLI globally
npm install -g @task-kanban-mcp/cli

# Verify installation
kanban --version
```

### Step 2: Start the Server (2 minutes)

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-kanban.git
cd mcp-kanban

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
```

Edit `.env` with your settings:
```bash
# Essential settings
PORT=3000
API_KEY_SECRET=your-secret-key-at-least-16-characters-long
API_KEYS=your-api-key-1,your-api-key-2

# Start the server
npm run dev
```

### Step 3: Configure CLI (1 minute)

```bash
# Configure CLI connection
kanban config set api-url http://localhost:3000
kanban config set api-key your-api-key-1

# Test connection
kanban config test
```

### Step 4: Create Your First Board (1 minute)

```bash
# Create a board
kanban board create "My Project"

# Create your first task
kanban task create "Set up development environment" --priority high

# List tasks
kanban task list
```

## 🎯 Basic Usage

### Creating and Managing Tasks

```bash
# Create a task with description
kanban task create "Implement user authentication" \
  --description "Add JWT-based authentication to the API" \
  --priority high

# Create a task with tags
kanban task create "Add user management" \
  --tags "backend,api,security" \
  --priority medium

# Update task status
kanban task update 1 --status "in-progress"

# Move task to different column
kanban task move 1 --column "review"
```

### Working with Boards

```bash
# List all boards
kanban board list

# Show board details
kanban board show "My Project"

# Switch to a different board
kanban board use "My Project"

# Create board with custom columns
kanban board create "Sprint 15" \
  --columns "backlog,todo,in-progress,review,done" \
  --default-column "todo"
```

### Using Tags and Notes

```bash
# Create tags
kanban tag create "backend"
kanban tag create "frontend"
kanban tag create "bug"

# Add tags to tasks
kanban tag add 1 backend
kanban tag add 2 frontend

# Create notes
kanban note add "API design decision" \
  --content "Use JWT tokens with 24h expiration" \
  --category "technical"

# Search notes
kanban note search "JWT"
```

## 🤖 AI Agent Integration

### Set Up MCP for AI Assistants

Create `.mcp/config.json` in your project:

```json
{
  "servers": {
    "kanban": {
      "command": "mcp-kanban",
      "args": ["--api-key", "your-api-key-2"],
      "env": {
        "MCP_KANBAN_URL": "http://localhost:3000"
      }
    }
  }
}
```

### AI Agent Workflow

```javascript
// AI agent gets next task
{
  "tool": "get_next_task",
  "parameters": {
    "capabilities": ["javascript", "react", "api"]
  }
}

// AI agent reports completion
{
  "tool": "complete_task",
  "parameters": {
    "task_id": 1,
    "implementation_notes": "JWT authentication implemented successfully"
  }
}
```

## 📊 Monitoring and Dashboard

### Real-time Monitoring

```bash
# Launch interactive dashboard
kanban dashboard

# Watch board changes in real-time
kanban watch --board "My Project"

# Monitor specific tasks
kanban watch --tasks 1,2,3
```

### Task Management

```bash
# Get next suggested task
kanban next

# View task dependencies
kanban task deps 1

# Create subtasks
kanban subtask create 1 "Design database schema"
kanban subtask create 1 "Create API endpoints"

# Set task dependencies
kanban task depend 3 2  # Task 3 depends on task 2
```

## 🔄 Complete Workflow Example

Here's a complete workflow from setup to task completion:

### 1. Project Setup

```bash
# Create project board
kanban board create "Feature Sprint"

# Create high-level tasks
kanban task create "Design system architecture" --priority high
kanban task create "Implement authentication" --priority high
kanban task create "Add user management" --priority medium
kanban task create "Write documentation" --priority low
```

### 2. Task Organization

```bash
# Add tags for organization
kanban tag create "design"
kanban tag create "implementation"
kanban tag create "documentation"

# Tag tasks appropriately
kanban tag add 1 design
kanban tag add 2 implementation
kanban tag add 3 implementation
kanban tag add 4 documentation
```

### 3. Work Execution

```bash
# Start working on first task
kanban task update 1 --status "in-progress"

# Add progress notes
kanban note add "Architecture decision" \
  --content "Using microservices pattern with API gateway" \
  --category "design"

# Complete the task
kanban task update 1 --status "done" \
  --notes "System architecture designed and documented"
```

### 4. Monitoring Progress

```bash
# View project overview
kanban dashboard --board "Feature Sprint"

# Check task status
kanban task list --status "in-progress"

# Get next priority task
kanban next
```

## 🎮 Advanced Features

### Task Dependencies

```bash
# Create dependent tasks
kanban task create "Design database schema" --priority high
kanban task create "Implement database layer" --priority high
kanban task create "Add data validation" --priority medium

# Set dependencies
kanban task depend 2 1  # Database layer depends on schema
kanban task depend 3 2  # Validation depends on database layer

# Check dependency status
kanban task deps 3
```

### Context and Search

```bash
# Get project context
kanban context

# Search for related tasks
kanban context search "authentication"

# Get task-specific context
kanban context task 1
```

### Backup and Data Management

```bash
# Create backup
kanban backup create

# Export board data
kanban export --board "Feature Sprint" --format json

# Import tasks from file
kanban import --file tasks.yaml --board "Feature Sprint"
```

## 🚦 Best Practices

### Task Creation

1. **Clear Titles**: Use descriptive, action-oriented titles
2. **Rich Descriptions**: Include acceptance criteria and technical details
3. **Proper Prioritization**: Use high/medium/low priority appropriately
4. **Tagging**: Use tags for categorization and filtering

### Workflow Management

1. **Regular Updates**: Update task status as you work
2. **Progress Notes**: Add notes for important decisions and progress
3. **Dependency Management**: Set up dependencies to prevent conflicts
4. **Regular Reviews**: Use the dashboard to monitor progress

### AI Agent Coordination

1. **Clear Boundaries**: Define what each agent should work on
2. **Context Sharing**: Use notes to share context between agents
3. **Progress Tracking**: Monitor agent progress through the dashboard
4. **Conflict Prevention**: Use dependencies to prevent overlapping work

## 🆘 Getting Help

### Quick Commands

```bash
# Get help
kanban --help

# Command-specific help
kanban task --help
kanban task create --help

# List all commands
kanban --help-all
```

### Common Issues

```bash
# Test connection
kanban config test

# Check server status
kanban health

# View logs
kanban logs --level debug
```

### Next Steps

1. **Explore the CLI**: Try different commands and options
2. **Set up MCP**: Configure AI agent integration
3. **Create workflows**: Build your own task management processes
4. **Read documentation**: Dive deeper into specific features

## 📚 What's Next?

After completing this tutorial:

1. **Read the CLI Usage Guide**: Master all CLI commands
2. **Set up MCP Integration**: Configure AI agent workflows
3. **Explore Advanced Features**: Learn about backup, monitoring, and automation
4. **Customize Your Workflow**: Adapt the system to your specific needs

---

**Ready to dive deeper?** Check out the [CLI Usage Guide](./cli-usage.md) for comprehensive command reference, or the [MCP Integration Guide](./mcp-integration.md) for AI agent setup. 