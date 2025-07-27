# MCP Kanban API Usage Guide

## Overview

This guide provides comprehensive documentation for using the MCP Kanban REST API. It includes practical examples, best practices, and common use cases for integrating with the kanban system.

## Table of Contents

- [Getting Started](#getting-started)
- [Authentication](#authentication)
- [Core Concepts](#core-concepts)
- [API Examples](#api-examples)
- [Best Practices](#best-practices)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [WebSocket Integration](#websocket-integration)
- [MCP Integration](#mcp-integration)

## Getting Started

### Base URL

```bash
# Development
http://localhost:3000/api/v1

# Production
https://api.mcp-kanban.com/v1
```

### Quick Start

1. **Get an API Key**: Generate an API key through the CLI or admin interface
2. **Test Connection**: Use the health endpoint to verify connectivity
3. **Create Your First Board**: Set up a board to organize your tasks
4. **Add Tasks**: Start creating and managing tasks

### Example: Basic Setup

```bash
# Test connection
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3000/api/v1/health

# Create a board
curl -X POST http://localhost:3000/api/v1/boards \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "description": "Main project board",
    "columns": [
      {"name": "To Do", "position": 0},
      {"name": "In Progress", "position": 1},
      {"name": "Done", "position": 2}
    ]
  }'
```

## Authentication

### API Key Authentication

All API requests require authentication using API keys in the Authorization header:

```http
Authorization: Bearer your-api-key-here
```

### Generating API Keys

```bash
# Using CLI
kanban config generate-key

# Or programmatically
curl -X POST http://localhost:3000/api/v1/auth/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My API Key"}'
```

### Security Best Practices

- **Keep API keys secure**: Never commit API keys to version control
- **Use environment variables**: Store keys in environment variables
- **Rotate regularly**: Generate new keys periodically
- **Scope appropriately**: Use different keys for different applications

## Core Concepts

### Data Model

The API follows a hierarchical data model:

```
Board
├── Columns
│   └── Tasks
│       ├── Subtasks
│       ├── Dependencies
│       └── Tags
├── Notes
└── Tags
```

### Key Entities

- **Boards**: Top-level containers for organizing work
- **Columns**: Vertical sections within boards (e.g., To Do, In Progress, Done)
- **Tasks**: Individual work items with status, priority, and metadata
- **Notes**: Rich text notes that can be linked to tasks
- **Tags**: Hierarchical labels for categorizing tasks
- **Backups**: Data snapshots for disaster recovery

### Status Values

Tasks can have the following statuses:

- `todo`: Not started
- `in_progress`: Currently being worked on
- `done`: Completed
- `blocked`: Blocked by dependencies or external factors
- `archived`: Archived (hidden from active views)

### Priority Levels

Tasks have priority levels from 1-5:

- `1`: Critical (highest priority)
- `2`: High
- `3`: Medium (default)
- `4`: Low
- `5`: Minimal (lowest priority)

## API Examples

### Board Management

#### Create a Board

```javascript
const createBoard = async () => {
  const response = await fetch('http://localhost:3000/api/v1/boards', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Software Development',
      description: 'Main development board',
      columns: [
        { name: 'Backlog', position: 0 },
        { name: 'To Do', position: 1 },
        { name: 'In Progress', position: 2 },
        { name: 'Review', position: 3 },
        { name: 'Done', position: 4 }
      ]
    })
  });
  
  const board = await response.json();
  console.log('Created board:', board.data);
};
```

#### Get Board with Tasks

```javascript
const getBoard = async (boardId) => {
  const response = await fetch(
    `http://localhost:3000/api/v1/boards/${boardId}?includeTasks=true`,
    {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  );
  
  const board = await response.json();
  return board.data;
};
```

### Task Management

#### Create a Task

```javascript
const createTask = async (boardId) => {
  const response = await fetch('http://localhost:3000/api/v1/tasks', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Implement user authentication',
      description: 'Add JWT-based authentication to the API',
      boardId: boardId,
      columnId: 'col-todo',
      priority: 4,
      assignee: 'john.doe',
      dueDate: '2024-12-31T23:59:59Z',
      estimatedHours: 8
    })
  });
  
  const task = await response.json();
  return task.data;
};
```

#### Update Task Status

```javascript
const moveTask = async (taskId, columnId) => {
  const response = await fetch(`http://localhost:3000/api/v1/tasks/${taskId}/move`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      columnId: columnId,
      position: 0
    })
  });
  
  const task = await response.json();
  return task.data;
};
```

#### Bulk Task Operations

```javascript
const bulkUpdateTasks = async (taskIds, updates) => {
  const response = await fetch('http://localhost:3000/api/v1/tasks/bulk', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operation: 'update',
      taskIds: taskIds,
      data: updates
    })
  });
  
  const result = await response.json();
  return result.data;
};
```

### Tag Management

#### Create Hierarchical Tags

```javascript
const createTagHierarchy = async () => {
  // Create parent tag
  const parentResponse = await fetch('http://localhost:3000/api/v1/tags', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Frontend',
      description: 'Frontend development tasks',
      color: '#3B82F6'
    })
  });
  
  const parentTag = await parentResponse.json();
  
  // Create child tags
  const childTags = ['React', 'Vue', 'Angular'];
  for (const tagName of childTags) {
    await fetch('http://localhost:3000/api/v1/tags', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer your-api-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: tagName,
        parentId: parentTag.data.id,
        color: '#10B981'
      })
    });
  }
};
```

#### Add Tags to Tasks

```javascript
const addTagsToTask = async (taskId, tagIds) => {
  const response = await fetch(`http://localhost:3000/api/v1/tasks/${taskId}/tags`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tagIds: tagIds
    })
  });
  
  const result = await response.json();
  return result.data;
};
```

### Search and Filtering

#### Advanced Task Search

```javascript
const searchTasks = async (query, filters = {}) => {
  const params = new URLSearchParams({
    q: query,
    limit: '50',
    ...filters
  });
  
  const response = await fetch(
    `http://localhost:3000/api/v1/tasks/search?${params}`,
    {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  );
  
  const results = await response.json();
  return results.data;
};

// Example usage
const highPriorityTasks = await searchTasks('authentication', {
  priority: '4',
  status: 'todo',
  boardId: 'board-123'
});
```

#### Full-text Note Search

```javascript
const searchNotes = async (query) => {
  const params = new URLSearchParams({
    q: query,
    limit: '20'
  });
  
  const response = await fetch(
    `http://localhost:3000/api/v1/notes/search?${params}`,
    {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  );
  
  const results = await response.json();
  return results.data;
};
```

### AI-Powered Features

#### Get Next Best Task

```javascript
const getNextTask = async (boardId) => {
  const response = await fetch(
    `http://localhost:3000/api/v1/priorities/next?boardId=${boardId}&includeReasoning=true`,
    {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  );
  
  const result = await response.json();
  return result.data;
};
```

#### Recalculate Priorities

```javascript
const recalculatePriorities = async (boardId) => {
  const response = await fetch('http://localhost:3000/api/v1/priorities/calculate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      boardId: boardId,
      algorithm: 'ai',
      factors: {
        dueDateWeight: 0.3,
        priorityWeight: 0.2,
        dependencyWeight: 0.3,
        complexityWeight: 0.2
      }
    })
  });
  
  const result = await response.json();
  return result.data;
};
```

### Context and Insights

#### Get Work Context

```javascript
const getWorkContext = async (boardId) => {
  const response = await fetch(
    `http://localhost:3000/api/v1/context?boardId=${boardId}&limit=20`,
    {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  );
  
  const context = await response.json();
  return context.data;
};
```

#### Get Project Summary

```javascript
const getProjectSummary = async (boardId) => {
  const response = await fetch(
    `http://localhost:3000/api/v1/context/summary?boardId=${boardId}&period=month`,
    {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  );
  
  const summary = await response.json();
  return summary.data;
};
```

### Backup and Recovery

#### Create Backup

```javascript
const createBackup = async () => {
  const response = await fetch('http://localhost:3000/api/v1/backup', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Weekly Backup',
      type: 'full',
      description: 'Weekly full backup',
      includeMetadata: true,
      compression: true
    })
  });
  
  const backup = await response.json();
  return backup.data;
};
```

#### Schedule Automated Backups

```javascript
const scheduleBackup = async () => {
  const response = await fetch('http://localhost:3000/api/v1/schedule', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Daily Backup',
      cronExpression: '0 2 * * *', // Daily at 2 AM
      type: 'full',
      retentionDays: 30,
      enabled: true
    })
  });
  
  const schedule = await response.json();
  return schedule.data;
};
```

## Best Practices

### Performance Optimization

1. **Use Pagination**: Always use pagination for large datasets
   ```javascript
   const getTasks = async (limit = 50, offset = 0) => {
     const response = await fetch(
       `http://localhost:3000/api/v1/tasks?limit=${limit}&offset=${offset}`
     );
     return response.json();
   };
   ```

2. **Batch Operations**: Use bulk endpoints for multiple operations
   ```javascript
   // Instead of multiple individual requests
   const bulkUpdate = await bulkUpdateTasks(taskIds, { status: 'done' });
   ```

3. **Selective Loading**: Only load data you need
   ```javascript
   // Load board without tasks
   const board = await fetch(`/boards/${boardId}`);
   
   // Load board with tasks when needed
   const boardWithTasks = await fetch(`/boards/${boardId}?includeTasks=true`);
   ```

### Error Handling

```javascript
const apiCall = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': 'Bearer your-api-key',
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`${error.error.code}: ${error.error.message}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};
```

