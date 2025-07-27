# MCP Tool Usage Guide for AI Agents

## Introduction

This guide provides comprehensive instructions for AI agents using the MCP (Model Context Protocol) tools to interact with the Kanban system. It covers best practices, advanced workflows, and real-world examples.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Workflow Patterns](#core-workflow-patterns)
3. [Advanced Features](#advanced-features)
4. [Best Practices](#best-practices)
5. [Common Workflows](#common-workflows)
6. [Error Handling](#error-handling)
7. [Performance Tips](#performance-tips)

## Getting Started

### Basic Task Creation Workflow

When creating tasks for users, follow this pattern:

1. **Get context first**
```json
{
  "tool": "get_project_context",
  "arguments": {
    "include_metrics": true,
    "max_items": 10
  }
}
```

2. **Select appropriate board**
```json
{
  "tool": "list_boards",
  "arguments": {
    "limit": 10
  }
}
```

3. **Create the task**
```json
{
  "tool": "create_task",
  "arguments": {
    "title": "Implement user authentication",
    "board_id": "board-123",
    "priority": 4,
    "estimated_hours": 8
  }
}
```

## Core Workflow Patterns

### Pattern 1: Intelligent Task Breakdown

When a user requests a complex feature, break it down into subtasks:

```javascript
// 1. Create parent task
const parentTask = await callTool("create_task", {
  title: "Implement shopping cart feature",
  board_id: boardId,
  priority: 4,
  description: "Complete shopping cart implementation with checkout"
});

// 2. Create subtasks
const subtasks = [
  "Design cart data model",
  "Implement add to cart API",
  "Create cart UI components",
  "Implement checkout flow",
  "Add payment integration"
];

for (const subtaskTitle of subtasks) {
  await callTool("create_subtask", {
    parent_task_id: parentTask.id,
    title: subtaskTitle,
    board_id: boardId,
    priority: 3
  });
}

// 3. Set dependencies
await callTool("set_task_dependency", {
  task_id: checkoutTaskId,
  depends_on_task_id: cartApiTaskId,
  dependency_type: "blocks"
});
```

### Pattern 2: Template-Based Task Creation

Use templates for common task types:

```javascript
// 1. List available templates
const templates = await callTool("list_task_templates", {
  category: "bug"
});

// 2. Create task from template
const bugTask = await callTool("create_task_from_template", {
  template_id: "bug-report-template",
  board_id: boardId,
  variables: {
    summary: "Login button not working",
    browser: "Chrome 120",
    severity: "high",
    steps: "1. Go to login page\n2. Click login button\n3. Nothing happens"
  }
});
```

### Pattern 3: Priority-Based Planning

Help users focus on the right tasks:

```javascript
// 1. Get priority suggestions
const priorities = await callTool("get_priority_suggestions", {
  board_id: boardId,
  include_reasoning: true
});

// 2. Present recommendations
console.log("Based on your current workload, I recommend focusing on:");
priorities.slice(0, 3).forEach((task, i) => {
  console.log(`${i + 1}. ${task.title}`);
  console.log(`   Priority: ${task.priority} - ${task.reasoning.join(", ")}`);
});
```

## Advanced Features

### Dependency Management

Create complex project structures with dependencies:

```javascript
// Frontend depends on API
await callTool("set_task_dependency", {
  task_id: frontendTaskId,
  depends_on_task_id: apiTaskId,
  dependency_type: "blocks"
});

// Get dependency graph
const graph = await callTool("get_dependency_graph", {
  board_id: boardId,
  format: "tree"
});

// Find critical path
const criticalPath = await callTool("get_critical_path", {
  board_id: boardId
});
```

### Context-Aware Suggestions

Use context to make intelligent suggestions:

```javascript
// 1. Get task context
const context = await callTool("get_task_context", {
  task_id: taskId,
  include_history: true
});

// 2. Analyze patterns
if (context.history.priority_changes > 3) {
  console.log("This task has had multiple priority changes. Consider:");
  console.log("- Breaking it into smaller tasks");
  console.log("- Clarifying requirements");
  console.log("- Setting a fixed deadline");
}

// 3. Suggest related tasks
if (context.related_tasks.length > 0) {
  console.log("Related tasks that might be affected:");
  context.related_tasks.forEach(task => {
    console.log(`- ${task.title} (${task.status})`);
  });
}
```

### Template Management

Create and use custom templates:

```javascript
// Create a custom template
await callTool("create_task_template", {
  name: "Feature Request",
  category: "feature",
  title_template: "Feature: {{feature_name}}",
  description_template: `## User Story
As a {{user_type}}, I want {{goal}} so that {{benefit}}.

## Acceptance Criteria
- [ ] {{criteria1}}
- [ ] {{criteria2}}

## Technical Notes
{{technical_notes}}`,
  priority: 2,
  tags: ["feature", "needs-review"]
});
```

## Best Practices

### 1. Always Check Context First

Before creating or modifying tasks, understand the current state:

```javascript
const context = await callTool("get_project_context");
if (context.key_metrics.blocked_count > 5) {
  console.log("⚠️ You have several blocked tasks. Would you like to address those first?");
}
```

### 2. Use Atomic Operations

Make changes in logical groups:

```javascript
// Good: Atomic operation
const result = await callTool("bulk_update_tasks", {
  task_ids: [task1, task2, task3],
  updates: { status: "in_progress" }
});

// Avoid: Multiple individual updates
// for (const taskId of tasks) {
//   await callTool("update_task", { id: taskId, status: "in_progress" });
// }
```

### 3. Provide Clear Reasoning

When making suggestions or changes, explain why:

```javascript
const suggestion = {
  action: "increase_priority",
  task_id: taskId,
  reasoning: [
    "This task blocks 3 other tasks",
    "It's 2 days overdue",
    "It's assigned to a key team member"
  ]
};
```

### 4. Handle Errors Gracefully

```javascript
try {
  const task = await callTool("create_task", taskData);
} catch (error) {
  if (error.code === "BOARD_NOT_FOUND") {
    // Suggest creating a board or selecting a different one
    const boards = await callTool("list_boards");
    console.log("That board doesn't exist. Available boards:");
    boards.forEach(b => console.log(`- ${b.name} (${b.id})`));
  }
}
```

## Common Workflows

### Daily Standup Helper

```javascript
async function dailyStandup(userId) {
  // Yesterday's completed tasks
  const completed = await callTool("search_tasks", {
    assignee: userId,
    status: "done",
    updated_after: yesterday(),
    limit: 10
  });

  // Today's tasks
  const inProgress = await callTool("list_tasks", {
    assignee: userId,
    status: "in_progress"
  });

  // Blockers
  const blocked = await callTool("get_blocked_tasks", {
    assignee: userId
  });

  return {
    yesterday: completed,
    today: inProgress,
    blockers: blocked
  };
}
```

### Sprint Planning Assistant

```javascript
async function planSprint(boardId, sprintDuration = 14) {
  // Get velocity data
  const velocity = await callTool("get_velocity_metrics", {
    board_id: boardId,
    days_back: 30
  });

  // Get prioritized backlog
  const backlog = await callTool("get_priority_suggestions", {
    board_id: boardId,
    status: "todo",
    limit: 50
  });

  // Calculate capacity
  const capacity = velocity.average_points_per_day * sprintDuration;

  // Select tasks for sprint
  let totalPoints = 0;
  const sprintTasks = [];
  
  for (const task of backlog) {
    if (totalPoints + task.estimated_points <= capacity) {
      sprintTasks.push(task);
      totalPoints += task.estimated_points;
    }
  }

  return {
    recommended_tasks: sprintTasks,
    total_points: totalPoints,
    capacity: capacity,
    confidence: velocity.consistency_score
  };
}
```

### Intelligent Task Assignment

```javascript
async function assignTask(taskId) {
  // Get task details
  const task = await callTool("get_task", { id: taskId });
  
  // Get team members' workload
  const workloads = await callTool("get_team_workload", {
    board_id: task.board_id
  });

  // Find best assignee based on:
  // - Current workload
  // - Skill match (via tags)
  // - Past performance on similar tasks
  const recommendations = workloads
    .filter(member => member.capacity > 0)
    .filter(member => hasMatchingSkills(member.skills, task.tags))
    .sort((a, b) => {
      // Prioritize by available capacity and skill match
      const scoreA = a.capacity * a.skill_match_score;
      const scoreB = b.capacity * b.skill_match_score;
      return scoreB - scoreA;
    });

  return recommendations[0];
}
```

## Error Handling

### Common Error Patterns

```javascript
const errorHandlers = {
  TASK_NOT_FOUND: async (error, context) => {
    console.log("Task not found. It may have been deleted.");
    // Suggest searching for similar tasks
    const similar = await callTool("search_tasks", {
      query: context.originalQuery,
      limit: 5
    });
    if (similar.length > 0) {
      console.log("Did you mean one of these?");
      similar.forEach(t => console.log(`- ${t.title} (${t.id})`));
    }
  },

  CIRCULAR_DEPENDENCY: async (error, context) => {
    console.log("Cannot create this dependency - it would create a cycle.");
    const graph = await callTool("get_dependency_graph", {
      task_id: context.taskId
    });
    console.log("Current dependency chain:", graph.chain);
  },

  RATE_LIMIT_EXCEEDED: async (error) => {
    console.log("Too many requests. Waiting 60 seconds...");
    await sleep(60000);
    // Retry the operation
  }
};
```

## Performance Tips

### 1. Batch Operations

```javascript
// Good: Single batch operation
const results = await callTool("bulk_create_tasks", {
  tasks: taskDataArray
});

// Avoid: Multiple individual creates
// for (const data of taskDataArray) {
//   await callTool("create_task", data);
// }
```

### 2. Use Filters Effectively

```javascript
// Good: Specific query
const tasks = await callTool("list_tasks", {
  board_id: boardId,
  status: "in_progress",
  assignee: userId,
  limit: 20
});

// Avoid: Getting all tasks then filtering
// const allTasks = await callTool("list_tasks", { limit: 1000 });
// const filtered = allTasks.filter(t => t.status === "in_progress");
```

### 3. Cache Context Data

```javascript
// Cache context for session
let projectContext = null;
let contextAge = 0;

async function getContext(forceRefresh = false) {
  const now = Date.now();
  if (!projectContext || forceRefresh || now - contextAge > 300000) {
    projectContext = await callTool("get_project_context");
    contextAge = now;
  }
  return projectContext;
}
```

### 4. Use Incremental Updates

```javascript
// Good: Update only what changed
await callTool("update_task", {
  id: taskId,
  status: "done",
  completed_at: new Date().toISOString()
});

// Avoid: Updating everything
// const task = await callTool("get_task", { id: taskId });
// task.status = "done";
// await callTool("update_task", task);
```

## Summary

The MCP tools provide powerful capabilities for AI agents to help users manage their tasks effectively. By following these patterns and best practices, you can create intelligent, context-aware assistants that truly understand and enhance the user's workflow.

Remember to:
- Always consider context before taking action
- Provide clear reasoning for suggestions
- Handle errors gracefully
- Use efficient patterns for better performance
- Break complex operations into manageable steps

For more details on specific tools, refer to the [MCP API Reference](./MCP.md). 