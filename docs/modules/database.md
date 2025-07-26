# Database Module

## Purpose

The database module provides a robust, type-safe interface to SQLite for the MCP Kanban system. It handles connection management, query execution, transactions, schema management, and performance optimization.

## Dependencies

### Internal
- Configuration Module: Database settings and connection parameters
- Logging Module: Query logging and error tracking

### External
- `sqlite3`: SQLite database driver
- `sqlite`: Promise-based SQLite wrapper
- `zod`: Schema validation

## Architecture

```
┌─────────────────────────────────────┐
│         Database Module             │
├─────────────────────────────────────┤
│   DatabaseConnection (Singleton)    │
│   - Connection lifecycle            │
│   - Query execution                 │
│   - Transaction management          │
│   - Health monitoring               │
├─────────────────────────────────────┤
│        SchemaManager                │
│   - Schema creation                 │
│   - Migration support               │
│   - Validation                      │
│   - Maintenance tasks               │
├─────────────────────────────────────┤
│        SQLite Database              │
│   - WAL mode enabled                │
│   - FTS5 search                     │
│   - Optimized pragmas               │
└─────────────────────────────────────┘
```

## Key Components

### DatabaseConnection

Singleton class managing the SQLite connection with optimized settings.

#### Features
- Connection pooling simulation (single connection)
- Automatic reconnection
- Query logging and metrics
- Transaction support with rollback
- Health checks and monitoring

#### Configuration
- **WAL Mode**: Write-Ahead Logging for better concurrency
- **Memory-mapped I/O**: Improved read performance
- **Foreign Keys**: Enforced referential integrity
- **Synchronous Mode**: Balanced for performance vs durability

### SchemaManager

Handles database schema lifecycle and maintenance.

#### Features
- Schema creation from SQL files
- Schema validation
- Migration support (planned)
- Index management
- Statistics collection

## Database Schema

### Core Tables

#### boards
```sql
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings JSON DEFAULT '{}',
    archived BOOLEAN DEFAULT FALSE
);
```

#### tasks
```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    parent_task_id TEXT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    position INTEGER NOT NULL,
    priority TEXT DEFAULT 'medium',
    priority_score REAL DEFAULT 0.0,
    due_date DATETIME NULL,
    estimated_hours REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    git_context JSON DEFAULT '{}',
    priority_factors JSON DEFAULT '{}',
    dependency_metrics JSON DEFAULT '{}',
    FOREIGN KEY (board_id) REFERENCES boards(id),
    FOREIGN KEY (column_id) REFERENCES columns(id),
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);
```

### Full-Text Search

FTS5 virtual tables for instant search:

```sql
CREATE VIRTUAL TABLE tasks_fts USING fts5(
    title,
    description,
    content='tasks',
    content_rowid='rowid'
);

CREATE VIRTUAL TABLE notes_fts USING fts5(
    title,
    content,
    content='notes',
    content_rowid='rowid'
);
```

### Performance Views

Pre-computed views for complex queries:

```sql
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    c.name as column_name,
    b.name as board_name,
    COUNT(DISTINCT sub.id) as subtask_count,
    COUNT(DISTINCT td.id) as dependency_count
FROM tasks t
JOIN columns c ON t.column_id = c.id
JOIN boards b ON t.board_id = b.id
LEFT JOIN tasks sub ON t.id = sub.parent_task_id
LEFT JOIN task_dependencies td ON t.id = td.task_id
WHERE t.archived = FALSE
GROUP BY t.id;
```

## Usage Examples

### Basic Queries

```typescript
import { dbConnection } from '@/database/connection';

// Initialize connection
await dbConnection.initialize();

// Simple query
const boards = await dbConnection.query<Board>(
  'SELECT * FROM boards WHERE archived = ?',
  [false]
);

// Single result
const task = await dbConnection.queryOne<Task>(
  'SELECT * FROM tasks WHERE id = ?',
  ['task-123']
);

// Insert with auto-ID
const result = await dbConnection.execute(
  'INSERT INTO tasks (board_id, title) VALUES (?, ?)',
  ['board-1', 'New Task']
);
console.log('New task ID:', result.lastID);
```

### Transactions

```typescript
// Simple transaction
await dbConnection.transaction(async (db) => {
  const board = await db.run(
    'INSERT INTO boards (id, name) VALUES (?, ?)',
    ['board-1', 'My Board']
  );
  
  await db.run(
    'INSERT INTO columns (id, board_id, name, position) VALUES (?, ?, ?, ?)',
    ['col-1', 'board-1', 'Todo', 0]
  );
});

// Transaction with error handling
try {
  const taskId = await dbConnection.transaction(async (db) => {
    // Create task
    const task = await db.run(
      'INSERT INTO tasks (title, board_id, column_id) VALUES (?, ?, ?)',
      ['New Task', boardId, columnId]
    );
    
    // Add tags
    for (const tag of tags) {
      await db.run(
        'INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)',
        [task.lastID, tag.id]
      );
    }
    
    return task.lastID;
  });
} catch (error) {
  // Transaction automatically rolled back
  console.error('Failed to create task:', error);
}
```

