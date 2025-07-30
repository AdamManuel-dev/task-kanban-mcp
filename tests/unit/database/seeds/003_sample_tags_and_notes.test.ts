/**
 * @fileoverview Test for sample tags and notes seed migration
 * @lastmodified 2025-07-28T04:50:00Z
 *
 * Features: Tags, notes, relationships, and dependencies validation
 * Main APIs: Sample tags and notes seed testing
 * Constraints: Database integration test with complex relationships
 * Patterns: Migration testing, hierarchical data validation, relationship testing
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { run, name, description } from '../../../../src/database/seeds/003_sample_tags_and_notes';

// Mock database interface to match the sqlite wrapper
interface MockDatabase {
  run: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  get: (sql: string, params?: any[]) => Promise<any>;
}

interface Tag {
  id: string;
  name: string;
  color: string;
  description: string;
  parent_tag_id?: string;
}

interface TaskTag {
  task_id: string;
  tag_id: string;
}

interface Note {
  id: string;
  task_id: string;
  content: string;
  category: string;
  pinned: boolean;
}

interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: string;
}

describe('003_sample_tags_and_notes seed', () => {
  let db: Database;
  let mockDb: MockDatabase;
  let tempDbPath: string;

  beforeEach(async () => {
    // Create temporary database for testing
    tempDbPath = path.join(__dirname, 'test-sample-tags-notes.db');

    // Remove existing test database
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File doesn't exist, ignore
    }

    db = new Database(tempDbPath);

    // Create mock database interface that matches the sqlite wrapper
    const run = promisify(db.run.bind(db));
    const all = promisify(db.all.bind(db));
    const get = promisify(db.get.bind(db));

    mockDb = {
      run: async (sql: string, params?: any[]) => await run(sql, params || []),
      all: async (sql: string, params?: any[]) => await all(sql, params || []),
      get: async (sql: string, params?: any[]) => await get(sql, params || []),
    };

    // Create required tables
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        // Tags table
        db.run(`
          CREATE TABLE tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            description TEXT,
            parent_tag_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_tag_id) REFERENCES tags(id) ON DELETE CASCADE
          )
        `);

        // Tasks table (minimal for references)
        db.run(`
          CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            board_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Task-Tags relationship table
        db.run(`
          CREATE TABLE task_tags (
            task_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (task_id, tag_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
          )
        `);

        // Notes table
        db.run(`
          CREATE TABLE notes (
            id TEXT PRIMARY KEY,
            task_id TEXT,
            board_id TEXT,
            content TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            pinned BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          )
        `);

        // Task dependencies table
        db.run(
          `
          CREATE TABLE task_dependencies (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            depends_on_task_id TEXT NOT NULL,
            dependency_type TEXT NOT NULL DEFAULT 'blocks',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
          )
        `,
          err => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    // Create prerequisite tasks for testing
    await mockDb.run(`
      INSERT INTO tasks (id, title, board_id, column_id) VALUES 
      ('task-1', 'Implement user authentication', 'board-1', 'col-3'),
      ('task-2', 'Design database schema', 'board-1', 'col-6'),
      ('task-3', 'Set up CI/CD pipeline', 'board-1', 'col-2'),
      ('task-4', 'Write API documentation', 'board-1', 'col-2'),
      ('task-5', 'Implement real-time updates', 'board-1', 'col-1'),
      ('task-6', 'Fix drag and drop bug', 'board-1', 'col-4'),
      ('task-7', 'Add task filtering', 'board-1', 'col-1'),
      ('task-8', 'Buy groceries', 'board-2', 'col-7'),
      ('task-9', 'Read Node.js book', 'board-2', 'col-8'),
      ('task-10', 'Exercise routine', 'board-2', 'col-9'),
      ('task-11', 'Mobile app development', 'board-3', 'col-11'),
      ('task-12', 'Integration with Slack', 'board-3', 'col-10'),
      ('task-13', 'Performance optimization', 'board-3', 'col-12'),
      ('task-14', 'Set up JWT middleware', 'board-1', 'col-3'),
      ('task-15', 'Create login API endpoint', 'board-1', 'col-2'),
      ('task-16', 'Create logout API endpoint', 'board-1', 'col-2'),
      ('task-17', 'Add password hashing', 'board-1', 'col-6')
    `);
  });

  afterEach(async () => {
    // Close database and clean up
    await new Promise<void>(resolve => {
      db.close(() => resolve());
    });

    try {
      await fs.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should have correct metadata', () => {
    expect(name).toBe('Sample Tags and Notes');
    expect(description).toBe('Create sample tags, task-tag relationships, and notes');
  });

  test('should create base tags', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify base tags (without parent_tag_id)
    const baseTags = (await mockDb.all(
      'SELECT * FROM tags WHERE parent_tag_id IS NULL ORDER BY id'
    )) as Tag[];

    expect(baseTags).toHaveLength(10);

    const expectedBaseTags = [
      { id: 'tag-1', name: 'bug', color: '#F44336', description: 'Issues that need to be fixed' },
      {
        id: 'tag-10',
        name: 'performance',
        color: '#FF5722',
        description: 'Performance optimization tasks',
      },
      {
        id: 'tag-2',
        name: 'feature',
        color: '#2196F3',
        description: 'New functionality to be implemented',
      },
      {
        id: 'tag-3',
        name: 'enhancement',
        color: '#4CAF50',
        description: 'Improvements to existing features',
      },
      {
        id: 'tag-4',
        name: 'documentation',
        color: '#FF9800',
        description: 'Documentation-related tasks',
      },
      {
        id: 'tag-5',
        name: 'urgent',
        color: '#E91E63',
        description: 'High priority tasks that need immediate attention',
      },
      { id: 'tag-6', name: 'backend', color: '#9C27B0', description: 'Backend development tasks' },
      {
        id: 'tag-7',
        name: 'frontend',
        color: '#00BCD4',
        description: 'Frontend development tasks',
      },
      { id: 'tag-8', name: 'database', color: '#795548', description: 'Database-related tasks' },
      {
        id: 'tag-9',
        name: 'security',
        color: '#607D8B',
        description: 'Security-related improvements',
      },
    ];

    expectedBaseTags.forEach((expected, index) => {
      expect(baseTags[index]).toMatchObject(expected);
      expect(baseTags[index].parent_tag_id).toBeNull();
    });
  });

  test('should create hierarchical tags', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify hierarchical tags (with parent_tag_id)
    const hierarchicalTags = (await mockDb.all(
      'SELECT * FROM tags WHERE parent_tag_id IS NOT NULL ORDER BY id'
    )) as Tag[];

    expect(hierarchicalTags).toHaveLength(4);

    const expectedHierarchicalTags = [
      {
        id: 'tag-11',
        name: 'critical-bug',
        color: '#D32F2F',
        description: 'Critical bugs that break functionality',
        parent_tag_id: 'tag-1',
      },
      {
        id: 'tag-12',
        name: 'minor-bug',
        color: '#FFCDD2',
        description: 'Minor bugs with low impact',
        parent_tag_id: 'tag-1',
      },
      {
        id: 'tag-13',
        name: 'api-feature',
        color: '#1976D2',
        description: 'New API endpoints and functionality',
        parent_tag_id: 'tag-2',
      },
      {
        id: 'tag-14',
        name: 'ui-feature',
        color: '#0288D1',
        description: 'New user interface features',
        parent_tag_id: 'tag-2',
      },
    ];

    expectedHierarchicalTags.forEach((expected, index) => {
      expect(hierarchicalTags[index]).toMatchObject(expected);
    });
  });

  test('should create task-tag relationships', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify task-tag relationships
    const taskTags = (await mockDb.all(
      'SELECT * FROM task_tags ORDER BY task_id, tag_id'
    )) as TaskTag[];

    expect(taskTags).toHaveLength(16);

    // Check specific relationships
    const task1Tags = (await mockDb.all(
      'SELECT tag_id FROM task_tags WHERE task_id = ? ORDER BY tag_id',
      ['task-1']
    )) as Array<{ tag_id: string }>;

    expect(task1Tags).toHaveLength(3);
    expect(task1Tags.map(t => t.tag_id)).toEqual(['tag-2', 'tag-6', 'tag-9']);

    const task6Tags = (await mockDb.all(
      'SELECT tag_id FROM task_tags WHERE task_id = ? ORDER BY tag_id',
      ['task-6']
    )) as Array<{ tag_id: string }>;

    expect(task6Tags).toHaveLength(3);
    expect(task6Tags.map(t => t.tag_id)).toEqual(['tag-1', 'tag-5', 'tag-7']);
  });

  test('should create notes with different categories', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify notes
    const notes = (await mockDb.all('SELECT * FROM notes ORDER BY id')) as Note[];

    expect(notes).toHaveLength(10);

    // Check category distribution
    const categories = (await mockDb.all(
      'SELECT DISTINCT category FROM notes ORDER BY category'
    )) as Array<{ category: string }>;

    expect(categories.map(c => c.category)).toEqual(['blocker', 'decision', 'general', 'progress']);

    // Check pinned notes
    const pinnedNotes = (await mockDb.all(
      'SELECT * FROM notes WHERE pinned = true ORDER BY id'
    )) as Note[];

    expect(pinnedNotes).toHaveLength(3);
    expect(pinnedNotes.map(n => n.id)).toEqual(['note-10', 'note-2', 'note-5']);

    // Check specific note content
    const note1 = (await mockDb.get('SELECT * FROM notes WHERE id = ?', ['note-1'])) as Note;

    expect(note1).toMatchObject({
      id: 'note-1',
      task_id: 'task-1',
      category: 'progress',
      pinned: 0, // SQLite returns boolean as integer
    });

    expect(note1.content).toContain('JWT libraries');
  });

  test('should create task dependencies', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify task dependencies
    const dependencies = (await mockDb.all(
      'SELECT * FROM task_dependencies ORDER BY id'
    )) as TaskDependency[];

    expect(dependencies).toHaveLength(4);

    const expectedDependencies = [
      {
        id: 'dep-1',
        task_id: 'task-15',
        depends_on_task_id: 'task-14',
        dependency_type: 'blocks',
      },
      {
        id: 'dep-2',
        task_id: 'task-16',
        depends_on_task_id: 'task-14',
        dependency_type: 'blocks',
      },
      {
        id: 'dep-3',
        task_id: 'task-5',
        depends_on_task_id: 'task-1',
        dependency_type: 'blocks',
      },
      {
        id: 'dep-4',
        task_id: 'task-7',
        depends_on_task_id: 'task-5',
        dependency_type: 'relates_to',
      },
    ];

    expectedDependencies.forEach((expected, index) => {
      expect(dependencies[index]).toMatchObject(expected);
    });
  });

  test('should create notes for various tasks', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify note distribution across tasks
    const notesPerTask = (await mockDb.all(`
      SELECT task_id, COUNT(*) as note_count 
      FROM notes 
      GROUP BY task_id 
      ORDER BY task_id
    `)) as Array<{ task_id: string; note_count: number }>;

    expect(notesPerTask.length).toBeGreaterThan(0);

    // Task-1 should have 2 notes
    const task1Notes = notesPerTask.find(n => n.task_id === 'task-1');
    expect(task1Notes?.note_count).toBe(2);

    // Task-6 should have 2 notes
    const task6Notes = notesPerTask.find(n => n.task_id === 'task-6');
    expect(task6Notes?.note_count).toBe(2);

    // Verify specific note categories
    const blockerNotes = (await mockDb.all('SELECT * FROM notes WHERE category = ? ORDER BY id', [
      'blocker',
    ])) as Note[];

    expect(blockerNotes).toHaveLength(2);
    expect(blockerNotes.map(n => n.id)).toEqual(['note-10', 'note-5']);
  });

  test('should maintain referential integrity', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify all task_tags reference existing tasks and tags
    const taskTagRefs = await mockDb.all(`
      SELECT tt.task_id, tt.tag_id
      FROM task_tags tt
      LEFT JOIN tasks t ON tt.task_id = t.id
      LEFT JOIN tags tg ON tt.tag_id = tg.id
      WHERE t.id IS NULL OR tg.id IS NULL
    `);

    expect(taskTagRefs).toHaveLength(0);

    // Verify all notes reference existing tasks
    const noteRefs = await mockDb.all(`
      SELECT n.id, n.task_id
      FROM notes n
      LEFT JOIN tasks t ON n.task_id = t.id
      WHERE t.id IS NULL
    `);

    expect(noteRefs).toHaveLength(0);

    // Verify all task dependencies reference existing tasks
    const depRefs = await mockDb.all(`
      SELECT d.id, d.task_id, d.depends_on_task_id
      FROM task_dependencies d
      LEFT JOIN tasks t1 ON d.task_id = t1.id
      LEFT JOIN tasks t2 ON d.depends_on_task_id = t2.id
      WHERE t1.id IS NULL OR t2.id IS NULL
    `);

    expect(depRefs).toHaveLength(0);

    // Verify hierarchical tag references
    const tagRefs = await mockDb.all(`
      SELECT t.id, t.parent_tag_id
      FROM tags t
      LEFT JOIN tags tp ON t.parent_tag_id = tp.id
      WHERE t.parent_tag_id IS NOT NULL AND tp.id IS NULL
    `);

    expect(tagRefs).toHaveLength(0);
  });

  test('should handle duplicate execution gracefully', async () => {
    // Run the seed twice
    await run(mockDb as any);

    // This should fail due to unique constraints
    await expect(run(mockDb as any)).rejects.toThrow();

    // Verify data integrity
    const allTags = (await mockDb.all('SELECT * FROM tags')) as Tag[];
    expect(allTags).toHaveLength(14); // 10 base + 4 hierarchical

    const allNotes = (await mockDb.all('SELECT * FROM notes')) as Note[];
    expect(allNotes).toHaveLength(10);
  });

  test('should create tags with unique names', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify all tag names are unique
    const tagNames = await mockDb.all(
      'SELECT name, COUNT(*) as count FROM tags GROUP BY name HAVING COUNT(*) > 1'
    );

    expect(tagNames).toHaveLength(0);

    // Verify specific unique names exist
    const uniqueNames = ['bug', 'feature', 'enhancement', 'critical-bug', 'ui-feature'];

    for (const name of uniqueNames) {
      const tag = (await mockDb.get('SELECT * FROM tags WHERE name = ?', [name])) as Tag;

      expect(tag).toBeDefined();
      expect(tag.name).toBe(name);
    }
  });

  test('should create comprehensive tag system', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify we have a good distribution of tag types
    const totalTags = (await mockDb.all('SELECT * FROM tags')) as Tag[];
    expect(totalTags).toHaveLength(14);

    // Check parent-child relationships
    const parentTags = (await mockDb.all(
      'SELECT * FROM tags WHERE parent_tag_id IS NULL'
    )) as Tag[];

    const childTags = (await mockDb.all(
      'SELECT * FROM tags WHERE parent_tag_id IS NOT NULL'
    )) as Tag[];

    expect(parentTags).toHaveLength(10);
    expect(childTags).toHaveLength(4);

    // Verify specific hierarchies
    const bugChildren = (await mockDb.all(
      'SELECT * FROM tags WHERE parent_tag_id = ? ORDER BY id',
      ['tag-1']
    )) as Tag[];

    expect(bugChildren).toHaveLength(2);
    expect(bugChildren.map(t => t.name)).toEqual(['critical-bug', 'minor-bug']);

    const featureChildren = (await mockDb.all(
      'SELECT * FROM tags WHERE parent_tag_id = ? ORDER BY id',
      ['tag-2']
    )) as Tag[];

    expect(featureChildren).toHaveLength(2);
    expect(featureChildren.map(t => t.name)).toEqual(['api-feature', 'ui-feature']);
  });

  test('should create meaningful task relationships', async () => {
    // Run the seed
    await run(mockDb as any);

    // Verify logical task-tag assignments
    const authTaskTags = (await mockDb.all(`
      SELECT t.name as tag_name
      FROM task_tags tt
      JOIN tags t ON tt.tag_id = t.id
      WHERE tt.task_id = 'task-1'
      ORDER BY t.name
    `)) as Array<{ tag_name: string }>;

    expect(authTaskTags.map(t => t.tag_name)).toEqual(['backend', 'feature', 'security']);

    const bugTaskTags = (await mockDb.all(`
      SELECT t.name as tag_name
      FROM task_tags tt
      JOIN tags t ON tt.tag_id = t.id
      WHERE tt.task_id = 'task-6'
      ORDER BY t.name
    `)) as Array<{ tag_name: string }>;

    expect(bugTaskTags.map(t => t.tag_name)).toEqual(['bug', 'frontend', 'urgent']);

    // Verify dependency chains make sense
    const jwtDependencies = (await mockDb.all(`
      SELECT task_id, depends_on_task_id
      FROM task_dependencies
      WHERE depends_on_task_id = 'task-14'
    `)) as Array<{ task_id: string; depends_on_task_id: string }>;

    expect(jwtDependencies).toHaveLength(2);
    expect(jwtDependencies.map(d => d.task_id).sort()).toEqual(['task-15', 'task-16']);
  });
});
