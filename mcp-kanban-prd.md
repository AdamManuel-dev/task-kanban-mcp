# Product Requirements Document: MCP Server for Headless Kanban Task Management System

## Executive Summary

This PRD defines requirements for a personal-use MCP (Model Context Protocol) server that provides AI agents (Claude Code, Cursor, etc.) with direct access to a headless kanban task management system. The server will automatically select appropriate boards based on git repository context, support both REST and WebSocket APIs for real-time updates, and use SQLite as the local data layer. Authentication will use simple API keys suitable for personal/single-user deployment, with comprehensive backup mechanisms for data protection.

## Problem Statement

AI coding assistants lack direct integration with task management systems, requiring developers to manually switch contexts between their IDE and task boards. This creates friction in development workflows, especially when AI agents could automatically create tasks, update progress, add notes, and manage project workflows based on code context. Current solutions require complex OAuth flows unsuitable for personal deployments.

## Goals & Objectives

### Primary Goals
- Enable AI agents to automatically manage tasks based on repository context
- Provide real-time task updates across all connected clients
- Minimize context switching between development and task management
- Support simple deployment for personal use

### Success Criteria
- Zero manual board selection when working in git repositories
- < 100ms latency for task operations
- 99.9% uptime for local deployment
- Complete task CRUD operations via natural language
- Real-time synchronization across multiple AI agent instances

## User Personas

### Primary: Solo Developer
- **Background**: Individual developer using AI assistants for coding
- **Needs**: Seamless task management integrated with development workflow, CLI access for quick operations
- **Pain Points**: Constant context switching, manual task updates, forgetting to update task status
- **Technical Skills**: Comfortable with Docker, basic server administration, command-line interfaces

### Secondary: AI Coding Assistant
- **Background**: Claude Code, Cursor, or similar AI development tools
- **Needs**: Simple API to create/update tasks, understand project context
- **Pain Points**: No direct access to project management tools
- **Constraints**: Limited to MCP protocol communication

## User Stories

1. **As a developer**, I want my AI assistant to automatically create tasks when I describe new features, so that I don't break my coding flow.

2. **As an AI agent**, I want to detect which kanban board to use based on the current git repository, so that tasks are organized correctly without user intervention.

3. **As a developer**, I want to see real-time updates when my AI assistant modifies tasks, so that I stay informed across all my tools.

4. **As an AI agent**, I want to update task status based on git commits and branch names, so that the board reflects actual development progress.

5. **As a developer**, I want my AI to add implementation notes to tasks as it writes code, so that I have context for future reference.

6. **As a developer**, I want to search through all my notes across tasks, so that I can find solutions to problems I've solved before.

7. **As an AI agent**, I want to automatically tag tasks based on their content and context, so that the developer can easily filter and find related work.

8. **As a developer**, I want hierarchical tags that let me organize tasks at different levels of granularity, so that I can view my work from multiple perspectives.

9. **As an AI agent**, I want to understand the full context of current work including blockers and patterns, so that I can make better decisions and provide more relevant assistance.

10. **As a developer**, I want my AI to learn from past solutions in my notes, so that it doesn't repeat work or can apply previous fixes to similar problems.

11. **As a developer**, I want to break down complex tasks into subtasks, so that I can track progress incrementally and maintain focus.

12. **As an AI agent**, I want to understand task dependencies, so that I can work on tasks in the correct order and identify blockers.

13. **As a developer**, I want AI-powered task prioritization that considers multiple factors, so that I always know what to focus on next.

14. **As an AI agent**, I want to explain why certain tasks are high priority, so that the developer understands and trusts my recommendations.

15. **As a developer**, I want my AI to recommend the single best task to work on next, so that I don't waste time deciding what to do.

16. **As an AI agent**, I want to prioritize tasks that unblock the most other work, so that I help maximize the developer's overall productivity.

17. **As a developer**, I want to use a CLI to quickly manage tasks without leaving my terminal, so that I maintain my development flow.

18. **As a developer**, I want CLI commands that mirror the API endpoints, so that I can script and automate my workflow.

19. **As a developer**, I want automatic backups of my task data, so that I never lose important work information.

20. **As a developer**, I want to restore from any backup point, so that I can recover from mistakes or data corruption.

## Functional Requirements

### 1. Context-Aware Board Selection (Must Have)
- **FR1.1**: Automatically detect current git repository
- **FR1.2**: Map repository to appropriate kanban board using configurable rules
- **FR1.3**: Support multiple mapping strategies:
  - Repository URL to board ID
  - Repository name patterns
  - Branch naming conventions
  - Configuration file in repository (`.mcp-kanban.json`)
- **FR1.4**: Fallback to default board if no mapping exists

### 2. Task Management Operations (Must Have)
- **FR2.1**: Create tasks with title, description, and metadata
- **FR2.2**: Update task status (todo, in-progress, done, archived)
- **FR2.3**: Modify task properties (assignee, labels, priority, due date)
- **FR2.4**: Add comments and notes to existing tasks
- **FR2.5**: Search tasks by title, description, tags, or notes content
- **FR2.6**: List tasks filtered by status, board, tags, or date range
- **FR2.7**: Add multiple notes to tasks with timestamps and categories
- **FR2.8**: Tag tasks with hierarchical tags (e.g., "frontend/react", "bug/critical")
- **FR2.9**: Create subtasks under parent tasks with automatic progress tracking
- **FR2.10**: Define task dependencies with blocking/blocked-by relationships
- **FR2.11**: Automatically update parent task progress based on subtask completion

