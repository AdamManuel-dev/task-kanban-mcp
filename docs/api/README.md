# MCP Kanban API Reference

## Overview

The MCP Kanban API provides a comprehensive REST interface for managing kanban boards, tasks, and project workflows. Built with Express.js and TypeScript, it offers type-safe endpoints with comprehensive validation and error handling.

## Base Information

- **Version**: 1.0.0
- **Base URL**: `http://localhost:3000/api/v1`
- **Content Type**: `application/json`
- **Authentication**: API Key (Header: `X-API-Key` or `Authorization: Bearer <key>`)

## Quick Start

### Authentication

All API requests require authentication via API key:

```bash
curl -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     http://localhost:3000/api/v1/boards
```

### Basic Operations

```bash
# List all boards
GET /api/v1/boards

# Create a new task
POST /api/v1/tasks
{
  "title": "Implement user authentication",
  "board_id": "board-uuid",
  "priority": 8,
  "assignee": "developer@example.com"
}

# Update task status
PATCH /api/v1/tasks/task-uuid
{
  "status": "in_progress",
  "progress": 25
}
```

## Core Resources

## 📋 Boards

Manage project boards and their structure.

### List Boards
```http
GET /api/v1/boards
```

**Query Parameters:**
- `limit` (number, optional): Maximum results (default: 50)
- `offset` (number, optional): Skip results (default: 0)
- `archived` (boolean, optional): Include archived boards
- `sort_by` (string, optional): Sort field (`name`, `created_at`, `updated_at`)
- `sort_order` (string, optional): Sort direction (`asc`, `desc`)

**Response:**
```json
{
  "data": [
    {
      "id": "board-uuid",
      "name": "Development Board",
      "description": "Main development tracking",
      "archived": false,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-30T12:00:00Z",
      "columns": [
        {
          "id": "col-uuid",
          "name": "To Do",
          "position": 0
        }
      ]
    }
  ],
  "pagination": {
    "total": 5,
    "limit": 50,
    "offset": 0,
    "page": 1
  }
}
```

### Create Board
```http
POST /api/v1/boards
```

**Request Body:**
```json
{
  "name": "Project Board",
  "description": "Board for tracking project tasks",
  "columns": [
    { "name": "Backlog", "position": 0 },
    { "name": "In Progress", "position": 1 },
    { "name": "Done", "position": 2 }
  ]
}
```

**Response:** `201 Created`
```json
{
  "data": {
    "id": "new-board-uuid",
    "name": "Project Board",
    "description": "Board for tracking project tasks",
    "archived": false,
    "created_at": "2025-01-30T12:00:00Z",
    "updated_at": "2025-01-30T12:00:00Z"
  }
}
```

### Get Board Details
```http
GET /api/v1/boards/{id}
```

**Path Parameters:**
- `id` (string, required): Board UUID

**Query Parameters:**
- `include_tasks` (boolean, optional): Include all board tasks
- `include_stats` (boolean, optional): Include board statistics

### Update Board
```http
PATCH /api/v1/boards/{id}
```

**Request Body:**
```json
{
  "name": "Updated Board Name",
  "description": "Updated description",
  "archived": false
}
```

### Delete Board
```http
DELETE /api/v1/boards/{id}
```

**Response:** `204 No Content`

---

## 📝 Tasks

Manage individual tasks and their properties.

### List Tasks
```http
GET /api/v1/tasks
```

**Query Parameters:**
- `board_id` (string, optional): Filter by board UUID
- `column_id` (string, optional): Filter by column UUID  
- `status` (string, optional): Filter by status (`todo`, `in_progress`, `done`, `blocked`, `archived`)
- `assignee` (string, optional): Filter by assignee email
- `priority_min` (number, optional): Minimum priority (1-10)
- `priority_max` (number, optional): Maximum priority (1-10)
- `tags` (string, optional): Comma-separated tag names
- `search` (string, optional): Search in title and description
- `due_before` (string, optional): Tasks due before date (ISO format)
- `due_after` (string, optional): Tasks due after date (ISO format)
- `limit` (number, optional): Maximum results (default: 50)
- `offset` (number, optional): Skip results (default: 0)
- `sort_by` (string, optional): Sort field (`priority`, `due_date`, `created_at`, `updated_at`)
- `sort_order` (string, optional): Sort direction (`asc`, `desc`)

