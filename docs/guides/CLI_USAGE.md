# CLI Usage Guide

The MCP Kanban Server provides a powerful command-line interface for managing tasks, boards, and coordinating with AI agents. This guide covers all CLI commands, options, and workflows.

## 🚀 Quick Start

### Basic Commands

```bash
# Get help
kanban --help

# Check version
kanban --version

# Test connection
kanban config test

# Create your first board
kanban board create "My Project"

# Create your first task
kanban task create "Set up development environment" --priority high

# List tasks
kanban task list
```

## Installation

### Global Installation

```bash
npm install -g @task-kanban-mcp/cli
```

### Local Development

```bash
# Clone the repository
git clone https://github.com/AdamManuel-dev/task-kanban-mcp.git
cd task-kanban-mcp

# Install dependencies
npm install

# Build CLI
npm run build:cli

# Use local CLI
./dist/cli/index.js --help
```

## Configuration

### Initial Setup

```bash
# Configure API connection
kanban config set api-url http://localhost:3000
kanban config set api-key your-supervisor-key

# Verify connection
kanban config test
```

### Configuration Options

```bash
# View current configuration
kanban config list

# Set configuration values
kanban config set <key> <value>

# Available configuration keys:
# - api-url: Server URL (default: http://localhost:3000)
# - api-key: Authentication key
# - default-board: Default board for commands
# - output-format: json, table, or yaml
# - color: Enable/disable colored output
```

## Board Management

### Creating Boards

```bash
# Create a new board
kanban board create "Sprint 15" --description "Q4 feature development"

# Create board with custom settings
kanban board create "Backend API" \
  --description "API development tasks" \
  --columns "todo,in-progress,review,done" \
  --default-column "todo"
```

### Managing Boards

```bash
# List all boards
kanban board list

# Show board details
kanban board show "Sprint 15"

# Update board
kanban board update "Sprint 15" --description "Updated description"

# Delete board
kanban board delete "Sprint 15" --force
```

### Board Operations

```bash
# Export board data
kanban board export "Sprint 15" --format json --output sprint15.json

# Import board data
kanban board import --file sprint15.json

# Archive board
kanban board archive "Sprint 15"
```

## Task Management

### Creating Tasks

```bash
# Create a simple task
kanban task create "Implement user authentication"

# Create task with full context
kanban task create "Add JWT authentication" \
  --description "Implement JWT-based authentication for the API" \
  --priority high \
  --board "Sprint 15" \
  --column "todo" \
  --context-files "src/auth.js,src/routes/user.js" \
  --acceptance-criteria "JWT tokens with 24h expiration,Refresh token mechanism" \
  --technical-notes "Use bcrypt for password hashing"

# Create task with dependencies
kanban task create "Implement refresh tokens" \
  --depends-on 42 \
  --assign-to-agent claude-code
```

### Task Operations

```bash
# List tasks
kanban task list --board "Sprint 15"

# Show task details
kanban task show 42

# Update task
kanban task update 42 --priority high --status "in-progress"

# Move task
kanban task move 42 --column "review"

# Delete task
kanban task delete 42 --force
```

### Task Filtering and Search

```bash
# Filter by status
kanban task list --status "in-progress"

# Filter by priority
kanban task list --priority "high"

# Search tasks
kanban task search "authentication"

# Filter by agent
kanban task list --assigned-to claude-code

# Filter by tags
kanban task list --tags "backend,api"
```

## Agent Management

### Agent Status

```bash
# List all agents
kanban agent list

# Show agent status
kanban agent status claude-code

# Show agent activity
kanban agent activity claude-code --hours 24
```

### Agent Coordination

```bash
# Assign task to agent
kanban task assign 42 --agent claude-code

# Unassign task
kanban task unassign 42

# Set agent boundaries
kanban agent boundary set claude-code \
  --scope "backend/*" \
  --exclude "src/legacy/*"

# Monitor agent conflicts
kanban agent conflicts --board "Sprint 15"
```

### Agent Logs

```bash
# View agent logs
kanban agent logs claude-code

# Follow logs in real-time
kanban agent logs claude-code --follow

# Filter logs by time
kanban agent logs claude-code --since "2 hours ago"

# Export logs
kanban agent logs claude-code --output claude-logs.json
```

## Context Management

### Project Context

```bash
# Get project context
kanban context get --files "src/**/*.js"

# Search related tasks
kanban context search "authentication" --max-results 5

# Get dependency context
kanban context dependencies 43 --include-notes
```

### Context Optimization

```bash
# Analyze context usage
kanban context analyze --agent claude-code

# Optimize task context
kanban context optimize 42 --max-size 30000

# Split large context
kanban context split 42 --max-chunk-size 20000
```

## Real-time Monitoring

### Dashboard

```bash
# Launch interactive dashboard
kanban dashboard

# Dashboard with specific board
kanban dashboard --board "Sprint 15"

# Dashboard with filters
kanban dashboard --agents claude-code,cursor --status "in-progress"
```

### Watch Mode