### Full-Text Search

```typescript
// Search tasks
const results = await dbConnection.query<Task>(
  `SELECT t.* FROM tasks t
   JOIN tasks_fts ON t.rowid = tasks_fts.rowid
   WHERE tasks_fts MATCH ?
   ORDER BY rank`,
  ['search terms']
);

// Search with snippets
const searchResults = await dbConnection.query(
  `SELECT 
     t.id,
     t.title,
     snippet(tasks_fts, 1, '<mark>', '</mark>', '...', 10) as snippet
   FROM tasks t
   JOIN tasks_fts ON t.rowid = tasks_fts.rowid
   WHERE tasks_fts MATCH ?`,
  ['implementation']
);
```

### Complex Queries

```typescript
// Get task with all related data
const taskWithDetails = await dbConnection.queryOne(`
  SELECT 
    t.*,
    c.name as column_name,
    b.name as board_name,
    GROUP_CONCAT(tags.name) as tags,
    COUNT(DISTINCT sub.id) as subtask_count,
    COUNT(DISTINCT notes.id) as note_count
  FROM tasks t
  JOIN columns c ON t.column_id = c.id
  JOIN boards b ON t.board_id = b.id
  LEFT JOIN task_tags tt ON t.id = tt.task_id
  LEFT JOIN tags ON tt.tag_id = tags.id
  LEFT JOIN tasks sub ON t.id = sub.parent_task_id
  LEFT JOIN notes ON t.id = notes.task_id
  WHERE t.id = ?
  GROUP BY t.id
`, ['task-123']);

// Priority calculation query
const prioritizedTasks = await dbConnection.query(`
  WITH priority_scores AS (
    SELECT 
      t.*,
      -- Age factor
      julianday('now') - julianday(t.created_at) as age_days,
      -- Dependency factor  
      COUNT(DISTINCT td.task_id) as blocking_count,
      -- Deadline factor
      CASE 
        WHEN t.due_date IS NOT NULL 
        THEN julianday(t.due_date) - julianday('now')
        ELSE 999
      END as days_until_due
    FROM tasks t
    LEFT JOIN task_dependencies td ON t.id = td.depends_on_task_id
    WHERE t.archived = FALSE
    GROUP BY t.id
  )
  SELECT 
    *,
    (
      (age_days * 0.15) +
      (blocking_count * 0.30) +
      (CASE WHEN days_until_due < 0 THEN 1.0 
            WHEN days_until_due < 7 THEN 0.8
            WHEN days_until_due < 14 THEN 0.5
            ELSE 0.2 END * 0.25) +
      (CASE priority 
        WHEN 'high' THEN 1.0
        WHEN 'medium' THEN 0.5
        ELSE 0.2 END * 0.20)
    ) as calculated_score
  FROM priority_scores
  ORDER BY calculated_score DESC
`);
```

## Schema Management

### Creating Schema

```typescript
const schemaManager = dbConnection.getSchemaManager();

// Create full schema
await schemaManager.createSchema();

// Validate schema
const validation = await schemaManager.validateSchema();
if (!validation.isValid) {
  console.error('Schema issues:', validation.errors);
}

// Get schema info
const info = await schemaManager.getSchemaInfo();
console.log(`Database version: ${info.version}`);
console.log(`Tables: ${info.tables.join(', ')}`);
```

### Database Maintenance

```typescript
// Get database statistics
const stats = await dbConnection.getStats();
console.log(`Database size: ${stats.size} bytes`);
console.log(`Total tables: ${stats.tables}`);

// Health check
const health = await dbConnection.healthCheck();
if (health.responsive) {
  console.log(`Response time: ${health.stats.responseTime}ms`);
}

// Optimize database
await dbConnection.execute('PRAGMA optimize');
await dbConnection.execute('VACUUM');
```

## Performance Optimization

### Indexes

Strategic indexes for common queries:

```sql
-- Board and column lookups
CREATE INDEX idx_tasks_board_id ON tasks(board_id);
CREATE INDEX idx_tasks_column_id ON tasks(column_id);

-- Priority and sorting
CREATE INDEX idx_tasks_priority ON tasks(priority, priority_score);
CREATE INDEX idx_tasks_position ON tasks(column_id, position);

-- Date-based queries
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- Dependency lookups
CREATE INDEX idx_task_deps_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_deps_depends_on ON task_dependencies(depends_on_task_id);
```

### Query Optimization Tips

1. **Use Prepared Statements**
   ```typescript
   // Good - uses prepared statement
   await db.query('SELECT * FROM tasks WHERE id = ?', [id]);
   
   // Bad - string concatenation
   await db.query(`SELECT * FROM tasks WHERE id = '${id}'`);
   ```

2. **Limit Result Sets**
   ```typescript
   // Always paginate large results
   const tasks = await db.query(
     'SELECT * FROM tasks LIMIT ? OFFSET ?',
     [limit, offset]
   );
   ```

3. **Use Covering Indexes**
   ```typescript
   // This query can be satisfied entirely from the index
   const counts = await db.query(`
     SELECT board_id, COUNT(*) as task_count
     FROM tasks
     WHERE archived = FALSE
     GROUP BY board_id
   `);
   ```