### 3. Board Management (Must Have)
- **FR3.1**: Create new boards with custom columns
- **FR3.2**: List all available boards
- **FR3.3**: Configure board-to-repository mappings
- **FR3.4**: Set default board for unmapped repositories

### 4. Real-time Synchronization (Must Have)
- **FR4.1**: WebSocket connection for live updates
- **FR4.2**: Broadcast changes to all connected clients
- **FR4.3**: Automatic reconnection on connection loss
- **FR4.4**: Conflict resolution for simultaneous updates

### 5. Git Integration (Should Have)
- **FR5.1**: Parse branch names to extract task IDs
- **FR5.2**: Automatically move tasks based on branch lifecycle
- **FR5.3**: Extract task references from commit messages
- **FR5.4**: Update task status based on PR/merge events

### 6. AI-Specific Features (Should Have)
- **FR6.1**: Natural language task creation
- **FR6.2**: Bulk operations from single command
- **FR6.3**: Smart task categorization based on content
- **FR6.4**: Suggested task descriptions from code context

### 8. Context Awareness System (Must Have)
- **FR8.1**: Provide comprehensive work context to LLMs for better decision making
- **FR8.2**: Track task completion patterns and velocity metrics
- **FR8.3**: Identify and surface current blockers across all tasks
- **FR8.4**: Analyze relationships between tasks based on tags, notes, and timing
- **FR8.5**: Generate project summaries with progress indicators
- **FR8.6**: Surface relevant past solutions from notes when working on similar tasks
- **FR8.7**: Provide code context from previous implementations
- **FR8.8**: Track and report on task dependencies and bottlenecks

### 9. Task Dependencies & Subtasks (Must Have)
- **FR9.1**: Create subtasks under any parent task
- **FR9.2**: Define "blocks" and "blocked by" relationships between tasks
- **FR9.3**: Automatically calculate parent task progress from subtask completion
- **FR9.4**: Visualize dependency chains and critical paths
- **FR9.5**: Prevent closing parent tasks with incomplete subtasks
- **FR9.6**: Alert when blocking tasks prevent progress
- **FR9.7**: Support nested subtasks up to 3 levels deep
- **FR9.8**: Clone task structures with subtasks for recurring workflows

### 11. Backup & Data Management (Must Have)
- **FR11.1**: Automatic daily backups of SQLite database
- **FR11.2**: Manual backup command with custom naming
- **FR11.3**: Point-in-time restoration from any backup
- **FR11.4**: Export data to JSON/CSV for portability
- **FR11.5**: Import data from backups or exports
- **FR11.6**: Backup rotation with configurable retention
- **FR11.7**: Incremental backups for storage efficiency
- **FR11.8**: Backup integrity verification

## Technical Requirements

### Architecture Overview
```
┌─────────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   AI Agent (MCP)    │────▶│   MCP Server     │◀────│   CLI Client     │
└─────────────────────┘     └──────────────────┘     └──────────────────┘
                                     │
                            ┌────────┴────────┐
                            │                 │
                      ┌─────▼─────┐    ┌─────▼─────┐
                      │  REST API │    │ WebSocket │
                      └─────┬─────┘    └─────┬─────┘
                            │                 │
                      ┌─────▼─────────────────▼─────┐
                      │    Business Logic Layer     │
                      └─────────────┬───────────────┘
                                    │
                            ┌───────▼────────┐
                            │     SQLite     │
                            │   (local.db)   │
                            └────────────────┘
```

### CLI Interface Specification

The CLI provides full access to all REST endpoints and real-time features through an intuitive command-line interface.

#### Installation & Setup
```bash
# Install globally
npm install -g @kanban-mcp/cli

# Configure API endpoint and key
kanban config set api-url http://localhost:3000
kanban config set api-key YOUR_API_KEY

# Test connection
kanban status
```

#### Task Commands
```bash
# Create a new task
kanban task create "Implement user authentication" \
  --description "Add JWT-based auth" \
  --tags backend,security \
  --priority high

# List tasks with filters
kanban task list --status in-progress --tags backend
kanban task list --board project-alpha --json

# Get task details
kanban task get task-123
kanban task get task-123 --with-notes --with-subtasks

# Update task
kanban task update task-123 --status done
kanban task update task-123 --add-tags frontend --priority medium

# Delete task
kanban task delete task-123 --confirm

# Move task between columns
kanban task move task-123 --to "in-progress"
```

#### Subtask & Dependency Commands
```bash
# Create subtask
kanban subtask create task-123 "Setup JWT middleware"

# List subtasks
kanban subtask list task-123

# Set dependencies
kanban task depend task-456 --on task-123
kanban task depend task-789 --on task-123,task-456 --type blocks

# View dependencies
kanban task deps task-123 --tree
kanban task deps task-123 --blocked-by --blocks
```

#### Note Commands
```bash
# Add note to task
kanban note add task-123 "Fixed CORS issue with Safari" --category blocker
kanban note add task-123 "Use passport.js for auth" --category research --pin

# List notes
kanban note list task-123
kanban note list --category blocker --all-tasks

# Search notes
kanban note search "authentication" --board current
kanban note search "CORS" --category blocker --pinned

# Update/delete note
kanban note update note-456 --unpin
kanban note delete note-456 --confirm
```

