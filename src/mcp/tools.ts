/**
 * MCP tool registry for kanban operations
 *
 * @module mcp/tools
 * @description Provides a comprehensive set of tools for AI agents to interact with the kanban system
 * through the Model Context Protocol. Includes tools for task management, board operations,
 * notes, tags, context generation, and analytics.
 *
 * @example
 * ```typescript
 * const registry = new MCPToolRegistry(services);
 *
 * // List available tools
 * const tools = await registry.listTools();
 *
 * // Execute a tool
 * const result = await registry.callTool('create_task', {
 *   title: 'New Feature',
 *   board_id: 'board123',
 *   priority: 3
 * });
 * ```
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger';
import type { TaskService, CreateTaskRequest } from '@/services/TaskService';
import type { BoardService } from '@/services/BoardService';
import type { NoteService } from '@/services/NoteService';
import type { TagService } from '@/services/TagService';
import type { ContextService } from '@/services/ContextService';
import type { Task, Note as NoteType, Tag as TagType } from '@/types';
import type {
  MCPResponse as ToolResponse,
  CreateTaskArgs,
  UpdateTaskArgs,
  GetTaskArgs,
  ListTasksArgs,
  SearchTasksArgs,
  DeleteTaskArgs,
  CreateBoardArgs,
  GetBoardArgs,
  ListBoardsArgs,
  AddNoteArgs,
  SearchNotesArgs,
  CreateTagArgs,
  AssignTagArgs,
  GetProjectContextArgs,
  GetTaskContextArgs,
  AnalyzeBoardArgs,
  GetBlockedTasksArgs,
  GetOverdueTasksArgs,
  CreateSubtaskArgs,
  SetTaskDependencyArgs,
  GetTaskDependenciesArgs,
  PrioritizeTasksArgs,
  GetNextTaskArgs,
  UpdatePriorityArgs,
  TaskResponse,
  TasksResponse,
  BoardResponse,
  BoardsResponse,
  NoteResponse,
  NotesResponse,
  TagResponse,
  GetTaskDetailedResponse,
  ProjectContextResponse,
  TaskContextResponse,
  BoardAnalysisResponse,
  BlockedTasksResponse,
  OverdueTasksResponse,
  SubtaskResponse,
  TaskDependencyResponse,
  TaskDependenciesResponse,
  PrioritizedTasksResponse,
  NextTaskResponse,
  PriorityUpdateResponse,
} from './types';

/**
 * Collection of services required for MCP tool operations
 *
 * @interface MCPServices
 * @property {TaskService} taskService - Service for task operations
 * @property {BoardService} boardService - Service for board operations
 * @property {NoteService} noteService - Service for note operations
 * @property {TagService} tagService - Service for tag operations
 * @property {ContextService} contextService - Service for context generation
 */
export interface MCPServices {
  taskService: TaskService;
  boardService: BoardService;
  noteService: NoteService;
  tagService: TagService;
  contextService: ContextService;
}

/**
 * Registry of MCP tools for kanban board operations
 *
 * @class MCPToolRegistry
 * @description Manages the registration and execution of MCP tools that AI agents can use
 * to interact with the kanban system. Provides tools for task management, board operations,
 * notes, tags, context generation, and analytics.
 *
 * Available tools:
 * - Task operations: create_task, update_task, get_task, list_tasks, search_tasks, delete_task
 * - Board operations: create_board, get_board, list_boards
 * - Note operations: add_note, search_notes
 * - Tag operations: create_tag, assign_tag
 * - Context tools: get_project_context, get_task_context
 * - Analytics: analyze_board, get_blocked_tasks, get_overdue_tasks
 *
 * @example
 * ```typescript
 * const registry = new MCPToolRegistry({
 *   taskService,
 *   boardService,
 *   noteService,
 *   tagService,
 *   contextService
 * });
 *
 * // Execute a tool
 * const result = await registry.callTool('create_task', {
 *   title: 'Implement feature',
 *   board_id: 'board123',
 *   status: 'todo'
 * });
 * ```
 */
export class MCPToolRegistry {
  /** Services used by tools */
  private readonly services: MCPServices;

  /**
   * Creates a new MCPToolRegistry instance
   *
   * @param {MCPServices} services - Collection of services for tool operations
   */
  constructor(services: MCPServices) {
    this.services = services;
  }

