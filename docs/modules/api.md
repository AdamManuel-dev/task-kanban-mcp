# API Module Documentation

## Overview

The API module provides RESTful endpoints for the MCP Kanban system. Built with Express.js, it offers comprehensive task management APIs with authentication, validation, error handling, and real-time capabilities.

## Table of Contents

- [Architecture](#architecture)
- [Base Configuration](#base-configuration)
- [Route Structure](#route-structure)
- [Authentication](#authentication)
- [Request/Response Format](#requestresponse-format)
- [Error Handling](#error-handling)
- [Middleware](#middleware)
- [Rate Limiting](#rate-limiting)
- [Development](#development)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Express Server                          │
│                 (src/server.ts)                         │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼─────┐   ┌─────▼─────┐  ┌─────▼─────┐
    │Middleware│   │  Routes   │  │WebSocket  │
    ├──────────┤   ├───────────┤  ├───────────┤
    │ • auth   │   │ • /tasks  │  │ • events  │
    │ • cors   │   │ • /boards │  │ • rooms   │
    │ • logging│   │ • /notes  │  │ • auth    │
    │ • errors │   │ • /tags   │  │           │
    └──────────┘   └───────────┘  └───────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                 ┌───────▼───────┐
                 │   Services    │
                 └───────────────┘
```

## Base Configuration

### Server Setup

**Location**: `src/server.ts`

```typescript
const app = express();

// Middleware
app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);
app.use(authenticationMiddleware);

// API Routes
app.use('/api/v1', apiRouter);

// Health check
app.get('/health', healthCheck);

// Error handling
app.use(errorHandler);
```

### API Configuration

```typescript
interface ApiConfig {
  port: number;
  host: string;
  basePath: '/api/v1';
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  authentication: {
    required: boolean;
    keyHeader: 'X-API-Key';
    bearerHeader: 'Authorization';
  };
}
```

## Route Structure

### Route Organization

```
/api/v1
├── /tasks
│   ├── GET    /                 # List tasks
│   ├── POST   /                 # Create task
│   ├── GET    /:id              # Get task
│   ├── PATCH  /:id              # Update task
│   ├── DELETE /:id              # Delete task
│   ├── GET    /:id/subtasks     # Get subtasks
│   ├── POST   /:id/dependencies # Add dependency
│   ├── GET    /:id/notes        # Get notes
│   ├── POST   /:id/notes        # Add note
│   └── POST   /:id/tags         # Add tags
├── /boards
│   ├── GET    /                 # List boards
│   ├── POST   /                 # Create board
│   ├── GET    /:id              # Get board
│   ├── PATCH  /:id              # Update board
│   ├── DELETE /:id              # Delete board
│   ├── POST   /:id/archive      # Archive board
│   ├── POST   /:id/duplicate    # Duplicate board
│   └── GET    /:id/analytics    # Board analytics
├── /notes
│   ├── GET    /                 # Search notes
│   ├── PATCH  /:id              # Update note
│   └── DELETE /:id              # Delete note
├── /tags
│   ├── GET    /                 # List tags
│   ├── POST   /                 # Create tag
│   ├── PATCH  /:id              # Update tag
│   └── DELETE /:id              # Delete tag
├── /context
│   ├── GET    /project          # Project context
│   ├── GET    /task/:id         # Task context
│   └── POST   /summary          # Generate summary
└── /backup
    ├── POST   /export           # Export data
    └── POST   /import           # Import data
```

### Route Implementation

**Example**: Task Routes (`src/routes/tasks.ts`)

```typescript
export async function taskRoutes(): Promise<Router> {
  const router = Router();
  const taskService = new TaskService(dbConnection);

  // List tasks with filtering
  router.get('/', requirePermission('read'), async (req, res, next) => {
    try {
      const filters = extractFilters(req.query);
      const tasks = await taskService.getTasks(filters);
      
      return res.apiSuccess(
        tasks,
        pagination.paginate(tasks, req.query)
      );
    } catch (error) {
      return next(error);
    }
  });

  // Create task
  router.post('/', requirePermission('write'), async (req, res, next) => {
    try {
      const taskData = validateInput(TaskValidation.create, req.body);
      const task = await taskService.createTask(taskData);
      
      return res.status(201).apiSuccess(task);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
```

## Authentication

### API Key Authentication

**Location**: `src/middleware/auth.ts`

```typescript
// Header-based authentication
headers: {
  'X-API-Key': 'your-api-key'
  // or
  'Authorization': 'Bearer your-api-key'
}
```

### Permission Levels

```typescript
type Permission = 'read' | 'write' | 'admin';

// Usage in routes
router.get('/tasks', requirePermission('read'), handler);
router.post('/tasks', requirePermission('write'), handler);
router.delete('/boards/:id', requirePermission('admin'), handler);
```

### Custom Authentication

```typescript
// Extend authentication for specific needs
export function requireOwnership() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const resource = await getResource(req.params.id);
    
    if (resource.owner_id !== req.user.id) {
      return next(new ForbiddenError('Access denied'));
    }
    
    next();
  };
}
```

## Request/Response Format

### Standard Request Format

```typescript
// Headers
{
  "Content-Type": "application/json",
  "X-API-Key": "your-api-key",
  "X-Request-ID": "unique-request-id"  // Optional
}

// Query Parameters
GET /api/v1/tasks?board_id=123&status=in_progress&limit=50&offset=0

// Body (POST/PATCH)
{
  "title": "Task title",
  "description": "Task description",
  "priority": 4,
  "due_date": "2024-12-31T23:59:59Z"
}
```

### Standard Response Format

```typescript
// Success Response
{
  "success": true,
  "data": {
    // Response data
  },
  "pagination": {        // Optional, for list endpoints
    "page": 1,
    "limit": 50,
    "total": 123,
    "totalPages": 3
  },
  "metadata": {          // Optional
    "version": "1.0",
    "timestamp": "2024-01-20T10:00:00Z"
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "priority",
      "constraint": "Must be between 1 and 10"
    }
  },
  "requestId": "req-123456"
}
```

### Response Helpers

```typescript
// Extended Express Response
declare global {
  namespace Express {
    interface Response {
      apiSuccess(data: any, pagination?: PaginationMeta): Response;
      apiError(error: ApiError): Response;
    }
  }
}

// Implementation
res.apiSuccess = function(data, pagination) {
  return this.json({
    success: true,
    data,
    ...(pagination && { pagination })
  });
};
```

## Error Handling

### Error Types

**Location**: `src/utils/errors.ts`

```typescript
// Base error class
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

// Specific error types
export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} not found: ${id}`);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}
```

### Error Handler Middleware

```typescript
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error
  logger.error('API Error', {
    error: err,
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body
    }
  });

  // Handle known errors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      },
      requestId: req.requestId
    });
  }

  // Handle unknown errors
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred'
    },
    requestId: req.requestId
  });
}
```

## Middleware

### Core Middleware Stack

```typescript
// 1. Request ID
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || generateId();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// 2. Request logging
app.use(requestLogger);

// 3. CORS
app.use(cors({
  origin: config.cors.allowedOrigins,
  credentials: true
}));

// 4. Security headers
app.use(helmet());

// 5. Body parsing
app.use(express.json({ limit: '10mb' }));

// 6. Authentication
app.use(authenticationMiddleware);

// 7. Rate limiting
app.use(rateLimiter);
```

### Custom Middleware

```typescript
// Validation middleware
export function validateInput<T>(schema: Schema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    throw new ValidationError(
      'Invalid input',
      result.error.issues
    );
  }
  
  return result.data;
}

// Caching middleware
export function cache(duration: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `cache:${req.originalUrl}`;
    const cached = cacheStore.get(key);
    
    if (cached) {
      return res.json(cached);
    }
    
    const originalJson = res.json;
    res.json = function(data) {
      cacheStore.set(key, data, duration);
      return originalJson.call(this, data);
    };
    
    next();
  };
}
```

## Rate Limiting

### Configuration

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply to all routes
app.use('/api/', limiter);

// Stricter limits for specific endpoints
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 creates per 15 minutes
});

router.post('/tasks', createLimiter, handler);
```

### Custom Rate Limiting

```typescript
// Per-user rate limiting
export function userRateLimit(max: number) {
  const limits = new Map<string, number[]>();
  
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) return next();
    
    const now = Date.now();
    const windowStart = now - 15 * 60 * 1000;
    
    // Get user's request timestamps
    let timestamps = limits.get(userId) || [];
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= max) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((timestamps[0] + 15 * 60 * 1000 - now) / 1000)
      });
    }
    
    timestamps.push(now);
    limits.set(userId, timestamps);
    next();
  };
}
```

## Development

### Adding New Endpoints

1. Create route file:

```typescript
// src/routes/myresource.ts
import { Router } from 'express';
import { requirePermission } from '@/middleware/auth';
import { MyResourceService } from '@/services/MyResourceService';

