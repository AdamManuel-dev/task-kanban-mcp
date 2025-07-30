/**
 * @fileoverview MCP note management tools configuration
 * @lastmodified 2025-01-28T10:30:00Z
 *
 * Features: Note CRUD operations, search, categorization
 * Main APIs: addNote, updateNote, deleteNote, searchNotes, getTaskNotes
 * Constraints: Requires NoteService, task_id validation for note creation
 * Patterns: All tools return Promise<Tool[]>, category enum consistency
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function getNoteTools(): Tool[] {
  return [
    {
      name: 'add_note',
      description: 'Add a note to a task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to add note to' },
          content: { type: 'string', description: 'Note content' },
          category: {
            type: 'string',
            enum: ['comment', 'requirement', 'technical', 'meeting', 'decision', 'risk'],
            description: 'Note category',
            default: 'comment',
          },
          priority: {
            type: 'number',
            description: 'Note priority (1-5)',
            minimum: 1,
            maximum: 5,
            default: 3,
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Note tags for organization',
          },
          is_private: {
            type: 'boolean',
            description: 'Whether note is private to creator',
            default: false,
          },
        },
        required: ['task_id', 'content'],
      },
    },
    {
      name: 'update_note',
      description: 'Update an existing note',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string', description: 'Note ID to update' },
          content: { type: 'string', description: 'Updated note content' },
          category: {
            type: 'string',
            enum: ['comment', 'requirement', 'technical', 'meeting', 'decision', 'risk'],
            description: 'Note category',
          },
          priority: {
            type: 'number',
            description: 'Note priority (1-5)',
            minimum: 1,
            maximum: 5,
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Note tags for organization',
          },
          is_private: {
            type: 'boolean',
            description: 'Whether note is private to creator',
          },
        },
        required: ['note_id'],
      },
    },
    {
      name: 'delete_note',
      description: 'Delete a note',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string', description: 'Note ID to delete' },
          soft_delete: {
            type: 'boolean',
            description: 'Soft delete (mark as deleted) instead of permanent removal',
            default: true,
          },
        },
        required: ['note_id'],
      },
    },
    {
      name: 'get_task_notes',
      description: 'Get all notes for a specific task',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID to get notes for' },
          category: {
            type: 'string',
            enum: ['comment', 'requirement', 'technical', 'meeting', 'decision', 'risk'],
            description: 'Filter by note category',
          },
          include_private: {
            type: 'boolean',
            description: 'Include private notes (if authorized)',
            default: false,
          },
          sort_by: {
            type: 'string',
            enum: ['created_at', 'updated_at', 'priority'],
            description: 'Sort notes by field',
            default: 'created_at',
          },
          sort_order: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort order',
            default: 'desc',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of notes',
            default: 50,
            maximum: 200,
          },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'search_notes',
      description: 'Search notes across tasks',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for note content' },
          board_id: { type: 'string', description: 'Limit search to specific board' },
          task_id: { type: 'string', description: 'Limit search to specific task' },
          category: {
            type: 'string',
            enum: ['comment', 'requirement', 'technical', 'meeting', 'decision', 'risk'],
            description: 'Filter by note category',
          },
          priority_min: {
            type: 'number',
            description: 'Minimum priority level',
            minimum: 1,
            maximum: 5,
          },
          priority_max: {
            type: 'number',
            description: 'Maximum priority level',
            minimum: 1,
            maximum: 5,
          },
          date_from: {
            type: 'string',
            format: 'date-time',
            description: 'Search notes created after this date',
          },
          date_to: {
            type: 'string',
            format: 'date-time',
            description: 'Search notes created before this date',
          },
          include_private: {
            type: 'boolean',
            description: 'Include private notes (if authorized)',
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
  ];
}
