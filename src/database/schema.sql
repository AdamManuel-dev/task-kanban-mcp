-- MCP Kanban Database Schema
-- SQLite database schema with full-text search and performance optimizations

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Core Tables
-- ============================================================================

-- Boards table - Main kanban boards
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settings JSON DEFAULT '{}',
    archived BOOLEAN DEFAULT FALSE
);

-- Columns table - Board columns (todo, in-progress, done, etc.)
CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    color TEXT DEFAULT '#6b7280',
    settings JSON DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    UNIQUE(board_id, position),
    UNIQUE(board_id, name)
);

-- Tasks table - Core task entities with full-text search support
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    parent_task_id TEXT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    position INTEGER NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    priority_score REAL DEFAULT 0.0,
    due_date DATETIME NULL,
    estimated_hours REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived BOOLEAN DEFAULT FALSE,
    git_context JSON DEFAULT '{}',
    priority_factors JSON DEFAULT '{}',
    dependency_metrics JSON DEFAULT '{}',
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE RESTRICT,
    FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(column_id, position)
);

-- Task progress tracking for subtasks
CREATE TABLE IF NOT EXISTS task_progress (
    task_id TEXT PRIMARY KEY,
    subtasks_total INTEGER DEFAULT 0,
    subtasks_completed INTEGER DEFAULT 0,
    percent_complete REAL DEFAULT 0.0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CHECK(subtasks_completed <= subtasks_total),
    CHECK(percent_complete >= 0.0 AND percent_complete <= 100.0)
);

-- Task dependencies - Task blocking relationships
CREATE TABLE IF NOT EXISTS task_dependencies (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    depends_on_task_id TEXT NOT NULL,
    dependency_type TEXT DEFAULT 'blocks' CHECK(dependency_type IN ('blocks', 'related', 'parent-child')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, depends_on_task_id),
    CHECK(task_id != depends_on_task_id)
);

-- ============================================================================
-- Notes and Content
-- ============================================================================

-- Notes table - Rich notes with categories and full-text search
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    task_id TEXT NULL,
    board_id TEXT NOT NULL,
    title TEXT DEFAULT '',
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general' CHECK(category IN ('implementation', 'research', 'blocker', 'idea', 'general')),
    pinned BOOLEAN DEFAULT FALSE,
    author TEXT DEFAULT 'system',
    code_snippets JSON DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- ============================================================================
-- Tagging System
-- ============================================================================

-- Tags table - Hierarchical tag system
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    parent_id TEXT NULL,
    path TEXT NOT NULL, -- Full hierarchy path like "frontend/react/hooks"
    color TEXT DEFAULT '#6b7280',
    description TEXT DEFAULT '',
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE SET NULL
);

-- Task-Tag junction table
CREATE TABLE IF NOT EXISTS task_tags (
    task_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, tag_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================================================
-- Configuration and Integration
-- ============================================================================

-- Repository mappings for git integration
CREATE TABLE IF NOT EXISTS repository_mappings (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    pattern_type TEXT DEFAULT 'glob' CHECK(pattern_type IN ('glob', 'regex', 'exact')),
    board_id TEXT NOT NULL,
    priority INTEGER DEFAULT 100,
    default_tags JSON DEFAULT '[]',
    auto_create_tasks BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Context analytics for tracking patterns and metrics
CREATE TABLE IF NOT EXISTS context_analytics (
    id TEXT PRIMARY KEY,
    board_id TEXT NOT NULL,
    date DATE NOT NULL,
    metrics JSON NOT NULL DEFAULT '{}',
    patterns JSON DEFAULT '{}',
    active_blockers JSON DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
    UNIQUE(board_id, date)
);

-- Backup metadata tracking
CREATE TABLE IF NOT EXISTS backup_metadata (
    id TEXT PRIMARY KEY,
    backup_name TEXT NOT NULL UNIQUE,
    backup_type TEXT DEFAULT 'full' CHECK(backup_type IN ('full', 'incremental')),
    file_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
    retention_days INTEGER DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL
);

-- ============================================================================
-- Full-Text Search Tables
-- ============================================================================

-- Full-text search for tasks
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
    title,
    description,
    content='tasks',
    content_rowid='rowid'
);

-- Full-text search for notes
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    content='notes',
    content_rowid='rowid'
);

