/**
 * @fileoverview MCP tag management tools configuration
 * @lastmodified 2025-01-28T10:30:00Z
 *
 * Features: Tag CRUD operations, assignment, statistics
 * Main APIs: createTag, updateTag, deleteTag, assignTag, removeTag, listTags
 * Constraints: Requires TagService, name uniqueness validation
 * Patterns: All tools return Promise<Tool[]>, consistent color enums
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function getTagTools(): Tool[] {
  return [
    {
      name: 'create_tag',
      description: 'Create a new tag',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Tag name' },
          color: {
            type: 'string',
            description: 'Tag color',
            enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'],
            default: 'blue',
          },
          description: { type: 'string', description: 'Tag description' },
          is_system: {
            type: 'boolean',
            description: 'Whether this is a system tag',
            default: false,
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_tag',
      description: 'Update an existing tag',
      inputSchema: {
        type: 'object',
        properties: {
          tag_id: { type: 'string', description: 'Tag ID to update' },
          name: { type: 'string', description: 'New tag name' },
          color: {
            type: 'string',
            enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'],
            description: 'Tag color',
          },
          description: { type: 'string', description: 'Tag description' },
        },
        required: ['tag_id'],
      },
    },
    {
      name: 'delete_tag',
      description: 'Delete a tag and optionally remove from all tasks',
      inputSchema: {
        type: 'object',
        properties: {
          tag_id: { type: 'string', description: 'Tag ID to delete' },
          remove_from_tasks: {
            type: 'boolean',
            description: 'Remove tag from all tasks before deletion',
            default: true,
          },
          force: {
            type: 'boolean',
            description: 'Force delete even if tag is in use',
            default: false,
          },
        },
        required: ['tag_id'],
      },
    },
    {
      name: 'list_tags',
      description: 'List all tags with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search tags by name or description' },
          color: {
            type: 'string',
            enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'],
            description: 'Filter by color',
          },
          include_system: {
            type: 'boolean',
            description: 'Include system tags',
            default: true,
          },
          include_usage_count: {
            type: 'boolean',
            description: 'Include count of tasks using each tag',
            default: false,
          },
          sort_by: {
            type: 'string',
            enum: ['name', 'created_at', 'usage_count'],
            description: 'Sort tags by field',
            default: 'name',
          },
          sort_order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort order',
            default: 'asc',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of tags',
            default: 50,
            maximum: 200,
          },
        },
        required: [],
      },
    },
    {
      name: 'assign_tag',
      description: 'Assign a tag to a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to tag' },
          tag_id: { type: 'string', description: 'Tag ID to assign' },
          auto_create: {
            type: 'boolean',
            description: "Create tag if it doesn't exist (by name)",
            default: false,
          },
          tag_name: {
            type: 'string',
            description: 'Tag name for auto-creation (if auto_create is true)',
          },
        },
        required: ['task_id', 'tag_id'],
      },
    },
    {
      name: 'remove_tag',
      description: 'Remove a tag from a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to remove tag from' },
          tag_id: { type: 'string', description: 'Tag ID to remove' },
        },
        required: ['task_id', 'tag_id'],
      },
    },
    {
      name: 'get_task_tags',
      description: 'Get all tags assigned to a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to get tags for' },
          include_system: {
            type: 'boolean',
            description: 'Include system tags',
            default: true,
          },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'get_tag_stats',
      description: 'Get statistics for tag usage',
      inputSchema: {
        type: 'object',
        properties: {
          tag_id: { type: 'string', description: 'Tag ID for statistics' },
          board_id: { type: 'string', description: 'Limit stats to specific board' },
          include_task_breakdown: {
            type: 'boolean',
            description: 'Include task status breakdown',
            default: true,
          },
          include_priority_analysis: {
            type: 'boolean',
            description: 'Include priority distribution',
            default: true,
          },
        },
        required: ['tag_id'],
      },
    },
  ];
}