#### Tag Commands
```bash
# Create tag
kanban tag create "frontend/react/hooks" --color "#00ff00"
kanban tag create "urgent" --description "Needs immediate attention"

# List tags
kanban tag list
kanban tag list --tree
kanban tag list --with-usage

# Tag operations
kanban tag add task-123 frontend,backend,urgent
kanban tag remove task-123 urgent

# Search by tags
kanban task list --tags frontend/react
kanban task list --tags urgent,backend --match all
```

#### Board Commands
```bash
# List boards
kanban board list

# Create board
kanban board create "Q1 Sprint" --columns "todo,in-progress,review,done"

# Get board with tasks
kanban board show project-alpha
kanban board show project-alpha --group-by column

# Update board
kanban board update board-123 --add-column "blocked"
kanban board update board-123 --default-column "todo"

# Set current board (for context)
kanban board use project-alpha
```

#### Priority & AI Commands
```bash
# Get next task recommendation
kanban next
kanban next --time 120 --skills frontend,react
kanban next --exclude-blocked --with-reasoning

# Get priority suggestions
kanban priority suggest --today
kanban priority suggest --this-week --count 10

# Recalculate priorities
kanban priority recalc --board current
kanban priority recalc --all

# Update task priority
kanban task priority task-123 high --reason "Blocking critical feature"
```

#### Context Commands
```bash
# Get current work context
kanban context
kanban context --include-blockers --lookback 14

# Get task context
kanban context task task-123 --with-related --with-history

# Get project summary
kanban summary
kanban summary --board project-alpha --with-metrics
```

#### Search Commands
```bash
# Search tasks
kanban search tasks "authentication" --in title,description
kanban search tasks "bug" --status open --has-notes

# Search with advanced filters
kanban search tasks --blocked --stale --no-subtasks
kanban search tasks --overdue --priority high,critical
```

#### Configuration & Mapping Commands
```bash
# Configure repository mappings
kanban config map add "github.com/user/project-*" --board work-projects
kanban config map add "personal-blog" --board blog-tasks
kanban config map list
kanban config map remove mapping-123

# Configure git integration
kanban config git branch-patterns "feature/{taskId}-*" "{taskId}-*"
kanban config git keywords "fixes,closes,implements"
kanban config git auto-tags '{"feature/*": ["feature"], "bug/*": ["bug"]}'

# View configuration
kanban config show
kanban config show --section git
```

#### Real-time Commands
```bash
# Watch for updates (WebSocket connection)
kanban watch --board current
kanban watch task-123
kanban watch --events "task:created,task:moved"

# Stream logs
kanban logs --follow
kanban logs --board project-alpha --follow
```

#### Backup & Restore Commands
```bash
# Manual backup
kanban backup create --name "before-refactor"
kanban backup create --compress --encrypt

# List backups
kanban backup list
kanban backup list --verbose

# Restore from backup
kanban backup restore --name "before-refactor"
kanban backup restore --latest
kanban backup restore --date "2024-01-15"

# Backup management
kanban backup delete --older-than 30d
kanban backup verify --name "backup-2024-01-15"
kanban backup export --format json --output tasks-export.json

# Automatic backup configuration
kanban config backup auto-enable --time "02:00"
kanban config backup retention --days 30
kanban config backup location --path "~/backups/kanban"
```

#### Database Maintenance Commands
```bash
# Database optimization
kanban db optimize
kanban db vacuum
kanban db analyze

# Database statistics
kanban db stats
kanban db stats --table tasks

# Database integrity check
kanban db check
kanban db repair

# Migration commands
kanban db migrate --to-version 2.0
kanban db migrate --rollback
```

#### Global Options
```bash
# Output formats
--json              # JSON output
--table             # Table format (default)
--csv               # CSV format
--quiet             # Minimal output
--verbose           # Detailed output

# Common options
--board <id>        # Specify board (overrides current)
--api-key <key>     # Override configured API key
--no-color          # Disable colored output
--config <file>     # Use alternate config file
```

#### Environment Variables
```bash
# Can be used instead of config file
export KANBAN_API_URL=http://localhost:3000
export KANBAN_API_KEY=your-api-key
export KANBAN_DEFAULT_BOARD=project-alpha
export KANBAN_OUTPUT_FORMAT=json
```

### CLI Configuration File
```yaml
# ~/.kanban/config.yml
api:
  url: http://localhost:3000
  key: ${KANBAN_API_KEY}  # Can reference env vars
  timeout: 30000

defaults:
  board: project-alpha
  output: table
  color: true

database:
  path: ~/.kanban/kanban.db
  wal_mode: true
  backup:
    enabled: true
    path: ~/.kanban/backups
    schedule: "0 2 * * *"  # 2 AM daily
    retention_days: 30
    compress: true
    encrypt: false

git:
  auto_detect: true
  branch_patterns:
    - "feature/{taskId}-*"
    - "{taskId}-*"

aliases:
  # Custom command aliases
  nt: next --with-reasoning
  td: task list --status todo
  pr: priority suggest --today
```

### API Specifications