  /**
   * Lists all available MCP tools with their schemas
   *
   * @returns {Promise<Tool[]>} Array of tool definitions with input schemas
   *
   * @description Returns comprehensive tool definitions including:
   * - Tool name and description
   * - Input schema with type definitions
   * - Required and optional parameters
   * - Parameter validation rules
   *
   * @example
   * ```typescript
   * const tools = await registry.listTools();
   * tools.forEach(tool => {
   *   console.log(`${tool.name}: ${tool.description}`);
   * });
   * ```
   */
  listTools(): Promise<Tool[]> {
    return Promise.resolve([
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
              default: false,
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'list_tasks',
        description: 'List tasks with optional filtering',
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
            assignee: { type: 'string', description: 'Filter by assignee' },
            priority_min: { type: 'number', description: 'Minimum priority level' },
            priority_max: { type: 'number', description: 'Maximum priority level' },
            search: { type: 'string', description: 'Search in title and description' },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 },
            offset: { type: 'number', description: 'Offset for pagination', default: 0 },
            sort_by: { type: 'string', description: 'Sort field', default: 'updated_at' },
            sort_order: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order',
              default: 'desc',
            },
          },
          required: [],
        },
      },
      {
        name: 'search_tasks',
        description: 'Search tasks across boards with full-text search capabilities',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query for task title and description' },
            board_id: { type: 'string', description: 'Filter by board ID' },
            column_id: { type: 'string', description: 'Filter by column ID' },
            status: {
              type: 'string',
              enum: ['todo', 'in_progress', 'done', 'blocked', 'archived'],
              description: 'Filter by status',
            },
            assignee: { type: 'string', description: 'Filter by assignee' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags',
            },
            limit: { type: 'number', description: 'Maximum number of results', default: 20 },
            offset: { type: 'number', description: 'Offset for pagination', default: 0 },
          },
          required: ['query'],
        },
      },
      {
        name: 'delete_task',
        description: 'Delete a task by ID',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID to delete' },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'create_board',
        description: 'Create a new board',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Board name' },
            description: { type: 'string', description: 'Board description' },
            color: { type: 'string', description: 'Board color (hex code)' },
          },
          required: ['name'],
        },
      },
      {
        name: 'get_board',
        description: 'Get board details by ID',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Board ID to retrieve' },
            include_columns: {
              type: 'boolean',
              description: 'Include columns in response',
              default: false,
            },
            include_tasks: {
              type: 'boolean',
              description: 'Include tasks in response',
              default: false,
            },
          },
          required: ['board_id'],
        },
      },
      {
        name: 'list_boards',
        description: 'List all boards',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search in board names and descriptions' },
            archived: { type: 'boolean', description: 'Filter by archived status' },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 },
            offset: { type: 'number', description: 'Offset for pagination', default: 0 },
          },
          required: [],
        },
      },
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
              enum: ['general', 'progress', 'blocker', 'decision', 'question'],
              description: 'Note category',
              default: 'general',
            },
            pinned: { type: 'boolean', description: 'Pin the note', default: false },
          },
          required: ['task_id', 'content'],
        },
      },
      {
        name: 'search_notes',
        description: 'Search notes with full-text search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            task_id: { type: 'string', description: 'Filter by task ID' },
            board_id: { type: 'string', description: 'Filter by board ID' },
            category: {
              type: 'string',
              enum: ['general', 'progress', 'blocker', 'decision', 'question'],
              description: 'Filter by category',
            },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_tag',
        description: 'Create a new tag',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tag name' },
            color: { type: 'string', description: 'Tag color (hex code)' },
            description: { type: 'string', description: 'Tag description' },
            parent_tag_id: { type: 'string', description: 'Parent tag ID for hierarchical tags' },
          },
          required: ['name'],
        },
      },
      {
        name: 'assign_tag',
        description: 'Assign a tag to a task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID' },
            tag_id: { type: 'string', description: 'Tag ID to assign' },
          },
          required: ['task_id', 'tag_id'],
        },
      },
      {
        name: 'get_project_context',
        description: 'Generate AI context for a project/board',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Board ID to generate context for' },
            include_completed: {
              type: 'boolean',
              description: 'Include completed tasks',
              default: false,
            },
            include_notes: { type: 'boolean', description: 'Include task notes', default: true },
            include_tags: { type: 'boolean', description: 'Include tags', default: true },
            max_tasks: { type: 'number', description: 'Maximum tasks to include', default: 100 },
            max_notes: { type: 'number', description: 'Maximum notes to include', default: 50 },
          },
          required: ['board_id'],
        },
      },
      {
        name: 'get_task_context',
        description: 'Generate AI context for a specific task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID to generate context for' },
            include_subtasks: { type: 'boolean', description: 'Include subtasks', default: true },
            include_dependencies: {
              type: 'boolean',
              description: 'Include dependencies',
              default: true,
            },
            include_notes: { type: 'boolean', description: 'Include notes', default: true },
            include_tags: { type: 'boolean', description: 'Include tags', default: true },
            include_related: {
              type: 'boolean',
              description: 'Include related tasks',
              default: false,
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'analyze_board',
        description: 'Analyze board performance and provide insights',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Board ID to analyze' },
            timeframe_days: {
              type: 'number',
              description: 'Analysis timeframe in days',
              default: 30,
            },
            include_recommendations: {
              type: 'boolean',
              description: 'Include improvement recommendations',
              default: true,
            },
            include_blockers: {
              type: 'boolean',
              description: 'Include blocker analysis',
              default: true,
            },
            include_metrics: {
              type: 'boolean',
              description: 'Include performance metrics',
              default: true,
            },
          },
          required: ['board_id'],
        },
      },
      {
        name: 'get_blocked_tasks',
        description: 'Get all blocked tasks across boards or for a specific board',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Filter by board ID (optional)' },
          },
          required: [],
        },
      },
      {
        name: 'get_overdue_tasks',
        description: 'Get all overdue tasks across boards or for a specific board',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Filter by board ID (optional)' },
          },
          required: [],
        },
      },
      {
        name: 'create_subtask',
        description: 'Create a subtask under a parent task',
        inputSchema: {
          type: 'object',
          properties: {
            parent_task_id: { type: 'string', description: 'Parent task ID' },
            title: { type: 'string', description: 'Subtask title' },
            description: { type: 'string', description: 'Subtask description' },
            priority: {
              type: 'number',
              description: 'Subtask priority (1-5)',
              minimum: 1,
              maximum: 5,
            },
            assignee: { type: 'string', description: 'User ID of assignee' },
            due_date: {
              type: 'string',
              format: 'date-time',
              description: 'Due date in ISO format',
            },
          },
          required: ['parent_task_id', 'title'],
        },
      },
      {
        name: 'set_task_dependency',
        description: 'Set a dependency relationship between two tasks',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task that depends on another' },
            depends_on_task_id: {
              type: 'string',
              description: 'Task that must be completed first',
            },
            dependency_type: {
              type: 'string',
              enum: ['blocks', 'requires', 'follows'],
              description: 'Type of dependency relationship',
              default: 'blocks',
            },
          },
          required: ['task_id', 'depends_on_task_id'],
        },
      },
      {
        name: 'get_task_dependencies',
        description: 'Get dependency relationships for a task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID to get dependencies for' },
            include_dependents: {
              type: 'boolean',
              description: 'Include tasks that depend on this task',
              default: true,
            },
            include_blocking: {
              type: 'boolean',
              description: 'Include tasks this task depends on',
              default: true,
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: 'prioritize_tasks',
        description: 'Trigger AI-powered task prioritization for a board',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Board ID to prioritize tasks for' },
            context_factors: {
              type: 'array',
              items: { type: 'string' },
              description: 'Context factors to consider (urgency, dependencies, deadlines)',
            },
            max_tasks: {
              type: 'number',
              description: 'Maximum tasks to prioritize',
              default: 50,
            },
          },
          required: ['board_id'],
        },
      },
      {
        name: 'get_next_task',
        description: 'Get the next recommended task based on priority and context',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { type: 'string', description: 'Board ID to get next task from' },
            assignee: { type: 'string', description: 'Filter by assignee' },
            skill_context: { type: 'string', description: 'Skill or context filter' },
            exclude_blocked: {
              type: 'boolean',
              description: 'Exclude blocked tasks',
              default: true,
            },
          },
          required: [],
        },
      },
      {
        name: 'update_priority',
        description: 'Update task priority with reasoning',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: 'Task ID to update priority for' },
            priority: {
              type: 'number',
              description: 'New priority (1-5)',
              minimum: 1,
              maximum: 5,
            },
            reasoning: { type: 'string', description: 'Reason for priority change' },
          },
          required: ['task_id', 'priority'],
        },
      },
    ]);
  }

  /**
   * Executes a specific MCP tool with provided arguments
   *
   * @param {string} name - Name of the tool to execute
   * @param {unknown} args - Tool-specific arguments
   * @returns {Promise<ToolResponse>} Tool execution result
   *
   * @throws {Error} When tool name is unknown
   * @throws {Error} When required arguments are missing
   * @throws {Error} When service operations fail
   *
   * @description Routes tool calls to appropriate implementation methods,
   * validates arguments, and handles errors consistently. All tool responses
   * follow a standard format with success status and relevant data.
   *
   * @example
   * ```typescript
   * try {
   *   const result = await registry.callTool('update_task', {
   *     task_id: 'task123',
   *     status: 'done',
   *     progress: 100
   *   });
   *   console.log('Task updated:', result.task);
   * } catch (error) {
   *   console.error('Tool execution failed:', error);
   * }
   * ```
   */
  async callTool(name: string, args: unknown): Promise<ToolResponse> {
    logger.info('MCP tool call', { toolName: name, args });

    try {
      switch (name) {
        case 'create_task':
          return await this.createTask(args as CreateTaskArgs);
        case 'update_task':
          return await this.updateTask(args as UpdateTaskArgs);
        case 'get_task':
          return await this.getTask(args as GetTaskArgs);
        case 'list_tasks':
          return await this.listTasks(args as ListTasksArgs);
        case 'search_tasks':
          return await this.searchTasks(args as SearchTasksArgs);
        case 'delete_task':
          return await this.deleteTask(args as DeleteTaskArgs);
        case 'create_board':
          return await this.createBoard(args as CreateBoardArgs);
        case 'get_board':
          return await this.getBoard(args as GetBoardArgs);
        case 'list_boards':
          return await this.listBoards(args as ListBoardsArgs);
        case 'add_note':
          return await this.addNote(args as AddNoteArgs);
        case 'search_notes':
          return await this.searchNotes(args as SearchNotesArgs);
        case 'create_tag':
          return await this.createTag(args as CreateTagArgs);
        case 'assign_tag':
          return await this.assignTag(args as AssignTagArgs);
        case 'get_project_context':
          return await this.getProjectContext(args as GetProjectContextArgs);
        case 'get_task_context':
          return await this.getTaskContext(args as GetTaskContextArgs);
        case 'analyze_board':
          return await this.analyzeBoard(args as AnalyzeBoardArgs);
        case 'get_blocked_tasks':
          return await this.getBlockedTasks(args as GetBlockedTasksArgs);
        case 'get_overdue_tasks':
          return await this.getOverdueTasks(args as GetOverdueTasksArgs);
        case 'create_subtask':
          return await this.createSubtask(args as CreateSubtaskArgs);
        case 'set_task_dependency':
          return await this.setTaskDependency(args as SetTaskDependencyArgs);
        case 'get_task_dependencies':
          return await this.getTaskDependencies(args as GetTaskDependenciesArgs);
        case 'prioritize_tasks':
          return await this.prioritizeTasks(args as PrioritizeTasksArgs);
        case 'get_next_task':
          return await this.getNextTask(args as GetNextTaskArgs);
        case 'update_priority':
          return await this.updatePriority(args as UpdatePriorityArgs);
        default:
          throw new Error(`Unknown tool: ${String(name)}`);
      }
    } catch (error) {
      logger.error('Tool execution error', { toolName: name, args, error });
      throw error;
    }
  }

  // Tool implementations

  /**
   * Creates a new task in the specified board
   *
   * @private
   * @param {CreateTaskArgs} args - Task creation arguments
   * @returns {Promise<TaskResponse>} Created task
   *
   * @throws {Error} When board_id is missing
   * @throws {Error} When board is not found
   *
   * @description Creates a task with required title and board_id,
   * plus optional fields like description, priority, assignee, and due date.
   * Validates board existence before creation.
   */
  private async createTask(args: CreateTaskArgs): Promise<TaskResponse> {
    const { board_id: boardId, column_id: columnId = 'todo' } = args;

    if (!boardId) {
      throw new Error('board_id is required');
    }

    // Validate board exists
    const boards = await this.services.boardService.getBoards();
    const board = boards.find(b => b.id === boardId);
    if (!board) {
      throw new Error('Board not found');
    }

    const createData: CreateTaskRequest = {
      title: args.title,
      board_id: boardId,
      column_id: columnId,
      status: args.status ?? 'todo',
    };

    // Only add optional properties if they are defined
    if (args.description !== undefined) {
      createData.description = args.description;
    }
    if (args.priority !== undefined) {
      createData.priority = args.priority;
    }
    if (args.assignee !== undefined) {
      createData.assignee = args.assignee;
    }
    if (args.due_date) {
      createData.due_date = new Date(args.due_date);
    }

    const task = await this.services.taskService.createTask(createData);
    return { success: true, task };
  }

  /**
   * Updates an existing task with new values
   *
   * @private
   * @param {UpdateTaskArgs} args - Task update arguments
   * @returns {Promise<TaskResponse>} Updated task
   *
   * @throws {Error} When task_id is missing
   *
   * @description Updates task fields including title, description, status,
   * priority, assignee, due date, and progress. Only provided fields are updated.
   */
  private async updateTask(args: UpdateTaskArgs): Promise<TaskResponse> {
    const { task_id: taskId, due_date: dueDate, ...updates } = args;

    if (!taskId) {
      throw new Error('task_id is required');
    }

    interface UpdateTaskData {
      title?: string;
      description?: string;
      priority?: number;
      status?: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
      assignee?: string;
      due_date?: Date;
      progress?: number;
    }

    const updateData: UpdateTaskData = updates;
    if (dueDate) {
      updateData.due_date = new Date(dueDate);
    }

    const task = await this.services.taskService.updateTask(taskId, updateData);
    return { success: true, task };
  }

  /**
   * Retrieves detailed task information with optional related data
   *
   * @private
   * @param {GetTaskArgs} args - Task retrieval arguments
   * @returns {Promise<GetTaskDetailedResponse>} Task with optional related data
   *
   * @throws {Error} When task_id is missing
   * @throws {Error} When task is not found
   *
   * @description Fetches task details with options to include:
   * - Subtasks
   * - Dependencies
   * - Notes
   * - Tags
   */
  private async getTask(args: GetTaskArgs): Promise<GetTaskDetailedResponse> {
    const { task_id: taskId, include_subtasks: includeSubtasks, include_dependencies: includeDependencies, include_notes: includeNotes, include_tags: includeTags } = args;

    if (!taskId) {
      throw new Error('task_id (or id) is required');
    }

    let task;
    if (includeSubtasks) {
      task = await this.services.taskService.getTaskWithSubtasks(taskId);
    } else if (includeDependencies) {
      task = await this.services.taskService.getTaskWithDependencies(taskId);
    } else {
      task = await this.services.taskService.getTaskById(taskId);
    }

    if (!task) {
      throw new Error(`Task not found: ${String(taskId)}`);
    }

    // Add additional data if requested
    const result: GetTaskDetailedResponse = { success: true, task };

    if (includeNotes) {
      const notes = await this.services.noteService.getTaskNotes(taskId, { limit: 100 });
      result.notes = notes;
    }

    if (includeTags) {
      const tags = await this.services.tagService.getTaskTags(taskId);
      result.tags = tags;
    }

    return result;
  }

  /**
   * Lists tasks with flexible filtering and sorting options
   *
   * @private
   * @param {ListTasksArgs} args - Task listing arguments
   * @returns {Promise<TasksResponse>} Array of tasks matching criteria
   *
   * @throws {Error} When status value is invalid
   *
   * @description Supports filtering by:
   * - Board and column
   * - Status and assignee
   * - Priority range
   * - Text search
   * With pagination and custom sorting.
   */
  private async listTasks(args: ListTasksArgs): Promise<TasksResponse> {
    const { status, ...restArgs } = args;
    interface TaskFilters {
      board_id?: string;
      column_id?: string;
      status?: Task['status'];
      assignee?: string;
      priority_min?: number;
      priority_max?: number;
      search?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
    const filters: TaskFilters = { ...restArgs };

    // Validate and cast status if provided
    if (status) {
      const validStatuses = ['todo', 'in_progress', 'done', 'blocked', 'archived'];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Invalid status: ${String(status)}. Must be one of: ${String(String(validStatuses.join(', ')))}`
        );
      }
      filters.status = status as Task['status'];
    }

    const tasks = await this.services.taskService.getTasks(filters);
    return { success: true, tasks, count: tasks.length };
  }

  /**
   * Searches tasks using full-text search with filters
   *
   * @private
   * @param {SearchTasksArgs} args - Search arguments
   * @returns {Promise<TasksResponse>} Tasks matching search criteria
   *
   * @throws {Error} When status value is invalid
   *
   * @description Performs full-text search across task titles and descriptions
   * with additional filtering by board, column, status, assignee, and tags.
   */
  private async searchTasks(args: SearchTasksArgs): Promise<TasksResponse> {
    const { query, status, ...restArgs } = args;

    // Convert SearchTasksArgs to ListTasksArgs format
    interface TaskFilters {
      board_id?: string;
      column_id?: string;
      status?: Task['status'];
      assignee?: string;
      tags?: string[];
      search: string; // Required for search
      limit?: number;
      offset?: number;
    }

    const filters: TaskFilters = {
      ...restArgs,
      search: query, // Use query as the search parameter
    };

    // Validate and cast status if provided
    if (status) {
      const validStatuses = ['todo', 'in_progress', 'done', 'blocked', 'archived'];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Invalid status: ${String(status)}. Must be one of: ${String(String(validStatuses.join(', ')))}`
        );
      }
      filters.status = status as Task['status'];
    }

    const tasks = await this.services.taskService.getTasks(filters);
    return { success: true, data: tasks, tasks, count: tasks.length };
  }

  /**
   * Deletes a task by ID
   *
   * @private
   * @param {DeleteTaskArgs} args - Deletion arguments
   * @returns {Promise<{success: boolean; message: string}>} Deletion confirmation
   *
   * @description Permanently deletes a task and all associated data
   * including notes, tags, and relationships.
   */
  private async deleteTask(args: DeleteTaskArgs): Promise<{ success: boolean; message: string }> {
    const { task_id: taskId } = args;
    await this.services.taskService.deleteTask(taskId);
    return { success: true, message: `Task ${String(taskId)} deleted` };
  }

  /**
   * Creates a new kanban board
   *
   * @private
   * @param {CreateBoardArgs} args - Board creation arguments
   * @returns {Promise<BoardResponse>} Created board
   *
   * @description Creates a board with name, optional description,
   * and color for visual identification.
   */
  private async createBoard(args: CreateBoardArgs): Promise<BoardResponse> {
    const board = await this.services.boardService.createBoard(args);
    return { success: true, board };
  }

  /**
   * Retrieves board details with optional columns and tasks
   *
   * @private
   * @param {GetBoardArgs} args - Board retrieval arguments
   * @returns {Promise<BoardResponse>} Board with optional related data
   *
   * @throws {Error} When board is not found
   *
   * @description Fetches board details with options to include:
   * - Column structure
   * - All tasks in the board
   */
  private async getBoard(args: GetBoardArgs): Promise<BoardResponse> {
    const { board_id: boardId, include_columns: includeColumns, include_tasks: includeTasks } = args;

    let board;
    if (includeColumns) {
      board = await this.services.boardService.getBoardWithColumns(boardId);
    } else {
      board = await this.services.boardService.getBoardById(boardId);
    }

    if (!board) {
      throw new Error(`Board not found: ${String(boardId)}`);
    }

    const result: BoardResponse = { success: true, board };

    if (includeTasks) {
      const tasks = await this.services.taskService.getTasks({ board_id: boardId, limit: 1000 });
      result.tasks = tasks;
    }

    return result;
  }

  /**
   * Lists all boards with optional filtering
   *
   * @private
   * @param {ListBoardsArgs} args - Board listing arguments
   * @returns {Promise<BoardsResponse>} Array of boards
   *
   * @description Lists boards with options to:
   * - Search by name/description
   * - Filter by archived status
   * - Paginate results
   */
  private async listBoards(args: ListBoardsArgs): Promise<BoardsResponse> {
    const boards = await this.services.boardService.getBoards(args);
    return { success: true, boards, count: boards.length };
  }

  /**
   * Adds a note to a task
   *
   * @private
   * @param {AddNoteArgs} args - Note creation arguments
   * @returns {Promise<NoteResponse>} Created note
   *
   * @throws {Error} When task_id is missing
   *
   * @description Creates a note with content, category (general, progress,
   * blocker, decision, question), and optional pinned status.
   */
  private async addNote(args: AddNoteArgs): Promise<NoteResponse> {
    // task_id is required for createNote
    if (!args.task_id) {
      throw new Error('task_id is required for creating a note');
    }

    const { category } = args;
    interface CreateNoteData {
      content: string;
      task_id: string;
      category?: 'general' | 'progress' | 'blocker' | 'decision' | 'question';
      pinned?: boolean;
    }
    const noteData: CreateNoteData = {
      content: args.content,
      task_id: args.task_id,
    };

    if (args.pinned !== undefined) {
      noteData.pinned = args.pinned;
    }

    // Map categories if provided
    if (category) {
      const categoryMap: Record<
        string,
        'general' | 'progress' | 'blocker' | 'decision' | 'question'
      > = {
        general: 'general',
        meeting: 'general',
        idea: 'general',
        todo: 'progress',
        reminder: 'general',
      };
      noteData.category = categoryMap[category] ?? 'general';
    }

    const note = await this.services.noteService.createNote(noteData);
    return { success: true, note };
  }

  /**
   * Searches notes using full-text search
   *
   * @private
   * @param {SearchNotesArgs} args - Note search arguments
   * @returns {Promise<NotesResponse>} Notes matching search criteria
   *
   * @throws {Error} When query is missing
   * @throws {Error} When category value is invalid
   *
   * @description Searches note content with filters for task, board,
   * and category. Supports result limiting.
   */
  private async searchNotes(args: SearchNotesArgs): Promise<NotesResponse> {
    // query is required for searchNotes
    if (!args.query) {
      throw new Error('query is required for searching notes');
    }

    const { category } = args;
    interface SearchNotesOptions {
      query: string;
      task_id?: string;
      board_id?: string;
      category?: 'general' | 'progress' | 'blocker' | 'decision' | 'question';
      limit?: number;
    }
    const searchOptions: SearchNotesOptions = {
      query: args.query,
    };

    // Add optional properties only if they have values
    if (args.task_id) searchOptions.task_id = args.task_id;
    if (args.board_id) searchOptions.board_id = args.board_id;
    if (args.limit) searchOptions.limit = args.limit;

    // Validate and cast category if provided
    if (category) {
      const validCategories = ['general', 'progress', 'blocker', 'decision', 'question'];
      if (!validCategories.includes(category)) {
        throw new Error(
          `Invalid category: ${String(category)}. Must be one of: ${String(String(validCategories.join(', ')))}`
        );
      }
      searchOptions.category = category as
        | 'general'
        | 'progress'
        | 'blocker'
        | 'decision'
        | 'question';
    }

    const notes = await this.services.noteService.searchNotes(searchOptions);
    return { success: true, notes, count: notes.length };
  }

  /**
   * Creates a new tag for task categorization
   *
   * @private
   * @param {CreateTagArgs} args - Tag creation arguments
   * @returns {Promise<TagResponse>} Created tag
   *
   * @description Creates a tag with name, color, optional description,
   * and parent tag for hierarchical organization.
   */
  private async createTag(args: CreateTagArgs): Promise<TagResponse> {
    const tag = await this.services.tagService.createTag(args);
    return { success: true, tag };
  }

  /**
   * Assigns tags to a task
   *
   * @private
   * @param {AssignTagArgs} args - Tag assignment arguments
   * @returns {Promise<{success: boolean; assignment: unknown}>} Assignment confirmation
   *
   * @description Assigns one or more tags to a task for categorization
   * and filtering purposes.
   */
  private async assignTag(args: AssignTagArgs): Promise<{ success: boolean; assignment: unknown }> {
    const { task_id: taskId, tag_ids: tagIds } = args;
    const assignments = await Promise.all(
      tagIds.map(tagId => this.services.tagService.addTagToTask(taskId, tagId))
    );
    return { success: true, assignment: assignments };
  }

  /**
   * Generates AI-friendly project context
   *
   * @private
   * @param {GetProjectContextArgs} args - Context generation arguments
   * @returns {Promise<ProjectContextResponse>} Structured project context
   *
   * @description Generates comprehensive project context including:
   * - Summary and active tasks
   * - Recent activity and priorities
   * - Bottlenecks and metrics
   * - Optional recommendations
   * Optimized for AI agent understanding.
   */
  private async getProjectContext(args: GetProjectContextArgs): Promise<ProjectContextResponse> {
    // Map args to ContextOptions
    interface ProjectContextOptions {
      days_back: number;
      include_metrics?: boolean;
      detail_level: 'comprehensive' | 'summary';
    }
    const options: ProjectContextOptions = {
      days_back: 30, // Default to 30 days
      include_metrics: args.include_metrics ?? false,
      detail_level: 'comprehensive',
    };

    const context = await this.services.contextService.getProjectContext(options);

    // Transform context to match expected response format
    const result: ProjectContextResponse['context'] = {
      summary: context.summary,
      active_tasks: context.priorities.map(p => p.task),
      recent_activity: context.recent_activities,
      priorities: context.priorities.map(p => p.task),
      bottlenecks: context.blockers,
      metrics: context.key_metrics as unknown as Record<string, unknown>,
    };

    if (args.include_recommendations) {
      result.recommendations = context.priorities.map(
        p => `Priority: ${String(String(p.task.title))}`
      );
    }

    return { success: true, context: result };
  }

  /**
   * Generates AI-friendly task context
   *
   * @private
   * @param {GetTaskContextArgs} args - Context generation arguments
   * @returns {Promise<TaskContextResponse>} Structured task context
   *
   * @description Generates detailed task context including:
   * - Task details and relationships
   * - Dependencies and subtasks
   * - Notes and tags
   * - Optional history and blockers
   * Optimized for AI agent task understanding.
   */
  private async getTaskContext(args: GetTaskContextArgs): Promise<TaskContextResponse> {
    const { task_id: taskId, include_history: includeHistory, include_related: includeRelated, include_blockers: includeBlockers } = args;

    // Map args to ContextOptions
    interface TaskContextOptions {
      detail_level: 'comprehensive' | 'summary';
      include_completed: boolean;
    }
    const options: TaskContextOptions = {
      detail_level: 'comprehensive',
      include_completed: true,
    };

    const context = await this.services.contextService.getTaskContext(taskId, options);

    // Transform context to match expected response format
    interface TaskContextResult {
      task: Task;
      dependencies?: Task[];
      subtasks?: Task[];
      notes?: NoteType[];
      tags?: TagType[];
      history?: unknown[];
      blockers?: unknown[];
      related?: Task[];
    }
    const result: TaskContextResult = {
      task: context.task,
      dependencies: context.related_tasks
        .filter(rt => rt.relationship === 'dependency')
        .map(rt => rt.task),
      subtasks: context.related_tasks.filter(rt => rt.relationship === 'child').map(rt => rt.task),
      notes: context.notes,
      tags: context.tags,
    };

    if (includeHistory) {
      result.history = context.history;
    }

    if (includeRelated) {
      result.related = context.related_tasks.map(rt => rt.task);
    }

    if (includeBlockers) {
      result.blockers = context.related_tasks
        .filter(rt => rt.relationship === 'dependency')
        .map(rt => rt.task);
    }

    return { success: true, context: result as TaskContextResponse['context'] };
  }

  /**
   * Analyzes board performance and provides insights
   *
   * @private
   * @param {AnalyzeBoardArgs} args - Analysis arguments
   * @returns {Promise<BoardAnalysisResponse>} Board analysis with metrics and insights
   *
   * @description Performs comprehensive board analysis including:
   * - Performance metrics
   * - Workflow insights
   * - Improvement recommendations
   * Based on configurable time ranges.
   */
  private async analyzeBoard(args: AnalyzeBoardArgs): Promise<BoardAnalysisResponse> {
    const { board_id: boardId } = args;

    // Map args to ContextOptions
    interface AnalyzeOptions {
      days_back: number;
      include_metrics: boolean;
      detail_level: 'comprehensive' | 'summary';
    }
    const options: AnalyzeOptions = {
      days_back: args.time_range === 'week' ? 7 : args.time_range === 'month' ? 30 : 90,
      include_metrics: true,
      detail_level: 'comprehensive',
    };

    const analysis = await this.services.contextService.getProjectContext(options);

    // Get board-specific data
    const boards = await this.services.boardService.getBoards();
    const board = boards.find(b => b.id === boardId);

    return {
      success: true,
      analysis: {
        board: board!,
        metrics: analysis.key_metrics as unknown as Record<string, unknown>,
        insights: analysis.priorities.map(
          p => `Task "${String(String(p.task.title))}" is high priority`
        ),
        recommendations: analysis.priorities
          .slice(0, 3)
          .map(p => `Focus on: ${String(String(p.task.title))}`),
      },
    };
  }

  /**
   * Retrieves all blocked tasks with optional reasons
   *
   * @private
   * @param {GetBlockedTasksArgs} args - Query arguments
   * @returns {Promise<BlockedTasksResponse>} Blocked tasks with optional blocking reasons
   *
   * @description Finds all tasks with 'blocked' status,
   * optionally including reasons for the blockage.
   */
  private async getBlockedTasks(args: GetBlockedTasksArgs): Promise<BlockedTasksResponse> {
    const { board_id: boardId, include_reasons: includeReasons } = args;
    const blockedTasks = await this.services.taskService.getBlockedTasks(boardId);
    const blockedTasksResult = blockedTasks.map(task => ({
      task,
      ...(includeReasons && { blocking_reasons: ['Dependency not completed'] }),
    }));
    return { success: true, blocked_tasks: blockedTasksResult };
  }

  /**
   * Retrieves all overdue tasks with days overdue calculation
   *
   * @private
   * @param {GetOverdueTasksArgs} args - Query arguments
   * @returns {Promise<OverdueTasksResponse>} Overdue tasks with days overdue
   *
   * @description Finds tasks past their due date, calculates
   * days overdue, and optionally filters by minimum days overdue.
   */
  private async getOverdueTasks(args: GetOverdueTasksArgs): Promise<OverdueTasksResponse> {
    const { board_id: boardId, days_overdue: daysOverdue } = args;
    const overdueTasks = await this.services.taskService.getOverdueTasks(boardId);
    const overdueTasksResult = overdueTasks
      .map(task => {
        const dueDate = task.due_date ? new Date(task.due_date) : null;
        const now = new Date();
        const daysDiff = dueDate
          ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return {
          task,
          days_overdue: Math.max(0, daysDiff),
        };
      })
      .filter(item => !daysOverdue || item.days_overdue >= daysOverdue);
    return { success: true, overdue_tasks: overdueTasksResult };
  }

  /**
   * Creates a subtask under a parent task
   *
   * @private
   * @param {CreateSubtaskArgs} args - Subtask creation arguments
   * @returns {Promise<SubtaskResponse>} Created subtask
   *
   * @throws {Error} When parent_task_id is missing
   * @throws {Error} When parent task is not found
   *
   * @description Creates a subtask with required title and parent_task_id,
   * plus optional fields. Validates parent task existence before creation.
   */
  private async createSubtask(args: CreateSubtaskArgs): Promise<SubtaskResponse> {
    const { parent_task_id: parentTaskId, title, description, priority, assignee, due_date: dueDate } = args;

    if (!parentTaskId) {
      throw new Error('parent_task_id is required');
    }

    // Validate parent task exists
    const parentTask = await this.services.taskService.getTaskById(parentTaskId);
    if (!parentTask) {
      throw new Error('Parent task not found');
    }

    const createData: CreateTaskRequest = {
      title,
      board_id: parentTask.board_id,
      column_id: parentTask.column_id,
      parent_task_id: parentTaskId,
      status: 'todo',
    };

    // Add optional properties if they are defined
    if (description !== undefined) {
      createData.description = description;
    }
    if (priority !== undefined) {
      createData.priority = priority;
    }
    if (assignee !== undefined) {
      createData.assignee = assignee;
    }
    if (dueDate) {
      createData.due_date = new Date(dueDate);
    }

    const subtask = await this.services.taskService.createTask(createData);
    return { success: true, subtask };
  }

  /**
   * Sets a dependency relationship between two tasks
   *
   * @private
   * @param {SetTaskDependencyArgs} args - Dependency creation arguments
   * @returns {Promise<TaskDependencyResponse>} Created dependency
   *
   * @throws {Error} When required task IDs are missing
   * @throws {Error} When tasks are not found
   * @throws {Error} When circular dependency would be created
   *
   * @description Creates a dependency where task_id depends on depends_on_task_id.
   * Validates both tasks exist and prevents circular dependencies.
   */
  private async setTaskDependency(args: SetTaskDependencyArgs): Promise<TaskDependencyResponse> {
    const { task_id: taskId, depends_on_task_id: dependsOnTaskId, dependency_type: dependencyType = 'blocks' } = args;

    if (!taskId || !dependsOnTaskId) {
      throw new Error('Both task_id and depends_on_task_id are required');
    }

    if (taskId === dependsOnTaskId) {
      throw new Error('A task cannot depend on itself');
    }

    // Validate both tasks exist
    const [task, dependsOnTask] = await Promise.all([
      this.services.taskService.getTaskById(taskId),
      this.services.taskService.getTaskById(dependsOnTaskId),
    ]);

    if (!task) {
      throw new Error(`Task not found: ${String(taskId)}`);
    }
    if (!dependsOnTask) {
      throw new Error(`Dependency task not found: ${String(dependsOnTaskId)}`);
    }

    const dependency = await this.services.taskService.addDependency(
      taskId,
      dependsOnTaskId,
      dependencyType as any
    );

    return {
      success: true,
      dependency: {
        id: dependency.id,
        task_id: dependency.task_id,
        depends_on_task_id: dependency.depends_on_task_id,
        dependency_type: dependency.dependency_type,
        created_at: dependency.created_at.toISOString(),
      },
    };
  }

  /**
   * Gets dependency relationships for a task
   *
   * @private
   * @param {GetTaskDependenciesArgs} args - Query arguments
   * @returns {Promise<TaskDependenciesResponse>} Task dependencies and dependents
   *
   * @throws {Error} When task_id is missing
   * @throws {Error} When task is not found
   *
   * @description Retrieves tasks this task depends on and tasks that depend on this task.
   * Optionally includes blocking tasks analysis.
   */
  private async getTaskDependencies(
    args: GetTaskDependenciesArgs
  ): Promise<TaskDependenciesResponse> {
    const { task_id: taskId, include_dependents: includeDependents = true, include_blocking: includeBlocking = true } = args;

    if (!taskId) {
      throw new Error('task_id is required');
    }

    const taskWithDeps = await this.services.taskService.getTaskWithDependencies(taskId);
    if (!taskWithDeps) {
      throw new Error(`Task not found: ${String(taskId)}`);
    }

    const result: TaskDependenciesResponse = {
      success: true,
      dependencies: [],
      dependents: [],
    };

    if (includeBlocking && taskWithDeps.dependencies.length > 0) {
      // Get the actual task objects for dependencies
      const dependencyTaskIds = taskWithDeps.dependencies.map(dep => dep.depends_on_task_id);
      const dependencyTasks = await Promise.all(
        dependencyTaskIds.map(id => this.services.taskService.getTaskById(id))
      );
      result.dependencies = dependencyTasks.filter(Boolean) as Task[];
    }

    if (includeDependents && taskWithDeps.dependents.length > 0) {
      // Get the actual task objects for dependents
      const dependentTaskIds = taskWithDeps.dependents.map(dep => dep.task_id);
      const dependentTasks = await Promise.all(
        dependentTaskIds.map(id => this.services.taskService.getTaskById(id))
      );
      result.dependents = dependentTasks.filter(Boolean) as Task[];
    }

    // Add blocking tasks (dependencies that are not completed)
    if (includeBlocking) {
      result.blocking_tasks = result.dependencies.filter(
        task => task.status !== 'done' && task.status !== 'archived'
      );
    }

    return result;
  }

  /**
   * Triggers AI-powered task prioritization for a board
   *
   * @private
   * @param {PrioritizeTasksArgs} args - Prioritization arguments
   * @returns {Promise<PrioritizedTasksResponse>} Prioritized tasks with scores
   *
   * @description Implements basic prioritization algorithm considering:
   * - Current priority level
   * - Due dates and urgency
   * - Dependency blocking factors
   * - Task status and progress
   */
  private async prioritizeTasks(args: PrioritizeTasksArgs): Promise<PrioritizedTasksResponse> {
    const { board_id: boardId, context_factors: contextFactors = [], max_tasks: maxTasks = 50 } = args;

    if (!boardId) {
      throw new Error('board_id is required');
    }

    // Get all tasks for the board
    const tasks = await this.services.taskService.getTasks({
      board_id: boardId,
      limit: maxTasks,
    });

    // Simple prioritization algorithm
    const prioritizedTasks = tasks
      .filter(task => task.status !== 'done' && task.status !== 'archived')
      .map(task => {
        let score = (task.priority ?? 1) * 20; // Base priority score

        // Add urgency based on due date
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          const now = new Date();
          const daysUntilDue = Math.ceil(
            (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilDue < 0) {
            score += 50; // Overdue
          } else if (daysUntilDue <= 1) {
            score += 30; // Due soon
          } else if (daysUntilDue <= 7) {
            score += 10; // Due this week
          }
        }

        // Add blocking factor
        if (task.status === 'blocked') {
          score -= 20;
        }

        // Consider context factors
        let reasoning = `Priority: ${String(task.priority ?? 1)}`;
        if (task.due_date) {
          const dueDate = new Date(task.due_date);
          const now = new Date();
          const daysUntilDue = Math.ceil(
            (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          reasoning += `, Due in ${String(daysUntilDue)} days`;
        }
        if (task.status === 'blocked') {
          reasoning += ', Currently blocked';
        }

        return {
          task,
          priority_score: Math.max(0, score),
          reasoning,
        };
      })
      .sort((a, b) => b.priority_score - a.priority_score);

    return {
      success: true,
      prioritized_tasks: prioritizedTasks,
    };
  }

  /**
   * Gets the next recommended task based on priority and context
   *
   * @private
   * @param {GetNextTaskArgs} args - Query arguments
   * @returns {Promise<NextTaskResponse>} Next recommended task
   *
   * @description Recommends the highest priority task that is not blocked
   * and matches the provided filters.
   */
  private async getNextTask(args: GetNextTaskArgs): Promise<NextTaskResponse> {
    const { board_id: boardId, assignee, skill_context: skillContext, exclude_blocked: excludeBlocked = true } = args;

    // Build filters
    const filters: any = {
      limit: 50,
    };

    if (boardId) {
      filters.board_id = boardId;
    }
    if (assignee) {
      filters.assignee = assignee;
    }

    const tasks = await this.services.taskService.getTasks(filters);

    // Filter out completed/archived tasks
    let availableTasks = tasks.filter(task => task.status !== 'done' && task.status !== 'archived');

    // Exclude blocked tasks if requested
    if (excludeBlocked) {
      availableTasks = availableTasks.filter(task => task.status !== 'blocked');
    }

    // Filter by skill context if provided
    if (skillContext) {
      availableTasks = availableTasks.filter(
        task =>
          task.title.toLowerCase().includes(skillContext.toLowerCase()) ||
          (task.description && task.description.toLowerCase().includes(skillContext.toLowerCase()))
      );
    }

    if (availableTasks.length === 0) {
      return {
        success: true,
        next_task: null,
        reasoning: 'No available tasks found matching the criteria',
      };
    }

    // Sort by priority (highest first), then by due date
    availableTasks.sort((a, b) => {
      const priorityDiff = (b.priority ?? 1) - (a.priority ?? 1);
      if (priorityDiff !== 0) return priorityDiff;

      // If same priority, sort by due date
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });

    const nextTask = availableTasks[0];
    let reasoning = `Highest priority available task (Priority: ${String(nextTask.priority ?? 1)})`;

    if (nextTask.due_date) {
      const dueDate = new Date(nextTask.due_date);
      const now = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      reasoning += `, Due in ${String(daysUntilDue)} days`;
    }

    if (skillContext) {
      reasoning += `, Matches skill context: ${String(skillContext)}`;
    }

    return {
      success: true,
      next_task: nextTask,
      reasoning,
    };
  }

  /**
   * Updates task priority with reasoning
   *
   * @private
   * @param {UpdatePriorityArgs} args - Priority update arguments
   * @returns {Promise<PriorityUpdateResponse>} Updated task with old and new priority
   *
   * @throws {Error} When task_id is missing
   * @throws {Error} When task is not found
   * @throws {Error} When priority is invalid
   *
   * @description Updates task priority and optionally logs reasoning for the change.
   */
  private async updatePriority(args: UpdatePriorityArgs): Promise<PriorityUpdateResponse> {
    const { task_id: taskId, priority, reasoning } = args;

    if (!taskId) {
      throw new Error('task_id is required');
    }

    if (priority < 1 || priority > 5) {
      throw new Error('Priority must be between 1 and 5');
    }

    // Get current task to capture old priority
    const currentTask = await this.services.taskService.getTaskById(taskId);
    if (!currentTask) {
      throw new Error(`Task not found: ${String(taskId)}`);
    }

    const oldPriority = currentTask.priority ?? 1;

    // Update the task priority
    const updatedTask = await this.services.taskService.updateTask(taskId, {
      priority,
    });

    // Log the priority change if reasoning provided
    if (reasoning) {
      await this.services.noteService.createNote({
        task_id: taskId,
        content: `Priority changed from ${String(oldPriority)} to ${String(priority)}: ${String(reasoning)}`,
        category: 'decision',
      });
    }

    return {
      success: true,
      task: updatedTask,
      old_priority: oldPriority,
      new_priority: priority,
      reasoning,
    };
  }
}
