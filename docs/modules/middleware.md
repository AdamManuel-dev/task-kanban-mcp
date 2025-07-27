# Middleware Module

## Overview

The middleware module provides a comprehensive set of Express middleware functions that handle cross-cutting concerns for the MCP Kanban application. These middleware components ensure consistent request handling, security, logging, and response formatting across all API endpoints.

## Table of Contents

- [Architecture](#architecture)
- [Core Components](#core-components)
  - [Authentication Middleware](#authentication-middleware)
  - [Logging Middleware](#logging-middleware)
  - [Validation Middleware](#validation-middleware)
  - [Request ID Middleware](#request-id-middleware)
  - [Response Middleware](#response-middleware)
- [Implementation Details](#implementation-details)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Related Modules](#related-modules)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Middleware Pipeline                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Request → RequestID → Logging → Auth → Validation → Route │
│                                                      ↓      │
│  Response ← Response Middleware ← Error Handling ← Handler │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### Authentication Middleware

**Location**: `/src/middleware/auth.ts`

Handles authentication and authorization for protected routes.

```typescript
interface AuthMiddleware {
  authenticate: RequestHandler;     // Verifies JWT tokens
  authorize: (roles: string[]) => RequestHandler;  // Role-based access
  apiKeyAuth: RequestHandler;      // API key authentication
  websocketAuth: WebSocketAuthHandler;  // WebSocket authentication
}
```

**Features**:
- JWT token validation
- Role-based access control (RBAC)
- API key authentication
- WebSocket connection authentication
- User context injection

### Logging Middleware

**Location**: `/src/middleware/logging.ts`

Provides comprehensive request/response logging for monitoring and debugging.

```typescript
interface LoggingMiddleware {
  requestLogger: RequestHandler;    // Logs incoming requests
  responseLogger: RequestHandler;   // Logs outgoing responses
  errorLogger: ErrorRequestHandler; // Logs errors with context
}
```

**Features**:
- Request duration tracking
- Sensitive data masking
- Correlation ID support
- Error context preservation
- Performance metrics

### Validation Middleware

**Location**: `/src/middleware/validation.ts`

Validates request data using Zod schemas with type safety.

```typescript
function validateRequest<T extends ZodSchema>(schema: T): RequestHandler {
  // Validates body, query, and params against schema
  // Provides typed request data
  // Returns 400 with validation errors
}
```

**Features**:
- Request body validation
- Query parameter validation
- Path parameter validation
- Custom error formatting
- Type inference

### Request ID Middleware

**Location**: `/src/middleware/requestId.ts`

Generates and tracks unique request identifiers for distributed tracing.

```typescript
interface RequestIdMiddleware {
  generateRequestId: RequestHandler;  // Creates unique ID
  extractRequestId: RequestHandler;   // Extracts from headers
}
```

**Features**:
- UUID v4 generation
- Header extraction (X-Request-ID)
- Context propagation
- Correlation support

### Response Middleware

**Location**: `/src/middleware/response.ts`

Standardizes API responses with consistent formatting.

```typescript
interface ResponseMiddleware {
  formatSuccess: ResponseFormatter;   // Success response wrapper
  formatError: ErrorFormatter;       // Error response wrapper
  notFound: RequestHandler;          // 404 handler
  methodNotAllowed: RequestHandler;  // 405 handler
}
```

**Features**:
- Consistent response structure
- Error serialization
- Status code management
- CORS handling
- Compression

## Implementation Details

### Middleware Registration Order

The order of middleware registration is critical for proper request handling:

```typescript
// In server.ts
app.use(requestId());           // 1. Generate request ID
app.use(requestLogger());       // 2. Log incoming request
app.use(cors(corsOptions));     // 3. Handle CORS
app.use(compression());         // 4. Enable compression
app.use(express.json());        // 5. Parse JSON bodies
app.use(authenticate());        // 6. Verify authentication
app.use(router);               // 7. Route to handlers
app.use(responseLogger());     // 8. Log response
app.use(errorHandler());       // 9. Handle errors
app.use(notFound());          // 10. Handle 404s
```

### Error Handling Flow

```typescript
// Global error handler
export function errorHandler(): ErrorRequestHandler {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const error = normalizeError(err);
    const statusCode = getStatusCode(error);
    const response = formatErrorResponse(error, req);
    
    logger.error('Request failed', {
      requestId: req.id,
      error: error.toJSON(),
      path: req.path,
      method: req.method
    });
    
    res.status(statusCode).json(response);
  };
}
```

### Type-Safe Validation

```typescript
// Example validation middleware usage
const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    board_id: z.string().uuid(),
    priority: z.number().int().min(1).max(5)
  })
});

router.post('/tasks',
  authenticate(),
  validateRequest(createTaskSchema),
  async (req, res) => {
    // req.body is fully typed here
    const task = await taskService.createTask(req.body);
    res.json({ success: true, data: task });
  }
);
```

## Usage Examples

### Custom Middleware Creation

```typescript
// Rate limiting middleware
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const limiter = new RateLimiter(options);
  
  return async (req, res, next) => {
    const key = options.keyGenerator(req);
    const allowed = await limiter.checkLimit(key);
    
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: limiter.getResetTime(key)
      });
    }
    
    next();
  };
}

// Usage
router.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests
  keyGenerator: req => req.ip
}));
```

### Conditional Middleware

```typescript
// Apply middleware conditionally
export function conditionalMiddleware(
  condition: (req: Request) => boolean,
  middleware: RequestHandler
): RequestHandler {
  return (req, res, next) => {
    if (condition(req)) {
      return middleware(req, res, next);
    }
    next();
  };
}

// Usage: Only authenticate non-public routes
router.use(conditionalMiddleware(
  req => !req.path.startsWith('/public'),
  authenticate()
));
```

## Best Practices

### 1. Middleware Composition

```typescript
// Compose multiple middleware into one
export function compose(...middleware: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let index = 0;
    
    function dispatch(i: number): void {
      if (i >= middleware.length) return next();
      
      const fn = middleware[i];
      fn(req, res, () => dispatch(i + 1));
    }
    
    dispatch(0);
  };
}
```

### 2. Error Propagation

```typescript
// Always use next(error) for error propagation
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### 3. Context Preservation

```typescript
// Preserve request context through async operations
export function preserveContext(): RequestHandler {
  return (req, res, next) => {
    const context = {
      requestId: req.id,
      userId: req.user?.id,
      method: req.method,
      path: req.path
    };
    
    // Attach to async local storage
    requestContext.run(context, () => next());
  };
}
```

### 4. Performance Considerations

- Keep middleware lightweight
- Avoid blocking operations
- Use caching where appropriate
- Implement timeouts for async operations
- Monitor middleware execution time

## Related Modules

- [API Module](./api.md) - REST API implementation using middleware
- [WebSocket Module](./websocket.md) - WebSocket authentication middleware
- [Logging Module](./logging.md) - Logging infrastructure
- [Configuration Module](./configuration.md) - Middleware configuration
- [Services Module](./services.md) - Business logic layer

## Security Considerations

1. **Authentication Order**: Always authenticate before authorization
2. **Input Validation**: Validate all input before processing
3. **Error Information**: Don't leak sensitive information in errors
4. **Rate Limiting**: Implement rate limiting for all endpoints
5. **CORS Configuration**: Configure CORS restrictively

## Testing Middleware

```typescript
// Example middleware test
describe('Authentication Middleware', () => {
  it('should reject requests without token', async () => {
    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = jest.fn();
    
    await authenticate()(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
  
  it('should attach user to request with valid token', async () => {
    const token = generateTestToken({ userId: '123' });
    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` }
    });
    const res = mockResponse();
    const next = jest.fn();
    
    await authenticate()(req, res, next);
    
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('123');
    expect(next).toHaveBeenCalled();
  });
});
```

## Troubleshooting

### Common Issues

1. **Middleware Order Problems**
   - Symptom: Authentication bypassed
   - Solution: Ensure auth middleware is before route handlers

2. **Context Loss**
   - Symptom: Request ID missing in logs
   - Solution: Use async local storage for context preservation

3. **Validation Errors**
   - Symptom: Type errors despite validation
   - Solution: Ensure schema matches expected types

4. **Performance Degradation**
   - Symptom: Slow response times
   - Solution: Profile middleware execution, optimize heavy operations