#### MCP Tools
```typescript
// Tool definitions for MCP protocol
tools: [
  {
    name: "create_task",
    description: "Create a new task in the current board",
    parameters: {
      title: { type: "string", required: true },
      description: { type: "string" },
      column: { type: "string", default: "todo" },
      tags: { type: "array", items: { type: "string" } },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      initialNote: { type: "object", properties: {
        content: { type: "string" },
        category: { type: "string", enum: ["implementation", "research", "blocker", "idea", "general"] }
      }}
    }
  },
  {
    name: "update_task",
    description: "Update an existing task",
    parameters: {
      taskId: { type: "string", required: true },
      updates: { type: "object" }
    }
  },
  {
    name: "add_note",
    description: "Add a note to an existing task",
    parameters: {
      taskId: { type: "string", required: true },
      content: { type: "string", required: true },
      category: { type: "string", enum: ["implementation", "research", "blocker", "idea", "general"] },
      pinned: { type: "boolean", default: false }
    }
  },
  {
    name: "add_tags",
    description: "Add tags to a task",
    parameters: {
      taskId: { type: "string", required: true },
      tags: { type: "array", items: { type: "string" }, required: true }
    }
  },
  {
    name: "search_tasks",
    description: "Search for tasks across boards",
    parameters: {
      query: { type: "string" },
      boardId: { type: "string" },
      status: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      hasNotes: { type: "boolean" },
      noteCategory: { type: "string" }
    }
  },
  {
    name: "search_notes",
    description: "Search through all notes across tasks",
    parameters: {
      query: { type: "string", required: true },
      category: { type: "string" },
      boardId: { type: "string" },
      onlyPinned: { type: "boolean" }
    }
  },
  {
    name: "get_context",
    description: "Get comprehensive context about current work including active tasks, recent notes, and related information",
    parameters: {
      includeActiveTasks: { type: "boolean", default: true },
      includeRecentNotes: { type: "boolean", default: true },
      includeBlockers: { type: "boolean", default: true },
      includeRelatedTasks: { type: "boolean", default: true },
      lookbackDays: { type: "number", default: 7 },
      maxItems: { type: "number", default: 20 }
    }
  },
  {
    name: "get_task_context",
    description: "Get detailed context about a specific task including its history, notes, and related tasks",
    parameters: {
      taskId: { type: "string", required: true },
      includeHistory: { type: "boolean", default: true },
      includeRelated: { type: "boolean", default: true },
      includeNotes: { type: "boolean", default: true }
    }
  },
  {
    name: "get_project_summary",
    description: "Get a high-level summary of the current project/board status",
    parameters: {
      boardId: { type: "string" },
      includeMetrics: { type: "boolean", default: true },
      includeVelocity: { type: "boolean", default: true },
      includeTrends: { type: "boolean", default: true }
    }
  },
  {
    name: "create_subtask",
    description: "Create a subtask under an existing task",
    parameters: {
      parentTaskId: { type: "string", required: true },
      title: { type: "string", required: true },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } }
    }
  },
  {
    name: "set_task_dependency",
    description: "Set a dependency relationship between tasks",
    parameters: {
      taskId: { type: "string", required: true },
      dependsOn: { type: "array", items: { type: "string" }, required: true },
      dependencyType: { type: "string", enum: ["blocks", "related", "parent-child"], default: "blocks" }
    }
  },
  {
    name: "get_task_dependencies",
    description: "Get all dependencies for a task including subtasks",
    parameters: {
      taskId: { type: "string", required: true },
      includeSubtasks: { type: "boolean", default: true },
      includeBlocked: { type: "boolean", default: true }
    }
  },
  {
    name: "prioritize_tasks",
    description: "Get AI-powered task prioritization suggestions",
    parameters: {
      boardId: { type: "string" },
      considerDependencies: { type: "boolean", default: true },
      maxSuggestions: { type: "number", default: 5 },
      timeHorizon: { type: "string", enum: ["today", "this_week", "this_sprint"], default: "today" }
    }
  },
  {
    name: "get_next_task",
    description: "Get the next most prioritized task to work on based on comprehensive metrics including dependencies",
    parameters: {
      boardId: { type: "string" },
      considerContext: { type: "boolean", default: true },
      excludeBlocked: { type: "boolean", default: true },
      skillTags: { type: "array", items: { type: "string" } },
      timeAvailable: { type: "number" },  // minutes available to work
      includeReasoning: { type: "boolean", default: true }
    }
  },
  {
    name: "update_priority",
    description: "Update task priority with optional AI assistance",
    parameters: {
      taskId: { type: "string", required: true },
      priority: { type: "string", enum: ["critical", "high", "medium", "low"], required: true },
      useAISuggestion: { type: "boolean", default: false },
      reason: { type: "string" }
    }
  }
]
```