**Response:**
```json
{
  "data": [
    {
      "id": "task-uuid",
      "title": "Implement authentication",
      "description": "Add JWT-based authentication system",
      "board_id": "board-uuid",
      "column_id": "col-uuid",
      "parent_id": null,
      "status": "in_progress",
      "priority": 8,
      "assignee": "dev@example.com",
      "due_date": "2025-02-15T00:00:00Z",
      "progress": 60,
      "position": 1,
      "archived": false,
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-30T14:30:00Z",
      "tags": [
        {
          "id": "tag-uuid",
          "name": "backend",
          "color": "#4CAF50"
        }
      ]
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "page": 1
  }
}
```

### Create Task
```http
POST /api/v1/tasks
```

**Request Body:**
```json
{
  "title": "Task Title",
  "description": "Detailed task description",
  "board_id": "board-uuid",
  "column_id": "col-uuid",
  "parent_id": null,
  "priority": 5,
  "assignee": "user@example.com",
  "due_date": "2025-02-28T23:59:59Z",
  "tags": ["feature", "backend"]
}
```

**Response:** `201 Created`

### Get Task Details
```http
GET /api/v1/tasks/{id}
```

**Query Parameters:**
- `include_subtasks` (boolean, optional): Include subtasks
- `include_notes` (boolean, optional): Include task notes
- `include_dependencies` (boolean, optional): Include task dependencies

### Update Task
```http
PATCH /api/v1/tasks/{id}
```

