# REST API Reference

This document provides comprehensive documentation for the MCP Kanban REST API endpoints.

## Table of Contents

- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Pagination](#pagination)
- [Boards API](#boards-api)
- [Tasks API](#tasks-api)
- [Notes API](#notes-api)
- [Tags API](#tags-api)
- [Context API](#context-api)
- [Health API](#health-api)

## Base URL

```
http://localhost:3000/api
```

## Authentication

The API uses API key authentication. Include the API key in the request headers:

```http
Authorization: Bearer your-api-key
```

## Error Handling

All API errors follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "Additional error context"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req-123-456-789"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_FAILED` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Pagination

List endpoints support pagination with consistent parameters:

```http
GET /api/tasks?limit=20&offset=40&sortBy=updated_at&sortOrder=desc
```

### Pagination Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Number of items per page (max 100) |
| `offset` | number | 0 | Number of items to skip |
| `sortBy` | string | 'created_at' | Field to sort by |
| `sortOrder` | string | 'desc' | Sort order: 'asc' or 'desc' |

### Pagination Response

```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "offset": 40,
    "total": 156,
    "hasMore": true
  }
}
```

## Boards API

### List Boards

Retrieves a list of boards with optional filtering.

```http
GET /api/boards
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `archived` | boolean | Include archived boards |
| `search` | string | Search in board names and descriptions |
| `limit` | number | Number of boards to return |
| `offset` | number | Pagination offset |

#### Response

```json
{
  "data": [
    {
      "id": "board-123",
      "name": "Development Tasks",
      "description": "Sprint planning and development workflow",
      "color": "#3B82F6",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T14:20:00Z",
      "archived": false,
      "column_order": ["todo", "in_progress", "done"],
      "settings": {
        "allow_subtasks": true,
        "auto_archive_completed": false
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 3,
    "hasMore": false
  }
}
```

### Get Board

Retrieves a single board by ID.

```http
GET /api/boards/{id}
```

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Board ID |

#### Response

```json
{
  "id": "board-123",
  "name": "Development Tasks",
  "description": "Sprint planning and development workflow",
  "color": "#3B82F6",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T14:20:00Z",
  "archived": false,
  "column_order": ["todo", "in_progress", "done"],
  "settings": {
    "allow_subtasks": true,
    "auto_archive_completed": false
  }
}
```

### Create Board

Creates a new board with default columns.

```http
POST /api/boards
```

#### Request Body

```json
{
  "name": "New Project Board",
  "description": "Project management board for XYZ project",
  "color": "#10B981",
  "settings": {
    "allow_subtasks": true,
    "auto_archive_completed": false
  }
}
```

#### Response

```json
{
  "id": "board-456",
  "name": "New Project Board",
  "description": "Project management board for XYZ project",
  "color": "#10B981",
  "created_at": "2024-01-15T15:30:00Z",
  "updated_at": "2024-01-15T15:30:00Z",
  "archived": false,
  "column_order": ["todo", "in_progress", "done"],
  "settings": {
    "allow_subtasks": true,
    "auto_archive_completed": false
  }
}
```

### Update Board

Updates an existing board.

```http
PATCH /api/boards/{id}
```

#### Request Body

```json
{
  "name": "Updated Board Name",
  "description": "Updated description",
  "color": "#EF4444",
  "column_order": ["backlog", "todo", "in_progress", "review", "done"]
}
```

#### Response

```json
{
  "id": "board-123",
  "name": "Updated Board Name",
  "description": "Updated description",
  "color": "#EF4444",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T16:45:00Z",
  "archived": false,
  "column_order": ["backlog", "todo", "in_progress", "review", "done"],
  "settings": {
    "allow_subtasks": true,
    "auto_archive_completed": false
  }
}
```

### Delete Board

Permanently deletes a board and all its tasks.

```http
DELETE /api/boards/{id}
```

#### Response

```http
204 No Content
```

## Tasks API

### List Tasks

Retrieves tasks with comprehensive filtering options.

```http
GET /api/tasks
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `board_id` | string | Filter by board ID |
| `column_id` | string | Filter by column ID |
| `status` | string | Filter by status (todo, in_progress, done) |
| `assignee` | string | Filter by assignee |
| `priority_min` | number | Minimum priority (1-10) |
| `priority_max` | number | Maximum priority (1-10) |
| `has_dependencies` | boolean | Filter tasks with/without dependencies |
| `overdue` | boolean | Filter overdue tasks |
| `parent_task_id` | string | Filter subtasks of a parent |
| `search` | string | Search in titles and descriptions |
| `tags` | string | Comma-separated tag names |
| `due_before` | string | ISO date - tasks due before this date |
| `due_after` | string | ISO date - tasks due after this date |
| `created_before` | string | ISO date - tasks created before this date |
| `created_after` | string | ISO date - tasks created after this date |

#### Response

```json
{
  "data": [
    {
      "id": "task-123",
      "title": "Implement user authentication",
      "description": "Add JWT-based authentication with refresh tokens",
      "board_id": "board-123",
      "column_id": "in_progress",
      "position": 1,
      "priority": 8,
      "status": "in_progress",
      "assignee": "dev@example.com",
      "due_date": "2024-01-20T23:59:59Z",
      "estimated_hours": 16,
      "actual_hours": 8.5,
      "parent_task_id": null,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T14:20:00Z",
      "completed_at": null,
      "archived": false,
      "metadata": {
        "epic": "user-management",
        "complexity": "medium"
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 25,
    "hasMore": false
  }
}
```

### Get Task

Retrieves a single task by ID.

```http
GET /api/tasks/{id}
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `include` | string | Comma-separated list: subtasks, dependencies, notes, tags |

#### Response

```json
{
  "id": "task-123",
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication with refresh tokens",
  "board_id": "board-123",
  "column_id": "in_progress",
  "position": 1,
  "priority": 8,
  "status": "in_progress",
  "assignee": "dev@example.com",
  "due_date": "2024-01-20T23:59:59Z",
  "estimated_hours": 16,
  "actual_hours": 8.5,
  "parent_task_id": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T14:20:00Z",
  "completed_at": null,
  "archived": false,
  "metadata": {
    "epic": "user-management",
    "complexity": "medium"
  },
  "subtasks": [
    {
      "id": "task-124",
      "title": "Design authentication flow",
      "status": "done",
      "priority": 6
    }
  ],
  "dependencies": [
    {
      "id": "dep-1",
      "task_id": "task-123",
      "depends_on_task_id": "task-100",
      "dependency_type": "blocks",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "notes": [
    {
      "id": "note-1",
      "content": "Updated to use bcrypt for password hashing",
      "created_at": "2024-01-15T12:30:00Z"
    }
  ],
  "tags": [
    {
      "id": "tag-1",
      "name": "backend",
      "color": "#3B82F6"
    }
  ]
}
```

### Create Task

Creates a new task.

```http
POST /api/tasks
```

#### Request Body

```json
{
  "title": "Add task search functionality",
  "description": "Implement full-text search across tasks and notes",
  "board_id": "board-123",
  "column_id": "todo",
  "position": 0,
  "priority": 7,
  "assignee": "dev@example.com",
  "due_date": "2024-01-25T23:59:59Z",
  "estimated_hours": 12,
  "parent_task_id": null,
  "metadata": {
    "epic": "search-features",
    "complexity": "high"
  }
}
```

#### Response

```json
{
  "id": "task-456",
  "title": "Add task search functionality",
  "description": "Implement full-text search across tasks and notes",
  "board_id": "board-123",
  "column_id": "todo",
  "position": 0,
  "priority": 7,
  "status": "todo",
  "assignee": "dev@example.com",
  "due_date": "2024-01-25T23:59:59Z",
  "estimated_hours": 12,
  "actual_hours": null,
  "parent_task_id": null,
  "created_at": "2024-01-15T16:30:00Z",
  "updated_at": "2024-01-15T16:30:00Z",
  "completed_at": null,
  "archived": false,
  "metadata": {
    "epic": "search-features",
    "complexity": "high"
  }
}
```

### Update Task

Updates an existing task.

```http
PATCH /api/tasks/{id}
```

#### Request Body

```json
{
  "title": "Updated task title",
  "status": "in_progress",
  "priority": 9,
  "actual_hours": 4.5,
  "column_id": "in_progress",
  "position": 2
}
```

#### Response

```json
{
  "id": "task-456",
  "title": "Updated task title",
  "description": "Implement full-text search across tasks and notes",
  "board_id": "board-123",
  "column_id": "in_progress",
  "position": 2,
  "priority": 9,
  "status": "in_progress",
  "assignee": "dev@example.com",
  "due_date": "2024-01-25T23:59:59Z",
  "estimated_hours": 12,
  "actual_hours": 4.5,
  "parent_task_id": null,
  "created_at": "2024-01-15T16:30:00Z",
  "updated_at": "2024-01-15T17:45:00Z",
  "completed_at": null,
  "archived": false,
  "metadata": {
    "epic": "search-features",
    "complexity": "high"
  }
}
```

### Delete Task

Permanently deletes a task.

```http
DELETE /api/tasks/{id}
```

#### Response

```http
204 No Content
```

### Add Task Dependency

Creates a dependency relationship between tasks.

```http
POST /api/tasks/{id}/dependencies
```

#### Request Body

```json
{
  "depends_on_task_id": "task-100",
  "dependency_type": "blocks"
}
```

#### Response

```json
{
  "id": "dep-123",
  "task_id": "task-456",
  "depends_on_task_id": "task-100",
  "dependency_type": "blocks",
  "created_at": "2024-01-15T18:00:00Z"
}
```

### Remove Task Dependency

Removes a dependency relationship.

```http
DELETE /api/tasks/{id}/dependencies/{depends_on_task_id}
```

#### Response

```http
204 No Content
```

## Notes API

### List Notes

Retrieves notes for a task.

```http
GET /api/tasks/{task_id}/notes
```

#### Response

```json
{
  "data": [
    {
      "id": "note-123",
      "task_id": "task-456",
      "content": "Implementation notes: Using Elasticsearch for search indexing",
      "note_type": "implementation",
      "author": "dev@example.com",
      "created_at": "2024-01-15T17:30:00Z",
      "updated_at": "2024-01-15T17:30:00Z"
    }
  ]
}
```

### Create Note

Adds a note to a task.

```http
POST /api/tasks/{task_id}/notes
```

#### Request Body

```json
{
  "content": "Updated the search implementation to use vector embeddings",
  "note_type": "progress",
  "author": "dev@example.com"
}
```

#### Response

```json
{
  "id": "note-456",
  "task_id": "task-456",
  "content": "Updated the search implementation to use vector embeddings",
  "note_type": "progress",
  "author": "dev@example.com",
  "created_at": "2024-01-15T18:30:00Z",
  "updated_at": "2024-01-15T18:30:00Z"
}
```

### Update Note

Updates an existing note.

```http
PATCH /api/notes/{id}
```

#### Request Body

```json
{
  "content": "Updated content with more details",
  "note_type": "clarification"
}
```

### Delete Note

Deletes a note.

```http
DELETE /api/notes/{id}
```

## Tags API

### List Tags

Retrieves all available tags.

```http
GET /api/tags
```

#### Response

```json
{
  "data": [
    {
      "id": "tag-123",
      "name": "backend",
      "color": "#3B82F6",
      "description": "Backend development tasks",
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

### Create Tag

Creates a new tag.

```http
POST /api/tags
```

#### Request Body

```json
{
  "name": "frontend",
  "color": "#10B981",
  "description": "Frontend development tasks"
}
```

### Add Tag to Task

Associates a tag with a task.

```http
POST /api/tasks/{task_id}/tags
```

#### Request Body

```json
{
  "tag_id": "tag-123"
}
```

### Remove Tag from Task

Removes a tag association from a task.

```http
DELETE /api/tasks/{task_id}/tags/{tag_id}
```

## Context API

### Get Project Context

Retrieves comprehensive project context for AI assistance.

```http
GET /api/context
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `board_id` | string | Focus on specific board |
| `lookback_days` | number | Days to look back for activity (default: 14) |
| `max_tasks` | number | Maximum tasks to include (default: 50) |

#### Response

```json
{
  "project": {
    "total_boards": 3,
    "total_tasks": 156,
    "active_tasks": 23,
    "overdue_tasks": 5,
    "completed_this_week": 12,
    "average_completion_time": 2.5
  },
  "current_work": {
    "active_tasks": [
      {
        "id": "task-123",
        "title": "Implement user authentication",
        "priority": 8,
        "status": "in_progress",
        "assigned_to": "dev@example.com",
        "due_date": "2024-01-20T23:59:59Z"
      }
    ],
    "blocked_tasks": [
      {
        "id": "task-456",
        "title": "Deploy to production",
        "blocked_by": ["task-123"],
        "impact": "high"
      }
    ],
    "next_recommended": [
      {
        "id": "task-789",
        "title": "Write unit tests",
        "priority": 6,
        "reason": "No blockers, aligned with current work"
      }
    ]
  },
  "activity": [
    {
      "type": "task_completed",
      "task_id": "task-100",
      "task_title": "Set up CI/CD pipeline",
      "timestamp": "2024-01-15T14:30:00Z"
    }
  ],
  "insights": {
    "productivity_trend": "increasing",
    "bottlenecks": ["code_review"],
    "recommendations": [
      "Consider parallelizing authentication and search features",
      "Review blocked tasks for potential unblocking"
    ]
  }
}
```

### Get Task Context

Retrieves detailed context for a specific task.

```http
GET /api/tasks/{id}/context
```

#### Response

```json
{
  "task": {
    "id": "task-123",
    "title": "Implement user authentication",
    "current_status": "in_progress",
    "completion_percentage": 60
  },
  "related_tasks": [
    {
      "id": "task-124",
      "title": "Design authentication flow",
      "relationship": "subtask",
      "status": "done"
    }
  ],
  "dependencies": {
    "blocks": [
      {
        "id": "task-456",
        "title": "Deploy to production",
        "impact": "high"
      }
    ],
    "blocked_by": []
  },
  "recent_activity": [
    {
      "type": "status_change",
      "from": "todo",
      "to": "in_progress",
      "timestamp": "2024-01-15T09:00:00Z"
    }
  ],
  "suggestions": [
    "Consider breaking this task into smaller subtasks",
    "Add unit tests for authentication logic"
  ]
}
```

### Get Next Task

Gets AI-recommended next task based on current context.

```http
GET /api/context/next-task
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `board_id` | string | Limit to specific board |
| `assignee` | string | Limit to specific assignee |

#### Response

```json
{
  "recommended_task": {
    "id": "task-789",
    "title": "Write unit tests for authentication",
    "priority": 6,
    "estimated_hours": 4,
    "reasoning": [
      "Builds on recently completed authentication work",
      "No blocking dependencies",
      "High impact on code quality"
    ]
  },
  "alternatives": [
    {
      "id": "task-790",
      "title": "Update API documentation",
      "priority": 4,
      "reasoning": ["Low complexity, can be done quickly"]
    }
  ]
}
```

## Health API

### Health Check

Gets system health status.

```http
GET /api/health
```

#### Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T18:30:00Z",
  "version": "0.1.0",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "healthy",
      "response_time": 5,
      "last_check": "2024-01-15T18:30:00Z"
    },
    "memory": {
      "status": "healthy",
      "usage_mb": 245,
      "limit_mb": 512
    },
    "websocket": {
      "status": "healthy",
      "connected_clients": 3
    }
  }
}
```

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default Limit**: 1000 requests per minute per API key
- **Burst Limit**: 100 requests per 10 seconds
- **Headers**: Rate limit information is included in response headers

### Rate Limit Headers

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1705339800
X-RateLimit-Window: 60
```

When rate limited:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again later.",
    "details": {
      "limit": 1000,
      "window": 60,
      "retry_after": 45
    }
  }
}
```

## Examples

### Creating a Complete Task Workflow

```bash
# 1. Create a board
curl -X POST http://localhost:3000/api/boards \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sprint 1",
    "description": "First development sprint"
  }'

# 2. Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Setup database schema",
    "board_id": "board-123",
    "column_id": "todo",
    "priority": 8
  }'

# 3. Add a note
curl -X POST http://localhost:3000/api/tasks/task-456/notes \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Using PostgreSQL with migrations",
    "note_type": "implementation"
  }'

# 4. Move task to in progress
curl -X PATCH http://localhost:3000/api/tasks/task-456 \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "column_id": "in_progress"
  }'

# 5. Get project context
curl -X GET http://localhost:3000/api/context \
  -H "Authorization: Bearer your-api-key"
```

For more examples and integration patterns, see the [Development Guide](../guides/DEVELOPMENT.md).