-- ============================================================================
-- Triggers for FTS and Data Integrity
-- ============================================================================

-- Tasks FTS triggers
CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks
BEGIN
    INSERT INTO tasks_fts(rowid, title, description)
    VALUES (NEW.rowid, NEW.title, NEW.description);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks
BEGIN
    DELETE FROM tasks_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks
BEGIN
    DELETE FROM tasks_fts WHERE rowid = OLD.rowid;
    INSERT INTO tasks_fts(rowid, title, description)
    VALUES (NEW.rowid, NEW.title, NEW.description);
END;

-- Notes FTS triggers
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes
BEGIN
    INSERT INTO notes_fts(rowid, title, content)
    VALUES (NEW.rowid, NEW.title, NEW.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes
BEGIN
    DELETE FROM notes_fts WHERE rowid = OLD.rowid;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes
BEGIN
    DELETE FROM notes_fts WHERE rowid = OLD.rowid;
    INSERT INTO notes_fts(rowid, title, content)
    VALUES (NEW.rowid, NEW.title, NEW.content);
END;

-- Update timestamps triggers
CREATE TRIGGER IF NOT EXISTS update_boards_timestamp
    AFTER UPDATE ON boards
BEGIN
    UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp
    AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_notes_timestamp
    AFTER UPDATE ON notes
BEGIN
    UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Task progress calculation trigger
CREATE TRIGGER IF NOT EXISTS update_task_progress
    AFTER INSERT ON tasks WHEN NEW.parent_task_id IS NOT NULL
BEGIN
    INSERT OR REPLACE INTO task_progress (task_id, subtasks_total, subtasks_completed, percent_complete)
    SELECT 
        NEW.parent_task_id,
        COUNT(*),
        COUNT(CASE WHEN c.name IN ('done', 'completed') THEN 1 END),
        ROUND((COUNT(CASE WHEN c.name IN ('done', 'completed') THEN 1 END) * 100.0) / COUNT(*), 2)
    FROM tasks t
    JOIN columns c ON t.column_id = c.id
    WHERE t.parent_task_id = NEW.parent_task_id AND t.archived = FALSE;
END;

-- Tag usage count triggers
CREATE TRIGGER IF NOT EXISTS increment_tag_usage
    AFTER INSERT ON task_tags
BEGIN
    UPDATE tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
END;

CREATE TRIGGER IF NOT EXISTS decrement_tag_usage
    AFTER DELETE ON task_tags
BEGIN
    UPDATE tags SET usage_count = usage_count - 1 WHERE id = OLD.tag_id;
END;

-- ============================================================================
-- Performance Indexes
-- ============================================================================

-- Board indexes
CREATE INDEX IF NOT EXISTS idx_boards_name ON boards(name);
CREATE INDEX IF NOT EXISTS idx_boards_created_at ON boards(created_at);

-- Column indexes
CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);
CREATE INDEX IF NOT EXISTS idx_columns_position ON columns(board_id, position);

-- Task indexes
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority, priority_score);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(column_id, position);
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived, board_id);

-- Task dependency indexes
CREATE INDEX IF NOT EXISTS idx_task_deps_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_type ON task_dependencies(dependency_type);

-- Note indexes
CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_board_id ON notes(board_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned) WHERE pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at);

-- Tag indexes
CREATE INDEX IF NOT EXISTS idx_tags_parent_id ON tags(parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_path ON tags(path);
CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count DESC);

-- Task-tag junction indexes
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);

-- Repository mapping indexes
CREATE INDEX IF NOT EXISTS idx_repo_mappings_board_id ON repository_mappings(board_id);
CREATE INDEX IF NOT EXISTS idx_repo_mappings_priority ON repository_mappings(priority);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_board_date ON context_analytics(board_id, date);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON context_analytics(date);

