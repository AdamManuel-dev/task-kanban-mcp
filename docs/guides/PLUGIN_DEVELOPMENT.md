# Plugin Development Guide

This guide covers how to develop plugins for the MCP Kanban system, extending its functionality with custom integrations, tools, and features.

## Table of Contents

- [Plugin Architecture](#plugin-architecture)
- [Plugin Types](#plugin-types)
- [Getting Started](#getting-started)
- [Plugin Development](#plugin-development)
- [Testing Plugins](#testing-plugins)
- [Distribution](#distribution)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Plugin Architecture

### Overview

The MCP Kanban system uses a plugin architecture that allows developers to extend functionality through:

- **Hook System**: Event-based extensions for custom logic
- **Custom MCP Tools**: Additional tools for AI assistants
- **API Middleware**: Custom request/response processing
- **Storage Backends**: Alternative data storage solutions
- **Authentication Providers**: Custom authentication methods

### Plugin Structure

```
plugins/
├── my-plugin/
│   ├── src/
│   │   ├── index.ts          # Plugin entry point
│   │   ├── hooks.ts          # Event hooks
│   │   ├── tools.ts          # MCP tools
│   │   ├── middleware.ts     # API middleware
│   │   └── types.ts          # Type definitions
│   ├── tests/
│   │   └── plugin.test.ts
│   ├── package.json
│   ├── README.md
│   └── plugin.json           # Plugin manifest
```

### Plugin Manifest

```json
{
  "name": "my-kanban-plugin",
  "version": "1.0.0",
  "description": "Custom plugin for MCP Kanban",
  "author": "Your Name",
  "license": "MIT",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "engines": {
    "node": ">=18.0.0"
  },
  "mcpKanban": {
    "version": "^1.0.0",
    "hooks": ["task.created", "task.updated"],
    "tools": ["my_custom_tool"],
    "middleware": ["myMiddleware"],
    "permissions": ["read:tasks", "write:tasks"]
  }
}
```

## Plugin Types

### 1. Hook Plugins

Hook plugins respond to system events and can modify data or trigger actions.

```typescript
// plugins/notification-plugin/src/hooks.ts
import type { PluginHook, Task, HookContext } from '@mcp-kanban/plugin-api';

export class NotificationHooks implements PluginHook {
  name = 'notification-plugin';
  
  async onTaskCreated(task: Task, context: HookContext): Promise<void> {
    // Send notification when task is created
    await this.sendNotification({
      type: 'task_created',
      taskId: task.id,
      title: task.title,
      userId: context.userId,
    });
  }
  
  async onTaskUpdated(task: Task, context: HookContext): Promise<void> {
    // Send notification when task is updated
    await this.sendNotification({
      type: 'task_updated',
      taskId: task.id,
      title: task.title,
      userId: context.userId,
    });
  }
  
  private async sendNotification(notification: NotificationData): Promise<void> {
    // Implementation for sending notifications
  }
}
```

### 2. MCP Tool Plugins

MCP tool plugins add new tools for AI assistants to use.

```typescript
// plugins/analytics-plugin/src/tools.ts
import type { MCPTool, ToolRegistry } from '@mcp-kanban/plugin-api';

export class AnalyticsTools {
  constructor(private analyticsService: AnalyticsService) {}
  
  getTaskAnalytics: MCPTool = {
    name: 'get_task_analytics',
    description: 'Get analytics and insights for tasks',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: { type: 'string', description: 'Board identifier' },
        timeRange: { type: 'string', description: 'Time range for analytics' },
      },
      required: ['board_id'],
    },
    
    async handler(args: GetTaskAnalyticsArgs): Promise<TaskAnalytics> {
      return this.analyticsService.getTaskAnalytics(args.board_id, args.timeRange);
    },
  };
  
  getProductivityMetrics: MCPTool = {
    name: 'get_productivity_metrics',
    description: 'Get productivity metrics and trends',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User identifier' },
        period: { type: 'string', description: 'Analysis period' },
      },
      required: ['userId'],
    },
    
    async handler(args: GetProductivityMetricsArgs): Promise<ProductivityMetrics> {
      return this.analyticsService.getProductivityMetrics(args.userId, args.period);
    },
  };
}
```

### 3. Middleware Plugins

Middleware plugins can intercept and modify API requests/responses.

```typescript
// plugins/rate-limit-plugin/src/middleware.ts
import type { PluginMiddleware, Request, Response, NextFunction } from '@mcp-kanban/plugin-api';

export class RateLimitMiddleware implements PluginMiddleware {
  name = 'rate-limit';
  
  constructor(private rateLimitService: RateLimitService) {}
  
  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    const clientId = this.getClientId(req);
    const endpoint = req.path;
    
    const isAllowed = await this.rateLimitService.checkLimit(clientId, endpoint);
    
    if (!isAllowed) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: await this.rateLimitService.getRetryAfter(clientId, endpoint),
      });
      return;
    }
    
    next();
  }
  
  private getClientId(req: Request): string {
    return req.headers['x-api-key'] as string || req.ip;
  }
}
```

### 4. Storage Backend Plugins

Storage backend plugins provide alternative data storage solutions.

```typescript
// plugins/postgres-storage/src/storage.ts
import type { StorageBackend, StorageConfig } from '@mcp-kanban/plugin-api';

export class PostgresStorageBackend implements StorageBackend {
  name = 'postgres';
  
  constructor(private config: StorageConfig) {
    this.client = new Client(config.connectionString);
  }
  
  async initialize(): Promise<void> {
    await this.client.connect();
    await this.createTables();
  }
  
  async createTask(task: CreateTaskData): Promise<Task> {
    const result = await this.client.query(
      'INSERT INTO tasks (id, title, description, board_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [task.id, task.title, task.description, task.board_id]
    );
    return result.rows[0];
  }
  
  async getTask(id: string): Promise<Task | null> {
    const result = await this.client.query(
      'SELECT * FROM tasks WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }
  
  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    const result = await this.client.query(
      `UPDATE tasks SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0];
  }
  
  async deleteTask(id: string): Promise<void> {
    await this.client.query('DELETE FROM tasks WHERE id = $1', [id]);
  }
  
  private async createTables(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        board_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}
```

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **TypeScript** >= 5.0.0
- **MCP Kanban** >= 1.0.0

### Plugin Template

Use the official plugin template to get started quickly:

```bash
# Clone the plugin template
git clone https://github.com/mcp-kanban/plugin-template.git my-plugin
cd my-plugin

# Install dependencies
npm install

# Build the plugin
npm run build

# Test the plugin
npm test
```

### Basic Plugin Structure

```typescript
// src/index.ts
import { Plugin, PluginContext } from '@mcp-kanban/plugin-api';
import { MyHooks } from './hooks';
import { MyTools } from './tools';
import { MyMiddleware } from './middleware';

export class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';
  
  async initialize(context: PluginContext): Promise<void> {
    // Initialize plugin resources
    await this.setupDatabase(context);
    await this.registerHooks(context);
    await this.registerTools(context);
    await this.registerMiddleware(context);
  }
  
  async destroy(): Promise<void> {
    // Cleanup plugin resources
    await this.cleanup();
  }
  
  private async setupDatabase(context: PluginContext): Promise<void> {
    // Setup plugin-specific database tables
  }
  
  private async registerHooks(context: PluginContext): Promise<void> {
    const hooks = new MyHooks();
    context.hookRegistry.register(hooks);
  }
  
  private async registerTools(context: PluginContext): Promise<void> {
    const tools = new MyTools();
    context.toolRegistry.register(tools);
  }
  
  private async registerMiddleware(context: PluginContext): Promise<void> {
    const middleware = new MyMiddleware();
    context.middlewareRegistry.register(middleware);
  }
  
  private async cleanup(): Promise<void> {
    // Cleanup resources
  }
}

// Plugin factory function
export function createPlugin(): Plugin {
  return new MyPlugin();
}
```

## Plugin Development

### Hook Development

#### Available Hooks

```typescript
interface PluginHook {
  name: string;
  
  // Task hooks
  onTaskCreated?(task: Task, context: HookContext): Promise<void>;
  onTaskUpdated?(task: Task, context: HookContext): Promise<void>;
  onTaskDeleted?(taskId: string, context: HookContext): Promise<void>;
  onTaskMoved?(task: Task, fromColumn: string, toColumn: string, context: HookContext): Promise<void>;
  
  // Board hooks
  onBoardCreated?(board: Board, context: HookContext): Promise<void>;
  onBoardUpdated?(board: Board, context: HookContext): Promise<void>;
  onBoardDeleted?(boardId: string, context: HookContext): Promise<void>;
  
  // Note hooks
  onNoteCreated?(note: Note, context: HookContext): Promise<void>;
  onNoteUpdated?(note: Note, context: HookContext): Promise<void>;
  onNoteDeleted?(noteId: string, context: HookContext): Promise<void>;
  
  // Tag hooks
  onTagCreated?(tag: Tag, context: HookContext): Promise<void>;
  onTagUpdated?(tag: Tag, context: HookContext): Promise<void>;
  onTagDeleted?(tagId: string, context: HookContext): Promise<void>;
}
```

#### Hook Context

```typescript
interface HookContext {
  userId: string;
  requestId: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  
  // Service access
  services: {
    taskService: TaskService;
    boardService: BoardService;
    noteService: NoteService;
    tagService: TagService;
  };
  
  // Database access
  database: DatabaseConnection;
  
  // Logger
  logger: Logger;
}
```

#### Example Hook Implementation

```typescript
// plugins/audit-plugin/src/hooks.ts
import type { PluginHook, Task, HookContext } from '@mcp-kanban/plugin-api';

export class AuditHooks implements PluginHook {
  name = 'audit-plugin';
  
  async onTaskCreated(task: Task, context: HookContext): Promise<void> {
    await this.logAuditEvent({
      event: 'task_created',
      entityId: task.id,
      entityType: 'task',
      userId: context.userId,
      timestamp: context.timestamp,
      data: {
        title: task.title,
        boardId: task.board_id,
        priority: task.priority,
      },
    });
  }
  
  async onTaskUpdated(task: Task, context: HookContext): Promise<void> {
    await this.logAuditEvent({
      event: 'task_updated',
      entityId: task.id,
      entityType: 'task',
      userId: context.userId,
      timestamp: context.timestamp,
      data: {
        title: task.title,
        status: task.status,
        priority: task.priority,
      },
    });
  }
  
  private async logAuditEvent(event: AuditEvent): Promise<void> {
    await context.database.run(`
      INSERT INTO audit_log (event, entity_id, entity_type, user_id, timestamp, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [event.event, event.entityId, event.entityType, event.userId, event.timestamp, JSON.stringify(event.data)]);
  }
}
```

### MCP Tool Development

#### Tool Structure

```typescript
interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (args: unknown) => Promise<unknown>;
}
```

#### Example Tool Implementation

```typescript
// plugins/calendar-plugin/src/tools.ts
import type { MCPTool } from '@mcp-kanban/plugin-api';

export class CalendarTools {
  constructor(private calendarService: CalendarService) {}
  
  scheduleTask: MCPTool = {
    name: 'schedule_task',
    description: 'Schedule a task for a specific date and time',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task identifier' },
        scheduledDate: { type: 'string', format: 'date-time', description: 'Scheduled date and time' },
        reminderMinutes: { type: 'number', description: 'Minutes before task to send reminder' },
      },
      required: ['taskId', 'scheduledDate'],
    },
    
    async handler(args: ScheduleTaskArgs): Promise<ScheduledTask> {
      const { taskId, scheduledDate, reminderMinutes = 15 } = args;
      
      const scheduledTask = await this.calendarService.scheduleTask({
        taskId,
        scheduledDate: new Date(scheduledDate),
        reminderMinutes,
      });
      
      return scheduledTask;
    },
  };
  
  getUpcomingTasks: MCPTool = {
    name: 'get_upcoming_tasks',
    description: 'Get tasks scheduled for the upcoming period',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to look ahead', default: 7 },
        includeCompleted: { type: 'boolean', description: 'Include completed tasks', default: false },
      },
    },
    
    async handler(args: GetUpcomingTasksArgs): Promise<ScheduledTask[]> {
      const { days = 7, includeCompleted = false } = args;
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);
      
      return this.calendarService.getScheduledTasks({
        startDate: new Date(),
        endDate,
        includeCompleted,
      });
    },
  };
}
```

### Middleware Development

#### Middleware Structure

```typescript
interface PluginMiddleware {
  name: string;
  priority?: number; // Lower numbers execute first
  handle(req: Request, res: Response, next: NextFunction): Promise<void>;
}
```

#### Example Middleware Implementation

```typescript
// plugins/cors-plugin/src/middleware.ts
import type { PluginMiddleware, Request, Response, NextFunction } from '@mcp-kanban/plugin-api';

export class CorsMiddleware implements PluginMiddleware {
  name = 'cors';
  priority = 100; // High priority (executes early)
  
  constructor(private config: CorsConfig) {}
  
  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    const origin = req.headers.origin;
    
    if (this.isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    next();
  }
  
  private isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return false;
    return this.config.allowedOrigins.includes(origin) || 
           this.config.allowedOrigins.includes('*');
  }
}
```

## Testing Plugins

### Unit Testing

```typescript
// tests/plugin.test.ts
import { MyPlugin } from '../src';
import { createMockPluginContext } from '@mcp-kanban/plugin-test-utils';

describe('MyPlugin', () => {
  let plugin: MyPlugin;
  let context: MockPluginContext;
  
  beforeEach(() => {
    plugin = new MyPlugin();
    context = createMockPluginContext();
  });
  
  afterEach(async () => {
    await plugin.destroy();
  });
  
  it('should initialize successfully', async () => {
    await expect(plugin.initialize(context)).resolves.not.toThrow();
  });
  
  it('should register hooks', async () => {
    await plugin.initialize(context);
    
    expect(context.hookRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-plugin' })
    );
  });
  
  it('should register tools', async () => {
    await plugin.initialize(context);
    
    expect(context.toolRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-plugin' })
    );
  });
});
```

### Integration Testing

```typescript
// tests/integration.test.ts
import { createTestServer } from '@mcp-kanban/plugin-test-utils';
import { MyPlugin } from '../src';

describe('MyPlugin Integration', () => {
  let server: TestServer;
  
  beforeAll(async () => {
    server = await createTestServer();
    await server.loadPlugin(new MyPlugin());
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  it('should handle task creation events', async () => {
    const task = await server.createTask({
      title: 'Test Task',
      board_id: 'test-board',
    });
    
    // Verify plugin hook was called
    expect(server.getHookCalls('onTaskCreated')).toHaveLength(1);
    expect(server.getHookCalls('onTaskCreated')[0].task.id).toBe(task.id);
  });
  
  it('should provide MCP tools', async () => {
    const tools = await server.getMCPTools();
    
    expect(tools).toContainEqual(
      expect.objectContaining({ name: 'my_custom_tool' })
    );
  });
});
```

### Plugin Testing Utilities

```typescript
// @mcp-kanban/plugin-test-utils
export interface MockPluginContext {
  hookRegistry: {
    register: jest.Mock;
    unregister: jest.Mock;
  };
  toolRegistry: {
    register: jest.Mock;
    unregister: jest.Mock;
  };
  middlewareRegistry: {
    register: jest.Mock;
    unregister: jest.Mock;
  };
  database: MockDatabase;
  logger: MockLogger;
}

export function createMockPluginContext(): MockPluginContext {
  return {
    hookRegistry: {
      register: jest.fn(),
      unregister: jest.fn(),
    },
    toolRegistry: {
      register: jest.fn(),
      unregister: jest.fn(),
    },
    middlewareRegistry: {
      register: jest.fn(),
      unregister: jest.fn(),
    },
    database: createMockDatabase(),
    logger: createMockLogger(),
  };
}
```

## Distribution

### Publishing to npm

```bash
# Build the plugin
npm run build

# Publish to npm
npm publish

# Or publish with specific tag
npm publish --tag beta
```

### Local Installation

```bash
# Install plugin locally
npm install ./path/to/my-plugin

# Or use npm link for development
cd my-plugin
npm link
cd ../mcp-kanban
npm link my-plugin
```

### Plugin Configuration

```json
// mcp-kanban config
{
  "plugins": {
    "my-plugin": {
      "enabled": true,
      "config": {
        "apiKey": "your-api-key",
        "endpoint": "https://api.example.com"
      }
    }
  }
}
```

## Best Practices

### Security

```typescript
// ✅ Good: Validate all inputs
export class SecurePlugin {
  async handleRequest(data: unknown): Promise<Response> {
    const validatedData = this.validateInput(data);
    // Process validated data
  }
  
  private validateInput(data: unknown): ValidatedData {
    return inputSchema.parse(data);
  }
}

// ❌ Bad: Trust user input
export class InsecurePlugin {
  async handleRequest(data: any): Promise<Response> {
    // Directly use untrusted data
    return this.processData(data);
  }
}
```

### Performance

```typescript
// ✅ Good: Use caching for expensive operations
export class OptimizedPlugin {
  private cache = new Map<string, CachedData>();
  
  async getExpensiveData(key: string): Promise<Data> {
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }
    
    const data = await this.fetchData(key);
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }
}

// ✅ Good: Use connection pooling
export class DatabasePlugin {
  private pool: Pool;
  
  constructor() {
    this.pool = new Pool({
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }
}
```

### Error Handling

```typescript
// ✅ Good: Comprehensive error handling
export class RobustPlugin {
  async processData(data: Data): Promise<Result> {
    try {
      const validatedData = this.validateData(data);
      const result = await this.performOperation(validatedData);
      return result;
    } catch (error) {
      this.logger.error('Plugin operation failed', { error, data });
      
      if (error instanceof ValidationError) {
        throw new PluginError('INVALID_DATA', 'Data validation failed', error);
      }
      
      if (error instanceof NetworkError) {
        throw new PluginError('NETWORK_ERROR', 'Network operation failed', error);
      }
      
      throw new PluginError('UNKNOWN_ERROR', 'Unknown error occurred', error);
    }
  }
}
```

### Logging

```typescript
// ✅ Good: Structured logging
export class WellLoggedPlugin {
  async performOperation(data: OperationData): Promise<Result> {
    this.logger.info('Starting operation', {
      operation: 'performOperation',
      dataId: data.id,
      userId: data.userId,
    });
    
    try {
      const result = await this.executeOperation(data);
      
      this.logger.info('Operation completed', {
        operation: 'performOperation',
        dataId: data.id,
        resultId: result.id,
        duration: Date.now() - startTime,
      });
      
      return result;
    } catch (error) {
      this.logger.error('Operation failed', {
        operation: 'performOperation',
        dataId: data.id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
```

## Examples

### Complete Plugin Example

```typescript
// plugins/slack-notifications/src/index.ts
import { Plugin, PluginContext } from '@mcp-kanban/plugin-api';
import { SlackHooks } from './hooks';
import { SlackTools } from './tools';
import { SlackConfig } from './types';

export class SlackNotificationsPlugin implements Plugin {
  name = 'slack-notifications';
  version = '1.0.0';
  
  private config: SlackConfig;
  private slackClient: SlackClient;
  
  constructor(config: SlackConfig) {
    this.config = config;
    this.slackClient = new SlackClient(config.webhookUrl);
  }
  
  async initialize(context: PluginContext): Promise<void> {
    // Validate configuration
    this.validateConfig();
    
    // Register hooks
    const hooks = new SlackHooks(this.slackClient, this.config);
    context.hookRegistry.register(hooks);
    
    // Register tools
    const tools = new SlackTools(this.slackClient);
    context.toolRegistry.register(tools);
    
    this.logger.info('Slack notifications plugin initialized', {
      channels: this.config.channels,
    });
  }
  
  async destroy(): Promise<void> {
    await this.slackClient.close();
  }
  
  private validateConfig(): void {
    if (!this.config.webhookUrl) {
      throw new Error('Slack webhook URL is required');
    }
    
    if (!this.config.channels || this.config.channels.length === 0) {
      throw new Error('At least one Slack channel must be configured');
    }
  }
}

// Plugin factory
export function createSlackPlugin(config: SlackConfig): Plugin {
  return new SlackNotificationsPlugin(config);
}
```

### Configuration Example

```json
{
  "plugins": {
    "slack-notifications": {
      "enabled": true,
      "config": {
        "webhookUrl": "https://hooks.slack.com/services/...",
        "channels": {
          "task-updates": "#kanban-updates",
          "urgent": "#urgent-tasks"
        },
        "notifications": {
          "taskCreated": true,
          "taskCompleted": true,
          "urgentTasks": true
        }
      }
    }
  }
}
```

This guide provides a comprehensive foundation for developing plugins for the MCP Kanban system. For more specific examples and advanced topics, refer to the [Plugin API Documentation](../api/PLUGIN_API.md) and [Plugin Examples](../examples/plugins/). 