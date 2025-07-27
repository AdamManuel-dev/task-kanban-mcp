# API Changelog

All notable changes to the MCP Kanban API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Interactive API explorer with Swagger UI
- Comprehensive OpenAPI 3.0 specification
- API usage guide with examples and best practices
- Bulk operations for tasks and tags
- Advanced search capabilities with full-text search
- AI-powered task prioritization and context generation
- Backup and restore functionality
- Automated backup scheduling
- Data export/import in multiple formats
- Real-time WebSocket events for all operations
- MCP integration for AI assistant compatibility

### Changed
- Improved error handling with structured error responses
- Enhanced pagination with consistent parameters
- Better validation with detailed error messages
- Optimized response formats for better performance

### Deprecated
- None

### Removed
- None

### Fixed
- TypeScript type safety improvements
- Database schema validation issues
- Authentication middleware enhancements
- Rate limiting configuration

### Security
- Enhanced API key validation
- Improved input sanitization
- Better CORS configuration
- Security headers implementation

## [1.0.0] - 2025-01-27

### Added
- **Core API Endpoints**
  - Board management (CRUD operations)
  - Task management with subtasks and dependencies
  - Note management with full-text search
  - Tag management with hierarchical structure
  - Context and AI-powered insights
  - Priority calculation and recommendations

- **Authentication & Security**
  - API key authentication
  - Rate limiting (1000 requests/minute)
  - Input validation and sanitization
  - CORS configuration
  - Security headers

- **Real-time Features**
  - WebSocket server for live updates
  - Event-driven architecture
  - Room-based subscriptions
  - Connection management

- **Data Management**
  - SQLite database with migrations
  - Backup and restore functionality
  - Data export/import capabilities
  - Automated backup scheduling

- **AI Integration**
  - MCP server implementation
  - Natural language task creation
  - Context-aware prioritization
  - Project summary generation

- **CLI Interface**
  - Command-line interface for all operations
  - Interactive mode with TUI
  - Configuration management
  - Real-time monitoring

### Technical Specifications
- **API Version**: v1
- **Base URL**: `/api/v1`
- **Authentication**: Bearer token (API key)
- **Rate Limiting**: 1000 requests/minute per API key
- **Pagination**: Limit/offset with max 100 items per page
- **Error Format**: Structured JSON with error codes
- **Data Format**: JSON with consistent response structure

### Endpoint Categories
1. **Health & Status** (4 endpoints)
   - Health checks, readiness, liveness

2. **Board Management** (14 endpoints)
   - CRUD operations, columns, statistics, cloning

3. **Task Management** (17 endpoints)
   - CRUD operations, subtasks, dependencies, bulk operations

4. **Note Management** (11 endpoints)
   - CRUD operations, search, pinning

5. **Tag Management** (13 endpoints)
   - CRUD operations, hierarchy, bulk operations

6. **Context & AI** (9 endpoints)
   - Work context, task context, project summary

7. **Priorities** (4 endpoints)
   - Priority calculation, next task recommendations

8. **Backup & Recovery** (7 endpoints)
   - Backup creation, restoration, verification

9. **Scheduling** (8 endpoints)
   - Automated backup scheduling

10. **Export/Import** (2 endpoints)
    - Data export/import in multiple formats

### Data Models
- **Board**: Container for organizing work
- **Column**: Vertical sections within boards
- **Task**: Individual work items with metadata
- **Note**: Rich text notes with linking
- **Tag**: Hierarchical labels for categorization
- **Backup**: Data snapshots for recovery
- **Schedule**: Automated backup scheduling

### Status Values
- **Task Status**: todo, in_progress, done, blocked, archived
- **Priority Levels**: 1-5 (critical to minimal)
- **Backup Status**: completed, failed, in_progress
- **Schedule Status**: active, paused, disabled

### WebSocket Events
- task:created, task:updated, task:moved, task:deleted
- note:added, note:updated
- dependency:blocked
- priority:changed

### MCP Tools
- create_task, update_task, search_tasks
- add_note, search_notes
- add_tags
- get_context, get_task_context, get_project_summary
- create_subtask, set_task_dependency, get_task_dependencies
- prioritize_tasks, get_next_task, update_priority

## Migration Guide

### From Pre-1.0 Versions
This is the initial release, so no migration is required.

### Breaking Changes
None in this release.

### Deprecation Timeline
No deprecated features in this release.

## Version Support

### Current Version
- **API Version**: 1.0.0
- **Supported Until**: 2026-01-27
- **Security Updates**: Until 2026-01-27
- **Bug Fixes**: Until 2026-01-27

### Version Policy
- **Major Versions**: Breaking changes, 12-month support
- **Minor Versions**: New features, 6-month support
- **Patch Versions**: Bug fixes, 3-month support

## API Stability

### Stable Endpoints
All endpoints in v1.0.0 are considered stable and will maintain backward compatibility within the v1.x series.

### Experimental Features
- AI-powered prioritization algorithms
- Advanced context generation
- Real-time collaboration features

### Future Considerations
- GraphQL API (planned for v2.0)
- Multi-tenant support
- Advanced analytics and reporting
- Plugin system for extensibility
- Mobile API optimizations

## Contributing

When adding new features or making changes:

1. **Update this changelog** with appropriate entries
2. **Update OpenAPI specification** if adding new endpoints
3. **Add tests** for new functionality
4. **Update documentation** for new features
5. **Consider backward compatibility** for existing users

## Release Process

### Pre-release Checklist
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Changelog updated
- [ ] OpenAPI spec updated
- [ ] Security review completed
- [ ] Performance testing completed

### Release Steps
1. Update version numbers
2. Create release tag
3. Generate release notes
4. Deploy to staging
5. Run integration tests
6. Deploy to production
7. Announce release

### Post-release Tasks
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Plan next release

---

For detailed information about specific endpoints, see the [API Reference](./REST.md) and [OpenAPI Specification](./openapi.yaml). 