**Request Body:** (All fields optional)
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "in_progress", 
  "priority": 7,
  "assignee": "newuser@example.com",
  "due_date": "2025-03-15T23:59:59Z",
  "progress": 75
}
```

### Move Task
```http
PATCH /api/v1/tasks/{id}/move
```

**Request Body:**
```json
{
  "column_id": "target-column-uuid",
  "position": 2
}
```

### Delete Task
```http
DELETE /api/v1/tasks/{id}
```

**Response:** `204 No Content`

### Get Next Recommended Task
```http
GET /api/v1/tasks/next
```

**Query Parameters:**
- `board_id` (string, optional): Filter by board
- `assignee` (string, optional): Filter by assignee
- `skill_context` (string, optional): AI context for recommendation
- `exclude_blocked` (boolean, optional): Exclude blocked tasks (default: true)

**Response:**
```json
{
  "data": {
    "next_task": {
      "id": "task-uuid",
      "title": "High priority task",
      "priority": 9,
      "due_date": "2025-02-01T00:00:00Z",
      "status": "todo"
    },
    "reasoning": "🔥 Critical Priority (9/10) - Urgent attention required\n⚠️ Due tomorrow - Time sensitive\n✅ Ready to start - No blocking dependencies"
  }
}
```

---

## 📑 Task Notes

Add contextual notes to tasks.

### Add Note to Task
```http
POST /api/v1/tasks/{id}/notes
```

**Request Body:**
```json
{
  "content": "Progress update: Completed API design",
  "category": "progress"
}
```

### Get Task Notes
```http
GET /api/v1/tasks/{id}/notes
```

**Query Parameters:**
- `category` (string, optional): Filter by category
- `limit` (number, optional): Maximum results
- `offset` (number, optional): Skip results

---

## 🏷️ Tags

Manage task categorization tags.

### List Tags
```http
GET /api/v1/tags
```

### Create Tag
```http
POST /api/v1/tags
```

**Request Body:**
```json
{
  "name": "urgent",
  "color": "#FF5722",
  "description": "High priority tasks"
}
```

### Add Tags to Task
```http
POST /api/v1/tasks/{id}/tags
```

**Request Body:**
```json
{
  "tag_ids": ["tag-uuid-1", "tag-uuid-2"]
}
```

### Remove Tag from Task
```http
DELETE /api/v1/tasks/{id}/tags/{tagId}
```

---

## 🔗 Dependencies

Manage task dependencies and relationships.

### Add Task Dependency
```http
POST /api/v1/tasks/{id}/dependencies
```

**Request Body:**
```json
{
  "depends_on_id": "dependency-task-uuid",
  "dependency_type": "blocks"
}
```

### Get Task Dependencies
```http
GET /api/v1/tasks/{id}/dependencies
```

**Response:**
```json
{
  "data": {
    "dependencies": [
      {
        "id": "dep-task-uuid",
        "title": "Setup database",
        "status": "done"
      }
    ],
    "dependents": [
      {
        "id": "dependent-task-uuid", 
        "title": "Deploy application",
        "status": "blocked"
      }
    ]
  }
}
```

### Remove Dependency
```http
DELETE /api/v1/tasks/{id}/dependencies/{dependsOnId}
```

---

## 📊 Analytics & Context

### Get Project Context
```http
GET /api/v1/context/project
```

**Query Parameters:**
- `board_id` (string, optional): Specific board
- `days` (number, optional): Days to include (default: 30)

**Response:**
```json
{
  "data": {
    "summary": "Project has 45 active tasks across 3 boards",
    "key_metrics": {
      "total_tasks": 45,
      "completed_tasks": 12,
      "blocked_tasks": 3,
      "overdue_tasks": 2
    },
    "recommendations": [
      "Focus on resolving 3 blocked tasks",
      "Review 2 overdue tasks for deadline adjustment"
    ]
  }
}
```

### Get Task Context
```http
GET /api/v1/context/task/{id}
```

### Prioritize Tasks (AI)
```http
POST /api/v1/tasks/prioritize
```

**Request Body:**
```json
{
  "board_id": "board-uuid",
  "context": "Sprint planning for Q1 features",
  "task_ids": ["task1", "task2", "task3"]
}
```

---

## ⚙️ System

### Health Check
```http
GET /api/v1/health
```

**Response:**
```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-01-30T12:00:00Z",
    "uptime": 86400,
    "database": {
      "status": "connected",
      "size": 2048576
    },
    "memory": {
      "used": 134217728,
      "total": 268435456
    }
  }
}
```

---

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Task title is required",
    "details": {
      "field": "title",
      "reason": "missing_required_field"
    }
  },
  "timestamp": "2025-01-30T12:00:00Z"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate name) |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### Error Examples

**Validation Error:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid priority value",
    "details": {
      "field": "priority",
      "value": 15,
      "expected": "number between 1 and 10"
    }
  }
}
```

**Authentication Error:**
```json
{
  "error": {
    "code": "UNAUTHORIZED", 
    "message": "Invalid API key"
  }
}
```

**Not Found Error:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Task not found",
    "details": {
      "resource": "task",
      "id": "invalid-uuid"
    }
  }
}
```

---

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Rate Limit**: 1000 requests per hour per API key
- **Headers**: Rate limit information is included in response headers
  - `X-RateLimit-Limit`: Maximum requests per window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Unix timestamp when window resets

---

## Webhooks (Coming Soon)

Real-time notifications for task and board changes:

```json
{
  "event": "task.updated",
  "data": {
    "task_id": "task-uuid",
    "changes": {
      "status": {
        "from": "todo",
        "to": "in_progress"
      }
    }
  },
  "timestamp": "2025-01-30T12:00:00Z"
}
```

---

## SDK Examples

### JavaScript/Node.js

```javascript
const { KanbanAPI } = require('@mcp/kanban-client');

const client = new KanbanAPI({
  baseURL: 'http://localhost:3000/api/v1',
  apiKey: 'your-api-key'
});

// Create a task
const task = await client.tasks.create({
  title: 'New Feature',
  board_id: 'board-uuid',
  priority: 7
});

// List high priority tasks
const tasks = await client.tasks.list({
  priority_min: 8,
  status: 'todo'
});

// Get next recommended task
const recommendation = await client.tasks.getNext({
  assignee: 'developer@example.com'
});
```

### Python

```python
from mcp_kanban import KanbanClient