### Rate Limiting

```javascript
class RateLimitedAPI {
  constructor(apiKey, maxRequests = 1000, windowMs = 60000) {
    this.apiKey = apiKey;
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }
  
  async request(url, options = {}) {
    this.cleanup();
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (Date.now() - oldestRequest);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.requests.push(Date.now());
    return apiCall(url, options);
  }
  
  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter(time => time > cutoff);
  }
}
```

### Caching

```javascript
class CachedAPI {
  constructor(apiKey, cacheTime = 5 * 60 * 1000) { // 5 minutes
    this.apiKey = apiKey;
    this.cacheTime = cacheTime;
    this.cache = new Map();
  }
  
  async get(url) {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTime) {
      return cached.data;
    }
    
    const data = await apiCall(url);
    this.cache.set(url, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  invalidate(pattern) {
    for (const [url] of this.cache) {
      if (url.includes(pattern)) {
        this.cache.delete(url);
      }
    }
  }
}
```

## WebSocket Integration

### Real-time Updates

```javascript
import { io } from 'socket.io-client';

class KanbanWebSocket {
  constructor(apiKey) {
    this.socket = io('http://localhost:3456', {
      auth: {
        token: apiKey
      }
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.socket.on('task:created', (data) => {
      console.log('New task created:', data.task);
      this.onTaskCreated(data);
    });
    
    this.socket.on('task:updated', (data) => {
      console.log('Task updated:', data.task);
      this.onTaskUpdated(data);
    });
    
    this.socket.on('task:moved', (data) => {
      console.log('Task moved:', data.task);
      this.onTaskMoved(data);
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket');
    });
    
    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
    });
  }
  
  subscribeToBoard(boardId) {
    this.socket.emit('subscribe', { boardId });
  }
  
  unsubscribeFromBoard(boardId) {
    this.socket.emit('unsubscribe', { boardId });
  }
  
  // Override these methods in your implementation
  onTaskCreated(data) {}
  onTaskUpdated(data) {}
  onTaskMoved(data) {}
}
```

