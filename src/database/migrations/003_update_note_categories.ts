/**
 * Migration: Update note categories to match PRD specification
 * Changes categories from (general, progress, blocker, decision, question)
 * to (general, implementation, research, blocker, idea)
 */

import type { Database } from 'sqlite3';
import { promisify } from 'util';

export async function up(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));
  const _all = promisify(db.all.bind(db));

  try {
    // Step 1: Create new notes table with updated categories
    await run(`
      CREATE TABLE notes_new (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general' CHECK (category IN ('general', 'implementation', 'research', 'blocker', 'idea')),
        pinned BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // Step 2: Map old categories to new categories and migrate data
    await run(`
      INSERT INTO notes_new (id, task_id, content, category, pinned, created_at, updated_at)
      SELECT 
        id, 
        task_id, 
        content,
        CASE 
          WHEN category = 'progress' THEN 'implementation'
          WHEN category = 'decision' THEN 'idea'
          WHEN category = 'question' THEN 'research'
          WHEN category = 'blocker' THEN 'blocker'
          WHEN category = 'general' THEN 'general'
          ELSE 'general'  -- fallback for any unexpected categories
        END as category,
        pinned,
        created_at,
        updated_at
      FROM notes
    `);

    // Step 3: Drop old table and rename new table
    await run('DROP TABLE notes');
    await run('ALTER TABLE notes_new RENAME TO notes');

    // Step 4: Recreate indexes
    await run('CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)');
    await run('CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned)');
  } catch (error) {
    throw error;
  }
}

export async function down(db: Database): Promise<void> {
  const run = promisify(db.run.bind(db));

  try {
    // Step 1: Create table with old categories
    await run(`
      CREATE TABLE notes_old (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general' CHECK (category IN ('general', 'progress', 'blocker', 'decision', 'question')),
        pinned BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // Step 2: Map new categories back to old categories and migrate data
    await run(`
      INSERT INTO notes_old (id, task_id, content, category, pinned, created_at, updated_at)
      SELECT 
        id, 
        task_id, 
        content,
        CASE 
          WHEN category = 'implementation' THEN 'progress'
          WHEN category = 'idea' THEN 'decision'
          WHEN category = 'research' THEN 'question'
          WHEN category = 'blocker' THEN 'blocker'
          WHEN category = 'general' THEN 'general'
          ELSE 'general'  -- fallback
        END as category,
        pinned,
        created_at,
        updated_at
      FROM notes
    `);

    // Step 3: Drop new table and rename old table
    await run('DROP TABLE notes');
    await run('ALTER TABLE notes_old RENAME TO notes');

    // Step 4: Recreate indexes
    await run('CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category)');
    await run('CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned)');
  } catch (error) {
    throw error;
  }
}