#### REST API Endpoints
```
POST   /api/tasks              # Create task
GET    /api/tasks              # List tasks
GET    /api/tasks/:id          # Get task details
PATCH  /api/tasks/:id          # Update task
DELETE /api/tasks/:id          # Delete task

POST   /api/tasks/:id/notes    # Add note to task
GET    /api/tasks/:id/notes    # Get task notes
PATCH  /api/notes/:id          # Update note
DELETE /api/notes/:id          # Delete note

POST   /api/tasks/:id/tags     # Add tags to task
DELETE /api/tasks/:id/tags/:tag # Remove tag from task

GET    /api/boards             # List boards
POST   /api/boards             # Create board
GET    /api/boards/:id         # Get board with tasks
PATCH  /api/boards/:id         # Update board

GET    /api/tags               # List all tags
POST   /api/tags               # Create tag
GET    /api/tags/:id           # Get tag with tasks
PATCH  /api/tags/:id           # Update tag
DELETE /api/tags/:id           # Delete tag

POST   /api/tasks/:id/subtasks # Create subtask
GET    /api/tasks/:id/subtasks # List subtasks
PATCH  /api/tasks/:id/dependencies # Update dependencies
GET    /api/tasks/:id/dependencies # Get task dependencies

GET    /api/priorities         # Get prioritized task list
POST   /api/priorities/calculate # Recalculate priorities
GET    /api/priorities/next    # Get next best task to work on
PATCH  /api/tasks/:id/priority # Update task priority

GET    /api/search/tasks       # Search tasks
GET    /api/search/notes       # Search notes

GET    /api/context            # Get current work context
GET    /api/context/task/:id   # Get specific task context
GET    /api/context/summary    # Get project summary

GET    /api/config/mappings    # Get repo mappings
POST   /api/config/mappings    # Create mapping
DELETE /api/config/mappings/:id # Delete mapping
```

#### WebSocket Events
```typescript
// Client to Server
{
  type: "subscribe",
  boardId: "board-123"
}

// Server to Client
{
  type: "task:created",
  boardId: "board-123",
  task: { ... }
}

{
  type: "task:updated", 
  boardId: "board-123",
  taskId: "task-456",
  changes: { ... }
}

{
  type: "task:moved",
  boardId: "board-123",
  taskId: "task-456",
  fromColumn: "todo",
  toColumn: "in-progress"
}

{
  type: "note:added",
  boardId: "board-123",
  taskId: "task-456",
  note: { ... }
}

{
  type: "dependency:blocked",
  boardId: "board-123",
  taskId: "task-456",
  blockedBy: ["task-123"],
  message: "Task cannot proceed until dependencies complete"
}

{
  type: "priority:changed",
  boardId: "board-123",
  taskId: "task-789",
  oldScore: 45,
  newScore: 82,
  reason: "Blocking critical path tasks"
}

{
  type: "subtask:completed",
  boardId: "board-123",
  parentTaskId: "task-111",
  subtaskId: "task-222",
  parentProgress: 75  // percentage
}
```

### Database Schema

#### SQLite Schema Definition
```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Boards table
CREATE TABLE boards (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  settings JSON DEFAULT '{}',
  UNIQUE(name)
);

-- Board columns
CREATE TABLE columns (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  board_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  color TEXT,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  UNIQUE(board_id, name)
);

-- Tasks table with full-text search
CREATE TABLE tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  board_id TEXT NOT NULL,
  column_id TEXT NOT NULL,
  parent_task_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL,
  priority TEXT DEFAULT 'medium',
  priority_score REAL DEFAULT 50.0,
  due_date DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  archived BOOLEAN DEFAULT 0,
  git_context JSON,
  priority_factors JSON,
  dependency_metrics JSON,
  estimated_hours REAL,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (column_id) REFERENCES columns(id),
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Full-text search for tasks
CREATE VIRTUAL TABLE tasks_fts USING fts5(
  task_id,
  title,
  description,
  content=tasks,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER tasks_ai AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(task_id, title, description) 
  VALUES (new.id, new.title, new.description);
END;

CREATE TRIGGER tasks_ad AFTER DELETE ON tasks BEGIN
  DELETE FROM tasks_fts WHERE task_id = old.id;
END;

CREATE TRIGGER tasks_au AFTER UPDATE ON tasks BEGIN
  UPDATE tasks_fts SET title = new.title, description = new.description 
  WHERE task_id = new.id;
END;

-- Task progress tracking
CREATE TABLE task_progress (
  task_id TEXT PRIMARY KEY,
  subtasks_total INTEGER DEFAULT 0,
  subtasks_completed INTEGER DEFAULT 0,
  percent_complete REAL DEFAULT 0.0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Dependencies table
CREATE TABLE task_dependencies (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT DEFAULT 'blocks',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id, depends_on_task_id)
);

-- Notes table with full-text search
CREATE TABLE notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  pinned BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  author TEXT,
  code_snippets JSON,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Full-text search for notes
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id,
  content,
  content=notes,
  content_rowid=rowid
);

-- Note links
CREATE TABLE note_links (
  note_id TEXT NOT NULL,
  linked_task_id TEXT NOT NULL,
  PRIMARY KEY (note_id, linked_task_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Tags table
CREATE TABLE tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  color TEXT,
  parent_id TEXT,
  path TEXT NOT NULL,
  description TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  FOREIGN KEY (parent_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Task-tag junction table
CREATE TABLE task_tags (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Repository mappings
CREATE TABLE repository_mappings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  board_id TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  default_tags JSON,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
);

-- Context analytics
CREATE TABLE context_analytics (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  board_id TEXT NOT NULL,
  date DATE NOT NULL,
  metrics JSON NOT NULL,
  patterns JSON,
  active_blockers JSON,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  UNIQUE(board_id, date)
);

-- Backup metadata
CREATE TABLE backup_metadata (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  backup_name TEXT NOT NULL,
  backup_type TEXT NOT NULL, -- 'full', 'incremental', 'manual'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  size_bytes INTEGER,
  checksum TEXT,
  status TEXT DEFAULT 'completed',
  retention_days INTEGER DEFAULT 30,
  metadata JSON
);

-- Create indexes for performance
CREATE INDEX idx_tasks_board_column ON tasks(board_id, column_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_priority ON tasks(priority_score DESC);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_archived ON tasks(archived);

CREATE INDEX idx_notes_task ON notes(task_id, pinned DESC, created_at DESC);
CREATE INDEX idx_notes_board_category ON notes(board_id, category);

CREATE INDEX idx_tags_parent ON tags(parent_id);
CREATE INDEX idx_tags_path ON tags(path);

CREATE INDEX idx_dependencies_task ON task_dependencies(task_id);
CREATE INDEX idx_dependencies_depends_on ON task_dependencies(depends_on_task_id);

-- Views for common queries
CREATE VIEW active_tasks AS
SELECT t.*, tp.percent_complete
FROM tasks t
LEFT JOIN task_progress tp ON t.id = tp.task_id
WHERE t.archived = 0;

CREATE VIEW task_dependency_graph AS
SELECT 
  t.id,
  t.title,
  COUNT(DISTINCT td1.depends_on_task_id) as blocks_count,
  COUNT(DISTINCT td2.task_id) as blocked_by_count
FROM tasks t
LEFT JOIN task_dependencies td1 ON t.id = td1.task_id
LEFT JOIN task_dependencies td2 ON t.id = td2.depends_on_task_id
GROUP BY t.id;
```