### Event Types

The WebSocket API provides real-time events for:

- `task:created` - New task created
- `task:updated` - Task properties updated
- `task:moved` - Task moved between columns
- `task:deleted` - Task deleted
- `note:added` - New note created
- `note:updated` - Note updated
- `dependency:blocked` - Task blocked by dependency
- `priority:changed` - Task priority updated

## MCP Integration

### Using with AI Assistants

The MCP Kanban server integrates seamlessly with AI assistants through the Model Context Protocol:

```javascript
// Example MCP tool usage
const mcpTools = {
  create_task: async (params) => {
    const response = await fetch('http://localhost:3000/api/v1/tasks', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer your-api-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    return response.json();
  },
  
  get_context: async (params) => {
    const response = await fetch(
      `http://localhost:3000/api/v1/context?boardId=${params.boardId}`,
      {
        headers: {
          'Authorization': 'Bearer your-api-key'
        }
      }
    );
    return response.json();
  },
  
  prioritize_tasks: async (params) => {
    const response = await fetch('http://localhost:3000/api/v1/priorities/calculate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer your-api-key',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    return response.json();
  }
};
```

### MCP Configuration

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

## Common Use Cases

### Project Management Workflow

```javascript
class ProjectManager {
  constructor(apiKey, boardId) {
    this.api = new RateLimitedAPI(apiKey);
    this.boardId = boardId;
  }
  