export async function myResourceRoutes(): Promise<Router> {
  const router = Router();
  const service = new MyResourceService(dbConnection);
  
  // Define routes
  router.get('/', requirePermission('read'), async (req, res, next) => {
    try {
      const resources = await service.getAll();
      return res.apiSuccess(resources);
    } catch (error) {
      return next(error);
    }
  });
  
  return router;
}
```

2. Register in main router:

```typescript
// src/routes/index.ts
import { myResourceRoutes } from './myresource';

const router = Router();
router.use('/myresource', await myResourceRoutes());
```

### Testing APIs

```typescript
import request from 'supertest';
import { app } from '@/server';

describe('Task API', () => {
  it('should list tasks', async () => {
    const response = await request(app)
      .get('/api/v1/tasks')
      .set('X-API-Key', 'test-key')
      .expect(200);
      
    expect(response.body).toMatchObject({
      success: true,
      data: expect.any(Array)
    });
  });
  
  it('should handle errors', async () => {
    const response = await request(app)
      .get('/api/v1/tasks/invalid-id')
      .set('X-API-Key', 'test-key')
      .expect(404);
      
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'NOT_FOUND'
      }
    });
  });
});
```

### API Documentation

Using OpenAPI/Swagger:

```typescript
/**
 * @swagger
 * /api/v1/tasks:
 *   get:
 *     summary: List tasks
 *     tags: [Tasks]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: board_id
 *         schema:
 *           type: string
 *         description: Filter by board
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TaskListResponse'
 */
```

## Best Practices

### 1. Input Validation

Always validate input data:

```typescript
const schema = z.object({
  title: z.string().min(1).max(200),
  priority: z.number().int().min(1).max(10),
  due_date: z.string().datetime().optional()
});

const validated = validateInput(schema, req.body);
```

### 2. Error Handling

Use consistent error types:

```typescript
if (!resource) {
  throw new NotFoundError('Task', id);
}

if (!isValid) {
  throw new ValidationError('Invalid data', errors);
}
```

### 3. Security

- Always authenticate requests
- Validate and sanitize input
- Use parameterized queries
- Implement proper CORS
- Rate limit endpoints

### 4. Performance

- Implement pagination for lists
- Use database indexes
- Cache frequently accessed data
- Optimize database queries
- Use compression

### 5. API Versioning

- Use URL versioning (/api/v1/)
- Maintain backwards compatibility
- Document breaking changes
- Provide migration guides

## See Also

- [REST API Reference](../api/REST.md)
- [Authentication Guide](../guides/AUTHENTICATION.md)
- [Services Module](./services.md)
- [Testing Guide](../guides/TESTING.md)