### Performance Optimizations
```sql
-- Enable Write-Ahead Logging for better concurrency
PRAGMA journal_mode = WAL;

-- Optimize for read-heavy workload
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456; -- 256MB memory-mapped I/O

-- Regular maintenance
PRAGMA optimize; -- Run periodically
PRAGMA vacuum;   -- Run during maintenance windows
```

### Performance Requirements
- **Response Time**: < 100ms for task operations
- **WebSocket Latency**: < 50ms for real-time updates
- **Concurrent Connections**: Support 10+ simultaneous WebSocket connections
- **Database Queries**: All queries must use indexes
- **Memory Usage**: < 256MB under normal operation

### Security Requirements
- **Authentication**: API key based authentication for simplicity
- **API Key Storage**: Keys stored as hashed values in environment variables
- **Rate Limiting**: 1000 requests per minute per API key
- **Input Validation**: Sanitize all inputs to prevent injection
- **CORS**: Configurable CORS for web-based dashboards

## Design Requirements

### MCP Server Interface
- Clean, single-purpose tools that map to natural language commands
- Descriptive tool names and parameters for AI comprehension
- Comprehensive error messages that guide AI agents
- Consistent response formats across all tools

### API Design Principles
- RESTful conventions for CRUD operations
- Consistent error response format
- Pagination for list endpoints
- Partial update support via PATCH
- Idempotent operations where possible

### Real-time Updates
- Minimal WebSocket message payload
- Room-based subscriptions per board
- Graceful degradation to polling if WebSocket fails
- Message queuing for offline clients

## Acceptance Criteria

### AC1: Context Detection
- Given: A git repository with remote URL "github.com/user/project-alpha"
- When: AI agent invokes task creation tool
- Then: Task is automatically created in the mapped board for "project-alpha"

### AC2: Real-time Sync
- Given: Two AI agents connected to the same board
- When: Agent A creates a task
- Then: Agent B receives the update within 100ms

### AC3: Task Management
- Given: An existing task in "todo" column
- When: AI agent updates status to "in-progress"
- Then: Task moves to correct column and update is broadcast

### AC4: Git Integration
- Given: A branch named "feature/TASK-123-user-auth"
- When: AI agent creates a commit
- Then: Task TASK-123 is automatically updated with commit reference

### AC5: Error Handling
- Given: An invalid board ID
- When: AI agent attempts to create a task
- Then: Clear error message is returned with available boards

### AC6: Note Management
- Given: A task with existing notes
- When: AI agent adds a note with category "blocker"
- Then: Note is created, indexed for search, and broadcast to all clients

### AC7: Tag Hierarchy
- Given: A tag "frontend/react/hooks"
- When: AI agent tags a task with it
- Then: Task is findable by searching for "frontend", "react", or "hooks"

### AC8: Cross-Task Search
- Given: Multiple tasks with notes containing "authentication"
- When: AI agent searches notes for "authentication"
- Then: All matching notes are returned with their associated tasks

### AC9: Context Retrieval
- Given: An AI agent working on a new feature
- When: Agent requests current context
- Then: System returns active tasks, recent blockers, velocity metrics, and related past solutions

### AC10: Smart Assistance
- Given: A task similar to one completed before
- When: AI agent gets task context
- Then: Previous implementation notes and solutions are included in the response

### AC11: Dependency Management
- Given: A task with subtasks and dependencies
- When: AI agent attempts to close the parent task
- Then: System prevents closure and lists incomplete subtasks/dependencies

### AC12: AI Prioritization
- Given: Multiple tasks with various factors (age, dependencies, deadlines)
- When: AI agent requests priority suggestions
- Then: System returns ranked tasks with reasoning for each priority score

