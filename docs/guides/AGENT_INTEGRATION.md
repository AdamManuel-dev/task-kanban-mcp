# Agent Integration Guide

This guide covers how to integrate AI agents with the MCP Kanban Server using the Model Context Protocol (MCP).

## Overview

The MCP Kanban Server provides a comprehensive interface for AI agents to manage tasks, coordinate work, and maintain project context without consuming valuable context window space.

## MCP Server Setup

### Basic Configuration

The MCP server runs on port 3000 by default and provides tools for task management:

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

### Server Endpoints

- **MCP Endpoint**: `http://localhost:3000/mcp`
- **REST API**: `http://localhost:3000/api`
- **WebSocket**: `ws://localhost:3000/ws`

## Available MCP Tools

### Task Management

#### `get_next_task`
Retrieve the next available task with full context.

```javascript
{
  "tool": "get_next_task",
  "parameters": {
    "capabilities": ["javascript", "react", "testing"],
    "exclude_files": ["src/legacy/*"],
    "priority": "high"
  }
}
```

**Response:**
```json
{
  "task": {
    "id": 42,
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication to the API",
    "status": "ready",
    "priority": "high",
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

#### `complete_task`
Report task completion with implementation details.

```javascript
{
  "tool": "complete_task",
  "parameters": {
    "task_id": 42,
    "status": "completed",
    "implementation_notes": "Added middleware for token validation",
    "files_modified": ["src/auth.js", "src/middleware/auth.js"],
    "tests_added": ["test/auth.test.js"],
    "time_spent_minutes": 45
  }
}
```

#### `update_task_progress`
Update task progress for long-running tasks.

```javascript
{
  "tool": "update_task_progress",
  "parameters": {
    "task_id": 42,
    "progress_percentage": 75,
    "current_step": "Implementing refresh token logic",
    "estimated_completion_minutes": 15
  }
}
```

### Dependency Management

#### `check_task_dependencies`
Check if a task's dependencies are satisfied.

```javascript
{
  "tool": "check_task_dependencies",
  "parameters": {
    "task_id": 43
  }
}
```

**Response:**
```json
{
  "dependencies": {
    "satisfied": ["task-41"],
    "pending": ["task-42"],
    "blocked": []
  },
  "can_start": false,
  "estimated_wait_time_minutes": 30
}
```

#### `get_dependency_context`
Get context from completed dependent tasks.

```javascript
{
  "tool": "get_dependency_context",
  "parameters": {
    "task_id": 43,
    "include_implementation_notes": true
  }
}
```

### Context Management

#### `get_project_context`
Retrieve project-wide context and configuration.

```javascript
{
  "tool": "get_project_context",
  "parameters": {
    "include_patterns": ["src/**/*.js"],
    "exclude_patterns": ["node_modules/**", "dist/**"],
    "max_context_size": 50000
  }
}
```

#### `search_related_tasks`
Find tasks related to current work.

```javascript
{
  "tool": "search_related_tasks",
  "parameters": {
    "current_task_id": 42,
    "search_terms": ["authentication", "JWT"],
    "max_results": 5
  }
}
```

## Agent Workflow Patterns

### Single Agent Deep Work

1. **Get Next Task**
   ```javascript
   const task = await mcp.call("get_next_task", {
     capabilities: ["javascript", "api"],
     priority: "high"
   });
   ```

2. **Check Dependencies**
   ```javascript
   const deps = await mcp.call("check_task_dependencies", {
     task_id: task.id
   });
   
   if (!deps.can_start) {
     // Wait or get alternative task
     return;
   }
   ```

3. **Get Full Context**
   ```javascript
   const context = await mcp.call("get_project_context", {
     include_patterns: task.context.files_to_modify,
     max_context_size: 50000
   });
   ```

4. **Execute Task**
   ```javascript
   // Implement the task using the provided context
   // No need to maintain state between tasks
   ```

5. **Report Completion**
   ```javascript
   await mcp.call("complete_task", {
     task_id: task.id,
     status: "completed",
     implementation_notes: "Implemented JWT authentication with refresh tokens",
     files_modified: ["src/auth.js", "src/middleware/auth.js"]
   });
   ```

### Multi-Agent Coordination

1. **Check Agent Boundaries**
   ```javascript
   const boundaries = await mcp.call("get_agent_boundaries", {
     agent_id: "claude-code"
   });
   ```

2. **Request Task Lock**
   ```javascript
   const lock = await mcp.call("lock_task", {
     task_id: 42,
     agent_id: "claude-code",
     timeout_minutes: 30
   });
   ```

3. **Work with Lock**
   ```javascript
   if (lock.acquired) {
     // Work on task
     // Lock prevents conflicts with other agents
   }
   ```

4. **Release Lock**
   ```javascript
   await mcp.call("release_task_lock", {
     task_id: 42,
     agent_id: "claude-code"
   });
   ```

## Context Window Optimization

### Best Practices

1. **Request Only Needed Context**
   ```javascript
   // Good: Specific file patterns
   const context = await mcp.call("get_project_context", {
     include_patterns: ["src/auth/**/*.js"],
     max_context_size: 30000
   });
   
   // Avoid: Requesting entire project
   const context = await mcp.call("get_project_context", {
     include_patterns: ["src/**/*"],
     max_context_size: 200000
   });
   ```

2. **Use Task-Specific Context**
   ```javascript
   // Task already includes relevant context
   const task = await mcp.call("get_next_task", {
     capabilities: ["javascript"]
   });
   
   // Use task.context.files_to_modify for additional context
   ```

3. **Leverage Dependency Context**
   ```javascript
   // Get context from completed dependencies
   const depContext = await mcp.call("get_dependency_context", {
     task_id: 43,
     include_implementation_notes: true
   });
   ```

### Context Size Guidelines

- **Small Tasks**: < 10,000 tokens
- **Medium Tasks**: 10,000 - 30,000 tokens
- **Large Tasks**: 30,000 - 50,000 tokens
- **Avoid**: > 50,000 tokens (request task split)

## Error Handling

### Common Error Responses

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID 999 does not exist",
    "suggestions": ["Check task ID", "List available tasks"]
  }
}
```

