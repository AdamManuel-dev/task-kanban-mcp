# Enhanced MCP Tool Usage Guide for AI Agents

## Introduction

This enhanced guide provides comprehensive instructions for AI agents using the MCP (Model Context Protocol) tools to interact with the advanced Kanban system. It covers best practices, advanced workflows, and real-world examples for the complete feature set.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Advanced Task Management](#advanced-task-management)
3. [Project Planning & Dependencies](#project-planning--dependencies)
4. [Analytics & Performance](#analytics--performance)
5. [Real-time Collaboration](#real-time-collaboration)
6. [Best Practices](#best-practices)
7. [Common Workflows](#common-workflows)
8. [Error Handling](#error-handling)

## Quick Start

### Initial Setup Workflow

When a user first asks for help with project management:

1. **Get context and check system health**
```json
{
  "tool": "get_system_health",
  "parameters": {}
}
```

2. **List available boards to understand current setup**
```json
{
  "tool": "list_boards",
  "parameters": {}
}
```

3. **If no boards exist, offer to create one**
```json
{
  "tool": "create_board",
  "parameters": {
    "name": "Main Project Board",
    "description": "Primary project management board",
    "columns": [
      {"name": "Backlog", "position": 0},
      {"name": "In Progress", "position": 1},
      {"name": "Review", "position": 2},
      {"name": "Done", "position": 3}
    ]
  }
}
```

## Advanced Task Management

### Creating Tasks with Full Context

When creating tasks, gather comprehensive information:

```json
{
  "tool": "create_task",
  "parameters": {
    "title": "Implement user authentication system",
    "description": "Create a secure authentication system with JWT tokens, password hashing, and session management",
    "board_id": "board-123",
    "column_id": "col-backlog",
    "priority": 3,
    "estimated_hours": 8,
    "due_date": "2024-02-15T17:00:00Z",
    "tags": ["authentication", "security", "backend"],
    "assignee": "developer@example.com"
  }
}
```

### Subtask Management

For complex tasks, break them down into subtasks:

```json
{
  "tool": "create_subtask",
  "parameters": {
    "parent_task_id": "task-123",
    "title": "Set up JWT token generation",
    "description": "Implement JWT token creation with proper signing and expiration",
    "priority": 3,
    "estimated_hours": 2,
    "assignee": "backend-dev@example.com"
  }
}
```

### Using Templates for Consistency

Always check for relevant templates before creating tasks:

```json
{
  "tool": "list_templates",
  "parameters": {
    "category": "feature"
  }
}
```

Then create from template:

```json
{
  "tool": "create_task_from_template",
  "parameters": {
    "template_id": "feature-template",
    "title": "User Dashboard",
    "board_id": "board-123",
    "variables": {
      "feature_type": "dashboard",
      "complexity": "medium",
      "estimated_story_points": 5
    }
  }
}
```

## Project Planning & Dependencies

### Dependency Management

When planning projects, identify and create dependencies:

1. **First, analyze existing dependencies**
```json
{
  "tool": "get_task_dependencies",
  "parameters": {
    "task_id": "task-123"
  }
}
```

2. **Create blocking dependencies**
```json
{
  "tool": "add_task_dependency",
  "parameters": {
    "task_id": "task-frontend-auth",
    "depends_on_task_id": "task-backend-auth",
    "dependency_type": "blocks"
  }
}
```

3. **Analyze critical path for project planning**
```json
{
  "tool": "analyze_critical_path",
  "parameters": {
    "board_id": "board-123"
  }
}
```

### Project Structure Planning

For large projects, create a hierarchical structure:

```json
{
  "tool": "create_epic_with_stories",
  "parameters": {
    "epic_title": "User Management System",
    "epic_description": "Complete user management with authentication, profiles, and permissions",
    "board_id": "board-123",
    "stories": [
      {
        "title": "User Authentication",
        "estimated_hours": 20,
        "subtasks": [
          "JWT token implementation",
          "Password hashing",
          "Login endpoint",
          "Logout functionality"
        ]
      },
      {
        "title": "User Profiles",
        "estimated_hours": 15,
        "dependencies": ["User Authentication"]
      }
    ]
  }
}
```

## Analytics & Performance

### Completion Analytics

Regularly check project progress and team performance:

```json
{
  "tool": "get_completion_analytics",
  "parameters": {
    "board_id": "board-123",
    "timeframe_days": 30
  }
}
```

### Velocity Tracking

Monitor team velocity for better planning:

```json
{
  "tool": "get_velocity_metrics",
  "parameters": {
    "board_id": "board-123",
    "sprint_length": 14
  }
}
```

### Performance Monitoring

Keep track of system performance:

```json
{
  "tool": "get_performance_dashboard",
  "parameters": {}
}
```

### Predictive Analytics

Use analytics for better project estimation:

```json
{
  "tool": "predict_completion_date",
  "parameters": {
    "board_id": "board-123",
    "remaining_tasks": 15,
    "current_velocity": 8.5
  }
}
```

## Real-time Collaboration

### Managing Real-time Updates

When multiple team members are working, use real-time features:

```json
{
  "tool": "subscribe_to_board_updates",
  "parameters": {
    "board_id": "board-123",
    "event_types": [
      "task:created",
      "task:updated", 
      "subtask:completed",
      "dependency:added"
    ]
  }
}
```

### User Presence and Activity

Track team activity for better coordination:

```json
{
  "tool": "get_user_activity",
  "parameters": {
    "board_id": "board-123",
    "timeframe_hours": 24
  }
}
```

## Best Practices

### Context Gathering

Always gather sufficient context before making recommendations:

1. **Check current project state**
```json
{
  "tool": "get_board_summary",
  "parameters": {
    "board_id": "board-123",
    "include_analytics": true
  }
}
```

2. **Understand team capacity**
```json
{
  "tool": "get_team_workload",
  "parameters": {
    "board_id": "board-123"
  }
}
```

### Intelligent Task Prioritization

Use AI-powered prioritization with context:

```json
{
  "tool": "suggest_task_priority",
  "parameters": {
    "task_id": "task-123",
    "factors": {
      "business_impact": "high",
      "technical_complexity": "medium",
      "dependencies": ["task-456"],
      "deadline": "2024-02-20T00:00:00Z"
    }
  }
}
```

### Smart Template Selection

Choose appropriate templates based on task type:

```json
{
  "tool": "recommend_template",
  "parameters": {
    "task_description": "Fix login button not responding on mobile devices",
    "context": {
      "type": "bug",
      "platform": "mobile",
      "severity": "high"
    }
  }
}
```

## Common Workflows

### Bug Triage Workflow

When a user reports a bug:

1. **Create bug task from template**
```json
{
  "tool": "create_task_from_template",
  "parameters": {
    "template_id": "bug-report",
    "title": "Login button unresponsive on iOS Safari",
    "variables": {
      "severity": "high",
      "platform": "iOS Safari",
      "reproduction_steps": "1. Open app in Safari\n2. Click login\n3. Nothing happens",
      "expected_behavior": "Should open login form",
      "actual_behavior": "Button appears frozen"
    }
  }
}
```

2. **Analyze impact and set priority**
```json
{
  "tool": "analyze_bug_impact",
  "parameters": {
    "task_id": "bug-task-123",
    "affected_users": 1500,
    "platform_usage": 0.3
  }
}
```

### Sprint Planning Workflow

For sprint planning sessions:

1. **Get velocity data**
```json
{
  "tool": "get_historical_velocity",
  "parameters": {
    "board_id": "board-123",
    "sprint_count": 6
  }
}
```

2. **Suggest sprint backlog**
```json
{
  "tool": "suggest_sprint_backlog",
  "parameters": {
    "board_id": "board-123",
    "team_velocity": 45,
    "sprint_length": 14,
    "priorities": ["P0", "P1", "P2"]
  }
}
```

### Release Planning Workflow

For release planning:

1. **Analyze release readiness**
```json
{
  "tool": "analyze_release_readiness",
  "parameters": {
    "board_id": "board-123",
    "target_date": "2024-03-01T00:00:00Z",
    "required_features": ["authentication", "user-profiles", "notifications"]
  }
}
```

2. **Generate release notes**
```json
{
  "tool": "generate_release_notes",
  "parameters": {
    "board_id": "board-123",
    "version": "v2.1.0",
    "from_date": "2024-01-01T00:00:00Z",
    "to_date": "2024-02-28T00:00:00Z"
  }
}
```

## Error Handling

### Graceful Degradation

Always handle errors gracefully and provide helpful suggestions:

```json
{
  "tool": "handle_api_error",
  "parameters": {
    "error_code": "BOARD_NOT_FOUND",
    "user_action": "create_task",
    "suggestions": [
      "Check if board ID is correct",
      "List available boards",
      "Create a new board if needed"
    ]
  }
}
```

### Validation and Safeguards

Before performing destructive operations:

```json
{
  "tool": "validate_dependency_removal",
  "parameters": {
    "task_id": "task-123",
    "dependency_id": "task-456",
    "check_blocking": true
  }
}
```

### Recovery Strategies

For common issues, provide recovery options:

```json
{
  "tool": "suggest_recovery_options",
  "parameters": {
    "issue_type": "circular_dependency",
    "affected_tasks": ["task-123", "task-456", "task-789"],
    "board_id": "board-123"
  }
}
```

## Advanced Integration Patterns

### Git Integration

When users mention code or branches:

```json
{
  "tool": "link_task_to_branch",
  "parameters": {
    "task_id": "task-123",
    "branch_name": "feature/user-authentication",
    "repository": "main-app",
    "auto_update": true
  }
}
```

### Automated Workflows

Set up automation for common patterns:

```json
{
  "tool": "create_automation_rule",
  "parameters": {
    "name": "Auto-assign code review tasks",
    "trigger": {
      "event": "task:moved",
      "condition": "column_name == 'Ready for Review'"
    },
    "action": {
      "type": "assign_reviewer",
      "reviewer_pool": ["senior-dev-1", "senior-dev-2"],
      "criteria": "least_workload"
    }
  }
}
```

### Cross-board Dependencies

For multi-project coordination:

```json
{
  "tool": "create_cross_board_dependency",
  "parameters": {
    "source_task_id": "task-123",
    "source_board_id": "frontend-board",
    "target_task_id": "task-456", 
    "target_board_id": "backend-board",
    "dependency_type": "blocks"
  }
}
```

## Performance Optimization

### Bulk Operations

For efficiency, use bulk operations when possible:

```json
{
  "tool": "bulk_update_tasks",
  "parameters": {
    "task_ids": ["task-1", "task-2", "task-3"],
    "updates": {
      "assignee": "new-team-member@example.com",
      "tags": ["migration", "priority"]
    }
  }
}
```

### Caching Strategies

Cache frequently accessed data:

```json
{
  "tool": "cache_board_data",
  "parameters": {
    "board_id": "board-123",
    "cache_duration": 300,
    "include": ["tasks", "analytics", "dependencies"]
  }
}
```

## Conclusion

This enhanced MCP tool usage guide provides AI agents with comprehensive patterns for effective task management. By following these practices, agents can:

- Provide intelligent project management assistance
- Help teams optimize their workflows
- Maintain context across complex project structures
- Handle errors gracefully
- Integrate with development workflows

Remember to always prioritize user experience and provide clear, actionable recommendations based on the current project context and team dynamics. 