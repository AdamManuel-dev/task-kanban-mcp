-- MCP Kanban Database Schema
-- This schema exactly matches the migration file 001_initial_schema.ts
-- SQLite database schema with full-text search and performance optimizations

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================================
-- Core Tables
-- ============================================================================

-- Boards table - Main kanban boards
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#2196F3',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived BOOLEAN DEFAULT FALSE
);

-- Columns table - Board columns (todo, in-progress, done, etc.)
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  wip_limit INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Tasks table - Core task entities with full-text search support
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  board_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked', 'archived')),
  assignee TEXT,
  due_date DATETIME,
  estimated_hours REAL,
  actual_hours REAL,
  parent_task_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  archived BOOLEAN DEFAULT FALSE,
  metadata TEXT, -- JSON field for additional data
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Task dependencies - Task blocking relationships
CREATE TABLE IF NOT EXISTS task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'relates_to', 'duplicates')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE (task_id, depends_on_task_id)
);

-- Notes table - Rich notes with categories and full-text search
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'progress', 'blocker', 'decision', 'question')),
  pinned BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Tags table - Hierarchical tag system
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#9E9E9E',
  description TEXT,
  parent_tag_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_tag_id) REFERENCES tags(id) ON DELETE SET NULL
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

-- Repository mappings for git integration
CREATE TABLE IF NOT EXISTS repository_mappings (
  id TEXT PRIMARY KEY,
  repository_path TEXT NOT NULL UNIQUE,
  board_id TEXT NOT NULL,
  branch_pattern TEXT DEFAULT 'main',
  auto_create_tasks BOOLEAN DEFAULT TRUE,
  tag_prefix TEXT DEFAULT 'task',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Task time tracking entries
CREATE TABLE IF NOT EXISTS task_time_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_minutes INTEGER,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task history for audit trail
CREATE TABLE IF NOT EXISTS task_history (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- API keys for authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  permissions TEXT NOT NULL, -- JSON array of permissions
  last_used_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN DEFAULT FALSE
);

-- Task templates table
CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'custom' CHECK (category IN ('bug', 'feature', 'meeting', 'maintenance', 'research', 'review', 'custom')),
  title_template TEXT NOT NULL,
  description_template TEXT,
  priority INTEGER DEFAULT 0,
  estimated_hours REAL,
  tags TEXT, -- JSON array of tag names
  checklist_items TEXT, -- JSON array of checklist items
  custom_fields TEXT, -- JSON object for additional fields
  created_by TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Schema information table
CREATE TABLE IF NOT EXISTS schema_info (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Performance Indexes
-- ============================================================================

-- Task indexes
CREATE INDEX IF NOT EXISTS idx_tasks_board_id ON tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column_id ON tasks(column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);

-- Task dependency indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

-- Note indexes
CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);

-- Task-tag junction indexes
CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);

-- Column indexes
CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);
CREATE INDEX IF NOT EXISTS idx_columns_position ON columns(position);

-- Tag indexes
CREATE INDEX IF NOT EXISTS idx_tags_parent_tag_id ON tags(parent_tag_id);

-- Task history indexes
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_changed_at ON task_history(changed_at);

-- Time entry indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON task_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_start_time ON task_time_entries(start_time);

-- Template indexes
CREATE INDEX IF NOT EXISTS idx_task_templates_category ON task_templates(category);
CREATE INDEX IF NOT EXISTS idx_task_templates_is_active ON task_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_task_templates_is_system ON task_templates(is_system);

-- ============================================================================
-- Full-Text Search Tables
-- ============================================================================

-- Full-text search for tasks
CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  content='tasks',
  content_rowid='rowid'
);

-- Full-text search for notes
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  content,
  content='notes',
  content_rowid='rowid'
);

-- ============================================================================
-- Database Views
-- ============================================================================

-- Active tasks view (non-archived tasks with calculated metrics)
CREATE VIEW IF NOT EXISTS active_tasks AS
SELECT 
  t.*,
  c.name as column_name,
  b.name as board_name,
  COUNT(st.id) as subtask_count,
  COUNT(CASE WHEN st.status = 'done' THEN 1 END) as completed_subtasks
