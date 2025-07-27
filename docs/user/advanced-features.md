# Advanced Features User Guide

This guide covers the advanced features of the MCP Kanban system that help you manage complex projects and track performance.

## Table of Contents

1. [Subtasks](#subtasks)
2. [Task Dependencies](#task-dependencies)
3. [Task Templates](#task-templates)
4. [Analytics & Reporting](#analytics--reporting)
5. [Performance Monitoring](#performance-monitoring)
6. [Git Integration](#git-integration)
7. [Real-time Collaboration](#real-time-collaboration)

## Subtasks

Subtasks help you break down complex tasks into smaller, manageable pieces while tracking overall progress.

### Creating Subtasks

#### Via CLI
```bash
# Create a subtask for an existing task
kanban task create --parent TASK_ID --title "Implement user authentication"

# Create multiple subtasks from a template
kanban task create --parent TASK_ID --template subtask-checklist
```

#### Via API
```bash
curl -X POST "http://localhost:3000/api/tasks/TASK_ID/subtasks" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Write unit tests",
    "description": "Add comprehensive test coverage",
    "priority": 2,
    "assignee": "developer@example.com",
    "due_date": "2024-01-15T09:00:00Z"
  }'
```

### Managing Subtasks

- **Progress Tracking**: Parent task progress updates automatically as subtasks are completed
- **Nested Hierarchy**: Create subtasks within subtasks for complex breakdowns
- **Independent Scheduling**: Each subtask can have its own due date and assignee
- **Status Inheritance**: Subtasks inherit the parent's board and default settings

### Best Practices

1. **Logical Breakdown**: Break tasks into logical, sequential steps
2. **Size Management**: Keep subtasks to 1-4 hours of work each
3. **Clear Ownership**: Assign subtasks to specific team members
4. **Progress Monitoring**: Use subtask completion to track overall progress

## Task Dependencies

Dependencies help you model relationships between tasks and identify critical paths in your projects.

### Types of Dependencies

1. **Blocks**: Task A must be completed before Task B can start
2. **Relates To**: Tasks are related but not blocking
3. **Duplicates**: Tasks represent the same work

### Creating Dependencies

#### Via CLI
```bash
# Add a blocking dependency
kanban deps add TASK_A_ID TASK_B_ID --type blocks

# View dependencies for a task
kanban deps list TASK_ID

# Analyze critical path
kanban deps critical-path --board BOARD_ID

# Visualize dependencies
kanban deps graph --board BOARD_ID --output deps.dot
```

#### Via API
```bash
curl -X POST "http://localhost:3000/api/tasks/TASK_ID/dependencies" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dependsOnTaskId": "OTHER_TASK_ID",
    "dependencyType": "blocks"
  }'
```

### Dependency Analysis

The system provides powerful analysis tools:

- **Critical Path**: Identifies the longest chain of dependent tasks
- **Impact Analysis**: Shows which tasks would be affected if a task is delayed
- **Cycle Detection**: Prevents circular dependencies that would create deadlocks
- **Bottleneck Identification**: Highlights tasks that block the most other work

### Dependency Visualization

Generate visual representations of your project dependencies:

```bash
# ASCII art dependency graph
kanban deps graph --format ascii

# DOT format for Graphviz
kanban deps graph --format dot --output project-deps.dot

# Generate SVG image
dot -Tsvg project-deps.dot -o project-deps.svg
```

## Task Templates

Templates help you standardize task creation and ensure consistency across projects.

### System Templates

Built-in templates for common task types:

- **Bug Report**: Structured bug reporting with reproduction steps
- **Feature Request**: Feature specification with acceptance criteria  
- **Meeting**: Meeting planning with agenda and follow-ups
- **Code Review**: Code review checklist with quality gates
- **Research**: Research task with goals and deliverables

### Using Templates

#### Via CLI
```bash
# List available templates
kanban templates list

# Create task from template
kanban task create --template bug-report --title "Login button not working"

# View template details
kanban templates show bug-report
```

#### Via API
```bash
# Get all templates
curl "http://localhost:3000/api/templates" \
  -H "Authorization: Bearer YOUR_API_KEY"

# Create task from template
curl -X POST "http://localhost:3000/api/tasks" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "bug-report",
    "title": "Login form validation issue",
    "board_id": "BOARD_ID",
    "variables": {
      "severity": "high",
      "browser": "Chrome 120"
    }
  }'
```

### Creating Custom Templates

Create your own templates for recurring task types:

```bash
# Create a custom template
kanban templates create \
  --name "Database Migration" \
  --category maintenance \
  --title-template "Migration: {{title}}" \
  --description-template "## Migration Steps\n1. Backup database\n2. {{description}}\n3. Test migration\n4. Deploy to production" \
  --default-tags "database,migration" \
  --estimated-hours 4
```

### Template Variables

Templates support variable substitution:

- `{{title}}` - Task title
- `{{description}}` - Task description  
- `{{assignee}}` - Assignee name
- `{{priority}}` - Priority level
- Custom variables passed during task creation

## Analytics & Reporting

Comprehensive analytics help you understand team performance and project progress.

### Completion Analytics

Track task completion patterns and team productivity:

#### Via CLI
```bash
# View completion analytics for a board
kanban analytics completion --board BOARD_ID

# Filter by timeframe
kanban analytics completion --timeframe 30  # Last 30 days

# Export analytics
kanban analytics completion --export csv --output completion-report.csv
```

#### Key Metrics

- **Completion Rate**: Percentage of tasks completed
- **Average Completion Time**: Time from creation to completion
- **Top Performers**: Team members with highest completion rates
- **Peak Productivity**: Best performing days and hours
- **Trend Analysis**: Historical completion trends

### Velocity Tracking

Monitor team velocity and sprint performance:

```bash
# Current sprint velocity
kanban analytics velocity --current

# Historical velocity trends
kanban analytics velocity --history 6  # Last 6 sprints

# Team velocity breakdown
kanban analytics velocity --by-assignee
```

#### Velocity Metrics

- **Sprint Velocity**: Points completed per sprint
- **Velocity Trends**: Increasing, decreasing, or stable
- **Team Velocity**: Individual contributor velocities
- **Burndown Charts**: Sprint progress visualization
- **Predictive Analytics**: Completion date estimates

### Productivity Insights

Identify bottlenecks and optimization opportunities:

- **Peak Hours**: Most productive times of day
- **Bottleneck Analysis**: Tasks and assignees causing delays
- **Workflow Efficiency**: Average time in each status
- **Priority Effectiveness**: How well priorities predict completion order

### Analytics Dashboard

Access comprehensive analytics through the web dashboard:

```bash
# Open analytics dashboard
kanban dashboard --analytics

# Or access via API
curl "http://localhost:3000/api/analytics/dashboard" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Performance Monitoring

Monitor system health and performance to ensure optimal operation.

### System Health

Real-time system health monitoring:

#### Via CLI
```bash
# Check system health
kanban health

# Detailed health report
kanban health --detailed

# Monitor continuously
kanban health --watch
```

#### Health Metrics

- **Response Times**: API endpoint performance
- **Error Rates**: Success/failure ratios
- **Memory Usage**: System memory consumption
- **Database Performance**: Query execution times
- **WebSocket Connections**: Real-time connection health

### Performance Dashboard

Access detailed performance metrics:

```bash
# Open performance dashboard
kanban dashboard --performance

# Or via web interface
open http://localhost:3000/performance
```

### Performance Alerts

Set up alerts for performance issues:

```bash
# Create response time alert
kanban alerts create \
  --name "High Response Time" \
  --metric responseTime \
  --threshold 2000 \
  --severity warning

# List active alerts
kanban alerts list

# Delete alert
kanban alerts delete ALERT_ID
```

### Metrics Export

Export metrics for external monitoring systems:

```bash
# Export in Prometheus format
curl "http://localhost:3000/api/performance/export?format=prometheus"

# Export in JSON format
curl "http://localhost:3000/api/performance/export?format=json"
```

## Git Integration

Seamlessly integrate with Git repositories for context-aware task management.

### Repository Setup

Connect your Kanban board to a Git repository:

```bash
# Initialize git integration
kanban init --git

# Configure branch mapping
kanban config set board-mapping "feature/*" "Development Board"
kanban config set board-mapping "hotfix/*" "Hotfix Board"
kanban config set board-mapping "main" "Production Board"
```

### Branch-based Context

The system automatically detects your current Git context:

- **Auto Board Selection**: Automatically selects the appropriate board based on your current branch
- **Context-aware Tasks**: Task creation includes git context (branch, commit info)
- **Smart Defaults**: Task titles and descriptions can include branch information

### Git Workflow Integration

```bash
# Create task for current branch
kanban task create --from-branch

# Link existing task to branch
kanban task link TASK_ID --branch feature/user-auth

# List tasks for current branch
kanban task list --current-branch
```

## Real-time Collaboration

WebSocket-powered real-time updates keep teams synchronized.

### Real-time Features

- **Live Updates**: See changes as they happen across all connected clients
- **User Presence**: Know who's currently viewing or editing tasks
- **Typing Indicators**: See when team members are composing updates
- **Conflict Resolution**: Automatic handling of concurrent edits

### WebSocket Events

The system broadcasts various events in real-time:

- Task creation, updates, and deletions
- Subtask progress changes
- Dependency additions and removals
- Priority and status changes
- User presence and activity

### Configuring Real-time Updates

```bash
# Configure WebSocket connection
kanban config set websocket.enabled true
kanban config set websocket.reconnect true
kanban config set websocket.timeout 30000

# Filter events by type
kanban config set websocket.events "task:created,task:updated,subtask:completed"
```

## Best Practices

### Project Organization

1. **Hierarchical Structure**: Use subtasks to break down complex work
2. **Clear Dependencies**: Model task relationships explicitly
3. **Consistent Templates**: Standardize task creation with templates
4. **Regular Review**: Use analytics to identify improvement opportunities

### Team Collaboration

1. **Real-time Updates**: Keep WebSocket connections enabled for live collaboration
2. **Clear Ownership**: Assign tasks and subtasks to specific team members
3. **Progress Tracking**: Monitor subtask completion for project visibility
4. **Context Sharing**: Use git integration to maintain context across tools

### Performance Optimization

1. **Monitor Health**: Regularly check system health metrics
2. **Set Alerts**: Configure alerts for critical performance thresholds
3. **Review Analytics**: Use completion analytics to optimize workflows
4. **Optimize Queries**: Monitor slow queries and optimize database performance

## Troubleshooting

### Common Issues

#### Subtasks Not Updating Progress
- Verify parent task ID is correct
- Check that subtasks have proper status values
- Ensure WebSocket connection is active for real-time updates

#### Dependencies Creating Cycles
- Use `kanban deps critical-path` to identify dependency chains
- Remove dependencies that create circular references
- Consider breaking large tasks into smaller, independent pieces

#### Templates Not Loading
- Verify template ID or name is correct
- Check that template is active (`is_active: true`)
- Ensure you have permission to use the template

#### Analytics Not Showing Data
- Verify date ranges include relevant task activity
- Check that tasks have completion dates set
- Ensure board ID is correct if filtering by board

#### Performance Issues
- Check system health with `kanban health --detailed`
- Review slow queries in performance dashboard
- Monitor memory usage and WebSocket connection counts
- Consider increasing database connection pool size

### Getting Help

- Check the [API documentation](../api/API_REFERENCE.md) for detailed endpoint information
- Review [troubleshooting guide](troubleshooting.md) for common solutions
- Join our community forums for support and best practices
- Submit bug reports with system health information and error logs 