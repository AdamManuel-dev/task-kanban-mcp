import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { ContextService } from '@/services/ContextService';

export interface MCPServices {
  taskService: TaskService;
  boardService: BoardService;
  noteService: NoteService;
  tagService: TagService;
  contextService: ContextService;
}

export class MCPToolRegistry {
  private services: MCPServices;

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
            priority: { type: 'number', description: 'Task priority (1-5)', minimum: 1, maximum: 5 },
            status: { 
              type: 'string', 
              enum: ['todo', 'in_progress', 'done', 'blocked', 'archived'],
              description: 'Task status'
            },
            assignee: { type: 'string', description: 'User ID of assignee' },
            due_date: { type: 'string', format: 'date-time', description: 'Due date in ISO format' },
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
            priority: { type: 'number', description: 'Task priority (1-5)', minimum: 1, maximum: 5 },
            status: { 
              type: 'string', 
              enum: ['todo', 'in_progress', 'done', 'blocked', 'archived'],
              description: 'Task status'
            },
            assignee: { type: 'string', description: 'User ID of assignee' },
            due_date: { type: 'string', format: 'date-time', description: 'Due date in ISO format' },
            progress: { type: 'number', description: 'Progress percentage (0-100)', minimum: 0, maximum: 100 },
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
            include_subtasks: { type: 'boolean', description: 'Include subtasks in response', default: false },
            include_dependencies: { type: 'boolean', description: 'Include dependencies in response', default: false },
            include_notes: { type: 'boolean', description: 'Include notes in response', default: false },
            include_tags: { type: 'boolean', description: 'Include tags in response', default: false },
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
              description: 'Filter by status'
            },
            assignee: { type: 'string', description: 'Filter by assignee' },
            priority_min: { type: 'number', description: 'Minimum priority level' },
            priority_max: { type: 'number', description: 'Maximum priority level' },
            search: { type: 'string', description: 'Search in title and description' },
            limit: { type: 'number', description: 'Maximum number of results', default: 50 },
            offset: { type: 'number', description: 'Offset for pagination', default: 0 },
            sort_by: { type: 'string', description: 'Sort field', default: 'updated_at' },
            sort_order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order', default: 'desc' },
          },
          required: [],
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
            include_columns: { type: 'boolean', description: 'Include columns in response', default: false },
            include_tasks: { type: 'boolean', description: 'Include tasks in response', default: false },
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
              default: 'general'
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
              description: 'Filter by category'
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
            include_completed: { type: 'boolean', description: 'Include completed tasks', default: false },
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
            include_dependencies: { type: 'boolean', description: 'Include dependencies', default: true },
            include_notes: { type: 'boolean', description: 'Include notes', default: true },
            include_tags: { type: 'boolean', description: 'Include tags', default: true },
            include_related: { type: 'boolean', description: 'Include related tasks', default: false },
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
            timeframe_days: { type: 'number', description: 'Analysis timeframe in days', default: 30 },
            include_recommendations: { type: 'boolean', description: 'Include improvement recommendations', default: true },
            include_blockers: { type: 'boolean', description: 'Include blocker analysis', default: true },
            include_metrics: { type: 'boolean', description: 'Include performance metrics', default: true },
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

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    logger.info('MCP tool call', { toolName: name, args });

    try {
      switch (name) {
        case 'create_task':
          return await this.createTask(args);
        case 'update_task':
          return await this.updateTask(args);
        case 'get_task':
          return await this.getTask(args);
        case 'list_tasks':
          return await this.listTasks(args);
        case 'delete_task':
          return await this.deleteTask(args);
        case 'create_board':
          return await this.createBoard(args);
        case 'get_board':
          return await this.getBoard(args);
        case 'list_boards':
          return await this.listBoards(args);
        case 'add_note':
          return await this.addNote(args);
        case 'search_notes':
          return await this.searchNotes(args);
        case 'create_tag':
          return await this.createTag(args);
        case 'assign_tag':
          return await this.assignTag(args);
        case 'get_project_context':
          return await this.getProjectContext(args);
        case 'get_task_context':
          return await this.getTaskContext(args);
        case 'analyze_board':
          return await this.analyzeBoard(args);
        case 'get_blocked_tasks':
          return await this.getBlockedTasks(args);
        case 'get_overdue_tasks':
          return await this.getOverdueTasks(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error('Tool execution error', { toolName: name, args, error });
      throw error;
    }
  }

  // Tool implementations
  private async createTask(args: any): Promise<any> {
    const task = await this.services.taskService.createTask(args);
    return { success: true, task };
  }

  private async updateTask(args: any): Promise<any> {
    const { task_id, ...updates } = args;
    const task = await this.services.taskService.updateTask(task_id, updates);
    return { success: true, task };
  }

  private async getTask(args: any): Promise<any> {
    const { task_id, include_subtasks, include_dependencies, include_notes, include_tags } = args;
    
    let task;
    if (include_subtasks) {
      task = await this.services.taskService.getTaskWithSubtasks(task_id);
    } else if (include_dependencies) {
      task = await this.services.taskService.getTaskWithDependencies(task_id);
    } else {
      task = await this.services.taskService.getTaskById(task_id);
    }

    if (!task) {
      throw new Error(`Task not found: ${task_id}`);
    }

    // Add additional data if requested
    const result: any = { success: true, task };
    
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

  private async listTasks(args: any): Promise<any> {
    const tasks = await this.services.taskService.getTasks(args);
    return { success: true, tasks, count: tasks.length };
  }

  private async deleteTask(args: any): Promise<any> {
    const { task_id } = args;
    await this.services.taskService.deleteTask(task_id);
    return { success: true, message: `Task ${task_id} deleted` };
  }

  private async createBoard(args: any): Promise<any> {
    const board = await this.services.boardService.createBoard(args);
    return { success: true, board };
  }

  private async getBoard(args: any): Promise<any> {
    const { board_id, include_columns, include_tasks } = args;
    
    let board;
    if (include_columns) {
      board = await this.services.boardService.getBoardWithColumns(board_id);
    } else {
      board = await this.services.boardService.getBoardById(board_id);
    }

    if (!board) {
      throw new Error(`Board not found: ${board_id}`);
    }

    const result: any = { success: true, board };
    
    if (include_tasks) {
      const tasks = await this.services.taskService.getTasks({ board_id, limit: 1000 });
      result.tasks = tasks;
    }

    return result;
  }

  private async listBoards(args: any): Promise<any> {
    const boards = await this.services.boardService.getBoards(args);
    return { success: true, boards, count: boards.length };
  }

  private async addNote(args: any): Promise<any> {
    const note = await this.services.noteService.createNote(args);
    return { success: true, note };
  }

  private async searchNotes(args: any): Promise<any> {
    const notes = await this.services.noteService.searchNotes(args);
    return { success: true, notes, count: notes.length };
  }

  private async createTag(args: any): Promise<any> {
    const tag = await this.services.tagService.createTag(args);
    return { success: true, tag };
  }

  private async assignTag(args: any): Promise<any> {
    const { task_id, tag_id } = args;
    const assignment = await this.services.tagService.addTagToTask(task_id, tag_id);
    return { success: true, assignment };
  }

  private async getProjectContext(args: any): Promise<any> {
    const { board_id, ...options } = args;
    const context = await this.services.contextService.getProjectContext(options);
    return { success: true, context };
  }

  private async getTaskContext(args: any): Promise<any> {
    const { task_id, ...options } = args;
    const context = await this.services.contextService.getTaskContext(task_id, options);
    return { success: true, context };
  }

  private async analyzeBoard(args: any): Promise<any> {
    const { board_id, ...options } = args;
    const analysis = await this.services.contextService.getProjectContext(options);
    return { success: true, analysis };
  }

  private async getBlockedTasks(args: any): Promise<any> {
    const { board_id } = args;
    const blockedTasks = await this.services.taskService.getBlockedTasks(board_id);
    return { success: true, tasks: blockedTasks, count: blockedTasks.length };
  }

  private async getOverdueTasks(args: any): Promise<any> {
    const { board_id } = args;
    const overdueTasks = await this.services.taskService.getOverdueTasks(board_id);
    return { success: true, tasks: overdueTasks, count: overdueTasks.length };
  }
}