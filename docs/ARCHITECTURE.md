# MCP Kanban System Architecture

## Overview

The MCP Kanban Server is a headless task management system designed to integrate with AI assistants through the Model Context Protocol (MCP). It provides a comprehensive REST API, WebSocket real-time updates, and a CLI interface for managing kanban boards, tasks, and related data.

## System Design Philosophy

- **Headless First**: No built-in UI, designed for programmatic access
- **AI-Optimized**: Rich context generation for AI decision making
- **Real-time**: WebSocket support for live updates
- **Local First**: SQLite database for simplicity and portability
- **Extensible**: Plugin architecture for custom integrations

## High-Level Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   AI Assistants     │     │   CLI Interface     │     │   External Apps     │
│   (via MCP)         │     │   (Commander.js)    │     │   (via REST API)    │
└──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘
           │                           │                           │
           │                           │                           │
           ▼                           ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ MCP Server  │  │  REST API   │  │  WebSocket  │  │     CLI     │        │
│  │  Protocol   │  │  (Express)  │  │ (Socket.io) │  │  Commands   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Business Logic Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Board     │  │    Task     │  │    Note     │  │  Priority   │        │
│  │  Service    │  │  Service    │  │  Service    │  │   Engine    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Data Access Layer (DAL)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Board     │  │    Task     │  │    Note     │  │     Tag     │        │
│  │ Repository  │  │ Repository  │  │ Repository  │  │ Repository  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Database Layer                                   │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                   │
│  │   SQLite Database       │  │   Schema Manager        │                   │
│  │   - Tables              │  │   - Migrations          │                   │
│  │   - Indexes             │  │   - Validation          │                   │
│  │   - Views               │  │   - Maintenance         │                   │
│  │   - FTS5                │  │                         │                   │
│  └─────────────────────────┘  └─────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### API Gateway Layer

#### MCP Server Protocol
- Implements Model Context Protocol specification
- Provides tools for AI task management
- Handles context generation and prioritization
- Manages AI-specific request/response formatting

#### REST API (Express.js)
- RESTful endpoints for all resources
- API key authentication
- Rate limiting (1000 req/min default)
- CORS support for web clients
- Request validation with Zod

#### WebSocket Server (Socket.io)
- Real-time event broadcasting
- Room-based subscriptions
- Automatic reconnection handling
- Event queuing for offline clients

#### CLI Interface
- Commander.js based CLI
- Interactive and batch modes
- Output formatting (table, JSON, CSV)
- Command aliases and shortcuts

### Business Logic Layer

#### Board Service
- Board lifecycle management
- Column organization
- Board-level statistics
- Template support

#### Task Service
- Task CRUD operations
- Subtask management
- Dependency tracking
- Progress calculation
- Archive/restore functionality

#### Note Service
- Rich note management
- Note categorization
- Full-text search
- Code snippet support
- Note pinning

#### Priority Engine
- Multi-factor priority calculation
- Configurable weight factors
- Dependency impact analysis
- Stale task detection
- Context-aware suggestions

### Data Access Layer

#### Repository Pattern
- Abstraction over database queries
- Transaction support
- Query optimization
- Result caching
- Error handling

#### Features
- Prepared statements for security
- Connection pooling
- Query logging
- Performance monitoring

### Database Layer

#### SQLite Configuration
- WAL mode for concurrency
- Memory-mapped I/O for performance
- Foreign key constraints
- Automatic VACUUM scheduling

#### Schema Features
- 12+ core tables
- Full-text search indexes
- Materialized views for performance
- Triggers for data integrity
- Comprehensive indexes

## Data Flow

### Task Creation Flow
```
1. Client Request → API Gateway
2. Authentication & Validation
3. Business Logic Processing
   - Priority calculation
   - Dependency validation
   - Git context extraction
4. Data Persistence
5. Event Broadcasting (WebSocket)
6. Response to Client
```

### Context Generation Flow
```
1. Context Request → MCP Tool
2. Gather Related Data
   - Active tasks
   - Recent notes
   - Dependencies
   - Git activity
3. Score Relevance
4. Format for AI
5. Cache Result
6. Return Context
```

## Technology Stack

### Runtime
- **Node.js**: v18+ (ES2022 features)
- **TypeScript**: v5+ with strict mode
- **Process Manager**: PM2 for production

### Core Dependencies
- **Express.js**: REST API framework
- **Socket.io**: WebSocket server
- **SQLite3**: Embedded database
- **Commander.js**: CLI framework
- **Winston**: Logging system
- **Zod**: Schema validation

### Development Tools
- **Jest**: Testing framework
- **ESLint**: Code linting (Airbnb config)
- **Prettier**: Code formatting
- **Husky**: Git hooks
- **Docker**: Containerization

## Security Architecture

### Authentication
- API key based authentication
- Key hashing with bcrypt
- Rate limiting per key
- Key rotation support

### Data Protection
- Prepared statements prevent SQL injection
- Input sanitization middleware
- XSS protection headers
- CORS configuration

### Audit Trail
- All modifications logged
- User action tracking
- Request/response logging
- Security event monitoring

## Performance Considerations

### Database Optimization
- Strategic indexes on frequently queried columns
- Views for complex queries
- Query result caching
- Connection pooling

### API Performance
- Response compression
- Request batching support
- Pagination for large datasets
- Partial response fields

### Real-time Performance
- Event debouncing
- Message queuing
- Subscription management
- Connection pooling

## Scalability Design

### Horizontal Scaling
- Stateless API design
- Session-less authentication
- External cache support (Redis)
- Load balancer ready

### Data Scaling
- Table partitioning strategy
- Archive old data
- Incremental backups
- Read replicas support

## Monitoring & Observability

### Metrics
- API response times
- Database query performance
- WebSocket connection count
- Error rates

### Logging
- Structured JSON logging
- Log levels (error, warn, info, debug)
- Log rotation
- External log aggregation support

### Health Checks
- `/health` endpoint
- Database connectivity
- Memory usage
- Disk space

## Deployment Architecture

### Development
```
Local SQLite → Node.js Server → Hot Reload
```

### Production
```
Docker Container → PM2 Process → SQLite Volume → Backup System
```

### High Availability (Future)
```
Load Balancer → Multiple Instances → Shared Storage → Primary/Replica DB
```

## Extension Points

### Plugin System (Planned)
- Hook system for custom logic
- Event-based extensions
- Custom MCP tools
- API middleware plugins

### Integration Points
- Git hooks for automation
- Webhook support
- External auth providers
- Custom storage backends

## Future Architecture Enhancements

1. **GraphQL API**: Alternative to REST
2. **Event Sourcing**: Complete audit trail
3. **Microservices**: Service separation
4. **Cloud Native**: Kubernetes support
5. **Multi-tenancy**: User isolation

## Architecture Decisions

### Why SQLite?
- Zero configuration
- Excellent performance for single-user
- Easy backup/restore
- Portable data files
- Full-text search built-in

### Why Express.js?
- Mature ecosystem
- Extensive middleware
- Simple and flexible
- Great TypeScript support
- Large community

### Why Local-First?
- Data sovereignty
- No cloud dependencies
- Instant responses
- Works offline
- Privacy by default