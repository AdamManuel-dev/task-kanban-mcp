# Database Schema Documentation

This document provides comprehensive documentation of the MCP Kanban database schema, including table structures, relationships, indexes, and data integrity constraints.

## Table of Contents

- [Schema Overview](#schema-overview)
- [Core Tables](#core-tables)
- [Relationship Tables](#relationship-tables)
- [Views and Indexes](#views-and-indexes)
- [Data Integrity](#data-integrity)
- [Migration System](#migration-system)
- [Performance Considerations](#performance-considerations)
- [Backup and Recovery](#backup-and-recovery)

## Schema Overview

### Database Technology

The MCP Kanban system uses **SQLite** as its primary database engine, chosen for:

- **Zero Configuration**: No server setup required
- **Portability**: Single file database
- **Performance**: Excellent for single-user workloads
- **Reliability**: ACID compliance and crash-safe
- **Full-text Search**: Built-in FTS5 support

### Schema Design Principles

- **Normalized Design**: Minimize data redundancy
- **Referential Integrity**: Foreign key constraints
- **Performance Optimization**: Strategic indexing
- **Extensibility**: Support for future features
- **Data Integrity**: Check constraints and triggers

### Database File Structure

```
data/
├── kanban.db              # Main database file
├── kanban.db-wal          # Write-Ahead Log (WAL mode)
├── kanban.db-shm          # Shared memory file
└── backups/               # Database backups
    ├── backup-2025-01-27.sql
    └── backup-2025-01-27.zip
```

## Core Tables

### 1. Boards Table

The `boards` table stores kanban board information.

```sql
CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3B82F6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    settings TEXT -- JSON configuration
);

-- Indexes
CREATE INDEX idx_boards_created_by ON boards(created_by);
CREATE INDEX idx_boards_archived ON boards(is_archived);
CREATE INDEX idx_boards_created_at ON boards(created_at DESC);
```

**Columns:**
- `id`: Unique board identifier (UUID)
- `name`: Board display name (required)
- `description`: Optional board description
- `color`: Board theme color (hex format)
- `created_at`: Board creation timestamp
- `updated_at`: Last modification timestamp
- `created_by`: User who created the board
- `is_archived`: Soft delete flag
- `settings`: JSON configuration for board features

**Usage Examples:**

```sql
-- Create a new board
INSERT INTO boards (id, name, description, color, created_by)
VALUES ('board-123', 'Development Tasks', 'Software development workflow', '#3B82F6', 'user-456');

-- Get active boards for a user
SELECT * FROM boards 
WHERE created_by = 'user-456' AND is_archived = FALSE
ORDER BY created_at DESC;

-- Update board settings
UPDATE boards 
SET settings = '{"autoArchive": true, "maxTasks": 1000}',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'board-123';
```

### 2. Columns Table

The `columns` table defines the structure of kanban boards.

```sql
CREATE TABLE columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL,
    color TEXT DEFAULT '#6B7280',
    is_done_column BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_columns_board_id ON columns(board_id);
CREATE INDEX idx_columns_position ON columns(board_id, position);
CREATE UNIQUE INDEX idx_columns_board_position ON columns(board_id, position);
```

**Columns:**
- `id`: Unique column identifier (UUID)
- `board_id`: Reference to parent board
- `name`: Column display name
- `description`: Optional column description
- `position`: Column order within board
- `color`: Column theme color
- `is_done_column`: Flag for completion columns
- `created_at`: Column creation timestamp
- `updated_at`: Last modification timestamp

**Usage Examples:**

```sql
-- Create default columns for a new board
INSERT INTO columns (id, board_id, name, position, color) VALUES
('col-1', 'board-123', 'To Do', 0, '#6B7280'),
('col-2', 'board-123', 'In Progress', 1, '#F59E0B'),
('col-3', 'board-123', 'Done', 2, '#10B981');

-- Get columns for a board in order
SELECT * FROM columns 
WHERE board_id = 'board-123'
ORDER BY position ASC;

-- Move column position
UPDATE columns 
SET position = 2, updated_at = CURRENT_TIMESTAMP
WHERE id = 'col-1';
```

### 3. Tasks Table

The `tasks` table stores individual task information.

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'archived')),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    due_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    assigned_to TEXT,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_tasks_board_id ON tasks(board_id);
CREATE INDEX idx_tasks_column_id ON tasks(column_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_position ON tasks(column_id, position);
CREATE INDEX idx_tasks_board_status ON tasks(board_id, status);
CREATE INDEX idx_tasks_priority_created ON tasks(priority DESC, created_at DESC);
```

**Columns:**
- `id`: Unique task identifier (UUID)
- `title`: Task title (required)
- `description`: Task description
- `board_id`: Reference to parent board
- `column_id`: Reference to current column
- `position`: Task order within column
- `priority`: Task priority (1-10, higher is more important)
- `status`: Task status (todo, in_progress, done, archived)
- `estimated_hours`: Estimated time to complete
- `actual_hours`: Actual time spent
- `due_date`: Task due date
- `created_at`: Task creation timestamp
- `updated_at`: Last modification timestamp
- `created_by`: User who created the task
- `assigned_to`: User assigned to the task

**Usage Examples:**

```sql
-- Create a new task
INSERT INTO tasks (id, title, description, board_id, column_id, position, priority, created_by)
VALUES ('task-123', 'Implement user authentication', 'Add OAuth2 support', 'board-123', 'col-1', 0, 8, 'user-456');

-- Get tasks for a board with column information
SELECT t.*, c.name as column_name 
FROM tasks t
JOIN columns c ON t.column_id = c.id
WHERE t.board_id = 'board-123'
ORDER BY c.position, t.position;

-- Update task status and position
UPDATE tasks 
SET status = 'in_progress',
    column_id = 'col-2',
    position = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'task-123';

-- Get high priority tasks
SELECT * FROM tasks 
WHERE priority >= 8 AND status != 'done'
ORDER BY priority DESC, due_date ASC;
```

### 4. Notes Table

The `notes` table stores task-related notes and comments.

```sql
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    category TEXT DEFAULT 'general',
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_notes_task_id ON notes(task_id);
CREATE INDEX idx_notes_category ON notes(category);
CREATE INDEX idx_notes_pinned ON notes(is_pinned);
CREATE INDEX idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX idx_notes_created_by ON notes(created_by);

-- Full-text search index
CREATE VIRTUAL TABLE notes_fts USING fts5(
    title, content, content='notes', content_rowid='id'
);
```

**Columns:**
- `id`: Unique note identifier (UUID)
- `task_id`: Reference to parent task
- `title`: Note title (required)
- `content`: Note content (supports markdown)
- `category`: Note category (general, bug, feature, etc.)
- `is_pinned`: Flag for pinned notes
- `created_at`: Note creation timestamp
- `updated_at`: Last modification timestamp
- `created_by`: User who created the note

**Usage Examples:**

```sql
-- Create a note
INSERT INTO notes (id, task_id, title, content, category, created_by)
VALUES ('note-123', 'task-123', 'Implementation details', 'Use JWT tokens for authentication', 'technical', 'user-456');

-- Get notes for a task
SELECT * FROM notes 
WHERE task_id = 'task-123'
ORDER BY is_pinned DESC, created_at DESC;

-- Search notes using full-text search
SELECT n.* FROM notes n
JOIN notes_fts fts ON n.id = fts.id
WHERE notes_fts MATCH 'authentication'
ORDER BY rank;

-- Pin a note
UPDATE notes 
SET is_pinned = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE id = 'note-123';
```

### 5. Tags Table

The `tags` table stores task tags for categorization.

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280',
    description TEXT,
    parent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_tags_parent_id ON tags(parent_id);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_created_by ON tags(created_by);
CREATE UNIQUE INDEX idx_tags_name_parent ON tags(name, parent_id);
```

**Columns:**
- `id`: Unique tag identifier (UUID)
- `name`: Tag name (required)
- `color`: Tag color (hex format)
- `description`: Optional tag description
- `parent_id`: Reference to parent tag (for hierarchy)
- `created_at`: Tag creation timestamp
- `updated_at`: Last modification timestamp
- `created_by`: User who created the tag

**Usage Examples:**

```sql
-- Create a tag
INSERT INTO tags (id, name, color, description, created_by)
VALUES ('tag-123', 'bug', '#EF4444', 'Bug fixes', 'user-456');

-- Create a child tag
INSERT INTO tags (id, name, color, parent_id, created_by)
VALUES ('tag-124', 'critical', '#DC2626', 'tag-123', 'user-456');

-- Get tag hierarchy
WITH RECURSIVE tag_tree AS (
    SELECT id, name, parent_id, 0 as level
    FROM tags WHERE parent_id IS NULL
    UNION ALL
    SELECT t.id, t.name, t.parent_id, tt.level + 1
    FROM tags t
    JOIN tag_tree tt ON t.parent_id = tt.id
)
SELECT * FROM tag_tree ORDER BY level, name;
```

## Relationship Tables

### 6. Task Tags Table

The `task_tags` table manages many-to-many relationships between tasks and tags.

```sql
CREATE TABLE task_tags (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE(task_id, tag_id)
);

-- Indexes
CREATE INDEX idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX idx_task_tags_tag_id ON task_tags(tag_id);
CREATE INDEX idx_task_tags_created_by ON task_tags(created_by);
```

**Usage Examples:**

```sql
-- Add tags to a task
INSERT INTO task_tags (id, task_id, tag_id, created_by) VALUES
('tt-1', 'task-123', 'tag-123', 'user-456'),
('tt-2', 'task-123', 'tag-124', 'user-456');

-- Get all tags for a task
SELECT t.* FROM tags t
JOIN task_tags tt ON t.id = tt.tag_id
WHERE tt.task_id = 'task-123'
ORDER BY t.name;

-- Get all tasks with a specific tag
SELECT task.* FROM tasks task
JOIN task_tags tt ON task.id = tt.task_id
WHERE tt.tag_id = 'tag-123'
ORDER BY task.priority DESC, task.created_at DESC;
```

### 7. Task Dependencies Table

The `task_dependencies` table manages task dependencies and blocking relationships.

```sql
CREATE TABLE task_dependencies (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    depends_on_task_id TEXT NOT NULL,
    dependency_type TEXT DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'requires', 'related')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CHECK (task_id != depends_on_task_id)
);

-- Indexes
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);
CREATE INDEX idx_task_dependencies_type ON task_dependencies(dependency_type);
CREATE INDEX idx_task_dependencies_created_by ON task_dependencies(created_by);
```

**Usage Examples:**

```sql
-- Create a dependency
INSERT INTO task_dependencies (id, task_id, depends_on_task_id, dependency_type, created_by)
VALUES ('dep-1', 'task-123', 'task-456', 'blocks', 'user-456');

-- Get dependencies for a task
SELECT t.* FROM tasks t
JOIN task_dependencies td ON t.id = td.depends_on_task_id
WHERE td.task_id = 'task-123'
ORDER BY t.priority DESC;

-- Get tasks that depend on this task
SELECT t.* FROM tasks t
JOIN task_dependencies td ON t.id = td.task_id
WHERE td.depends_on_task_id = 'task-123'
ORDER BY t.priority DESC;

-- Check for circular dependencies
WITH RECURSIVE dependency_chain AS (
    SELECT task_id, depends_on_task_id, 1 as depth
    FROM task_dependencies WHERE task_id = 'task-123'
    UNION ALL
    SELECT td.task_id, td.depends_on_task_id, dc.depth + 1
    FROM task_dependencies td
    JOIN dependency_chain dc ON td.task_id = dc.depends_on_task_id
    WHERE dc.depth < 10
)
SELECT * FROM dependency_chain WHERE task_id = depends_on_task_id;
```

### 8. Subtasks Table

The `subtasks` table stores subtasks for complex task breakdown.

```sql
CREATE TABLE subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    position INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_subtasks_task_id ON subtasks(task_id);
CREATE INDEX idx_subtasks_completed ON subtasks(is_completed);
CREATE INDEX idx_subtasks_position ON subtasks(task_id, position);
CREATE INDEX idx_subtasks_created_by ON subtasks(created_by);
```

**Usage Examples:**

```sql
-- Create subtasks
INSERT INTO subtasks (id, task_id, title, position, created_by) VALUES
('sub-1', 'task-123', 'Design database schema', 0, 'user-456'),
('sub-2', 'task-123', 'Implement API endpoints', 1, 'user-456'),
('sub-3', 'task-123', 'Write tests', 2, 'user-456');

-- Get subtasks for a task
SELECT * FROM subtasks 
WHERE task_id = 'task-123'
ORDER BY position;

-- Mark subtask as completed
UPDATE subtasks 
SET is_completed = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE id = 'sub-1';

-- Calculate task completion percentage
SELECT 
    task_id,
    COUNT(*) as total_subtasks,
    SUM(CASE WHEN is_completed THEN 1 ELSE 0 END) as completed_subtasks,
    ROUND(SUM(CASE WHEN is_completed THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as completion_percentage
FROM subtasks
GROUP BY task_id;
```

## Views and Indexes

### 9. Active Tasks View

The `active_tasks` view provides a convenient way to query active (non-archived) tasks.

```sql
CREATE VIEW active_tasks AS
SELECT 
    t.*,
    b.name as board_name,
    c.name as column_name,
    c.position as column_position
FROM tasks t
JOIN boards b ON t.board_id = b.id
JOIN columns c ON t.column_id = c.id
WHERE t.status != 'archived' AND b.is_archived = FALSE;
```

**Usage Examples:**

```sql
-- Get all active tasks
SELECT * FROM active_tasks ORDER BY board_name, column_position, position;

-- Get tasks by priority
SELECT * FROM active_tasks 
WHERE priority >= 8
ORDER BY priority DESC, due_date ASC;

-- Get tasks due soon
SELECT * FROM active_tasks 
WHERE due_date IS NOT NULL 
AND due_date <= datetime('now', '+7 days')
ORDER BY due_date ASC;
```

### 10. Task Dependency Graph View

The `task_dependency_graph` view provides dependency information for tasks.

```sql
CREATE VIEW task_dependency_graph AS
SELECT 
    t.id as task_id,
    t.title as task_title,
    t.status as task_status,
    td.depends_on_task_id,
    dt.title as depends_on_title,
    dt.status as depends_on_status,
    td.dependency_type
FROM tasks t
LEFT JOIN task_dependencies td ON t.id = td.task_id
LEFT JOIN tasks dt ON td.depends_on_task_id = dt.id
WHERE t.status != 'archived';
```

**Usage Examples:**

```sql
-- Get blocked tasks
SELECT DISTINCT task_id, task_title 
FROM task_dependency_graph 
WHERE depends_on_status != 'done' AND task_status != 'done';

-- Get blocking tasks
SELECT DISTINCT depends_on_task_id, depends_on_title 
FROM task_dependency_graph 
WHERE task_status != 'done' AND depends_on_status != 'done';
```

### 11. Task Statistics View

The `task_statistics` view provides aggregated task statistics.

```sql
CREATE VIEW task_statistics AS
SELECT 
    board_id,
    status,
    COUNT(*) as task_count,
    AVG(priority) as avg_priority,
    SUM(CASE WHEN due_date IS NOT NULL THEN 1 ELSE 0 END) as tasks_with_due_date,
    SUM(CASE WHEN due_date < datetime('now') THEN 1 ELSE 0 END) as overdue_tasks
FROM tasks
WHERE status != 'archived'
GROUP BY board_id, status;
```

**Usage Examples:**

```sql
-- Get board statistics
SELECT 
    b.name as board_name,
    ts.status,
    ts.task_count,
    ts.avg_priority,
    ts.tasks_with_due_date,
    ts.overdue_tasks
FROM task_statistics ts
JOIN boards b ON ts.board_id = b.id
ORDER BY b.name, ts.status;

-- Get overdue tasks summary
SELECT 
    board_id,
    SUM(overdue_tasks) as total_overdue
FROM task_statistics
GROUP BY board_id
HAVING total_overdue > 0;
```

## Data Integrity

### Foreign Key Constraints

All foreign key relationships are enforced with CASCADE delete behavior:

```sql
-- Example foreign key constraints
FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
```

### Check Constraints

Data validation is enforced through check constraints:

```sql
-- Priority range validation
CHECK (priority >= 1 AND priority <= 10)

-- Status validation
CHECK (status IN ('todo', 'in_progress', 'done', 'archived'))

-- Dependency type validation
CHECK (dependency_type IN ('blocks', 'requires', 'related'))

-- Prevent self-dependencies
CHECK (task_id != depends_on_task_id)
```

### Triggers

Triggers maintain data consistency and audit trails:

```sql
-- Update timestamp trigger
CREATE TRIGGER update_tasks_timestamp
AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Update timestamp trigger for boards
CREATE TRIGGER update_boards_timestamp
AFTER UPDATE ON boards
BEGIN
    UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Maintain task position consistency
CREATE TRIGGER maintain_task_position
AFTER INSERT ON tasks
BEGIN
    UPDATE tasks 
    SET position = (
        SELECT COALESCE(MAX(position), -1) + 1 
        FROM tasks 
        WHERE column_id = NEW.column_id
    )
    WHERE id = NEW.id AND position = 0;
END;
```

## Migration System

### Migration Structure

Migrations are versioned and tracked in the `migrations` table:

```sql
CREATE TABLE migrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    checksum TEXT NOT NULL
);
```

### Migration Example

```typescript
// src/database/migrations/001_initial_schema.ts
import type { Migration } from './types';

export const migration: Migration = {
  id: '001',
  name: 'initial_schema',
  description: 'Create initial database schema',
  
  async up(db) {
    // Create tables
    await db.run(`
      CREATE TABLE boards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#3B82F6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT,
        is_archived BOOLEAN DEFAULT FALSE,
        settings TEXT
      )
    `);
    
    // Create indexes
    await db.run(`
      CREATE INDEX idx_boards_created_by ON boards(created_by)
    `);
    
    // Create triggers
    await db.run(`
      CREATE TRIGGER update_boards_timestamp
      AFTER UPDATE ON boards
      BEGIN
        UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `);
  },
  
  async down(db) {
    await db.run('DROP TABLE IF EXISTS boards');
  },
};
```

### Running Migrations

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status

# Create new migration
npm run migrate:create add_user_preferences
```

## Performance Considerations

### Index Strategy

Strategic indexes are created for common query patterns:

```sql
-- Composite indexes for complex queries
CREATE INDEX idx_tasks_board_status ON tasks(board_id, status);
CREATE INDEX idx_tasks_priority_created ON tasks(priority DESC, created_at DESC);
CREATE INDEX idx_tasks_column_position ON tasks(column_id, position);

-- Covering indexes for frequently accessed data
CREATE INDEX idx_tasks_list ON tasks(board_id, status, priority DESC, title);
```

### Query Optimization

```sql
-- Use EXPLAIN QUERY PLAN to analyze query performance
EXPLAIN QUERY PLAN
SELECT * FROM tasks 
WHERE board_id = 'board-123' AND status = 'todo'
ORDER BY priority DESC, created_at DESC;

-- Use LIMIT for large result sets
SELECT * FROM tasks 
WHERE board_id = 'board-123'
ORDER BY created_at DESC
LIMIT 100;

-- Use prepared statements for repeated queries
SELECT * FROM tasks WHERE board_id = ? AND status = ?
```

### Database Maintenance

```sql
-- Regular maintenance commands
VACUUM;                    -- Reclaim unused space
ANALYZE;                   -- Update query planner statistics
REINDEX;                   -- Rebuild all indexes
PRAGMA integrity_check;    -- Check database integrity
```

## Backup and Recovery

### Backup Strategy

```typescript
// src/services/BackupService.ts
export class BackupService {
  async createBackup(): Promise<BackupInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./backups/backup-${timestamp}.sql`;
    
    // Create SQL dump
    await this.createSqlDump(backupPath);
    
    // Compress backup
    const compressedPath = await this.compressBackup(backupPath);
    
    // Verify backup integrity
    await this.verifyBackup(compressedPath);
    
    return {
      path: compressedPath,
      timestamp: new Date(),
      size: await this.getFileSize(compressedPath),
    };
  }
  
  private async createSqlDump(path: string): Promise<void> {
    // Export schema and data
    const schema = await this.db.all("SELECT sql FROM sqlite_master WHERE type='table'");
    const data = await this.exportData();
    
    // Write to file
    await fs.writeFile(path, this.formatSqlDump(schema, data));
  }
}
```

### Recovery Process

```typescript
export class RecoveryService {
  async restoreFromBackup(backupPath: string): Promise<void> {
    // Stop application
    await this.stopApplication();
    
    // Create backup of current database
    await this.createBackup();
    
    // Restore from backup
    await this.restoreDatabase(backupPath);
    
    // Verify restoration
    await this.verifyRestoration();
    
    // Start application
    await this.startApplication();
  }
  
  private async restoreDatabase(backupPath: string): Promise<void> {
    const sql = await fs.readFile(backupPath, 'utf-8');
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    await this.db.transaction(async (tx) => {
      for (const statement of statements) {
        if (statement.trim()) {
          await tx.run(statement);
        }
      }
    });
  }
}
```

### Automated Backups

```typescript
// src/services/BackupScheduler.ts
export class BackupScheduler {
  async scheduleBackups(): Promise<void> {
    // Daily backup at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.backupService.createBackup();
        await this.cleanupOldBackups();
      } catch (error) {
        this.logger.error('Backup failed', error);
      }
    });
  }
  
  private async cleanupOldBackups(): Promise<void> {
    const retentionDays = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const backups = await this.getBackupFiles();
    for (const backup of backups) {
      if (backup.timestamp < cutoffDate) {
        await fs.unlink(backup.path);
      }
    }
  }
}
```

This database schema documentation provides comprehensive information for developers working with the MCP Kanban system. For additional details on specific queries or optimization techniques, refer to the [Performance Tuning Guide](./PERFORMANCE_TUNING.md) and [API Documentation](../API.md). 