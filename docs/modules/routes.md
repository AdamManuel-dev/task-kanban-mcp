# Routes Module

## Overview

The routes module defines all REST API endpoints for the MCP Kanban application. It implements RESTful conventions, handles request routing, integrates middleware, and coordinates with service layers to process API requests.

## Table of Contents

- [Architecture](#architecture)
- [Route Organization](#route-organization)
- [Core Routes](#core-routes)
  - [Task Routes](#task-routes)
  - [Board Routes](#board-routes)
  - [Note Routes](#note-routes)
  - [Tag Routes](#tag-routes)
  - [Export Routes](#export-routes)
  - [Backup Routes](#backup-routes)
- [Implementation Patterns](#implementation-patterns)
- [Request/Response Flow](#requestresponse-flow)
- [Best Practices](#best-practices)
- [API Documentation](#api-documentation)
- [Related Modules](#related-modules)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Routes Layer                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  HTTP Request → Router → Middleware → Handler → Service    │
│                                         ↓          ↓        │
│  HTTP Response ← Formatter ← Handler ← Result ← Database   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Route Files:                                               │
│  • /tasks.ts    - Task CRUD operations                     │
│  • /boards.ts   - Board management                         │
│  • /notes.ts    - Note operations                          │
│  • /tags.ts     - Tag management                           │
│  • /export.ts   - Data export endpoints                    │
│  • /backup.ts   - Backup/restore operations                │
└─────────────────────────────────────────────────────────────┘
```

## Route Organization

### Base URL Structure

All API routes are prefixed with `/api/v1`:

```
https://api.kanban.example.com/api/v1/tasks
https://api.kanban.example.com/api/v1/boards
https://api.kanban.example.com/api/v1/notes
```

### Route Naming Conventions

- **Resources**: Plural nouns (`/tasks`, `/boards`, `/notes`)
- **Actions**: RESTful verbs (GET, POST, PUT, PATCH, DELETE)
- **Identifiers**: UUID format (`/tasks/:taskId`)
- **Relationships**: Nested resources (`/tasks/:taskId/notes`)
- **Filters**: Query parameters (`/tasks?status=todo&priority=5`)

## Core Routes

### Task Routes

**File**: `/src/routes/tasks.ts`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/tasks` | List tasks with filters | Yes |
| POST | `/tasks` | Create new task | Yes |
| GET | `/tasks/:taskId` | Get task details | Yes |
| PUT | `/tasks/:taskId` | Update entire task | Yes |
| PATCH | `/tasks/:taskId` | Partial task update | Yes |
| DELETE | `/tasks/:taskId` | Delete task | Yes |
| GET | `/tasks/:taskId/subtasks` | Get subtasks | Yes |
| POST | `/tasks/:taskId/subtasks` | Create subtask | Yes |
| POST | `/tasks/:taskId/dependencies` | Add dependency | Yes |
| DELETE | `/tasks/:taskId/dependencies/:depId` | Remove dependency | Yes |

**Query Parameters**:
- `board_id`: Filter by board
- `column_id`: Filter by column
- `status`: Filter by status (todo, in_progress, done, blocked, archived)
- `priority`: Filter by priority (1-5)
- `assignee`: Filter by assignee ID
- `search`: Full-text search
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset
- `sort`: Sort field (created_at, updated_at, priority, due_date)
- `order`: Sort order (asc, desc)

### Board Routes

**File**: `/src/routes/boards.ts`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/boards` | List all boards | Yes |
| POST | `/boards` | Create new board | Yes |
| GET | `/boards/:boardId` | Get board details | Yes |
| PUT | `/boards/:boardId` | Update board | Yes |
| DELETE | `/boards/:boardId` | Delete board | Yes |
| GET | `/boards/:boardId/columns` | Get board columns | Yes |
| POST | `/boards/:boardId/columns` | Create column | Yes |
| PUT | `/boards/:boardId/columns/:columnId` | Update column | Yes |
| DELETE | `/boards/:boardId/columns/:columnId` | Delete column | Yes |
| POST | `/boards/:boardId/columns/reorder` | Reorder columns | Yes |

### Note Routes

**File**: `/src/routes/notes.ts`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/notes` | List all notes | Yes |
| POST | `/notes` | Create new note | Yes |
| GET | `/notes/:noteId` | Get note details | Yes |
| PUT | `/notes/:noteId` | Update note | Yes |
| DELETE | `/notes/:noteId` | Delete note | Yes |
| GET | `/tasks/:taskId/notes` | Get task notes | Yes |
| POST | `/notes/:noteId/pin` | Pin note | Yes |
| DELETE | `/notes/:noteId/pin` | Unpin note | Yes |

### Tag Routes

**File**: `/src/routes/tags.ts`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/tags` | List all tags | Yes |
| POST | `/tags` | Create new tag | Yes |
| GET | `/tags/:tagId` | Get tag details | Yes |
| PUT | `/tags/:tagId` | Update tag | Yes |
| DELETE | `/tags/:tagId` | Delete tag | Yes |
| GET | `/tags/hierarchy` | Get tag hierarchy | Yes |
| POST | `/tasks/:taskId/tags` | Assign tag to task | Yes |
| DELETE | `/tasks/:taskId/tags/:tagId` | Remove tag from task | Yes |

### Export Routes

**File**: `/src/routes/export.ts`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/export/tasks` | Export tasks | Yes |
| GET | `/export/boards/:boardId` | Export board | Yes |
| POST | `/export/custom` | Custom export | Yes |
| GET | `/export/formats` | Get supported formats | Yes |

### Backup Routes

**File**: `/src/routes/backup.ts`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/backup` | Create backup | Admin |
| GET | `/backup` | List backups | Admin |
| GET | `/backup/:backupId` | Download backup | Admin |
| POST | `/backup/restore` | Restore from backup | Admin |
| DELETE | `/backup/:backupId` | Delete backup | Admin |

## Implementation Patterns

### Route Handler Structure

```typescript
// Standard route handler pattern
router.post('/tasks',
  authenticate(),                          // Authentication
  authorize(['user', 'admin']),           // Authorization
  validateRequest(createTaskSchema),      // Validation
  rateLimit({ max: 100 }),              // Rate limiting
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await taskService.createTask({
        ...req.body,
        created_by: req.user.id
      });
      
      res.status(201).json({
        success: true,
        data: task,
        meta: {
          created_at: task.created_at,
          request_id: req.id
        }
      });
    } catch (error) {
      next(error);  // Pass to error handler
    }
  }
);
```

### Pagination Implementation

```typescript
// Pagination helper
function paginate(query: any) {
  const limit = Math.min(parseInt(query.limit) || 50, 100);
  const offset = parseInt(query.offset) || 0;
  const page = Math.floor(offset / limit) + 1;
  
  return { limit, offset, page };
}

// Usage in route
router.get('/tasks', authenticate(), async (req, res, next) => {
  try {
    const { limit, offset, page } = paginate(req.query);
    const filters = extractFilters(req.query);
    
    const { tasks, total } = await taskService.getTasks({
      ...filters,
      limit,
      offset
    });
    
    res.json({
      success: true,
      data: tasks,
      meta: {
        total,
        page,
        limit,
        hasMore: offset + limit < total
      }
    });
  } catch (error) {
    next(error);
  }
});
```

### Error Response Format

```typescript
// Consistent error response
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    request_id: string;
  };
}

// Error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const error = normalizeError(err);
  const status = getStatusCode(error);
  
  const response: ErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp: new Date().toISOString(),
      request_id: req.id
    }
  };
  
  res.status(status).json(response);
}
```

## Request/Response Flow

### 1. Request Processing

```typescript
// Request flow through middleware and handlers
export function setupRoutes(app: Express) {
  // Global middleware
  app.use(requestId());
  app.use(requestLogger());
  app.use(express.json());
  app.use(cors());
  
  // API routes
  const apiRouter = Router();
  
  // Mount route modules
  apiRouter.use('/tasks', taskRoutes);
  apiRouter.use('/boards', boardRoutes);
  apiRouter.use('/notes', noteRoutes);
  apiRouter.use('/tags', tagRoutes);
  
  // Mount API router
  app.use('/api/v1', apiRouter);
  
  // Error handling
  app.use(errorHandler);
  app.use(notFoundHandler);
}
```

### 2. Response Formatting

```typescript
// Success response wrapper
export function successResponse<T>(
  data: T,
  meta?: Record<string, any>
): SuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

// Usage
router.get('/tasks/:taskId', async (req, res) => {
  const task = await taskService.getTask(req.params.taskId);
  res.json(successResponse(task, { 
    includesSubtasks: true 
  }));
});
```

## Best Practices

### 1. Route Validation

```typescript
// Define schemas for all routes
const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    board_id: z.string().uuid(),
    column_id: z.string().uuid().optional(),
    priority: z.number().int().min(1).max(5).default(3),
    due_date: z.string().datetime().optional(),
    assignee: z.string().uuid().optional(),
    tags: z.array(z.string().uuid()).optional()
  })
});

// Apply validation
router.post('/tasks', validateRequest(createTaskSchema), handler);
```

### 2. Async Error Handling

```typescript
// Async handler wrapper
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

// Usage
router.get('/tasks', asyncHandler(async (req, res) => {
  const tasks = await taskService.getTasks();
  res.json(successResponse(tasks));
}));
```

### 3. Route Organization

```typescript
// Group related routes
export function createTaskRoutes(services: Services): Router {
  const router = Router();
  const { taskService, noteService } = services;
  
  // Task CRUD
  router.route('/')
    .get(listTasks)
    .post(authenticate(), createTask);
    
  router.route('/:taskId')
    .get(getTask)
    .put(authenticate(), updateTask)
    .delete(authenticate(), authorize(['admin']), deleteTask);
    
  // Task relationships
  router.use('/:taskId/notes', createNoteRoutes(noteService));
  router.use('/:taskId/subtasks', createSubtaskRoutes(taskService));
  
  return router;
}
```

### 4. Query Parameter Handling

```typescript
// Query parameter parser
export function parseQueryFilters(query: any): TaskFilters {
  return {
    board_id: query.board_id,
    status: query.status as TaskStatus,
    priority: query.priority ? parseInt(query.priority) : undefined,
    assignee: query.assignee,
    search: query.search,
    tags: query.tags ? query.tags.split(',') : undefined,
    due_before: query.due_before ? new Date(query.due_before) : undefined,
    due_after: query.due_after ? new Date(query.due_after) : undefined
  };
}
```

## API Documentation

### OpenAPI/Swagger Integration

```typescript
// Route documentation
/**
 * @swagger
 * /api/v1/tasks:
 *   get:
 *     summary: List tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: board_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by board ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, done, blocked, archived]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Task list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskListResponse'
 */
router.get('/tasks', authenticate(), listTasks);
```

## Related Modules

- [API Module](./api.md) - REST API architecture
- [Middleware Module](./middleware.md) - Request processing pipeline
- [Services Module](./services.md) - Business logic implementation
- [Database Module](./database.md) - Data persistence layer
- [WebSocket Module](./websocket.md) - Real-time updates

## Security Considerations

1. **Authentication**: All routes require authentication except public endpoints
2. **Authorization**: Role-based access control for sensitive operations
3. **Input Validation**: Validate all input using Zod schemas
4. **Rate Limiting**: Apply rate limits to prevent abuse
5. **CORS**: Configure CORS for allowed origins only

## Testing Routes

```typescript
// Route testing example
describe('Task Routes', () => {
  it('should create a task', async () => {
    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Test Task',
        board_id: boardId,
        priority: 3
      });
      
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.title).toBe('Test Task');
  });
  
  it('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        // Missing required title
        board_id: boardId
      });
      
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```