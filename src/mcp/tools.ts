import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger';
import type { TaskService } from '@/services/TaskService';
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
} from './types';

export interface MCPServices {
  taskService: TaskService;
  boardService: BoardService;
  noteService: NoteService;
  tagService: TagService;
  contextService: ContextService;
}

export class MCPToolRegistry {
  private readonly services: MCPServices;

  constructor(services: MCPServices) {
    this.services = services;
  }

  async listTools(): Promise<Tool[]> {
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
    ];
  }

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
        default:
          throw new Error(`Unknown tool: ${String(name)}`);
      }
    } catch (error) {
      logger.error('Tool execution error', { toolName: name, args, error });
      throw error;
    }
  }

  // Tool implementations
  private async createTask(args: any): Promise<TaskResponse> {
    // Handle both naming conventions: board_id/boardId, column_id/columnId
    const board_id = args.board_id || args.boardId;
    const column_id = args.column_id || args.columnId || 'todo';

    if (!board_id) {
      throw new Error('board_id (or boardId) is required');
    }

    // Validate board exists
    const boards = await this.services.boardService.getBoards();
    const board = boards.find(b => b.id === board_id);
    if (!board) {
      throw new Error('Board not found');
    }

    interface CreateTaskData {
      title: string;
      description?: string;
      board_id: string;
      column_id: string;
      priority?: number;
      status?: 'todo' | 'in_progress' | 'done' | 'blocked' | 'archived';
      assignee?: string;
      due_date?: Date;
      tags?: string[];
    }

    const createData: CreateTaskData = {
      title: args.title,
      description: args.description,
      board_id,
      column_id,
      priority: args.priority,
      status: args.status || 'todo',
      assignee: args.assignee,
      tags: args.tags,
    };

    // Convert due_date string to Date if provided
    if (args.due_date) {
      createData.due_date = new Date(args.due_date);
    }

    const task = await this.services.taskService.createTask(createData);
    return { success: true, task };
  }

  private async updateTask(args: any): Promise<TaskResponse> {
    const task_id = args.task_id || args.id;
    const { due_date, ...updates } = args;

    if (!task_id) {
      throw new Error('task_id (or id) is required');
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
    if (due_date) {
      updateData.due_date = new Date(due_date);
    }
    const task = await this.services.taskService.updateTask(task_id, updateData);
    return { success: true, task };
  }

  private async getTask(args: any): Promise<GetTaskDetailedResponse> {
    const task_id = args.task_id || args.id;
    const { include_subtasks, include_dependencies, include_notes, include_tags } = args;

    if (!task_id) {
      throw new Error('task_id (or id) is required');
    }

    let task;
    if (include_subtasks) {
      task = await this.services.taskService.getTaskWithSubtasks(task_id);
    } else if (include_dependencies) {
      task = await this.services.taskService.getTaskWithDependencies(task_id);
    } else {
      task = await this.services.taskService.getTaskById(task_id);
    }

    if (!task) {
      throw new Error(`Task not found: ${String(task_id)}`);
    }

    // Add additional data if requested
    const result: GetTaskDetailedResponse = { success: true, task };

    if (include_notes) {
      const notes = await this.services.noteService.getTaskNotes(task_id, { limit: 100 });
      result.notes = notes;
    }

    if (include_tags) {
      const tags = await this.services.tagService.getTaskTags(task_id);
      result.tags = tags;
    }

    return result;
  }

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

  private async deleteTask(args: DeleteTaskArgs): Promise<{ success: boolean; message: string }> {
    const { task_id } = args;
    await this.services.taskService.deleteTask(task_id);
    return { success: true, message: `Task ${String(task_id)} deleted` };
  }

  private async createBoard(args: CreateBoardArgs): Promise<BoardResponse> {
    const board = await this.services.boardService.createBoard(args);
    return { success: true, board };
  }

  private async getBoard(args: GetBoardArgs): Promise<BoardResponse> {
    const { board_id, include_columns, include_tasks } = args;

    let board;
    if (include_columns) {
      board = await this.services.boardService.getBoardWithColumns(board_id);
    } else {
      board = await this.services.boardService.getBoardById(board_id);
    }

    if (!board) {
      throw new Error(`Board not found: ${String(board_id)}`);
    }

    const result: BoardResponse = { success: true, board };

    if (include_tasks) {
      const tasks = await this.services.taskService.getTasks({ board_id, limit: 1000 });
      result.tasks = tasks;
    }

    return result;
  }

  private async listBoards(args: ListBoardsArgs): Promise<BoardsResponse> {
    const boards = await this.services.boardService.getBoards(args);
    return { success: true, boards, count: boards.length };
  }

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
      noteData.category = categoryMap[category] || 'general';
    }

    const note = await this.services.noteService.createNote(noteData);
    return { success: true, note };
  }

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

  private async createTag(args: CreateTagArgs): Promise<TagResponse> {
    const tag = await this.services.tagService.createTag(args);
    return { success: true, tag };
  }

  private async assignTag(args: AssignTagArgs): Promise<{ success: boolean; assignment: unknown }> {
    const { task_id, tag_ids } = args;
    const assignments = await Promise.all(
      tag_ids.map(tag_id => this.services.tagService.addTagToTask(task_id, tag_id))
    );
    return { success: true, assignment: assignments };
  }

  private async getProjectContext(args: GetProjectContextArgs): Promise<ProjectContextResponse> {
    // Map args to ContextOptions
    interface ProjectContextOptions {
      days_back: number;
      include_metrics?: boolean;
      detail_level: 'comprehensive' | 'summary';
    }
    const options: ProjectContextOptions = {
      days_back: 30, // Default to 30 days
      include_metrics: args.include_metrics || false,
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

  private async getTaskContext(args: GetTaskContextArgs): Promise<TaskContextResponse> {
    const { task_id, include_history, include_related, include_blockers } = args;

    // Map args to ContextOptions
    interface TaskContextOptions {
      detail_level: 'comprehensive' | 'summary';
      include_completed: boolean;
    }
    const options: TaskContextOptions = {
      detail_level: 'comprehensive',
      include_completed: true,
    };

    const context = await this.services.contextService.getTaskContext(task_id, options);

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

    if (include_history) {
      result.history = context.history;
    }

    if (include_related) {
      result.related = context.related_tasks.map(rt => rt.task);
    }

    if (include_blockers) {
      result.blockers = context.related_tasks
        .filter(rt => rt.relationship === 'dependency')
        .map(rt => rt.task);
    }

    return { success: true, context: result as TaskContextResponse['context'] };
  }

  private async analyzeBoard(args: AnalyzeBoardArgs): Promise<BoardAnalysisResponse> {
    const { board_id } = args;

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
    const board = boards.find(b => b.id === board_id);

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

  private async getBlockedTasks(args: GetBlockedTasksArgs): Promise<BlockedTasksResponse> {
    const { board_id, include_reasons } = args;
    const blockedTasks = await this.services.taskService.getBlockedTasks(board_id);
    const blocked_tasks = blockedTasks.map(task => ({
      task,
      ...(include_reasons && { blocking_reasons: ['Dependency not completed'] }),
    }));
    return { success: true, blocked_tasks };
  }

  private async getOverdueTasks(args: GetOverdueTasksArgs): Promise<OverdueTasksResponse> {
    const { board_id, days_overdue } = args;
    const overdueTasks = await this.services.taskService.getOverdueTasks(board_id);
    const overdue_tasks = overdueTasks
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
      .filter(item => !days_overdue || item.days_overdue >= days_overdue);
    return { success: true, overdue_tasks };
  }
}