```bash
# Watch board changes
kanban watch --board "Sprint 15"

# Watch specific tasks
kanban watch --tasks 42,43,44

# Watch with notifications
kanban watch --board "Sprint 15" --notify
```

### Real-time Updates

```bash
# Subscribe to task updates
kanban subscribe --board "Sprint 15" --events "task.created,task.updated"

# Subscribe to agent activity
kanban subscribe --agents claude-code --events "agent.started,agent.completed"
```

## Data Management

### Backup and Restore

```bash
# Create backup
kanban backup create --output backup-$(date +%Y%m%d).json

# Restore from backup
kanban backup restore --file backup-20241201.json

# List backups
kanban backup list

# Delete old backups
kanban backup cleanup --older-than 30d
```

### Export and Import

```bash
# Export board data
kanban export --board "Sprint 15" --format json

# Export specific tasks
kanban export --tasks 42,43,44 --format csv

# Import tasks from file
kanban import --file tasks.yaml --board "Sprint 15"
```

### Data Validation

```bash
# Validate database integrity
kanban validate --check-integrity

# Validate task dependencies
kanban validate --check-dependencies

# Fix common issues
kanban validate --fix
```

## Advanced Features

### Batch Operations

```bash
# Create multiple tasks
kanban batch create --file tasks.yaml

# Update multiple tasks
kanban batch update --filter "priority:low" --set "priority:medium"

# Move multiple tasks
kanban batch move --filter "status:todo" --column "in-progress"
```

### Task Orchestration

```bash
# Orchestrate multiple agents
kanban orchestrate \
  --agents claude-code,cursor \
  --strategy parallel \
  --board "Sprint 15"

# Set coordination points
kanban orchestrate \
  --coordination-point "api-contracts" \
  --strategy sequential
```

### Performance Monitoring

```bash
# Monitor system performance
kanban monitor --metrics cpu,memory,disk

# Monitor agent performance
kanban monitor --agents claude-code --metrics completion-time,context-usage

# Generate performance report
kanban monitor --report --output performance-report.json
```

## Output Formats

### JSON Output

```bash
kanban task list --format json
```

### Table Output

```bash
kanban task list --format table
```

### YAML Output

```bash
kanban task list --format yaml
```

### Custom Formatting

```bash
# Custom template
kanban task list --template "{{.ID}}: {{.Title}} ({{.Status}})"

# Filtered output
kanban task list --fields "id,title,status,priority"
```

## Scripting and Automation

### Shell Integration

```bash
# Use in shell scripts
TASK_ID=$(kanban task create "Deploy to production" --format json | jq -r '.id')
kanban task assign $TASK_ID --agent claude-code
```

### API Integration

```bash
# Get API token
kanban config get api-key

# Use with curl
curl -H "Authorization: Bearer $(kanban config get api-key)" \
  http://localhost:3000/api/tasks
```

### Cron Jobs

```bash
# Daily backup
0 2 * * * kanban backup create --output /backups/kanban-$(date +\%Y\%m\%d).json

# Cleanup old backups
0 3 * * 0 kanban backup cleanup --older-than 30d
```

## Troubleshooting

### Common Issues

```bash
# Test connection
kanban config test

# Check server status
kanban health

# View logs
kanban logs --level debug

# Reset configuration
kanban config reset
```

### Debug Mode

```bash
# Enable debug output
kanban --debug task list

# Verbose logging
kanban --verbose agent status claude-code

# Trace API calls
kanban --trace task create "Test task"
```

## Examples

### Complete Workflow

```bash
# 1. Setup
kanban config set api-url http://localhost:3000
kanban config set api-key your-key

# 2. Create board
kanban board create "Feature Sprint" --description "New feature development"

# 3. Create tasks
kanban task create "Setup authentication" \
  --board "Feature Sprint" \
  --priority high \
  --context-files "src/auth.js"

kanban task create "Implement API endpoints" \
  --board "Feature Sprint" \
  --depends-on 1 \
  --context-files "src/api.js"

# 4. Assign to agents
kanban task assign 1 --agent claude-code
kanban task assign 2 --agent cursor

# 5. Monitor progress
kanban dashboard --board "Feature Sprint"

# 6. Review and complete
kanban task review 1 --show-diff
kanban task complete 1 --notes "Authentication implemented successfully"
```

### Agent Coordination

```bash
# Set up agent boundaries
kanban agent boundary set claude-code --scope "backend/*"
kanban agent boundary set cursor --scope "frontend/*"

# Create coordination task
kanban task create "API contract review" \
  --board "Feature Sprint" \
  --coordination-point true

# Orchestrate work
kanban orchestrate \
  --agents claude-code,cursor \
  --strategy parallel \
  --coordination-point "API contract review"
```

## Help and Support

```bash
# General help
kanban --help

# Command-specific help
kanban task --help
kanban task create --help

# List all commands
kanban --help-all

# Version information
kanban --version
```

For more information, see:
- [API Documentation](../API.md)
- [Agent Integration Guide](./AGENT_INTEGRATION.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md) 