### AC13: Next Task Selection
- Given: A developer with 2 hours available and backend skills
- When: AI agent requests the next best task
- Then: System returns the task that maximizes value considering dependencies, time constraint, and skill match

### AC14: Dependency Impact
- Given: A task that blocks 5 other high-priority tasks
- When: AI agent calls get_next_task
- Then: This bottleneck task is recommended with clear reasoning about its blocking impact

### AC15: Backup Integrity
- Given: A daily backup schedule configured
- When: 24 hours pass
- Then: Backup is created automatically with verification checksum

### AC16: Data Recovery
- Given: A corrupted database or accidental deletion
- When: User runs restore command
- Then: System restores from most recent valid backup with data integrity verified

## Success Metrics

### Technical Metrics
- **API Response Time**: P95 < 100ms
- **WebSocket Latency**: P95 < 50ms
- **Context Generation**: P95 < 200ms for full context retrieval
- **Priority Calculation**: P95 < 150ms for board-wide prioritization
- **Dependency Resolution**: P95 < 100ms for full dependency graph
- **Backup Time**: < 5 seconds for 10,000 tasks
- **Restore Time**: < 10 seconds for full restoration
- **Database Size**: < 100MB for 10,000 tasks with full history
- **Uptime**: > 99.9% for personal deployment
- **Error Rate**: < 0.1% for valid requests

### Usage Metrics
- **Task Creation Time**: < 5 seconds via natural language
- **Context Detection Accuracy**: > 95% correct board selection
- **Sync Reliability**: 100% eventual consistency
- **AI Integration Success**: > 90% successful tool invocations
- **Context Relevance**: > 80% of suggested solutions rated helpful
- **Priority Accuracy**: > 85% agreement with user's actual work order
- **Subtask Completion**: > 90% of parent tasks have subtasks utilized

## Timeline & Milestones

### Phase 1: Core Infrastructure (Week 1-2)
- MongoDB schema implementation
- Basic REST API with CRUD operations
- API key authentication
- MCP server skeleton with basic tools

### Phase 2: Real-time Features (Week 3-4)
- WebSocket server implementation
- Real-time event broadcasting
- Subscription management
- Connection resilience and reconnection
- CLI client with full endpoint coverage

### Phase 3: Git Integration (Week 5-6)
- Repository detection logic
- Configurable mapping system
- Branch name parsing
- Commit message integration
- CLI git configuration commands

### Phase 4: AI Optimization (Week 7-8)
- Natural language processing for task creation
- Smart categorization
- Bulk operations
- Enhanced error messages for AI agents
- Context awareness system
- Pattern recognition for similar tasks
- Automated insight generation

## Risks & Dependencies

### Technical Risks
- **Risk**: Data corruption in SQLite database
- **Mitigation**: Automatic daily backups, WAL mode for crash recovery, integrity checks

### Dependencies
- SQLite (bundled with most systems)
- Node.js runtime environment
- MCP protocol compatibility with AI agents

### Limitations
- Single-user design (no multi-tenant support)
- Local database limits scalability
- Limited to MCP-compatible AI agents

## Out of Scope

### This Phase
- Multi-user authentication and authorization
- Web-based UI for task management
- Mobile application support
- Advanced workflow automation
- Time tracking features
- Integrations with external services (GitHub, Slack, etc.)
- Task dependencies and subtasks
- Kanban board templates
- Analytics and reporting

### Future Considerations
- OAuth 2.0 for team deployments
- GraphQL API for more flexible queries
- Plugin system for custom integrations
- AI-powered task prioritization
- Automated sprint planning

## Appendices

### A. Example Configuration File
```json
{
  "defaultBoard": "personal-tasks",
  "mappings": [
    {
      "pattern": "github.com/myusername/project-*",
      "boardId": "work-projects"
    },
    {
      "pattern": "personal-blog",
      "boardId": "blog-tasks"
    }
  ],
  "gitIntegration": {
    "enableBranchParsing": true,
    "branchPatterns": ["feature/{taskId}-*", "{taskId}-*"],
    "commitKeywords": ["fixes", "closes", "implements"],
    "autoTags": {
      "feature/*": ["feature"],
      "bugfix/*": ["bug"],
      "hotfix/*": ["bug", "urgent"]
    }
  },
  "prioritization": {
    "factors": {
      "ageWeight": 0.15,
      "dependencyWeight": 0.30,
      "dueDateWeight": 0.25,
      "priorityWeight": 0.20,
      "contextWeight": 0.10
    },
    "dependencyScoring": {
      "directBlockWeight": 0.6,
      "transitiveBlockWeight": 0.3,
      "criticalPathWeight": 0.1
    },
    "staleThreshold": 7,  // Days before task is considered stale
    "autoReprioritize": true,
    "dailySuggestions": 5
  },
  "backup": {
    "autoBackup": true,
    "backupTime": "02:00",
    "retentionDays": 30,
    "incrementalEnabled": true,
    "compression": true,
    "encryption": {
      "enabled": false,
      "algorithm": "aes-256-gcm"
    }
  }
}
```