  async createSprint(sprintName, tasks) {
    // Create sprint board
    const sprintBoard = await this.api.request('/boards', {
      method: 'POST',
      body: JSON.stringify({
        name: sprintName,
        columns: [
          { name: 'Sprint Backlog', position: 0 },
          { name: 'In Progress', position: 1 },
          { name: 'Review', position: 2 },
          { name: 'Done', position: 3 }
        ]
      })
    });
    
    // Create tasks
    const taskPromises = tasks.map(task => 
      this.api.request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...task,
          boardId: sprintBoard.data.id
        })
      })
    );
    
    const createdTasks = await Promise.all(taskPromises);
    return { board: sprintBoard.data, tasks: createdTasks };
  }
  
  async getSprintProgress(sprintBoardId) {
    const board = await this.api.request(`/boards/${sprintBoardId}?includeTasks=true`);
    const tasks = board.data.tasks;
    
    const progress = {
      total: tasks.length,
      done: tasks.filter(t => t.status === 'done').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
      todo: tasks.filter(t => t.status === 'todo').length
    };
    
    progress.completionRate = (progress.done / progress.total) * 100;
    return progress;
  }
}
```

### Automated Task Management

```javascript
class TaskAutomation {
  constructor(apiKey) {
    this.api = new RateLimitedAPI(apiKey);
  }
  
  async autoAssignTasks() {
    // Get unassigned high-priority tasks
    const tasks = await this.api.request('/tasks?priority=4&assignee=&status=todo');
    
    // Get available team members
    const teamMembers = ['john.doe', 'jane.smith', 'bob.johnson'];
    
    // Assign tasks based on workload
    for (const task of tasks.data) {
      const assignee = await this.getLeastBusyMember(teamMembers);
      await this.api.request(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignee })
      });
    }
  }
  
  async getLeastBusyMember(members) {
    const workloads = await Promise.all(
      members.map(async (member) => {
        const tasks = await this.api.request(`/tasks?assignee=${member}&status=in_progress`);
        return { member, count: tasks.data.length };
      })
    );
    
    return workloads.reduce((min, current) => 
      current.count < min.count ? current : min
    ).member;
  }
  
  async checkDependencies() {
    // Get blocked tasks
    const blockedTasks = await this.api.request('/tasks?status=blocked');
    
    for (const task of blockedTasks.data) {
      const dependencies = await this.api.request(`/tasks/${task.id}/dependencies`);
      
      // Check if all dependencies are done
      const allDone = dependencies.data.dependencies.every(dep => dep.status === 'done');
      
      if (allDone) {
        await this.api.request(`/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'todo' })
        });
      }
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify API key is correct
   - Check Authorization header format
   - Ensure API key has proper permissions

2. **Rate Limiting**
   - Implement exponential backoff
   - Use bulk operations when possible
   - Monitor rate limit headers

3. **Validation Errors**
   - Check required fields
   - Verify data types and formats
   - Review field length limits

4. **WebSocket Connection Issues**
   - Verify WebSocket endpoint
   - Check authentication token
   - Implement reconnection logic

### Debugging Tips

```javascript
// Enable detailed logging
const debugAPI = async (url, options = {}) => {
  console.log('Request:', { url, options });
  
  const startTime = Date.now();
  const response = await fetch(url, options);
  const endTime = Date.now();
  
  console.log('Response:', {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    duration: endTime - startTime
  });
  
  const data = await response.json();
  console.log('Data:', data);
  
  return data;
};
```

## Support

For additional support:

- **Documentation**: [API Reference](./REST.md)
- **WebSocket**: [WebSocket API](./WEBSOCKET.md)
- **MCP Integration**: [MCP API](./MCP.md)
- **Issues**: GitHub repository issues
- **Community**: GitHub discussions

---

*This guide covers the most common use cases and patterns. For complete API reference, see the [OpenAPI specification](./openapi.yaml).* 