# MCP (Model Context Protocol) API Documentation

## Overview

The MCP Kanban server implements the Model Context Protocol, enabling AI assistants to interact with the kanban system through standardized tools and prompts. This API provides comprehensive task management, board operations, and intelligent planning capabilities.

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Available Tools](#available-tools)
- [Available Prompts](#available-prompts)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

## Installation

### Claude Desktop Configuration

Add the MCP Kanban server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/path/to/mcp-kanban/dist/mcp/index.js"],
      "env": {
        "DATABASE_URL": "sqlite:///path/to/kanban.db",
        "PORT": "3456"
      }
    }
  }
}
```

### Environment Variables

```bash
DATABASE_URL=sqlite:///path/to/kanban.db
PORT=3456
LOG_LEVEL=info
MCP_ENABLED=true
```

## Configuration

### MCP Server Options

```typescript
interface MCPServerOptions {
  port: number;
  databaseUrl: string;
  enableLogging?: boolean;
  maxConnections?: number;
  timeout?: number;
}
```

## Available Tools

### Task Management Tools

#### create_task
Create a new task in a board.

**Parameters:**
```typescript
{
  title: string;              // Required: Task title
  description?: string;       // Task description
  board_id: string;          // Required: Board ID
  column_id?: string;        // Column ID (default: 'todo')
  priority?: number;         // Priority 1-5
  status?: string;           // todo|in_progress|done|blocked|archived
  assignee?: string;         // User ID
  due_date?: string;         // ISO date format
  tags?: string[];           // Array of tag IDs
}
```

**Example:**
```json
{
  "tool": "create_task",
  "arguments": {
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication to the API",
    "board_id": "board-123",
    "priority": 4,
    "status": "todo",
    "due_date": "2024-12-31T23:59:59Z"
  }
}
```

#### update_task
Update an existing task.

**Parameters:**
```typescript
{
  task_id: string;           // Required: Task ID
  title?: string;            // New title
  description?: string;      // New description
  priority?: number;         // Priority 1-5
  status?: string;           // Task status
  assignee?: string;         // User ID
  due_date?: string;         // ISO date format
  progress?: number;         // Progress percentage 0-100
}
```

#### get_task
Get detailed task information.

**Parameters:**
```typescript
{
  task_id: string;                  // Required: Task ID
  include_subtasks?: boolean;       // Include subtasks
  include_dependencies?: boolean;   // Include dependencies
  include_notes?: boolean;          // Include notes
  include_tags?: boolean;           // Include tags
}
```

#### list_tasks
List tasks with filtering options.

**Parameters:**
```typescript
{
  board_id?: string;         // Filter by board
  column_id?: string;        // Filter by column
  status?: string;           // Filter by status
  assignee?: string;         // Filter by assignee
  priority_min?: number;     // Minimum priority
  priority_max?: number;     // Maximum priority
  search?: string;           // Search in title/description
  limit?: number;            // Max results (default: 50)
  offset?: number;           // Pagination offset
  sort_by?: string;          // Sort field
  sort_order?: string;       // asc|desc
}
```

#### search_tasks
Full-text search across tasks.

**Parameters:**
```typescript
{
  query: string;             // Required: Search query
  board_id?: string;         // Filter by board
  column_id?: string;        // Filter by column
  status?: string;           // Filter by status
  assignee?: string;         // Filter by assignee
  tags?: string[];           // Filter by tags
  limit?: number;            // Max results (default: 20)
  offset?: number;           // Pagination offset
}
```

#### delete_task
Delete a task by ID.

**Parameters:**
```typescript
{
  task_id: string;           // Required: Task ID to delete
}
```

### Board Management Tools

#### create_board
Create a new board.

**Parameters:**
```typescript
{
  name: string;              // Required: Board name
  description?: string;      // Board description
  color?: string;            // Hex color code
}
```

#### get_board
Get board details.

**Parameters:**
```typescript
{
  board_id: string;          // Required: Board ID
  include_columns?: boolean; // Include columns
  include_tasks?: boolean;   // Include all tasks
}
```

#### list_boards
List all boards.

**Parameters:**
```typescript
{
  search?: string;           // Search in names/descriptions
  archived?: boolean;        // Filter by archived status
  limit?: number;            // Max results (default: 50)
  offset?: number;           // Pagination offset
}
```

### Note Management Tools

#### add_note
Add a note to a task.

**Parameters:**
```typescript
{
  task_id: string;           // Required: Task ID
  content: string;           // Required: Note content
  category?: string;         // general|progress|blocker|decision|question
  pinned?: boolean;          // Pin the note
}
```

#### search_notes
Search notes with full-text search.

**Parameters:**
```typescript
{
  query: string;             // Required: Search query
  task_id?: string;          // Filter by task
  board_id?: string;         // Filter by board
  category?: string;         // Filter by category
  limit?: number;            // Max results
}
```

### Tag Management Tools

#### create_tag
Create a new tag.

**Parameters:**
```typescript
{
  name: string;              // Required: Tag name
  color?: string;            // Hex color code
  description?: string;      // Tag description
  parent_tag_id?: string;    // Parent tag for hierarchy
}
```

#### assign_tag
Assign tags to a task.

**Parameters:**
```typescript
{
  task_id: string;           // Required: Task ID
  tag_id: string;            // Required: Tag ID
}
```

### AI Context Tools

#### get_project_context
Generate AI context for a project/board.

**Parameters:**
```typescript
{
  board_id: string;          // Required: Board ID
  include_completed?: boolean;
  include_notes?: boolean;
  include_tags?: boolean;
  max_tasks?: number;
  max_notes?: number;
}
```

#### get_task_context
Generate AI context for a specific task.

**Parameters:**
```typescript
{
  task_id: string;           // Required: Task ID
  include_subtasks?: boolean;
  include_dependencies?: boolean;
  include_notes?: boolean;
  include_tags?: boolean;
  include_related?: boolean;
}
```

### Analytics Tools

#### analyze_board
Analyze board performance and provide insights.

**Parameters:**
```typescript
{
  board_id: string;          // Required: Board ID
  timeframe_days?: number;   // Analysis timeframe
  include_recommendations?: boolean;
  include_blockers?: boolean;
  include_metrics?: boolean;
}
```

#### get_blocked_tasks
Get all blocked tasks.

**Parameters:**
```typescript
{
  board_id?: string;         // Filter by board (optional)
}
```

#### get_overdue_tasks
Get all overdue tasks.

**Parameters:**
```typescript
{
  board_id?: string;         // Filter by board (optional)
}
```

## Available Prompts

### Task Planning Prompts

#### task_planning
Help plan and organize tasks with intelligent suggestions.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  planning_horizon?: string; // day|week|sprint|month
  focus_area?: string;       // Specific area to focus on
}
```