FROM tasks t
JOIN columns c ON t.column_id = c.id
JOIN boards b ON t.board_id = b.id
LEFT JOIN tasks st ON st.parent_task_id = t.id
WHERE t.archived = FALSE AND t.status != 'archived'
GROUP BY t.id;

-- Task dependency graph view for cycle detection and analysis
CREATE VIEW IF NOT EXISTS task_dependency_graph AS
SELECT 
  td.task_id,
  td.depends_on_task_id,
  td.dependency_type,
  t1.title as task_title,
  t2.title as depends_on_title,
  t1.status as task_status,
  t2.status as depends_on_status
FROM task_dependencies td
JOIN tasks t1 ON td.task_id = t1.id
JOIN tasks t2 ON td.depends_on_task_id = t2.id
WHERE t1.archived = FALSE AND t2.archived = FALSE;

-- Board statistics view
CREATE VIEW IF NOT EXISTS board_stats AS
SELECT 
  b.id as board_id,
  b.name as board_name,
  COUNT(t.id) as total_tasks,
  COUNT(CASE WHEN t.status = 'todo' THEN 1 END) as todo_tasks,
  COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) as in_progress_tasks,
  COUNT(CASE WHEN t.status = 'done' THEN 1 END) as done_tasks,
  COUNT(CASE WHEN t.status = 'blocked' THEN 1 END) as blocked_tasks,
  AVG(t.priority) as avg_priority,
  COUNT(CASE WHEN t.due_date < datetime('now') AND t.status != 'done' THEN 1 END) as overdue_tasks
FROM boards b
LEFT JOIN tasks t ON b.id = t.board_id AND t.archived = FALSE
WHERE b.archived = FALSE
GROUP BY b.id, b.name;

-- ============================================================================
-- Triggers for FTS Maintenance
-- ============================================================================

-- Tasks FTS triggers
CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks
BEGIN
  INSERT INTO tasks_fts(rowid, id, title, description) 
  VALUES (new.rowid, new.id, new.title, new.description);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks
BEGIN
  UPDATE tasks_fts SET title = new.title, description = new.description 
  WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks
BEGIN
  DELETE FROM tasks_fts WHERE rowid = old.rowid;
END;

-- Notes FTS triggers
CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes
BEGIN
  INSERT INTO notes_fts(rowid, id, content) 
  VALUES (new.rowid, new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes
BEGIN
  UPDATE notes_fts SET content = new.content WHERE rowid = new.rowid;
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes
BEGIN
  DELETE FROM notes_fts WHERE rowid = old.rowid;
END;

-- ============================================================================
-- Triggers for updated_at Fields
-- ============================================================================

-- Update timestamp triggers
CREATE TRIGGER IF NOT EXISTS boards_updated_at AFTER UPDATE ON boards
BEGIN
  UPDATE boards SET updated_at = CURRENT_TIMESTAMP WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS columns_updated_at AFTER UPDATE ON columns
BEGIN
  UPDATE columns SET updated_at = CURRENT_TIMESTAMP WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS tasks_updated_at AFTER UPDATE ON tasks
BEGIN
  UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS notes_updated_at AFTER UPDATE ON notes
BEGIN
  UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS repository_mappings_updated_at AFTER UPDATE ON repository_mappings
BEGIN
  UPDATE repository_mappings SET updated_at = CURRENT_TIMESTAMP WHERE id = new.id;
END;

CREATE TRIGGER IF NOT EXISTS task_templates_updated_at AFTER UPDATE ON task_templates
BEGIN
  UPDATE task_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = new.id;
END;

-- ============================================================================
-- Schema Version Information
-- ============================================================================

-- Insert schema version
INSERT OR REPLACE INTO schema_info (key, value) 
VALUES ('version', '1.0.0');

INSERT OR REPLACE INTO schema_info (key, value) 
VALUES ('created_at', datetime('now'));