4. **Batch Operations**
   ```typescript
   // Good - single transaction
   await db.transaction(async (database) => {
     for (const tag of tags) {
       await database.run('INSERT INTO tags (name) VALUES (?)', [tag]);
     }
   });
   ```

## Error Handling

### Common Errors

1. **Foreign Key Violations**
   ```typescript
   try {
     await db.execute('INSERT INTO tasks (board_id) VALUES (?)', ['invalid']);
   } catch (error) {
     if (error.code === 'SQLITE_CONSTRAINT') {
       console.error('Invalid board ID');
     }
   }
   ```

2. **Unique Constraints**
   ```typescript
   try {
     await db.execute('INSERT INTO boards (name) VALUES (?)', ['Existing Board']);
   } catch (error) {
     if (error.message.includes('UNIQUE constraint failed')) {
       console.error('Board name already exists');
     }
   }
   ```

3. **Database Locked**
   ```typescript
   // Configure busy timeout
   await db.execute('PRAGMA busy_timeout = 5000'); // 5 seconds
   ```

## Backup and Recovery

### Manual Backup

```typescript
import { copyFile } from 'fs/promises';

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupPath = `./backups/kanban-${timestamp}.db`;
  
  // Close connections
  await dbConnection.close();
  
  // Copy database file
  await copyFile(config.database.path, backupPath);
  
  // Reopen connection
  await dbConnection.initialize();
  
  console.log(`Backup created: ${backupPath}`);
}
```

### Recovery

```typescript
async function restoreDatabase(backupPath: string) {
  // Validate backup
  const backupDb = await open({
    filename: backupPath,
    driver: sqlite3.Database
  });
  
  const integrity = await backupDb.get('PRAGMA integrity_check');
  await backupDb.close();
  
  if (integrity.integrity_check !== 'ok') {
    throw new Error('Backup file is corrupted');
  }
  
  // Restore
  await dbConnection.close();
  await copyFile(backupPath, config.database.path);
  await dbConnection.initialize();
}
```

## Security Considerations

### SQL Injection Prevention

Always use parameterized queries:

```typescript
// Safe
const user = await db.queryOne(
  'SELECT * FROM users WHERE email = ?',
  [userInput]
);

// Unsafe - DO NOT USE
const user = await db.queryOne(
  `SELECT * FROM users WHERE email = '${userInput}'`
);
```

### Access Control

Database file permissions:

```bash
# Restrict database file access
chmod 600 /path/to/kanban.db
chown appuser:appgroup /path/to/kanban.db
```

## Testing

### Unit Tests

```typescript
describe('DatabaseConnection', () => {
  let db: DatabaseConnection;
  
  beforeEach(async () => {
    db = DatabaseConnection.getInstance();
    await db.initialize({ skipSchema: true });
  });
  
  afterEach(async () => {
    await db.close();
  });
  
  it('should execute queries', async () => {
    const result = await db.query('SELECT 1 as value');
    expect(result[0].value).toBe(1);
  });
  
  it('should handle transactions', async () => {
    await db.transaction(async (database) => {
      await database.run('CREATE TABLE test (id INTEGER)');
      await database.run('INSERT INTO test VALUES (1)');
    });
    
    const result = await db.query('SELECT * FROM test');
    expect(result).toHaveLength(1);
  });
});
```

### Integration Tests

```typescript
describe('Database Schema', () => {
  it('should enforce foreign keys', async () => {
    await expect(
      db.execute('INSERT INTO tasks (board_id) VALUES (?)', ['invalid'])
    ).rejects.toThrow('FOREIGN KEY constraint failed');
  });
  
  it('should support full-text search', async () => {
    await db.execute(
      'INSERT INTO tasks (id, title) VALUES (?, ?)',
      ['t1', 'Test implementation']
    );
    
    const results = await db.query(
      'SELECT * FROM tasks_fts WHERE tasks_fts MATCH ?',
      ['implementation']
    );
    
    expect(results).toHaveLength(1);
  });
});
```

## Troubleshooting

### Common Issues

1. **Database is locked**
   - Increase busy timeout
   - Check for long-running transactions
   - Ensure proper connection closing

2. **Performance degradation**
   - Run `ANALYZE` to update statistics
   - Check for missing indexes
   - Consider `VACUUM` for fragmentation

3. **Disk space issues**
   - Monitor WAL file size
   - Run `PRAGMA wal_checkpoint`
   - Set up automatic vacuuming

### Debug Queries

```typescript
// Enable query logging
process.env.DATABASE_VERBOSE = 'true';

// Analyze query performance
const plan = await db.query('EXPLAIN QUERY PLAN SELECT ...');
console.log('Query plan:', plan);

// Check database integrity
const check = await db.queryOne('PRAGMA integrity_check');
console.log('Integrity:', check);
```

## Future Enhancements

1. **Migration System**: Automated schema versioning and migrations
2. **Read Replicas**: Support for read-only replicas
3. **Connection Pooling**: Multiple connections for better concurrency
4. **Sharding**: Data partitioning for scale
5. **External Databases**: PostgreSQL/MySQL support