#### task_breakdown
Break down complex tasks into manageable subtasks.

**Arguments:**
```typescript
{
  task_description: string;  // Required: Task description
  board_id?: string;         // Board for context
  complexity_level?: string; // Desired complexity
}
```

### Sprint Planning Prompts

#### sprint_planning
Assist with sprint planning and capacity estimation.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  sprint_duration?: string;  // Duration in days
  team_capacity?: string;    // Available capacity
}
```

#### sprint_planning_assistant
Advanced sprint planning with team capacity analysis.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  sprint_duration?: string;  // Duration in days/weeks
  team_capacity?: string;    // Capacity constraints
}
```

### Analysis Prompts

#### analyze_project_status
Analyze project status and provide insights.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  focus_area?: string;       // progress|blockers|team_performance|timeline
}
```

#### blocker_resolution_helper
Analyze blocked tasks and suggest resolutions.

**Arguments:**
```typescript
{
  board_id?: string;         // Board ID
  task_id?: string;          // Specific task ID
}
```

### Reporting Prompts

#### progress_report_generator
Generate comprehensive progress reports.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  timeframe?: string;        // week|month|sprint
  audience?: string;         // team|management|client
}
```

#### retrospective_insights
Generate insights for retrospective meetings.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  timeframe?: string;        // Period to analyze
  focus_areas?: string;      // Areas to focus on
}
```

### Workflow Prompts

#### priority_recommendation
Get task prioritization recommendations.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  criteria?: string;         // deadline|impact|effort|dependencies
}
```

#### workflow_optimization
Analyze workflow and suggest optimizations.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  optimization_goal?: string; // speed|quality|efficiency|collaboration
}
```

### Team Collaboration Prompts

#### standup_preparation
Prepare content for daily standup meetings.

**Arguments:**
```typescript
{
  board_id: string;          // Required: Board ID
  team_member?: string;      // Specific member
  since_date?: string;       // ISO date format
}
```

#### task_estimation_helper
Help estimate effort and timeline for tasks.

**Arguments:**
```typescript
{
  task_description: string;  // Required: Task description
  board_id?: string;         // For historical context
  complexity?: string;       // low|medium|high
}
```

## Usage Examples

### Example 1: Creating and Managing Tasks

```javascript
// Create a new task
const response = await mcp.callTool('create_task', {
  title: 'Design new dashboard',
  description: 'Create mockups for the analytics dashboard',
  board_id: 'board-123',
  priority: 3,
  due_date: '2024-12-15T00:00:00Z',
  tags: ['design', 'frontend']
});

// Update task progress
await mcp.callTool('update_task', {
  task_id: response.task.id,
  progress: 50,
  status: 'in_progress'
});

