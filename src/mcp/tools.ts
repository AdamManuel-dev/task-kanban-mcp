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
import type { TaskService, UpdateTaskRequest as ServiceUpdateTaskRequest } from '@/services/TaskService';
import type { BoardService } from '@/services/BoardService';
import type { NoteService } from '@/services/NoteService';
import type { TagService } from '@/services/TagService';
import type { ContextService } from '@/services/ContextService';
import { AIContextualPrioritizer } from '@/services/AIContextualPrioritizer';
import type { Task, UpdateTaskRequest } from '@/types';
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

  /** Enhanced AI prioritizer */
  private readonly aiPrioritizer: AIContextualPrioritizer;

  /**
   * Creates a new MCPToolRegistry instance
   *
   * @param {MCPServices} services - Collection of services for tool operations
   */
  constructor(services: MCPServices) {
    this.services = services;
    this.aiPrioritizer = new AIContextualPrioritizer(services.taskService);
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
  async listTools(): Promise<Tool[]> {
    const { getTaskTools } = await import('./tools/task-tools');
    const { getBoardTools } = await import('./tools/board-tools');
    const { getNoteTools } = await import('./tools/note-tools');
    const { getTagTools } = await import('./tools/tag-tools');
    const { getAnalyticsTools } = await import('./tools/analytics-tools');

    return Promise.resolve([
      ...getTaskTools(),
      ...getBoardTools(),
      ...getNoteTools(),
      ...getTagTools(),
      ...getAnalyticsTools(),
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
   *
   * @example
   * ```typescript
   * const result = await registry.callTool('create_task', {
   *   title: 'New Feature',
   *   board_id: 'board123',
   *   priority: 3
   * });
   *
   * if (result.isError) {
   *   console.error('Tool execution failed:', result.content);
   * } else {
   *   console.log('Task created:', result.content);
   * }
   * ```
   */
  async callTool(name: string, args: unknown): Promise<ToolResponse> {
    try {
      logger.info(`Executing MCP tool: ${name}`, { args });

      switch (name) {
        // Task tools
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

        // Board tools
        case 'create_board':
          return await this.createBoard(args as CreateBoardArgs);
        case 'get_board':
          return await this.getBoard(args as GetBoardArgs);
        case 'list_boards':
          return await this.listBoards(args as ListBoardsArgs);

        // Note tools
        case 'add_note':
          return await this.addNote(args as AddNoteArgs);
        case 'search_notes':
          return await this.searchNotes(args as SearchNotesArgs);

        // Tag tools
        case 'create_tag':
          return await this.createTag(args as CreateTagArgs);
        case 'assign_tag':
          return await this.assignTag(args as AssignTagArgs);

        // Context tools
        case 'get_project_context':
          return await this.getProjectContext(args as GetProjectContextArgs);
        case 'get_task_context':
          return await this.getTaskContext(args as GetTaskContextArgs);

        default:
          const error = new Error(`Unknown tool: ${name}`);
          logger.error('Unknown MCP tool requested', { toolName: name, error });
          return {
            success: false,
            message: `Unknown tool: ${name}. Available tools: ${(await this.listTools())
              .map(t => t.name)
              .join(', ')}`,
          };
      }
    } catch (error) {
      logger.error(`MCP tool execution failed: ${name}`, { error, args });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        message: `Tool execution failed: ${errorMessage}`,
      };
    }
  }

  // Private method implementations
  private async createTask(args: CreateTaskArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.taskService.createTask(args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Create task failed',
      };
    }
  }

  private async updateTask(args: UpdateTaskArgs): Promise<ToolResponse> {
    try {
      const { task_id, ...updates } = args;
      const result = await this.services.taskService.updateTask(task_id, updates as ServiceUpdateTaskRequest);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Update task failed',
      };
    }
  }

  private async getTask(args: GetTaskArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.taskService.getTaskById(args.task_id);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Get task failed',
      };
    }
  }

  private async listTasks(args: ListTasksArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.taskService.getTasks(args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'List tasks failed',
      };
    }
  }

  private async searchTasks(args: SearchTasksArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.taskService.searchTasks(args.query, args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Search tasks failed',
      };
    }
  }

  private async deleteTask(args: DeleteTaskArgs): Promise<ToolResponse> {
    try {
      await this.services.taskService.deleteTask(args.task_id);
      return { success: true, data: { deleted: true } };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Delete task failed',
      };
    }
  }

  private async createBoard(args: CreateBoardArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.boardService.createBoard(args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Create board failed',
      };
    }
  }

  private async getBoard(args: GetBoardArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.boardService.getBoardById(args.board_id);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Get board failed',
      };
    }
  }

  private async listBoards(_args: ListBoardsArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.boardService.getBoards();
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'List boards failed',
      };
    }
  }

  private async addNote(args: AddNoteArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.noteService.createNote(args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Add note failed',
      };
    }
  }

  private async searchNotes(args: SearchNotesArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.noteService.searchNotes(args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Search notes failed',
      };
    }
  }

  private async createTag(args: CreateTagArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.tagService.createTag(args as any);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Create tag failed',
      };
    }
  }

  private async assignTag(args: AssignTagArgs): Promise<ToolResponse> {
    try {
      // TagService.addTagToTask handles one tag at a time, so we need to process multiple tags
      const results = await Promise.all(
        args.tag_ids.map(tagId => 
          this.services.tagService.addTagToTask(args.task_id, tagId)
        )
      );
      return { success: true, data: results };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Assign tag failed',
      };
    }
  }

  private async getProjectContext(args: GetProjectContextArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.contextService.getProjectContext(
        (args as any).board_id
      );
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Get project context failed',
      };
    }
  }

  private async getTaskContext(args: GetTaskContextArgs): Promise<ToolResponse> {
    try {
      const result = await this.services.contextService.getTaskContext(args.task_id);
      return { success: true, data: result as unknown };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Get task context failed',
      };
    }
  }
}
