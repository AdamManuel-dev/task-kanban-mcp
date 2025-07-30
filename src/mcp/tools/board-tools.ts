/**
 * @fileoverview MCP board management tools configuration
 * @lastmodified 2025-01-28T10:30:00Z
 *
 * Features: Board CRUD operations, statistics, team management
 * Main APIs: createBoard, updateBoard, getBoard, listBoards, deleteBoard, getBoardStats
 * Constraints: Requires BoardService, name uniqueness validation
 * Patterns: All tools return Promise<Tool[]>, consistent color/status enums
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function getBoardTools(): Tool[] {
  return [
    {
      name: 'create_board',
      description: 'Create a new kanban board',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Board name' },
          description: { type: 'string', description: 'Board description' },
          color: {
            type: 'string',
            description: 'Board color theme',
            enum: ['blue', 'green', 'purple', 'orange', 'red', 'gray'],
            default: 'blue',
          },
          is_public: {
            type: 'boolean',
            description: 'Whether board is publicly visible',
            default: false,
          },
          columns: {
            type: 'array',
            description: 'Initial columns to create',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                position: { type: 'number' },
                color: { type: 'string' },
              },
              required: ['name'],
            },
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_board',
      description: 'Update board details',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID to update' },
          name: { type: 'string', description: 'New board name' },
          description: { type: 'string', description: 'New board description' },
          color: {
            type: 'string',
            enum: ['blue', 'green', 'purple', 'orange', 'red', 'gray'],
            description: 'Board color theme',
          },
          is_public: { type: 'boolean', description: 'Public visibility setting' },
        },
        required: ['board_id'],
      },
    },
    {
      name: 'get_board',
      description: 'Get board details with optional task data',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID to retrieve' },
          include_tasks: {
            type: 'boolean',
            description: 'Include tasks in response',
            default: true,
          },
          include_columns: {
            type: 'boolean',
            description: 'Include column information',
            default: true,
          },
          include_stats: {
            type: 'boolean',
            description: 'Include board statistics',
            default: false,
          },
          task_limit: {
            type: 'number',
            description: 'Maximum tasks per column',
            default: 50,
            maximum: 200,
          },
        },
        required: ['board_id'],
      },
    },
    {
      name: 'list_boards',
      description: 'List all boards with filtering options',
      inputSchema: {
        type: 'object',
        properties: {
          include_public: {
            type: 'boolean',
            description: 'Include public boards',
            default: true,
          },
          include_private: {
            type: 'boolean',
            description: 'Include private boards',
            default: true,
          },
          search: { type: 'string', description: 'Search boards by name or description' },
          color: {
            type: 'string',
            enum: ['blue', 'green', 'purple', 'orange', 'red', 'gray'],
            description: 'Filter by color',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of boards',
            default: 20,
            maximum: 100,
          },
          include_stats: {
            type: 'boolean',
            description: 'Include basic statistics for each board',
            default: false,
          },
        },
        required: [],
      },
    },
    {
      name: 'delete_board',
      description: 'Delete a board and optionally its tasks',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID to delete' },
          delete_tasks: {
            type: 'boolean',
            description: 'Also delete all tasks in the board',
            default: false,
          },
          force: {
            type: 'boolean',
            description: 'Force delete even if board has tasks',
            default: false,
          },
        },
        required: ['board_id'],
      },
    },
    {
      name: 'get_board_stats',
      description: 'Get detailed statistics for a board',
      inputSchema: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Board ID for statistics' },
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
          include_timeline: {
            type: 'boolean',
            description: 'Include task creation timeline',
            default: false,
          },
          days_back: {
            type: 'number',
            description: 'Days of history to include in timeline',
            default: 30,
            maximum: 365,
          },
        },
        required: ['board_id'],
      },
    },
  ];
}