// Add a note
await mcp.callTool('add_note', {
  task_id: response.task.id,
  content: 'Completed initial wireframes, moving to high-fidelity designs',
  category: 'progress'
});
```

### Example 2: Sprint Planning

```javascript
// Get sprint planning assistance
const prompt = await mcp.getPrompt('sprint_planning_assistant', {
  board_id: 'board-123',
  sprint_duration: '14 days',
  team_capacity: '3 developers, 1 designer'
});

// Analyze current board status
const analysis = await mcp.callTool('analyze_board', {
  board_id: 'board-123',
  timeframe_days: 30,
  include_recommendations: true
});
```

### Example 3: Task Breakdown

```javascript
// Break down a complex task
const breakdown = await mcp.getPrompt('task_breakdown', {
  task_description: 'Implement user authentication system with OAuth2',
  board_id: 'board-123',
  complexity_level: 'medium'
});

// Create subtasks based on breakdown
for (const subtask of breakdown.subtasks) {
  await mcp.callTool('create_task', {
    title: subtask.title,
    description: subtask.description,
    board_id: 'board-123',
    parent_task_id: 'parent-task-id',
    priority: subtask.priority
  });
}
```

### Example 4: Daily Standup Preparation

```javascript
// Prepare standup content
const standup = await mcp.getPrompt('standup_preparation', {
  board_id: 'board-123',
  team_member: 'user-456',
  since_date: '2024-11-20T00:00:00Z'
});

// Get blocked tasks for discussion
const blockers = await mcp.callTool('get_blocked_tasks', {
  board_id: 'board-123'
});
```

## Best Practices

### 1. Tool Usage

- **Use specific tools for specific tasks** - Don't use generic tools when specific ones exist
- **Include relevant context** - Provide board_id and other context when available
- **Handle errors gracefully** - All tools can throw errors that should be caught
- **Batch operations** - Use bulk operations when available instead of loops

### 2. Prompt Engineering

- **Provide complete context** - Include all relevant parameters for better results
- **Specify audience and format** - Help the AI tailor responses appropriately
- **Use appropriate timeframes** - Choose timeframes that match your workflow
- **Iterate on complex tasks** - Break down complex requests into steps

### 3. Performance Optimization

- **Cache frequently accessed data** - Board and tag information changes infrequently
- **Use pagination** - Don't request all tasks at once
- **Filter at the source** - Use query parameters instead of filtering results
- **Minimize includes** - Only request additional data when needed

### 4. Integration Patterns

```javascript
// Pattern 1: Task Creation Pipeline
async function createTaskPipeline(taskData) {
  // 1. Create the task
  const task = await mcp.callTool('create_task', taskData);
  
  // 2. Assign tags
  for (const tagId of taskData.tags) {
    await mcp.callTool('assign_tag', {
      task_id: task.id,
      tag_id: tagId
    });
  }
  
  // 3. Add initial note
  if (taskData.initialNote) {
    await mcp.callTool('add_note', {
      task_id: task.id,
      content: taskData.initialNote
    });
  }
  
  return task;
}

// Pattern 2: Intelligent Task Breakdown
async function intelligentBreakdown(description, boardId) {
  // 1. Get task breakdown suggestions
  const breakdown = await mcp.getPrompt('task_breakdown', {
    task_description: description,
    board_id: boardId
  });
  
  // 2. Create parent task
  const parent = await mcp.callTool('create_task', {
    title: breakdown.parentTitle,
    description: description,
    board_id: boardId
  });
  
  // 3. Create subtasks
  const subtasks = [];
  for (const sub of breakdown.subtasks) {
    const subtask = await mcp.callTool('create_task', {
      ...sub,
      board_id: boardId,
      parent_id: parent.id
    });
    subtasks.push(subtask);
  }
  
  return { parent, subtasks };
}

// Pattern 3: Smart Priority Management
async function updatePriorities(boardId) {
  // 1. Get priority recommendations
  const recommendations = await mcp.getPrompt('priority_recommendation', {
    board_id: boardId,
    criteria: 'deadline,impact,effort'
  });
  
  // 2. Apply recommendations
  for (const rec of recommendations.updates) {
    await mcp.callTool('update_task', {
      task_id: rec.taskId,
      priority: rec.newPriority
    });
  }
  
  return recommendations;
}
```

## Error Handling

All MCP tools return errors in a consistent format:

```typescript
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any
  }
}
```

Common error codes:
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid parameters
- `PERMISSION_DENIED` - Insufficient permissions
- `RATE_LIMIT` - Rate limit exceeded
- `INTERNAL_ERROR` - Server error

## See Also

- [REST API Documentation](./REST.md)
- [WebSocket API Documentation](./WEBSOCKET.md)
- [Getting Started Guide](../guides/GETTING_STARTED.md)
- [Agent Integration Guide](../guides/AGENT_INTEGRATION.md)