client = KanbanClient(
    base_url='http://localhost:3000/api/v1',
    api_key='your-api-key'
)

# Create a task
task = client.tasks.create({
    'title': 'New Feature',
    'board_id': 'board-uuid',
    'priority': 7
})

# List tasks
tasks = client.tasks.list(priority_min=8, status='todo')

# Get recommendation
recommendation = client.tasks.get_next(assignee='developer@example.com')
```

### cURL Examples

```bash
# Create a board
curl -X POST http://localhost:3000/api/v1/boards \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Development Board",
    "description": "Main development tracking"
  }'

# List tasks with filters
curl "http://localhost:3000/api/v1/tasks?board_id=board-uuid&status=in_progress&priority_min=7" \
  -H "X-API-Key: your-api-key"

# Update task status
curl -X PATCH http://localhost:3000/api/v1/tasks/task-uuid \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "done",
    "progress": 100
  }'
```

---

## CLI Component Reference

### Ink Component Props (v6.1.0)

The CLI uses Ink for React-based terminal UIs. Here are the supported props:

#### Box Component Props

**Layout & Positioning:**
- `position?: 'absolute' | 'relative'`
- `display?: 'flex' | 'none'`
- `flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'` ✅
- `flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse'`
- `alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch'`
- `justifyContent?: 'flex-start' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly' | 'center'`

**Spacing:**
- `margin?: number`, `marginX?: number`, `marginY?: number`
- `marginTop?: number` ✅, `marginBottom?: number` ✅
- `marginLeft?: number`, `marginRight?: number`
- `padding?: number`, `paddingX?: number`, `paddingY?: number`
- `paddingTop?: number`, `paddingBottom?: number`
- `paddingLeft?: number`, `paddingRight?: number`

**Sizing:**
- `width?: number | string`, `height?: number | string`
- `minWidth?: number | string`, `minHeight?: number | string`
- `flexGrow?: number`, `flexShrink?: number`, `flexBasis?: number | string`

**Styling:**
- `backgroundColor?: string`
- `borderStyle?: keyof Boxes | BoxStyle`
- `borderColor?: string`, `borderDimColor?: boolean`
- `overflow?: 'visible' | 'hidden'`

#### Text Component Props

**Text Styling:**
- `color?: string` - Text color (chalk color names or hex)
- `backgroundColor?: string` - Background color
- `bold?: boolean` ✅ - Bold text
- `italic?: boolean` - Italic text
- `underline?: boolean` - Underlined text
- `strikethrough?: boolean` - Strikethrough text
- `dimColor?: boolean` - Dimmed color
- `inverse?: boolean` - Inverse colors

**Text Behavior:**
- `wrap?: 'wrap' | 'end' | 'middle' | 'truncate-end' | 'truncate' | 'truncate-middle' | 'truncate-start'`

#### Example Usage

```tsx
import { Box, Text } from 'ink';

// Correct usage with supported props
<Box flexDirection="column" marginBottom={2}>
  <Box marginBottom={1}>
    <Text bold color="cyan">Header</Text>
  </Box>
  
  <Box flexDirection="row" gap={2}>
    <Text>Left column</Text>
    <Text>Right column</Text>
  </Box>
</Box>
```

#### Common Issues

❌ **Wrong**: Text doesn't support layout props
```tsx
<Text marginBottom={1}>Content</Text>  // Error
```

✅ **Correct**: Use Box for layout, Text for styling
```tsx
<Box marginBottom={1}>
  <Text bold>Content</Text>
</Box>
```

---

## Additional Resources

- [Authentication Guide](./auth.md) - Detailed authentication setup
- [Pagination Guide](./pagination.md) - Working with large result sets
- [Filtering Guide](./filtering.md) - Advanced filtering and search
- [Webhook Integration](./webhooks.md) - Real-time event handling
- [CLI Tool](../modules/cli.md) - Command-line interface
- [Troubleshooting](../TROUBLESHOOTING.md) - Common issues and solutions