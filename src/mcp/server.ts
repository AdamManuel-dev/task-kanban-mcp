/**
 * MCP Kanban Server - Model Context Protocol server implementation
 *
 * @module mcp/server
 * @description Provides MCP (Model Context Protocol) server implementation for the Kanban system.
 * This allows AI agents like Claude to interact with the kanban board through standardized
 * tools, resources, and prompts. The server handles tool execution, resource access, and
 * prompt generation for AI-powered task management workflows.
 *
 * @example
 * ```typescript
 * import { mcpServer } from '@/mcp/server';
 *
 * // Start the MCP server
 * await mcpServer.start();
 *
 * // The server will be available via stdio transport
 * // AI agents can now call tools like:
 * // - create_task
 * // - get_context
 * // - search_tasks
 * ```
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from '@/config';
import { logger } from '@/utils/logger';
import { dbConnection } from '@/database/connection';
import { TaskService } from '@/services/TaskService';
import { BoardService } from '@/services/BoardService';
import { NoteService } from '@/services/NoteService';
import { TagService } from '@/services/TagService';
import { ContextService } from '@/services/ContextService';
import { MCPToolRegistry } from './tools';
import { MCPResourceRegistry } from './resources';
import { MCPPromptRegistry } from './prompts';

/**
 * MCP Kanban Server - Main server class for Model Context Protocol integration
 *
 * @class MCPKanbanServer
 * @description Implements the MCP server specification to provide AI agents with
 * access to kanban functionality through tools, resources, and prompts. Handles
 * all MCP protocol communications and delegates actual work to service layers.
 */
export class MCPKanbanServer {
  private readonly server: Server;

  private readonly taskService: TaskService;

  private readonly boardService: BoardService;

  private readonly noteService: NoteService;

  private readonly tagService: TagService;

  private readonly contextService: ContextService;

  private readonly toolRegistry: MCPToolRegistry;

  private readonly resourceRegistry: MCPResourceRegistry;

  private readonly promptRegistry: MCPPromptRegistry;

  /**
   * Creates a new MCP Kanban Server instance
   *
   * @description Initializes the MCP server with kanban capabilities:
   * - Tools: For task manipulation and querying
   * - Resources: For accessing board and task data
   * - Prompts: For AI-guided task management workflows
   */
  constructor() {
    this.server = new Server(
      {
        name: 'mcp-kanban-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    // Initialize services
    this.taskService = new TaskService(dbConnection);
    this.boardService = new BoardService(dbConnection);
    this.noteService = new NoteService(dbConnection);
    this.tagService = new TagService(dbConnection);
    this.contextService = new ContextService(
      dbConnection,
      this.boardService,
      this.taskService,
      this.noteService,
      this.tagService
    );

    // Initialize registries
    this.toolRegistry = new MCPToolRegistry({
      taskService: this.taskService,
      boardService: this.boardService,
      noteService: this.noteService,
      tagService: this.tagService,
      contextService: this.contextService,
    });

    this.resourceRegistry = new MCPResourceRegistry({
      taskService: this.taskService,
      boardService: this.boardService,
      noteService: this.noteService,
      tagService: this.tagService,
      contextService: this.contextService,
    });

    this.promptRegistry = new MCPPromptRegistry({
      taskService: this.taskService,
      boardService: this.boardService,
      noteService: this.noteService,
      tagService: this.tagService,
      contextService: this.contextService,
    });

    this.setupHandlers();
  }

  /**
   * Sets up all MCP protocol request handlers
   *
   * @private
   * @description Configures handlers for:
   * - Tool listing and execution
   * - Resource listing and reading
   * - Prompt listing and generation
   * - Error handling and logging
   */
  private setupHandlers(): void {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await this.toolRegistry.listTools();
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.toolRegistry.callTool(name, args ?? {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('MCP tool call failed', { toolName: name, args, error });
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${String(String(error instanceof Error ? error.message : 'Unknown error'))}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Resource handlers
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await this.resourceRegistry.listResources();
      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;

      try {
        const resource = await this.resourceRegistry.readResource(uri);
        return {
          contents: [
            {
              uri,
              mimeType: resource.mimeType ?? 'application/json',
              text: resource.text,
            },
          ],
        };
      } catch (error) {
        logger.error('MCP resource read failed', { uri, error });
        throw error;
      }
    });

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      const prompts = await this.promptRegistry.listPrompts();
      return { prompts };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        const prompt = await this.promptRegistry.getPrompt(name, args ?? {});
        return {
          description: prompt.description,
          messages: prompt.messages,
        };
      } catch (error) {
        logger.error('MCP prompt get failed', { promptName: name, args, error });
        throw error;
      }
    });