### B. Sample MCP Tool Invocations
```typescript
// Creating a task
{
  tool: "create_task",
  arguments: {
    title: "Implement user authentication",
    description: "Add JWT-based auth with refresh tokens",
    tags: ["backend", "security", "auth/jwt"],
    priority: "high",
    initialNote: {
      content: "Research OAuth2 vs JWT. Consider using Passport.js",
      category: "research"
    }
  }
}

// Adding a note
{
  tool: "add_note",
  arguments: {
    taskId: "task-123",
    content: "Discovered issue with token expiration in Safari. Need to implement refresh token rotation.",
    category: "blocker",
    pinned: true
  }
}

// Searching with tags and notes
{
  tool: "search_tasks",
  arguments: {
    query: "authentication",
    tags: ["backend", "security"],
    hasNotes: true,
    noteCategory: "blocker"
  }
}

// Getting comprehensive context
{
  tool: "get_context",
  arguments: {
    includeActiveTasks: true,
    includeRecentNotes: true,
    includeBlockers: true,
    lookbackDays: 7
  }
}
// Returns:
{
  activeTasks: [
    {
      id: "task-123",
      title: "Implement authentication",
      status: "in-progress",
      tags: ["backend", "security"],
      daysInProgress: 3,
      hasBlocker: true,
      blocker: {
        note: "CORS issues with Safari",
        duration: "2 days"
      }
    }
  ],
  recentNotes: [
    {
      taskId: "task-456",
      content: "Fixed similar CORS issue by adding credentials: 'include'",
      category: "implementation",
      relevanceScore: 0.92
    }
  ],
  currentVelocity: {
    tasksPerWeek: 12,
    averageCompletionTime: "2.5 days",
    trend: "improving"
  },
  suggestedFocus: "Address CORS blocker in task-123 using solution from task-456"
}

// Creating task with subtasks
{
  tool: "create_task",
  arguments: {
    title: "Implement user authentication system",
    description: "Complete auth system with JWT",
    tags: ["backend", "security"],
    priority: "high"
  }
}
// Then create subtasks
{
  tool: "create_subtask",
  arguments: {
    parentTaskId: "task-123",
    title: "Setup JWT middleware",
    tags: ["backend/middleware"]
  }
}
{
  tool: "create_subtask",
  arguments: {
    parentTaskId: "task-123",
    title: "Create login endpoint",
    tags: ["backend/api"]
  }
}

// Setting dependencies
{
  tool: "set_task_dependency",
  arguments: {
    taskId: "task-456",  // "Create user dashboard"
    dependsOn: ["task-123"],  // Must wait for auth system
    dependencyType: "blocks"
  }
}

// Getting the next best task to work on
{
  tool: "get_next_task",
  arguments: {
    boardId: "current",
    considerContext: true,
    excludeBlocked: true,
    timeAvailable: 120,  // 2 hours available
    includeReasoning: true
  }
}
// Returns:
{
  task: {
    id: "task-234",
    title: "Fix authentication middleware",
    estimatedTime: 90,  // minutes
    tags: ["backend", "auth", "bug"]
  },
  metrics: {
    priorityScore: 94,
    dependencyMetrics: {
      directBlocksCount: 4,
      totalBlocksCount: 7,
      criticalPathLength: 3,
      isBottleneck: true
    },
    scores: {
      urgency: 0.9,
      impact: 0.95,
      effort: 0.7,  // Lower is better
      contextMatch: 0.85
    }
  },
  reasoning: {
    primary: "This task blocks 7 other tasks and is on the critical path",
    factors: [
      "Blocks user dashboard (high priority)",
      "Blocks API endpoints (3 tasks)",
      "Has been in progress for 2 days (risk of staleness)",
      "Matches your recent auth work context",
      "Estimated 90 min fits your 2-hour availability"
    ],
    alternativeConsideration: "Task-456 has higher manual priority but would only unblock 1 task"
  },
  unblocks: [
    { id: "task-345", title: "Create user dashboard", priority: "high" },
    { id: "task-456", title: "Add user preferences API", priority: "medium" },
    { id: "task-567", title: "Implement team sharing", priority: "medium" }
  ]
}

// Example with different parameters
{
  tool: "get_next_task",
  arguments: {
    skillTags: ["frontend", "react"],
    timeAvailable: 30,  // Only 30 minutes
    excludeBlocked: true
  }
}
// Returns:
{
  task: {
    id: "task-789",
    title: "Update loading spinner component",
    estimatedTime: 20,
    tags: ["frontend", "react", "ui"]
  },
  metrics: {
    priorityScore: 76,
    dependencyMetrics: {
      directBlocksCount: 0,
      totalBlocksCount: 0,
      isBottleneck: false
    }
  },
  reasoning: {
    primary: "Quick win that matches your skills and time constraint",
    factors: [
      "Can be completed in your 30-minute window",
      "Matches your frontend/react skill tags",
      "No dependencies to worry about",
      "Has been requested by 3 team members",
      "Will improve user experience immediately"
    ]
  }
}
```

### D. CLI Quick Reference
```bash
# Essential commands for daily use
kanban next                    # What should I work on?
kanban task create "Fix bug"   # Create task quickly
kanban task list --status todo # Show my todo list
kanban task update ID --status done # Complete a task
kanban note add ID "Solution found" # Add implementation note
kanban watch --board current   # Monitor real-time updates
kanban backup create           # Manual backup before changes

# Productivity shortcuts
kanban nt     # Alias for 'next --with-reasoning'
kanban td     # Alias for 'task list --status todo'
kanban done   # Alias for moving task to done
kanban block  # Alias for adding blocker note
```