-- Backup indexes
CREATE INDEX IF NOT EXISTS idx_backup_created_at ON backup_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_backup_expires_at ON backup_metadata(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Useful Views
-- ============================================================================

-- Active tasks view (non-archived tasks with calculated metrics)
CREATE VIEW IF NOT EXISTS active_tasks AS
SELECT 
    t.*,
    c.name as column_name,
    c.color as column_color,
    b.name as board_name,
    pt.title as parent_title,
    COALESCE(tp.percent_complete, 0) as completion_percentage,
    COALESCE(tp.subtasks_total, 0) as subtasks_total,
    COALESCE(tp.subtasks_completed, 0) as subtasks_completed,
    COUNT(DISTINCT sub.id) as subtask_count,
    COUNT(DISTINCT td_blocking.id) as blocking_count,
    COUNT(DISTINCT td_blocked.id) as blocked_by_count,
    GROUP_CONCAT(DISTINCT tags.name, ', ') as tag_names
FROM tasks t
JOIN columns c ON t.column_id = c.id
JOIN boards b ON t.board_id = b.id
LEFT JOIN tasks pt ON t.parent_task_id = pt.id
LEFT JOIN task_progress tp ON t.id = tp.task_id
LEFT JOIN tasks sub ON t.id = sub.parent_task_id AND sub.archived = FALSE
LEFT JOIN task_dependencies td_blocking ON t.id = td_blocking.task_id
LEFT JOIN task_dependencies td_blocked ON t.id = td_blocked.depends_on_task_id
LEFT JOIN task_tags tt ON t.id = tt.task_id
LEFT JOIN tags ON tt.tag_id = tags.id
WHERE t.archived = FALSE
GROUP BY t.id;

-- Task dependency graph view for cycle detection and analysis
CREATE VIEW IF NOT EXISTS task_dependency_graph AS
WITH RECURSIVE dependency_chain(task_id, depends_on_task_id, depth, path) AS (
    -- Base case: direct dependencies
    SELECT 
        task_id, 
        depends_on_task_id, 
        0 as depth,
        task_id || ' -> ' || depends_on_task_id as path
    FROM task_dependencies
    
    UNION ALL
    
    -- Recursive case: indirect dependencies
    SELECT 
        dc.task_id,
        td.depends_on_task_id,
        dc.depth + 1,
        dc.path || ' -> ' || td.depends_on_task_id
    FROM dependency_chain dc
    JOIN task_dependencies td ON dc.depends_on_task_id = td.task_id
    WHERE dc.depth < 10 -- Prevent infinite loops
    AND dc.path NOT LIKE '%' || td.depends_on_task_id || '%' -- Prevent cycles
)
SELECT 
    task_id,
    depends_on_task_id,
    depth,
    path,
    t1.title as task_title,
    t2.title as dependency_title
FROM dependency_chain dc
JOIN tasks t1 ON dc.task_id = t1.id
JOIN tasks t2 ON dc.depends_on_task_id = t2.id
ORDER BY task_id, depth;

-- Board statistics view
CREATE VIEW IF NOT EXISTS board_stats AS
SELECT 
    b.id,
    b.name,
    COUNT(DISTINCT t.id) as total_tasks,
    COUNT(DISTINCT CASE WHEN c.name IN ('done', 'completed') THEN t.id END) as completed_tasks,
    COUNT(DISTINCT CASE WHEN t.parent_task_id IS NULL THEN t.id END) as root_tasks,
    COUNT(DISTINCT CASE WHEN t.parent_task_id IS NOT NULL THEN t.id END) as subtasks,
    COUNT(DISTINCT n.id) as total_notes,
    COUNT(DISTINCT CASE WHEN n.pinned = TRUE THEN n.id END) as pinned_notes,
    AVG(CASE WHEN t.priority = 'high' THEN 3 WHEN t.priority = 'medium' THEN 2 ELSE 1 END) as avg_priority,
    MAX(t.updated_at) as last_activity
FROM boards b
LEFT JOIN tasks t ON b.id = t.board_id AND t.archived = FALSE
LEFT JOIN columns c ON t.column_id = c.id
LEFT JOIN notes n ON b.id = n.board_id
WHERE b.archived = FALSE
GROUP BY b.id, b.name;