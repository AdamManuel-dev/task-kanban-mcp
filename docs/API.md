# MCP Kanban API Reference

## Overview

The MCP Kanban Server provides a comprehensive REST API for managing kanban boards, tasks, notes, and related data. All API endpoints are prefixed with `/api/v1` and require authentication via API key.

## Authentication

All API requests must include an API key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" https://localhost:3000/api/v1/boards
```

## Base URL

```
http://localhost:3000/api/v1
```

## Response Format

All responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": {
    "timestamp": "2025-01-26T10:00:00Z",
    "version": "1.0.0"
  }
}
```

Error responses:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { ... }
  },
  "meta": { ... }
}
```

## Core Endpoints

### Health Check

```http
GET /health
```

Returns server health status. No authentication required.

**Response:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 3600,
  "database": {
    "connected": true,
    "responsive": true,
    "size": 1048576
  }
}
```

### Boards

#### List Boards

```http
GET /api/v1/boards
```

**Query Parameters:**
- `archived` (boolean): Include archived boards
- `sort` (string): Sort field (name, created_at, updated_at)
- `order` (string): Sort order (asc, desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "board-123",
      "name": "My Project",
      "description": "Project kanban board",
      "settings": {},
      "created_at": "2025-01-26T10:00:00Z",
      "updated_at": "2025-01-26T10:00:00Z",
      "archived": false
    }
  ]
}
```

#### Create Board

```http
POST /api/v1/boards
```

**Request Body:**
```json
{
  "name": "New Board",
  "description": "Board description",
  "columns": ["Todo", "In Progress", "Done"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "board-456",
    "name": "New Board",
    "columns": [
      {
        "id": "col-1",
        "name": "Todo",
        "position": 0
      },
      {
        "id": "col-2",
        "name": "In Progress",
        "position": 1
      },
      {
        "id": "col-3",
        "name": "Done",
        "position": 2
      }
    ]
  }
}
```

### Tasks

#### List Tasks

```http
GET /api/v1/tasks
```

**Query Parameters:**
- `board_id` (string): Filter by board
- `column_id` (string): Filter by column
- `archived` (boolean): Include archived tasks
- `priority` (string): Filter by priority (low, medium, high)
- `tags` (string[]): Filter by tags
- `search` (string): Full-text search
- `parent_id` (string): Get subtasks of a parent
- `has_dependencies` (boolean): Tasks with dependencies
- `limit` (number): Results per page (default: 50)
- `offset` (number): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "task-789",
      "board_id": "board-123",
      "column_id": "col-1",
      "parent_task_id": null,
      "title": "Implement feature X",
      "description": "Detailed description",
      "position": 0,
      "priority": "high",
      "priority_score": 0.85,
      "due_date": "2025-02-01T00:00:00Z",
      "estimated_hours": 8,
      "tags": ["feature", "frontend"],
      "created_at": "2025-01-26T10:00:00Z",
      "updated_at": "2025-01-26T10:00:00Z",
      "archived": false,
      "progress": {
        "subtasks_total": 3,
        "subtasks_completed": 1,
        "percent_complete": 33.33
      }
    }
  ],
  "meta": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

#### Create Task

```http
POST /api/v1/tasks
```

**Request Body:**
```json
{
  "board_id": "board-123",
  "column_id": "col-1",
  "title": "New Task",
  "description": "Task description",
  "priority": "medium",
  "due_date": "2025-02-01T00:00:00Z",
  "estimated_hours": 4,
  "tags": ["bug", "backend"],
  "parent_task_id": null
}
```

#### Update Task

```http
PATCH /api/v1/tasks/:id
```

**Request Body (partial update):**
```json
{
  "title": "Updated Title",
  "priority": "high",
  "column_id": "col-2"
}
```

#### Move Task

```http
POST /api/v1/tasks/:id/move
```

**Request Body:**
```json
{
  "column_id": "col-3",
  "position": 2
}
```

### Notes

#### Add Note

```http
POST /api/v1/tasks/:taskId/notes
```

**Request Body:**
```json
{
  "title": "Implementation Notes",
  "content": "Consider using strategy pattern here",
  "category": "implementation",
  "code_snippets": [
    {
      "language": "typescript",
      "code": "interface Strategy { execute(): void; }"
    }
  ]
}
```

#### Search Notes

```http
GET /api/v1/search/notes
```

**Query Parameters:**
- `q` (string): Search query
- `task_id` (string): Filter by task
- `category` (string): Filter by category
- `pinned` (boolean): Only pinned notes

### Tags

#### List Tags

```http
GET /api/v1/tags
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tag-1",
      "name": "Frontend",
      "slug": "frontend",
      "path": "development/frontend",
      "parent_id": "tag-dev",
      "color": "#3B82F6",
      "description": "Frontend related tasks",
      "usage_count": 42
    }
  ]
}
```

#### Tag Hierarchy

```http
GET /api/v1/tags/tree
```

Returns tags organized in tree structure.

### Dependencies

#### Add Dependency

```http
POST /api/v1/tasks/:id/dependencies
```

**Request Body:**
```json
{
  "depends_on_task_id": "task-456",
  "dependency_type": "blocks"
}
```

#### Get Dependencies

```http
GET /api/v1/tasks/:id/dependencies
```

**Response:**
```json
{
  "success": true,
  "data": {
    "blocking": [
      {
        "id": "task-456",
        "title": "Prerequisite task",
        "status": "in_progress"
      }
    ],
    "blocked_by": [],
    "related": []
  }
}
```

### Priority & AI

#### Get Prioritized Tasks

```http
GET /api/v1/priorities
```

Returns tasks sorted by calculated priority score.

**Query Parameters:**
- `board_id` (string): Filter by board
- `recalculate` (boolean): Force recalculation

#### Get Next Task Suggestion

```http
GET /api/v1/priorities/next
```

Returns the best next task based on context and priorities.

**Response:**
```json
{
  "success": true,
  "data": {
    "task": {
      "id": "task-789",
      "title": "High priority task"
    },
    "reasoning": {
      "factors": {
        "age": 0.8,
        "dependencies": 0.9,
        "deadline": 0.7,
        "context": 0.6
      },
      "score": 0.85,
      "explanation": "This task is blocking 3 other tasks and is overdue"
    }
  }
}
```

### Context

#### Get Current Context

```http
GET /api/v1/context
```

Returns AI-optimized context about current work state.

**Query Parameters:**
- `include_completed` (boolean): Include recently completed tasks
- `lookback_days` (number): Days to look back
- `max_items` (number): Maximum items per category

#### Get Task Context

```http
GET /api/v1/context/task/:id
```

Returns comprehensive context for a specific task.

## WebSocket Events

Connect to WebSocket server:

```javascript
const socket = io('http://localhost:3001', {
  auth: {
    apiKey: 'your-api-key'
  }
});
```

### Subscribe to Board

```javascript
socket.emit('subscribe', { board_id: 'board-123' });
```

### Events

#### Task Events
- `task:created` - New task created
- `task:updated` - Task updated
- `task:moved` - Task moved between columns
- `task:deleted` - Task deleted

#### Note Events
- `note:added` - Note added to task
- `note:updated` - Note updated
- `note:deleted` - Note deleted

#### Priority Events
- `priority:changed` - Task priority changed
- `priority:recalculated` - All priorities recalculated

## Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid API key |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid request data |
| `CONFLICT` | Resource conflict (e.g., duplicate) |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |

## Rate Limiting

Default rate limits:
- 1000 requests per minute per API key
- 100 requests per minute for search endpoints
- 10 requests per minute for context generation

Rate limit headers:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

## Best Practices

### Pagination
Always use pagination for list endpoints:
```http
GET /api/v1/tasks?limit=50&offset=100
```

### Partial Updates
Use PATCH for partial updates instead of PUT:
```http
PATCH /api/v1/tasks/123
Content-Type: application/json

{ "priority": "high" }
```

### Error Handling
Always check the `success` field:
```javascript
const response = await fetch('/api/v1/tasks');
const data = await response.json();

if (!data.success) {
  console.error('API Error:', data.error.message);
}
```

### Caching
Use ETags for caching:
```http
GET /api/v1/boards/123
If-None-Match: "33a64df551"
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { KanbanClient } from '@mcp-kanban/client';

const client = new KanbanClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3000'
});

// Create a task
const task = await client.tasks.create({
  board_id: 'board-123',
  title: 'New Task',
  priority: 'high'
});

// Subscribe to updates
client.on('task:updated', (task) => {
  console.log('Task updated:', task);
});
```

### Python

```python
from mcp_kanban import KanbanClient

client = KanbanClient(
    api_key='your-api-key',
    base_url='http://localhost:3000'
)

# List tasks
tasks = client.tasks.list(board_id='board-123')

# Create note
note = client.notes.create(
    task_id='task-789',
    content='Implementation complete'
)
```

### cURL

```bash
# Create board
curl -X POST http://localhost:3000/api/v1/boards \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Board"}'

# Update task
curl -X PATCH http://localhost:3000/api/v1/tasks/task-123 \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"priority": "high"}'
```