    // Error handler
    this.server.onerror = error => {
      logger.error('MCP server error', { error });
    };
  }

  /**
   * Starts the MCP server and establishes transport connection
   *
   * @returns Promise that resolves when server is fully started
   *
   * @throws {Error} When database initialization fails
   * @throws {Error} When MCP transport connection fails
   *
   * @description This method:
   * - Initializes the database connection
   * - Sets up stdio transport for CLI communication
   * - Registers signal handlers for graceful shutdown
   * - Logs server startup information
   *
   * @example
   * ```typescript
   * const server = new MCPKanbanServer();
   * await server.start();
   * ```
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting MCP Kanban server...');

      // Initialize database connection
      if (!dbConnection.isConnected()) {
        await dbConnection.initialize();
      }

      // Connect to transport (stdio for CLI usage)
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info('MCP Kanban server started successfully', {
        name: config.mcp.serverName,
        version: config.mcp.serverVersion,
        tools: (await this.toolRegistry.listTools()).length,
        resources: (await this.resourceRegistry.listResources()).length,
        prompts: (await this.promptRegistry.listPrompts()).length,
      });

      // Keep the process running
      process.on('SIGINT', () => {
        this.stop().catch(error => logger.error('Failed to stop server on SIGINT', { error }));
      });

      process.on('SIGTERM', () => {
        this.stop().catch(error => logger.error('Failed to stop server on SIGTERM', { error }));
      });
    } catch (error) {
      logger.error('Failed to start MCP server', { error });
      throw error;
    }
  }

  /**
   * Gracefully stops the MCP server and cleans up resources
   *
   * @returns Promise that resolves when server is fully stopped
   *
   * @description This method:
   * - Closes the MCP server connection
   * - Closes the database connection
   * - Logs shutdown information
   * - Exits the process with appropriate code
   *
   * @example
   * ```typescript
   * await server.stop();
   * ```
   */
  async stop(exitProcess: boolean = true): Promise<void> {
    try {
      logger.info('Stopping MCP Kanban server...');

      await this.server.close();

      if (dbConnection.isConnected()) {
        await dbConnection.close();
      }

      logger.info('MCP Kanban server stopped');

      if (exitProcess) {
        process.exit(0);
      }
    } catch (error) {
      logger.error('Error stopping MCP server', { error });
      if (exitProcess) {
        process.exit(1);
      }
    }
  }

  /**
   * Performs a comprehensive health check of the MCP server
   *
   * @returns Promise resolving to health status with detailed metrics
   *
   * @description Checks:
   * - Database connection health
   * - Number of available tools, resources, and prompts
   * - Server uptime
   * - Overall system status
   *
   * @example
   * ```typescript
   * const health = await server.healthCheck();
   * logger.log(`Server status: ${String(String(health.status))}`);
   * logger.log(`Tools available: ${String(String(health.tools))}`);
   * ```
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: boolean;
    tools: number;
    resources: number;
    prompts: number;
    uptime: number;
  }> {
    try {
      const dbHealth = await dbConnection.healthCheck();
      const tools = await this.toolRegistry.listTools();
      const resources = await this.resourceRegistry.listResources();
      const prompts = await this.promptRegistry.listPrompts();

      return {
        status: dbHealth.connected ? 'healthy' : 'unhealthy',
        database: dbHealth.connected,
        tools: tools.length,
        resources: resources.length,
        prompts: prompts.length,
        uptime: process.uptime(),
      };
    } catch (error) {
      logger.error('MCP health check failed', { error });
      return {
        status: 'unhealthy',
        database: false,
        tools: 0,
        resources: 0,
        prompts: 0,
        uptime: process.uptime(),
      };
    }
  }

  /**
   * Gets basic server information and capabilities
   *
   * @returns Server metadata including name, version, and capabilities
   *
   * @example
   * ```typescript
   * const info = server.getServerInfo();
   * logger.log(`${String(String(info.name))} v${String(String(info.version))}`);
   * logger.log(`Capabilities: ${String(String(info.capabilities.join(', ')))}`);
   * ```
   */
  getServerInfo(): {
    name: string;
    version: string;
    capabilities: string[];
    description: string;
  } {
    return {
      name: config.mcp.serverName,
      version: config.mcp.serverVersion,
      capabilities: ['tools', 'resources', 'prompts'],
      description: 'MCP server for Kanban task management with AI integration',
    };
  }

  /**
   * Gets the tool registry for external access
   *
   * @returns The MCPToolRegistry instance
   *
   * @example
   * ```typescript
   * const tools = server.getToolRegistry();
   * const toolList = await tools.listTools();
   * ```
   */
  getToolRegistry(): MCPToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Gets the resource registry for external access
   *
   * @returns The MCPResourceRegistry instance
   */
  getResourceRegistry(): MCPResourceRegistry {
    return this.resourceRegistry;
  }

  /**
   * Gets the prompt registry for external access
   *
   * @returns The MCPPromptRegistry instance
   */
  getPromptRegistry(): MCPPromptRegistry {
    return this.promptRegistry;
  }
}

// Create singleton instance
export const mcpServer = new MCPKanbanServer();

// Start server if this file is run directly
if (require.main === module) {
  mcpServer.start().catch(error => {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}
