# MCP (Model Context Protocol) Module Documentation

## Overview

The MCP module implements the Model Context Protocol for the MCP Kanban system, enabling AI assistants to interact with the kanban board through standardized tools and prompts. This module bridges the gap between AI language models and task management operations.

## Table of Contents

- [Architecture](#architecture)
- [Core Components](#core-components)
- [Tool Registry](#tool-registry)
- [Prompt System](#prompt-system)
- [Integration](#integration)
- [Tool Implementation](#tool-implementation)
- [Development](#development)
- [Best Practices](#best-practices)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  MCP Server                              │
│                (src/mcp/index.ts)                       │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼─────┐   ┌─────▼─────┐  ┌─────▼─────┐
    │   Tools  │   │  Prompts  │  │  Context  │
    ├──────────┤   ├───────────┤  ├───────────┤
    │ • create │   │ • planning│  │ • project │
    │ • read   │   │ • analysis│  │ • task    │
    │ • update │   │ • reports │  │ • board   │
    │ • delete │   │ • insights│  │ • metrics │
    └──────────┘   └───────────┘  └───────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                ┌────────▼────────┐
                │    Services     │
                └─────────────────┘
```

## Core Components

### MCP Server

**Location**: `src/mcp/index.ts`

```typescript
export class MCPServer {
  private server: Server;
  private toolRegistry: MCPToolRegistry;
  private promptRegistry: MCPPromptRegistry;
  
  constructor(services: MCPServices) {
    this.toolRegistry = new MCPToolRegistry(services);
    this.promptRegistry = new MCPPromptRegistry(services);
    
    this.server = new Server({
      name: 'mcp-kanban',
      version: '1.0.0',
    });
    
    this.setupHandlers();
  }
  
  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: await this.toolRegistry.listTools(),
      })
    );
    
    // Execute tool
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => ({
        content: [await this.toolRegistry.callTool(
          request.params.name,
          request.params.arguments
        )],
      })
    );
    
    // List prompts
    this.server.setRequestHandler(
      ListPromptsRequestSchema,
      async () => ({
        prompts: await this.promptRegistry.listPrompts(),
      })
    );
    
    // Get prompt
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => ({
        ...await this.promptRegistry.getPrompt(
          request.params.name,
          request.params.arguments || {}
        ),
      })
    );
  }
  
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started');
  }
}
```

### Service Integration

**Location**: `src/mcp/types.ts`

```typescript
export interface MCPServices {
  taskService: TaskService;
  boardService: BoardService;
  noteService: NoteService;
  tagService: TagService;
  contextService: ContextService;
}

export interface MCPResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface MCPContext {
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}
```

## Tool Registry

### Tool Definition

**Location**: `src/mcp/tools.ts`

```typescript
export class MCPToolRegistry {
  constructor(private services: MCPServices) {}
  
  async listTools(): Promise<Tool[]> {
    return [
      // Task Management Tools
      {
        name: 'create_task',
        description: 'Create a new task in a board',
        inputSchema: {
          type: 'object',
          properties: {
            title: { 
              type: 'string', 
              description: 'Task title' 
            },
            board_id: { 
              type: 'string', 
              description: 'Board ID where task will be created' 
            },
            // ... other properties
          },
          required: ['title', 'board_id'],
        },
      },
      
      // Board Management Tools
      {
        name: 'create_board',
        description: 'Create a new board',
        inputSchema: {
          type: 'object',
          properties: {
            name: { 
              type: 'string', 
              description: 'Board name' 
            },
            description: { 
              type: 'string', 
              description: 'Board description' 
            },
          },
          required: ['name'],
        },
      },
      
      // Context Tools
      {
        name: 'get_project_context',
        description: 'Generate AI context for a project',
        inputSchema: {
          type: 'object',
          properties: {
            board_id: { 
              type: 'string', 
              description: 'Board ID to generate context for' 
            },
            include_completed: { 
              type: 'boolean', 
              description: 'Include completed tasks',
              default: false 
            },
          },
          required: ['board_id'],
        },
      },
    ];
  }
}
```

### Tool Implementation

```typescript
export class MCPToolRegistry {
  async callTool(name: string, args: unknown): Promise<MCPResponse> {
    logger.info('MCP tool call', { toolName: name, args });
    
    try {
      switch (name) {
        case 'create_task':
          return await this.createTask(args as CreateTaskArgs);
        case 'update_task':
          return await this.updateTask(args as UpdateTaskArgs);
        case 'get_task':
          return await this.getTask(args as GetTaskArgs);
        // ... other tools
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error('Tool execution error', { toolName: name, args, error });
      
      return {
        success: false,
        error: {
          code: error.code || 'TOOL_ERROR',
          message: error.message,
          details: error.details,
        },
      };
    }
  }
  
  private async createTask(args: CreateTaskArgs): Promise<TaskResponse> {
    // Validate input
    const validated = validateCreateTaskArgs(args);
    
    // Check board exists
    const board = await this.services.boardService.getBoardById(
      validated.board_id
    );
    if (!board) {
      throw new Error('Board not found');
    }
    
    // Create task
    const task = await this.services.taskService.createTask({
      title: validated.title,
      description: validated.description,
      board_id: validated.board_id,
      column_id: validated.column_id || 'todo',
      priority: validated.priority || 3,
      status: validated.status || 'todo',
      assignee: validated.assignee,
      due_date: validated.due_date ? new Date(validated.due_date) : undefined,
      tags: validated.tags,
    });
    
    return { 
      success: true, 
      task 
    };
  }
}
```

## Prompt System

### Prompt Registry

**Location**: `src/mcp/prompts.ts`

```typescript
export class MCPPromptRegistry {
  constructor(private services: MCPServices) {}
  
  async listPrompts(): Promise<Prompt[]> {
    return [
      {
        name: 'task_planning',
        description: 'Help plan and organize tasks with intelligent suggestions',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to plan tasks for',
            required: true,
          },
          {
            name: 'planning_horizon',
            description: 'Time horizon for planning (day, week, sprint, month)',
            required: false,
          },
        ],
      },
      {
        name: 'sprint_planning',
        description: 'Assist with sprint planning and capacity estimation',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board for sprint planning',
            required: true,
          },
          {
            name: 'sprint_duration',
            description: 'Duration of the sprint in days',
            required: false,
          },
        ],
      },
    ];
  }
  
  async getPrompt(name: string, args: Record<string, any>): Promise<PromptContent> {
    logger.info('MCP prompt request', { promptName: name, args });
    
    try {
      switch (name) {
        case 'task_planning':
          return await this.generateTaskPlanningPrompt(args);
        case 'sprint_planning':
          return await this.generateSprintPlanningPrompt(args);
        // ... other prompts
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    } catch (error) {
      logger.error('Prompt generation error', { promptName: name, args, error });
      throw error;
    }
  }
}
```

### Prompt Generation

```typescript
private async generateTaskPlanningPrompt(args: any): Promise<PromptContent> {
  const { board_id, planning_horizon, focus_area } = args;
  
  if (!board_id) {
    throw new Error('board_id is required');
  }
  
  // Get context data
  const context = await this.services.contextService.getProjectContext({
    board_id,
    include_completed: false,
    days_back: 14,
    max_items: 100,
  });
  
  const board = await this.services.boardService.getBoardWithStats(board_id);
  
  return {
    description: 'Generate a comprehensive task planning strategy',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are a project planning assistant. Help create an effective task plan for the ${planning_horizon || 'sprint'}${focus_area ? ` with focus on ${focus_area}` : ''}.

Current Context:
${JSON.stringify(context, null, 2)}

Board Statistics:
- Total tasks: ${board.taskCount}
- Completed: ${board.completedTasks}
- In progress: ${board.inProgressTasks}
- Blocked: ${board.blockedTasks}

Create a comprehensive task plan that includes:
1. Priority assessment of existing tasks
2. Recommended task sequencing
3. Capacity planning considerations
4. Risk assessment and mitigation
5. Dependencies and blocking factors

Focus on actionable recommendations that will improve team productivity and project outcomes.`,
        },
      },
    ],
  };
}
```

## Integration

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/path/to/mcp-kanban/dist/mcp/index.js"],
      "env": {
        "DATABASE_URL": "sqlite:///path/to/kanban.db",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Setup

```bash
# Required environment variables
DATABASE_URL=sqlite:///path/to/kanban.db
LOG_LEVEL=info
MCP_ENABLED=true

# Optional configuration
MCP_MAX_CONTEXT_SIZE=50000
MCP_TIMEOUT=30000
MCP_RETRY_ATTEMPTS=3
```

## Tool Implementation

### Task Tools

```typescript
// Create task with full validation
private async createTask(args: CreateTaskArgs): Promise<TaskResponse> {
  // 1. Input validation
  if (!args.title?.trim()) {
    throw new ValidationError('Task title is required');
  }
  
  if (!args.board_id) {
    throw new ValidationError('Board ID is required');
  }
  
  // 2. Business logic validation
  const board = await this.services.boardService.getBoardById(args.board_id);
  if (!board) {
    throw new NotFoundError('Board', args.board_id);
  }
  
  // 3. Transform data
  const createData: CreateTaskData = {
    title: args.title.trim(),
    description: args.description?.trim(),
    board_id: args.board_id,
    column_id: args.column_id || 'todo',
    priority: Math.min(Math.max(args.priority || 3, 1), 5),
    status: args.status || 'todo',
    assignee: args.assignee,
    due_date: args.due_date ? new Date(args.due_date) : undefined,
  };
  
  // 4. Execute operation
  const task = await this.services.taskService.createTask(createData);
  
  // 5. Handle tags if provided
  if (args.tags?.length) {
    await Promise.all(
      args.tags.map(tagId => 
        this.services.tagService.addTagToTask(task.id, tagId)
      )
    );
  }
  
  // 6. Return formatted response
  return {
    success: true,
    task: await this.services.taskService.getTaskById(task.id),
  };
}
```

### Context Tools

```typescript
private async getProjectContext(args: GetProjectContextArgs): Promise<ProjectContextResponse> {
  const { board_id, include_completed, include_notes, max_tasks } = args;
  
  // Get comprehensive context
  const context = await this.services.contextService.getProjectContext({
    board_id,
    include_completed: include_completed ?? false,
    days_back: 30,
    max_items: max_tasks || 100,
    include_metrics: true,
    detail_level: 'comprehensive',
  });
  
  // Transform to MCP format
  return {
    success: true,
    context: {
      summary: context.summary,
      active_tasks: context.priorities.map(p => p.task),
      recent_activity: context.recent_activities,
      priorities: context.priorities.map(p => p.task),
      bottlenecks: context.blockers,
      metrics: context.key_metrics,
      recommendations: context.priorities.map(
        p => `Priority: ${p.task.title} - ${p.reason}`
      ),
    },
  };
}
```

### Search Tools

```typescript
private async searchTasks(args: SearchTasksArgs): Promise<TasksResponse> {
  const { query, board_id, status, assignee, tags, limit, offset } = args;
  
  if (!query?.trim()) {
    throw new ValidationError('Search query is required');
  }
  
  // Build search filters
  const filters: TaskSearchFilters = {
    search: query.trim(),
    board_id,
    status: status as Task['status'],
    assignee,
    tags,
    limit: limit || 20,
    offset: offset || 0,
  };
  
  // Execute search
  const tasks = await this.services.taskService.searchTasks(filters);
  
  // Add relevance scoring
  const scoredTasks = tasks.map(task => ({
    ...task,
    relevance: calculateRelevance(task, query),
  }));
  
  // Sort by relevance
  scoredTasks.sort((a, b) => b.relevance - a.relevance);
  
  return {
    success: true,
    tasks: scoredTasks,
    count: scoredTasks.length,
    query,
  };
}
```

## Development

### Creating New Tools

1. Define the tool interface:

```typescript
// src/mcp/types.ts
export interface MyToolArgs {
  requiredParam: string;
  optionalParam?: number;
}

export interface MyToolResponse extends MCPResponse {
  result: SomeType;
}
```

2. Add tool definition:

```typescript
// src/mcp/tools.ts
{
  name: 'my_tool',
  description: 'Description of what the tool does',
  inputSchema: {
    type: 'object',
    properties: {
      requiredParam: {
        type: 'string',
        description: 'Parameter description',
      },
      optionalParam: {
        type: 'number',
        description: 'Optional parameter',
        default: 10,
      },
    },
    required: ['requiredParam'],
  },
}
```

3. Implement tool handler:

```typescript
private async myTool(args: MyToolArgs): Promise<MyToolResponse> {
  // Validation
  if (!args.requiredParam) {
    throw new ValidationError('requiredParam is required');
  }
  
  try {
    // Business logic
    const result = await this.services.myService.doSomething(args);
    
    return {
      success: true,
      result,
    };
  } catch (error) {
    logger.error('Tool error', { tool: 'my_tool', args, error });
    throw error;
  }
}
```

### Testing MCP Tools

```typescript
import { MCPToolRegistry } from '@/mcp/tools';
import { createMockServices } from '@/tests/mocks';

describe('MCP Tools', () => {
  let toolRegistry: MCPToolRegistry;
  let mockServices: MCPServices;
  
  beforeEach(() => {
    mockServices = createMockServices();
    toolRegistry = new MCPToolRegistry(mockServices);
  });
  
  describe('create_task', () => {
    it('should create task with valid input', async () => {
      mockServices.boardService.getBoardById.mockResolvedValue({
        id: 'board-123',
        name: 'Test Board',
      });
      
      mockServices.taskService.createTask.mockResolvedValue({
        id: 'task-456',
        title: 'Test Task',
        board_id: 'board-123',
      });
      
      const result = await toolRegistry.callTool('create_task', {
        title: 'Test Task',
        board_id: 'board-123',
      });
      
      expect(result).toEqual({
        success: true,
        task: expect.objectContaining({
          id: 'task-456',
          title: 'Test Task',
        }),
      });
    });
    
    it('should handle validation errors', async () => {
      const result = await toolRegistry.callTool('create_task', {
        // Missing required fields
        description: 'Task without title',
      });
      
      expect(result).toEqual({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Task title is required',
        },
      });
    });
  });
});
```

### Debugging MCP

Enable debug logging:

```typescript
// src/mcp/debug.ts
export function enableMCPDebug() {
  const originalCallTool = MCPToolRegistry.prototype.callTool;
  
  MCPToolRegistry.prototype.callTool = async function(name, args) {
    console.log('MCP Tool Call:', { name, args });
    const startTime = Date.now();
    
    try {
      const result = await originalCallTool.call(this, name, args);
      console.log('MCP Tool Result:', {
        name,
        duration: Date.now() - startTime,
        success: result.success,
      });
      return result;
    } catch (error) {
      console.error('MCP Tool Error:', {
        name,
        duration: Date.now() - startTime,
        error: error.message,
      });
      throw error;
    }
  };
}
```

## Best Practices

### 1. Input Validation

Always validate tool inputs thoroughly:

```typescript
private validateTaskInput(args: any): CreateTaskArgs {
  const schema = z.object({
    title: z.string().min(1).max(200),
    board_id: z.string().uuid(),
    priority: z.number().int().min(1).max(5).optional(),
    due_date: z.string().datetime().optional(),
  });
  
  const result = schema.safeParse(args);
  if (!result.success) {
    throw new ValidationError(
      'Invalid input',
      result.error.issues
    );
  }
  
  return result.data;
}
```

### 2. Error Handling

Provide clear, actionable error messages:

```typescript
try {
  const result = await operation();
  return { success: true, data: result };
} catch (error) {
  if (error instanceof NotFoundError) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `${error.resource} not found: ${error.id}`,
        details: { resource: error.resource, id: error.id },
      },
    };
  }
  
  // Generic error handling
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
}
```

### 3. Context Generation

Optimize context for AI consumption:

```typescript
private formatContextForAI(data: any): string {
  // Remove unnecessary fields
  const cleaned = omit(data, ['internal_id', 'created_by', 'updated_by']);
  
  // Flatten nested structures
  const flattened = flattenObject(cleaned);
  
  // Add helpful metadata
  return {
    generated_at: new Date().toISOString(),
    context_type: 'project_overview',
    data: flattened,
    summary: generateSummary(flattened),
  };
}
```

### 4. Performance

Implement caching for expensive operations:

```typescript
private cache = new Map<string, { data: any; expiry: number }>();

private async getCachedContext(key: string, generator: () => Promise<any>) {
  const cached = this.cache.get(key);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  
  const data = await generator();
  this.cache.set(key, {
    data,
    expiry: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  
  return data;
}
```

### 5. Tool Naming

Use consistent, descriptive tool names:

```typescript
// Good
'create_task'
'update_task'
'get_task'
'list_tasks'
'search_tasks'

// Bad
'newTask'
'taskUpdate'
'fetch-task'
'GETTASKS'
```

## See Also

- [MCP API Reference](../api/MCP.md)
- [Agent Integration Guide](../guides/AGENT_INTEGRATION.md)
- [Services Module](./services.md)
- [Architecture Overview](../ARCHITECTURE.md)