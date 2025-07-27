# API Migration Guide

## Overview

This guide helps you migrate between different versions of the MCP Kanban API. It includes breaking changes, new features, and step-by-step migration instructions.

## Version History

### v1.0.0 (Current)
- **Release Date**: 2025-07-27
- **Status**: Stable
- **Features**: Complete REST API with WebSocket support, MCP integration, and CLI

## Breaking Changes

### v1.0.0 Breaking Changes

#### Authentication
- **Change**: API key authentication is now required for all endpoints
- **Migration**: Add `Authorization: Bearer your-api-key` header to all requests
- **Example**:
  ```bash
  # Before (no auth)
  curl http://localhost:3000/api/v1/tasks
  
  # After (with auth)
  curl -H "Authorization: Bearer your-api-key" \
    http://localhost:3000/api/v1/tasks
  ```

#### Response Format
- **Change**: All responses now include standardized error format
- **Migration**: Update error handling to use new format
- **Example**:
  ```json
  {
    "error": "Task not found",
    "code": "TASK_NOT_FOUND",
    "timestamp": "2025-07-27T10:30:00.000Z"
  }
  ```

#### Task Status Values
- **Change**: Task status values are now standardized
- **Migration**: Update any hardcoded status values
- **New Values**: `todo`, `in_progress`, `done`, `archived`

## New Features

### v1.0.0 New Features

#### Real-time Updates
- **Feature**: WebSocket support for real-time task updates
- **Usage**: Connect to `ws://localhost:3456` for live updates
- **Example**:
  ```javascript
  const ws = new WebSocket('ws://localhost:3456');
  ws.onmessage = (event) => {
    const update = JSON.parse(event.data);
    console.log('Task updated:', update);
  };
  ```

#### Advanced Search
- **Feature**: Full-text search across tasks and notes
- **Usage**: Use `/api/v1/search/tasks` and `/api/v1/search/notes`
- **Example**:
  ```bash
  curl -H "Authorization: Bearer your-api-key" \
    "http://localhost:3000/api/v1/search/tasks?q=urgent&board=1"
  ```

#### Task Dependencies
- **Feature**: Support for task dependencies and subtasks
- **Usage**: Use `/api/v1/tasks/:id/dependencies` and `/api/v1/tasks/:id/subtasks`
- **Example**:
  ```bash
  # Add dependency
  curl -X PATCH \
    -H "Authorization: Bearer your-api-key" \
    -H "Content-Type: application/json" \
    -d '{"dependencyId": "task-123"}' \
    http://localhost:3000/api/v1/tasks/task-456/dependencies
  ```

## Migration Checklists

### v1.0.0 Migration Checklist

#### Authentication Setup
- [ ] Generate API key using CLI or admin interface
- [ ] Update all API requests to include Authorization header
- [ ] Test authentication with health endpoint
- [ ] Update error handling for 401 responses

#### Response Format Updates
- [ ] Update error handling to use new standardized format
- [ ] Remove any hardcoded status code checks
- [ ] Update success response parsing if needed
- [ ] Test error scenarios

#### Feature Adoption
- [ ] Evaluate WebSocket integration for real-time updates
- [ ] Implement advanced search functionality
- [ ] Add task dependency management
- [ ] Test new endpoints and features

## Code Examples

### JavaScript/Node.js Migration

#### Before (v0.x)
```javascript
const response = await fetch('/api/tasks');
const tasks = await response.json();
```

#### After (v1.0.0)
```javascript
const response = await fetch('/api/v1/tasks', {
  headers: {
    'Authorization': 'Bearer your-api-key'
  }
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(`${error.code}: ${error.error}`);
}

const tasks = await response.json();
```

### Python Migration

#### Before (v0.x)
```python
import requests

response = requests.get('http://localhost:3000/api/tasks')
tasks = response.json()
```

#### After (v1.0.0)
```python
import requests

headers = {
    'Authorization': 'Bearer your-api-key'
}

response = requests.get('http://localhost:3000/api/v1/tasks', headers=headers)

if not response.ok:
    error = response.json()
    raise Exception(f"{error['code']}: {error['error']}")

tasks = response.json()
```

### cURL Migration

#### Before (v0.x)
```bash
curl http://localhost:3000/api/tasks
```

#### After (v1.0.0)
```bash
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3000/api/v1/tasks
```

## Testing Migration

### Pre-migration Testing
1. **Backup Data**: Export all data before migration
2. **Test Environment**: Set up test environment with new API version
3. **Feature Testing**: Test all critical features in test environment
4. **Performance Testing**: Verify performance meets requirements

### Post-migration Testing
1. **Authentication**: Verify all API calls include proper authentication
2. **Error Handling**: Test error scenarios and verify proper handling
3. **Feature Validation**: Confirm all features work as expected
4. **Integration Testing**: Test with all integrated systems

## Rollback Plan

### Rollback Steps
1. **Stop New Version**: Stop the new API version
2. **Restore Previous Version**: Deploy the previous API version
3. **Verify Functionality**: Confirm all features work correctly
4. **Data Validation**: Verify data integrity

### Rollback Triggers
- Authentication failures affecting >5% of requests
- Critical feature failures
- Performance degradation >50%
- Data corruption or loss

## Support

### Getting Help
- **Documentation**: Check the [API Guide](./API_GUIDE.md) for detailed information
- **Interactive Explorer**: Use the [Interactive API Explorer](./INTERACTIVE_EXPLORER.md) to test endpoints
- **Issues**: Report issues on the GitHub repository
- **Community**: Join the community discussions

### Migration Support
- **Testing**: Use the test environment for migration testing
- **Validation**: Use the health endpoints to verify system status
- **Monitoring**: Monitor logs and metrics during migration
- **Backup**: Always maintain backups before migration

## Future Versions

### Planned Changes
- **v1.1.0**: Enhanced search capabilities
- **v1.2.0**: Advanced analytics and reporting
- **v2.0.0**: GraphQL support and real-time subscriptions

### Deprecation Policy
- **Notice Period**: 6 months advance notice for breaking changes
- **Support Period**: 12 months support for deprecated features
- **Migration Tools**: Automated migration tools for major versions

---

**Last Updated**: 2025-07-27  
**Version**: 1.0.0 