### Error Recovery Patterns

1. **Task Lock Timeout**
   ```javascript
   try {
     const lock = await mcp.call("lock_task", { task_id: 42 });
   } catch (error) {
     if (error.code === "LOCK_TIMEOUT") {
       // Get alternative task or retry
       const altTask = await mcp.call("get_next_task", { exclude: [42] });
     }
   }
   ```

2. **Dependency Not Ready**
   ```javascript
   const deps = await mcp.call("check_task_dependencies", { task_id: 43 });
   if (!deps.can_start) {
     // Get task that can start immediately
     const readyTask = await mcp.call("get_next_task", { 
       exclude_dependencies: deps.pending 
     });
   }
   ```

## Performance Monitoring

### Agent Metrics

Track your agent's performance:

```javascript
// Report metrics after task completion
await mcp.call("report_agent_metrics", {
  task_id: 42,
  metrics: {
    context_tokens_used: 25000,
    implementation_time_minutes: 45,
    code_quality_score: 0.95,
    test_coverage_percentage: 85
  }
});
```

### Context Efficiency

Monitor context usage:

```javascript
// Get context efficiency report
const efficiency = await mcp.call("get_context_efficiency", {
  agent_id: "claude-code",
  time_range_days: 7
});
```

## Security Considerations

### API Key Management

- Store API keys securely
- Use environment variables
- Rotate keys regularly
- Use different keys for different agents

### Task Isolation

- Don't share task context between agents
- Clear sensitive data after task completion
- Use task-specific API keys when possible

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Check if MCP server is running
   - Verify port configuration
   - Check firewall settings

2. **Authentication Failed**
   - Verify API key
   - Check key permissions
   - Ensure key is not expired

3. **Task Not Found**
   - Check task ID
   - Verify task exists
   - Check agent permissions

4. **Context Too Large**
   - Request smaller context chunks
   - Use more specific file patterns
   - Request task split

### Debug Mode

Enable debug logging:

```javascript
// Enable debug mode
await mcp.call("set_debug_mode", {
  enabled: true,
  log_level: "verbose"
});
```

## Examples

### Complete Agent Implementation

```javascript
class KanbanAgent {
  constructor(mcpClient) {
    this.mcp = mcpClient;
  }

  async work() {
    while (true) {
      try {
        // Get next task
        const task = await this.mcp.call("get_next_task", {
          capabilities: ["javascript", "react"],
          priority: "high"
        });

        if (!task) {
          console.log("No tasks available");
          await this.sleep(60000); // Wait 1 minute
          continue;
        }

        // Check dependencies
        const deps = await this.mcp.call("check_task_dependencies", {
          task_id: task.id
        });

        if (!deps.can_start) {
          console.log(`Task ${task.id} blocked by dependencies`);
          continue;
        }

        // Get context
        const context = await this.mcp.call("get_project_context", {
          include_patterns: task.context.files_to_modify,
          max_context_size: 30000
        });

        // Execute task
        const result = await this.executeTask(task, context);

        // Report completion
        await this.mcp.call("complete_task", {
          task_id: task.id,
          status: "completed",
          implementation_notes: result.notes,
          files_modified: result.files
        });

      } catch (error) {
        console.error("Agent error:", error);
        await this.sleep(5000);
      }
    }
  }

  async executeTask(task, context) {
    // Implement task execution logic
    // This would contain your agent's core logic
    return {
      notes: "Task completed successfully",
      files: ["src/example.js"]
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Next Steps

1. **Setup MCP Client**: Configure your MCP client with the server URL and API key
2. **Test Connection**: Use the basic tools to verify connectivity
3. **Implement Workflow**: Build your agent's task execution logic
4. **Monitor Performance**: Track context usage and task completion rates
5. **Optimize**: Refine context requests and task handling based on metrics

For more information, see:
- [API Documentation](../API.md)
- [Architecture Overview](../ARCHITECTURE.md)
- [Troubleshooting Guide](../TROUBLESHOOTING.md) 