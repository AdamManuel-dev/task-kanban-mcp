/**
 * @fileoverview MCP task management tools configuration
 * @lastmodified 2025-01-28T10:30:00Z
 *
 * Features: Task CRUD operations, search, dependency management
 * Main APIs: createTask, updateTask, getTask, listTasks, searchTasks, deleteTask
 * Constraints: Requires TaskService, board_id validation for create operations
 * Patterns: All tools return Promise<Tool[]>, consistent schema structure
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function getTaskTools(): Tool[] {
  return [
    {
      name: 'create_task',
      description: 'Create a new task in a board',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          board_id: { type: 'string', description: 'Board ID where task will be created' },
          column_id: { type: 'string', description: 'Column ID for task placement' },
          priority: {
            type: 'number',
            description: 'Task priority (1-5)',
            minimum: 1,
            maximum: 5,
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'blocked', 'archived'],
            description: 'Task status',
          },
          assignee: { type: 'string', description: 'User ID of assignee' },
          due_date: {
            type: 'string',
            format: 'date-time',
            description: 'Due date in ISO format',
          },
          tags: { type: 'array', items: { type: 'string' }, description: 'Array of tag IDs' },
        },
        required: ['title', 'board_id'],
      },
    },
    {
      name: 'update_task',
      description: 'Update an existing task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to update' },
          title: { type: 'string', description: 'New task title' },
          description: { type: 'string', description: 'New task description' },
          priority: {
            type: 'number',
            description: 'Task priority (1-5)',
            minimum: 1,
            maximum: 5,
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'blocked', 'archived'],
            description: 'Task status',
          },
          assignee: { type: 'string', description: 'User ID of assignee' },
          due_date: {
            type: 'string',
            format: 'date-time',
            description: 'Due date in ISO format',
          },
          progress: {
            type: 'number',
            description: 'Progress percentage (0-100)',
            minimum: 0,
            maximum: 100,
          },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'get_task',
      description: 'Get task details by ID',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to retrieve' },
          include_subtasks: {
            type: 'boolean',
            description: 'Include subtasks in response',
            default: false,
          },
          include_dependencies: {
            type: 'boolean',
            description: 'Include dependencies in response',
            default: false,
          },
          include_notes: {
            type: 'boolean',
            description: 'Include notes in response',
            default: false,
          },
          include_tags: {
            type: 'boolean',
            description: 'Include tags in response',
            default: true,
          },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'list_tasks',
      description: 'List tasks with filtering options',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Filter by board ID' },
          column_id: { type: 'string', description: 'Filter by column ID' },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'done', 'blocked', 'archived'],
            description: 'Filter by status',
          },
          priority: {
            type: 'number',
            description: 'Filter by priority (1-5)',
            minimum: 1,
            maximum: 5,
          },
          assignee: { type: 'string', description: 'Filter by assignee' },
          due_before: {
            type: 'string',
            format: 'date-time',
            description: 'Filter tasks due before this date',
          },
          due_after: {
            type: 'string',
            format: 'date-time',
            description: 'Filter tasks due after this date',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tasks to return',
            default: 50,
            maximum: 200,
          },
          offset: {
            type: 'number',
            description: 'Number of tasks to skip',
            default: 0,
          },
        },
        required: [],
      },
    },
    {
      name: 'search_tasks',
      description: 'Search tasks by title, description, or content',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          board_id: { type: 'string', description: 'Limit search to specific board' },
          include_description: {
            type: 'boolean',
            description: 'Include description in search',
            default: true,
          },
          include_notes: {
            type: 'boolean',
            description: 'Include task notes in search',
            default: false,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 20,
            maximum: 100,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'delete_task',
      description: 'Delete a task (with optional cascade to subtasks)',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to delete' },
          cascade: {
            type: 'boolean',
            description: 'Also delete subtasks and dependencies',
            default: false,
          },
          force: {
            type: 'boolean',
            description: 'Force delete even if task has dependencies',
            default: false,
          },
        },
        required: ['task_id'],
      },
    },
  ];
}
